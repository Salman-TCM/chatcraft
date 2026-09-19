"""
set_document_content is the single write path used by both the dashboard's
PATCH-document endpoint and the update_kb_document agent tool. It must run
pasted/agent-composed text through the same Bijoy/SutonnyMJ legacy-Bengali
fix used for file extraction, since copy-pasted text can carry the same
mis-encoded byte sequences a legacy-encoded PDF/DOCX would.
"""

from app.models.agent_knowledge_base import AgentKnowledgeDocument
from app.models.knowledge_base import DocumentStatus, DocumentType
from app.services.kb.agent_kb_service import set_document_content

_BIJOY_SAMPLE = (
    "mvwjkx cwil` MwVZ n‡e|\n"
    " GK Rb †Pqvig¨vb I GB Aa¨v‡`‡k ewY©Z wel‡qi m‡½ hy³ cÿ mg~‡ni cÖ‡Z¨‡Ki GKRb K‡i\n"
    "cÖwZwbwai mgš^‡q mvwjkx cwil` (Arbitration Council) MVb Kiv nq|"
)


def _new_doc() -> AgentKnowledgeDocument:
    return AgentKnowledgeDocument(name="Test Doc", type=DocumentType.text)


def test_replace_fixes_legacy_bengali_encoding():
    doc = _new_doc()
    set_document_content(doc, _BIJOY_SAMPLE, mode="replace")
    assert doc.raw_content != _BIJOY_SAMPLE
    assert "পরিষদ" in doc.raw_content
    assert doc.status == DocumentStatus.pending
    assert doc.error_message is None


def test_replace_leaves_plain_english_untouched():
    doc = _new_doc()
    set_document_content(doc, "Plain English content.", mode="replace")
    assert doc.raw_content == "Plain English content."


def test_append_fixes_new_chunk_and_keeps_existing_content():
    doc = _new_doc()
    doc.raw_content = "Existing correct notes."
    set_document_content(doc, _BIJOY_SAMPLE, mode="append")
    assert doc.raw_content.startswith("Existing correct notes.")
    assert "পরিষদ" in doc.raw_content


def test_append_with_no_existing_content_behaves_like_replace():
    doc = _new_doc()
    set_document_content(doc, _BIJOY_SAMPLE, mode="append")
    assert "পরিষদ" in doc.raw_content


def test_resets_error_state_on_edit():
    doc = _new_doc()
    doc.status = DocumentStatus.error
    doc.error_message = "previous failure"
    set_document_content(doc, "New content.", mode="replace")
    assert doc.status == DocumentStatus.pending
    assert doc.error_message is None
