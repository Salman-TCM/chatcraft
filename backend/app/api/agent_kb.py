"""
Per-Agent Knowledge Base API.

Mirrors kb.py but scopes documents to Agent (not ChatbotConfig). Uses the
agent_kb_documents / agent_kb_chunks tables and the process_agent_document
Celery task. Storage keys are namespaced under `kb/agent/{agent_id}/…`.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.dependencies import CurrentUser, DBSession, require_feature
from app.core.features import KNOWLEDGE_BASE
from app.models.agent import Agent
from app.models.agent_knowledge_base import AgentKnowledgeDocument
from app.models.knowledge_base import DocumentStatus, DocumentType
from app.schemas.agent_kb import (
    AgentDocumentDetailResponse,
    AgentDocumentResponse,
    AgentDocumentUpdateRequest,
    AgentSearchRequest,
    AgentSearchResultItem,
    AgentTextIngestRequest,
    AgentUrlIngestRequest,
)
from app.services.kb.agent_kb_service import (
    dispatch_agent_document_processing,
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
        raw_content=body.content,
        status=DocumentStatus.pending,
    )
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

    if doc.raw_content:
        content = doc.raw_content
    else:
        # Never edited before — pull the current text straight from the
        # original source (file/URL) so the editor starts from real content.
        from app.services.kb.extractor import extract_text_for_document

        try:
            content = await extract_text_for_document(
                doc_type=doc.type.value,
                file_url=doc.file_url,
                source_url=doc.source_url,
                raw_content=doc.raw_content,
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "success": False,
                    "error": f"Could not read current content: {exc}",
                    "code": "EXTRACT_FAILED",
                },
            ) from exc

    return {"success": True, "data": {"content": content}}


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

    if body.name:
        doc.name = body.name
    set_document_content(doc, body.content, mode="replace")

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
