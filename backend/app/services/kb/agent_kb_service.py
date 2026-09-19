"""
Shared helpers for writing to an AgentKnowledgeDocument's content.

Used by both the dashboard API (app/api/agent_kb.py — manual edits and
instruction-based edits) and the update_kb_document / edit_kb_document agent
tools (app/api/agents.py), so every write path — human or agent — goes
through the same versioning, concurrency check, and text normalization.
"""

import uuid

from app.models.agent_knowledge_base import AgentKnowledgeDocument, AgentKnowledgeDocumentVersion
from app.models.knowledge_base import DocumentStatus
from app.services.kb.extractor import fix_legacy_bengali_encoding

_MAX_CONTENT_CHARS = 500_000


class VersionConflict(Exception):
    """Raised when a caller's expected_version doesn't match the document's
    current version — someone else (or the agent) edited it in the meantime."""

    def __init__(self, expected: int, actual: int) -> None:
        self.expected = expected
        self.actual = actual
        super().__init__(f"expected version {expected}, document is at {actual}")


class ContentTooLarge(Exception):
    """Raised when the resulting content would exceed _MAX_CONTENT_CHARS.

    Enforced centrally here (not just at the request-schema layer) because
    append mode combines the new text with whatever's already stored — two
    schema-legal pieces can still add up to an over-limit document, and the
    agent tools don't go through the HTTP schema at all."""

    def __init__(self, length: int) -> None:
        self.length = length
        self.limit = _MAX_CONTENT_CHARS
        super().__init__(f"content is {length} chars, limit is {_MAX_CONTENT_CHARS}")


def set_document_content(
    db,
    doc: AgentKnowledgeDocument,
    content: str,
    mode: str = "replace",
    source: str = "user",
    instruction: str | None = None,
    expected_version: int | None = None,
) -> None:
    """Overwrite (or append to) a document's text content in place.

    Once set, `raw_content` becomes this document's source of truth: the
    extraction step (extract_text_for_document) skips re-fetching the
    original file/URL and re-chunks/re-embeds straight from this text, so
    edits work the same way regardless of the document's original type.

    `doc.version` is bumped on every accepted edit of a persisted document
    (not just when there's prior content to snapshot into
    agent_kb_document_versions — a pdf/docx/txt/url document's first-ever
    edit still needs the bump, or a second concurrent writer racing against
    that same expected_version would never see a conflict). A snapshot row
    is only added when there's actual prior text to preserve. Pass
    `expected_version` to reject a write against a version that's no
    longer current (raises VersionConflict) instead of silently clobbering
    a newer edit.

    The version row is added straight to `db` rather than through
    `doc.versions` — appending to that relationship would force an implicit
    lazy-load on an AsyncSession, which raises outside a greenlet context.

    Runs the same Bijoy/SutonnyMJ legacy-Bengali-font fix used for freshly
    extracted files: pasting text copied out of a legacy-encoded Word/PDF
    straight into the edit box (or having an agent relay it) hits the same
    mis-encoded byte sequences, so it needs the same correction, not just
    text that came in through file extraction. No-op on already-correct
    Unicode text (English or otherwise).

    Raises ContentTooLarge (checked before anything is mutated, so a
    rejected write has no side effects) if the resulting text — after
    append merges with existing content — would exceed _MAX_CONTENT_CHARS.

    Caller is responsible for committing and dispatching reprocessing.
    """
    if expected_version is not None and expected_version != doc.version:
        raise VersionConflict(expected_version, doc.version)

    content = fix_legacy_bengali_encoding(content.strip())
    if mode == "append" and doc.raw_content:
        content = f"{doc.raw_content.rstrip()}\n\n{content}"

    if len(content) > _MAX_CONTENT_CHARS:
        raise ContentTooLarge(len(content))

    if doc.id is not None:
        if doc.raw_content:
            db.add(
                AgentKnowledgeDocumentVersion(
                    document_id=doc.id,
                    version=doc.version,
                    name=doc.name,
                    content=doc.raw_content,
                    source=source,
                    instruction=instruction,
                )
            )
        doc.version += 1

    doc.raw_content = content
    doc.status = DocumentStatus.pending
    doc.error_message = None


async def get_current_content(doc: AgentKnowledgeDocument) -> str:
    """Return the document's current editable text: `raw_content` if it's
    ever been set, otherwise a live extraction from the original file/URL
    (never persisted — that only happens through an explicit edit)."""
    if doc.raw_content:
        return doc.raw_content

    from app.services.kb.extractor import extract_text_for_document

    return await extract_text_for_document(
        doc_type=doc.type.value,
        file_url=doc.file_url,
        source_url=doc.source_url,
        raw_content=doc.raw_content,
    )


async def merge_document_with_instruction(
    current_content: str, instruction: str, user_id: uuid.UUID, db
) -> str:
    """Apply a natural-language edit instruction to a document's full text
    with one cheap, non-streaming LLM call, and return the complete updated
    text. Lets a caller (dashboard or agent tool) make a targeted change —
    "update the refund window to 30 days" — without having to retype the
    entire document itself.

    Known limitation: the model must emit the whole document in its
    response, so this doesn't scale to documents near or beyond the
    completion model's output token limit — fine for typical KB notes/
    policies, not for book-length documents.
    """
    from app.services.llm.base import ChatMessage
    from app.services.llm.key_store import get_all_keys
    from app.services.llm.router import LLMRouter

    api_keys = await get_all_keys(user_id, db)
    llm = LLMRouter(model="claude-haiku-4-5", fallback_model="gpt-4o-mini", api_keys=api_keys)

    system = (
        "You edit documents. You are given the CURRENT full text of a document and "
        "an INSTRUCTION describing a change to make. Apply the instruction precisely "
        "and leave everything else — wording, structure, formatting — exactly as-is. "
        "Respond with ONLY the complete updated document text: no preamble, no "
        "explanation, no markdown code fences."
    )
    user_msg = f"CURRENT DOCUMENT:\n{current_content}\n\nINSTRUCTION:\n{instruction}"

    resp = await llm.complete(
        [ChatMessage(role="system", content=system), ChatMessage(role="user", content=user_msg)],
        max_tokens=8192,
        temperature=0.2,
    )
    return resp.content.strip()


def dispatch_agent_document_processing(document_id: str) -> None:
    try:
        from app.workers.embedding_worker import process_agent_document

        process_agent_document.delay(document_id)
    except Exception as exc:
        from app.core.logging import logger

        logger.warning(f"Failed to enqueue process_agent_document for {document_id}: {exc!r}")
