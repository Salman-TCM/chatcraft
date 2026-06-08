"""
Knowledge Base API
Endpoints for uploading, listing, inspecting, deleting documents,
and test-searching the vector store.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.dependencies import CurrentUser, DBSession, require_feature
from app.core.features import KNOWLEDGE_BASE
from app.models.chatbot_config import ChatbotConfig
from app.models.knowledge_base import (
    DocumentStatus,
    DocumentType,
    KnowledgeBaseChunk,
    KnowledgeBaseDocument,
)
from app.schemas.kb import (
    ChunkResponse,
    DocumentDetailResponse,
    DocumentResponse,
    SearchRequest,
    SearchResultItem,
    TextIngestRequest,
    UrlIngestRequest,
)
from app.services.kb.rag import RAGService
from app.services.storage import (
    MAX_FILE_SIZE_BYTES,
    detect_doc_type,
    upload_file,
)
from app.services.virus_scan import scan_bytes

router = APIRouter(prefix="/api/kb", tags=["knowledge-base"], dependencies=[Depends(require_feature(KNOWLEDGE_BASE))])


# ── Upload file ───────────────────────────────────────────────────────────────

@router.post("/{chatbot_id}/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    chatbot_id: uuid.UUID,
    file: UploadFile,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_chatbot(chatbot_id, user.id, db)

    # ── File size validation ──────────────────────────────────────────────────
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

    # ── Virus scan ────────────────────────────────────────────────────────────
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

    # ── MIME / extension validation ───────────────────────────────────────────
    content_type = file.content_type or "application/octet-stream"
    try:
        doc_type = detect_doc_type(file.filename or "", content_type)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"success": False, "error": str(exc), "code": "UNSUPPORTED_TYPE"},
        )

    # ── Upload to storage ─────────────────────────────────────────────────────
    try:
        file_url = await upload_file(
            data=data,
            filename=file.filename or "upload",
            content_type=content_type,
            chatbot_id=str(chatbot_id),
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"success": False, "error": str(exc), "code": "STORAGE_ERROR"},
        )

    # ── Persist document record ───────────────────────────────────────────────
    doc = KnowledgeBaseDocument(
        chatbot_id=chatbot_id,
        name=file.filename or "upload",
        type=DocumentType(doc_type),
        file_url=file_url,
        status=DocumentStatus.pending,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # ── Dispatch Celery task ──────────────────────────────────────────────────
    _dispatch_processing(str(doc.id))

    return {"success": True, "data": DocumentResponse.model_validate(doc)}


# ── Ingest URL ────────────────────────────────────────────────────────────────

@router.post("/{chatbot_id}/ingest-url", status_code=status.HTTP_201_CREATED)
async def ingest_url(
    chatbot_id: uuid.UUID,
    body: UrlIngestRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_chatbot(chatbot_id, user.id, db)

    doc = KnowledgeBaseDocument(
        chatbot_id=chatbot_id,
        name=body.name or body.url[:200],
        type=DocumentType.url,
        source_url=body.url,
        status=DocumentStatus.pending,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    _dispatch_processing(str(doc.id))
    return {"success": True, "data": DocumentResponse.model_validate(doc)}


# ── Ingest raw text ───────────────────────────────────────────────────────────

@router.post("/{chatbot_id}/ingest-text", status_code=status.HTTP_201_CREATED)
async def ingest_text(
    chatbot_id: uuid.UUID,
    body: TextIngestRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_chatbot(chatbot_id, user.id, db)

    doc = KnowledgeBaseDocument(
        chatbot_id=chatbot_id,
        name=body.name,
        type=DocumentType.text,
        raw_content=body.content,
        status=DocumentStatus.pending,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    _dispatch_processing(str(doc.id))
    return {"success": True, "data": DocumentResponse.model_validate(doc)}


# ── List documents ────────────────────────────────────────────────────────────

@router.get("/{chatbot_id}/documents")
async def list_documents(
    chatbot_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_chatbot(chatbot_id, user.id, db)

    result = await db.execute(
        select(KnowledgeBaseDocument)
        .where(KnowledgeBaseDocument.chatbot_id == chatbot_id)
        .order_by(KnowledgeBaseDocument.created_at.desc())
    )
    docs = result.scalars().all()
    return {
        "success": True,
        "data": [DocumentResponse.model_validate(d) for d in docs],
    }


# ── Document detail + chunks ──────────────────────────────────────────────────

@router.get("/{chatbot_id}/documents/{document_id}")
async def get_document(
    chatbot_id: uuid.UUID,
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_chatbot(chatbot_id, user.id, db)

    result = await db.execute(
        select(KnowledgeBaseDocument)
        .where(
            KnowledgeBaseDocument.id == document_id,
            KnowledgeBaseDocument.chatbot_id == chatbot_id,
        )
        .options(selectinload(KnowledgeBaseDocument.chunks))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Document not found", "code": "NOT_FOUND"},
        )
    return {"success": True, "data": DocumentDetailResponse.model_validate(doc)}


# ── Delete document ───────────────────────────────────────────────────────────

@router.delete("/{chatbot_id}/documents/{document_id}")
async def delete_document(
    chatbot_id: uuid.UUID,
    document_id: uuid.UUID,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_chatbot(chatbot_id, user.id, db)

    doc = await db.get(KnowledgeBaseDocument, document_id)
    if not doc or doc.chatbot_id != chatbot_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Document not found", "code": "NOT_FOUND"},
        )

    await db.delete(doc)
    await db.commit()
    return {"success": True, "data": None}


# ── Test search ───────────────────────────────────────────────────────────────

@router.post("/{chatbot_id}/search")
async def test_search(
    chatbot_id: uuid.UUID,
    body: SearchRequest,
    user: CurrentUser,
    db: DBSession,
) -> dict:
    await _assert_owns_chatbot(chatbot_id, user.id, db)

    rag = RAGService(db)
    # Temporarily lower threshold to the value provided in the request
    import app.services.kb.rag as _rag_module
    orig = _rag_module.RELEVANCE_THRESHOLD
    _rag_module.RELEVANCE_THRESHOLD = body.threshold
    try:
        _, chunks = await rag.query(
            chatbot_id=chatbot_id,
            user_message=body.query,
            top_k=body.top_k,
            debug=True,
        )
    finally:
        _rag_module.RELEVANCE_THRESHOLD = orig

    return {
        "success": True,
        "data": [
            SearchResultItem(
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

async def _assert_owns_chatbot(
    chatbot_id: uuid.UUID, user_id: uuid.UUID, db
) -> ChatbotConfig:
    bot = await db.get(ChatbotConfig, chatbot_id)
    if not bot or bot.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": "Chatbot not found", "code": "NOT_FOUND"},
        )
    return bot


def _dispatch_processing(document_id: str) -> None:
    """Fire-and-forget Celery task; swallows broker errors so upload still succeeds."""
    try:
        from app.workers.embedding_worker import process_document
        process_document.delay(document_id)
    except Exception as exc:
        from app.core.logging import logger
        logger.warning(f"Failed to enqueue process_document for {document_id}: {exc!r}")
