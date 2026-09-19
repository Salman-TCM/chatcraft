"""
Per-Agent Knowledge Base API.

Mirrors kb.py but scopes documents to Agent (not ChatbotConfig). Uses the
agent_kb_documents / agent_kb_chunks tables and the process_agent_document
Celery task. Storage keys are namespaced under `kb/agent/{agent_id}/…`.
"""

import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.dependencies import CurrentUser, DBSession, require_feature
from app.core.features import KNOWLEDGE_BASE
from app.models.agent import Agent
from app.models.agent_knowledge_base import AgentKnowledgeDocument, AgentKnowledgeDocumentVersion
from app.models.knowledge_base import DocumentStatus, DocumentType
from app.schemas.agent_kb import (
    AgentDocumentDetailResponse,
    AgentDocumentInstructRequest,
    AgentDocumentResponse,
    AgentDocumentUpdateRequest,
    AgentDocumentVersionResponse,
    AgentSearchRequest,
    AgentSearchResultItem,
    AgentTextIngestRequest,
    AgentUrlIngestRequest,
)
from app.services.kb.agent_kb_service import (
    ContentTooLarge,
    VersionConflict,
    dispatch_agent_document_processing,
    get_current_content,
    merge_document_with_instruction,
    set_document_content,
)
from app.services.kb.agent_rag import AgentRAGService
from app.services.storage import (
    MAX_FILE_SIZE_BYTES,
    delete_file,
    detect_doc_type,
    upload_file,
)
from app.services.virus_scan import scan_bytes

router = APIRouter(
    prefix="/api/agent-kb",
    tags=["agent-knowledge-base"],
    dependencies=[Depends(require_feature(KNOWLEDGE_BASE))],
)


# ── Upload file ───────────────────────────────────────────────────────────────


