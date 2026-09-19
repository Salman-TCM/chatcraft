"""
Shared helpers for writing to an AgentKnowledgeDocument's content.

Used by both the dashboard API (app/api/agent_kb.py, PATCH endpoint) and the
update_kb_document agent tool (app/api/agents.py), so a human editing a
document from the UI and the agent editing it via tool call go through the
exact same reprocessing path.
"""

from app.models.agent_knowledge_base import AgentKnowledgeDocument
from app.models.knowledge_base import DocumentStatus
from app.services.kb.extractor import fix_legacy_bengali_encoding


def set_document_content(
    doc: AgentKnowledgeDocument, content: str, mode: str = "replace"
) -> None:
    """Overwrite (or append to) a document's text content in place.

    Once set, `raw_content` becomes this document's source of truth: the
    extraction step (extract_text_for_document) skips re-fetching the
    original file/URL and re-chunks/re-embeds straight from this text, so
    edits work the same way regardless of the document's original type.

    Runs the same Bijoy/SutonnyMJ legacy-Bengali-font fix used for freshly
    extracted files: pasting text copied out of a legacy-encoded Word/PDF
    straight into the edit box (or having an agent relay it) hits the same
    mis-encoded byte sequences, so it needs the same correction, not just
    text that came in through file extraction. No-op on already-correct
    Unicode text (English or otherwise).

    Caller is responsible for committing and dispatching reprocessing.
    """
    content = fix_legacy_bengali_encoding(content.strip())
    if mode == "append" and doc.raw_content:
        content = f"{doc.raw_content.rstrip()}\n\n{content}"

    doc.raw_content = content
    doc.status = DocumentStatus.pending
    doc.error_message = None


def dispatch_agent_document_processing(document_id: str) -> None:
    try:
        from app.workers.embedding_worker import process_agent_document

        process_agent_document.delay(document_id)
    except Exception as exc:
        from app.core.logging import logger

        logger.warning(f"Failed to enqueue process_agent_document for {document_id}: {exc!r}")