@router.post("/{agent_id}/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    agent_id: uuid.UUID,
    file: UploadFile,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_agent(agent_id, user.id, db)

    data = await file.read()
    if len(data) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "success": False,
                "error": f"File exceeds 25 MB limit ({len(data) // 1024 // 1024} MB uploaded)",
                "code": "FILE_TOO_LARGE",
            },
        )
    if len(data) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "error": "Empty file", "code": "EMPTY_FILE"},
        )

    scan = await scan_bytes(data)
    if not scan.clean:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "success": False,
                "error": f"File rejected: malware detected ({scan.threat})",
                "code": "MALWARE_DETECTED",
            },
        )

    content_type = file.content_type or "application/octet-stream"
    try:
        doc_type = detect_doc_type(file.filename or "", content_type)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"success": False, "error": str(exc), "code": "UNSUPPORTED_TYPE"},
        )

    try:
        # Namespace storage keys under agent/{agent_id} so they can't collide
        # with chatbot uploads and are easy to sweep on agent delete.
        file_url = await upload_file(
            data=data,
            filename=file.filename or "upload",
            content_type=content_type,
            chatbot_id=f"agent/{agent_id}",
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"success": False, "error": str(exc), "code": "STORAGE_ERROR"},
        )

    doc = AgentKnowledgeDocument(
        agent_id=agent_id,
        name=file.filename or "upload",
        type=DocumentType(doc_type),
        file_url=file_url,
        status=DocumentStatus.pending,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    _dispatch_processing(str(doc.id))
    return {"success": True, "data": AgentDocumentResponse.model_validate(doc)}


# ── Ingest URL ────────────────────────────────────────────────────────────────


@router.post("/{agent_id}/ingest-url", status_code=status.HTTP_201_CREATED)
async def ingest_url(
    agent_id: uuid.UUID,
    body: AgentUrlIngestRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_agent(agent_id, user.id, db)
    doc = AgentKnowledgeDocument(
        agent_id=agent_id,
        name=body.name or body.url[:200],
        type=DocumentType.url,
        source_url=body.url,
        status=DocumentStatus.pending,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    _dispatch_processing(str(doc.id))
    return {"success": True, "data": AgentDocumentResponse.model_validate(doc)}


# ── Ingest raw text ───────────────────────────────────────────────────────────


@router.post("/{agent_id}/ingest-text", status_code=status.HTTP_201_CREATED)
async def ingest_text(
    agent_id: uuid.UUID,
    body: AgentTextIngestRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_agent(agent_id, user.id, db)
    doc = AgentKnowledgeDocument(
        agent_id=agent_id,
        name=body.name,
        type=DocumentType.text,
        status=DocumentStatus.pending,
    )
    # Runs the same legacy Bijoy/SutonnyMJ Bengali-font fix used for file
    # extraction — pasted text can carry the same mis-encoded byte sequences.
    try:
        set_document_content(db, doc, body.content, mode="replace")
    except ContentTooLarge as exc:
        raise _content_too_large_response(exc) from exc
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    _dispatch_processing(str(doc.id))
    return {"success": True, "data": AgentDocumentResponse.model_validate(doc)}


# ── List documents ────────────────────────────────────────────────────────────


@router.get("/{agent_id}/documents")
async def list_documents(
    agent_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_agent(agent_id, user.id, db)
    result = await db.execute(
        select(AgentKnowledgeDocument)
        .where(AgentKnowledgeDocument.agent_id == agent_id)
        .order_by(AgentKnowledgeDocument.created_at.desc())
    )
    docs = result.scalars().all()
    return {"success": True, "data": [AgentDocumentResponse.model_validate(d) for d in docs]}


# ── Document detail + chunks ──────────────────────────────────────────────────


@router.get("/{agent_id}/documents/{document_id}")
async def get_document(
    agent_id: uuid.UUID,
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_agent(agent_id, user.id, db)
    result = await db.execute(
        select(AgentKnowledgeDocument)
        .where(
            AgentKnowledgeDocument.id == document_id,
            AgentKnowledgeDocument.agent_id == agent_id,
        )
        .options(selectinload(AgentKnowledgeDocument.chunks))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Document not found", "code": "NOT_FOUND"},
        )
    return {"success": True, "data": AgentDocumentDetailResponse.model_validate(doc)}


# ── Current editable content ─────────────────────────────────────────────────


@router.get("/{agent_id}/documents/{document_id}/content")
async def get_document_content(
    agent_id: uuid.UUID,
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_agent(agent_id, user.id, db)
    doc = await db.get(AgentKnowledgeDocument, document_id)
    if not doc or doc.agent_id != agent_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Document not found", "code": "NOT_FOUND"},
        )

    try:
        content = await get_current_content(doc)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "success": False,
                "error": f"Could not read current content: {exc}",
                "code": "EXTRACT_FAILED",
            },
        ) from exc

    return {"success": True, "data": {"content": content, "version": doc.version}}


# ── Update document content ──────────────────────────────────────────────────


@router.patch("/{agent_id}/documents/{document_id}")
async def update_document(
    agent_id: uuid.UUID,
    document_id: uuid.UUID,
    body: AgentDocumentUpdateRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_agent(agent_id, user.id, db)
    doc = await db.get(AgentKnowledgeDocument, document_id)
    if not doc or doc.agent_id != agent_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Document not found", "code": "NOT_FOUND"},
        )

    try:
        # Snapshot before renaming — the version row should capture the
        # document's name as it was, not the name it's about to become.
        set_document_content(
            db, doc, body.content, mode="replace", expected_version=body.expected_version
        )
    except VersionConflict as exc:
        raise _version_conflict_response(exc) from exc
    except ContentTooLarge as exc:
        raise _content_too_large_response(exc) from exc

    if body.name:
        doc.name = body.name

    await db.commit()
    await db.refresh(doc)

    dispatch_agent_document_processing(str(doc.id))
    return {"success": True, "data": AgentDocumentResponse.model_validate(doc)}


# ── Version history ───────────────────────────────────────────────────────────


@router.get("/{agent_id}/documents/{document_id}/versions")
async def list_document_versions(
    agent_id: uuid.UUID,
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_agent(agent_id, user.id, db)
    doc = await db.get(AgentKnowledgeDocument, document_id)
    if not doc or doc.agent_id != agent_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Document not found", "code": "NOT_FOUND"},
        )

    result = await db.execute(
        select(AgentKnowledgeDocumentVersion)
        .where(AgentKnowledgeDocumentVersion.document_id == document_id)
        .order_by(AgentKnowledgeDocumentVersion.version.desc())
    )
    versions = result.scalars().all()
    return {
        "success": True,
        "data": {
            "current_version": doc.version,
            "versions": [AgentDocumentVersionResponse.model_validate(v) for v in versions],
        },
    }


@router.post("/{agent_id}/documents/{document_id}/versions/{version}/restore")
async def restore_document_version(
    agent_id: uuid.UUID,
    document_id: uuid.UUID,
    version: int,
    user: CurrentUser,
    db: DBSession,
    expected_version: int | None = Body(None, embed=True),
) -> dict:
    await _assert_owns_agent(agent_id, user.id, db)
    doc = await db.get(AgentKnowledgeDocument, document_id)
    if not doc or doc.agent_id != agent_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Document not found", "code": "NOT_FOUND"},
        )

    result = await db.execute(
        select(AgentKnowledgeDocumentVersion).where(
            AgentKnowledgeDocumentVersion.document_id == document_id,
            AgentKnowledgeDocumentVersion.version == version,
        )
    )
    snapshot = result.scalar_one_or_none()
    if not snapshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Version not found", "code": "VERSION_NOT_FOUND"},
        )

    # Restoring is itself an edit: the content being replaced (the current,
    # post-snapshot state) gets its own version row first, so restoring an
    # old version never loses the state you restored away from. Passing
    # expected_version through means restoring against a stale view (e.g.
    # someone else edited after this history list was loaded) 409s instead
    # of silently discarding their edit.
    try:
        set_document_content(
            db,
            doc,
            snapshot.content,
            mode="replace",
            source="restore",
            instruction=f"Restored v{version}",
            expected_version=expected_version,
        )
    except VersionConflict as exc:
        raise _version_conflict_response(exc) from exc
    except ContentTooLarge as exc:
        raise _content_too_large_response(exc) from exc
    doc.name = snapshot.name

    await db.commit()
    await db.refresh(doc)

    dispatch_agent_document_processing(str(doc.id))
    return {"success": True, "data": AgentDocumentResponse.model_validate(doc)}


# ── Instruction-based edit ────────────────────────────────────────────────────


@router.post("/{agent_id}/documents/{document_id}/instruct")
async def instruct_document_edit(
    agent_id: uuid.UUID,
    document_id: uuid.UUID,
    body: AgentDocumentInstructRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    """Apply a natural-language instruction to a document without the
    caller having to supply the full replacement text themselves."""
    await _assert_owns_agent(agent_id, user.id, db)
    doc = await db.get(AgentKnowledgeDocument, document_id)
    if not doc or doc.agent_id != agent_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Document not found", "code": "NOT_FOUND"},
        )

    # Fast-fail before the slow merge call below, but this alone isn't
    # enough: expected_version is re-checked atomically at the actual write
    # (see set_document_content call below) to close the race where someone
    # else edits the document during the LLM round-trip.
    if body.expected_version is not None and body.expected_version != doc.version:
        raise _version_conflict_response(VersionConflict(body.expected_version, doc.version))

    try:
        current_content = await get_current_content(doc)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "success": False,
                "error": f"Could not read current content: {exc}",
                "code": "EXTRACT_FAILED",
            },
        ) from exc

    try:
        new_content = await merge_document_with_instruction(
            current_content, body.instruction, user.id, db
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "success": False,
                "error": f"Instruction-based edit failed: {exc}",
                "code": "MERGE_FAILED",
            },
        ) from exc

    try:
        set_document_content(
            db,
            doc,
            new_content,
            mode="replace",
            source="instruction",
            instruction=body.instruction,
            expected_version=body.expected_version,
        )
    except VersionConflict as exc:
        raise _version_conflict_response(exc) from exc
    except ContentTooLarge as exc:
        raise _content_too_large_response(exc) from exc
    await db.commit()
    await db.refresh(doc)

    dispatch_agent_document_processing(str(doc.id))
    return {"success": True, "data": AgentDocumentResponse.model_validate(doc)}


# ── Delete document ───────────────────────────────────────────────────────────


@router.delete("/{agent_id}/documents/{document_id}")
async def delete_document(
    agent_id: uuid.UUID,
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_agent(agent_id, user.id, db)
    doc = await db.get(AgentKnowledgeDocument, document_id)
    if not doc or doc.agent_id != agent_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Document not found", "code": "NOT_FOUND"},
        )

    file_url = doc.file_url
    await db.delete(doc)
    await db.commit()

    if file_url:
        await delete_file(file_url)

    return {"success": True, "data": None}


# ── Test search ───────────────────────────────────────────────────────────────


@router.post("/{agent_id}/search")
async def test_search(
    agent_id: uuid.UUID,
    body: AgentSearchRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_agent(agent_id, user.id, db)
    rag = AgentRAGService(db)
    _, chunks = await rag.query(
        agent_id=agent_id,
        user_message=body.query,
        top_k=body.top_k,
        threshold=body.threshold,
        debug=True,
    )
    return {
        "success": True,
        "data": [
            AgentSearchResultItem(
                chunk_id=c.chunk_id,
                document_id=c.document_id,
                document_name=c.document_name,
                content=c.content,
                similarity=round(c.similarity, 4),
            )
            for c in chunks
        ],
    }


# ── Helpers ───────────────────────────────────────────────────────────────────


def _version_conflict_response(exc: VersionConflict) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "success": False,
            "error": (
                f"Document was edited since you loaded it (now at version "
                f"{exc.actual}, expected {exc.expected}). Reload and reapply your change."
            ),
            "code": "VERSION_CONFLICT",
            "current_version": exc.actual,
        },
    )


def _content_too_large_response(exc: ContentTooLarge) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        detail={
            "success": False,
            "error": f"Content is {exc.length:,} characters — the limit is {exc.limit:,}.",
            "code": "CONTENT_TOO_LARGE",
        },
    )


async def _assert_owns_agent(agent_id: uuid.UUID, user_id: uuid.UUID, db) -> Agent:
    agent = await db.get(Agent, agent_id)
    if not agent or agent.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Agent not found", "code": "NOT_FOUND"},
        )
    return agent


def _dispatch_processing(document_id: str) -> None:
    dispatch_agent_document_processing(document_id)
