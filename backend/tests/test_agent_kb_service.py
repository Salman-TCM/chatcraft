"""
set_document_content is the single write path used by the dashboard's
PATCH-document endpoint, the restore/instruct endpoints, and the
update_kb_document / edit_kb_document agent tools. It must:
  - run pasted/agent-composed text through the same Bijoy/SutonnyMJ
    legacy-Bengali fix used for file extraction, since copy-pasted text can
    carry the same mis-encoded byte sequences a legacy-encoded PDF/DOCX
    would;
  - snapshot the document's prior state into a version row (when there is
    prior text to snapshot) and bump doc.version on every edit of a
    persisted document, even its first — the version bump can't be
    conditioned on there being something to snapshot, or optimistic
    concurrency silently breaks for a document's first-ever edit (two
    concurrent writers both checking expected_version==1 would both
    succeed, since nothing would move it to 2);
  - enforce optimistic concurrency when a caller passes expected_version;
    and
  - reject (not silently truncate) content beyond the size limit, checked
    before anything is mutated so a rejected write has no side effects —
    enforced here centrally, not just in the HTTP request schema, since
    append mode can push two schema-legal pieces over the limit together,
    and the agent tools don't go through that schema at all.
"""

import pytest

from app.models.agent_knowledge_base import AgentKnowledgeDocument, AgentKnowledgeDocumentVersion
from app.models.knowledge_base import DocumentStatus, DocumentType
from app.services.kb.agent_kb_service import (
    ContentTooLarge,
    VersionConflict,
    set_document_content,
)

_BIJOY_SAMPLE = (
    "mvwjkx cwil` MwVZ n‡e|\n"
    " GK Rb †Pqvig¨vb I GB Aa¨v‡`‡k ewY©Z wel‡qi m‡½ hy³ cÿ mg~‡ni cÖ‡Z¨‡Ki GKRb K‡i\n"
    "cÖwZwbwai mgš^‡q mvwjkx cwil` (Arbitration Council) MVb Kiv nq|"
)


class _FakeDB:
    """Records db.add() calls without touching a real session — the only
    thing set_document_content needs from `db`."""

    def __init__(self) -> None:
        self.added: list = []

    def add(self, obj) -> None:
        self.added.append(obj)


def _new_doc(persisted: bool = False) -> AgentKnowledgeDocument:
    import uuid

    doc = AgentKnowledgeDocument(name="Test Doc", type=DocumentType.text)
    if persisted:
        doc.id = uuid.uuid4()
    return doc


def test_replace_fixes_legacy_bengali_encoding():
    db, doc = _FakeDB(), _new_doc()
    set_document_content(db, doc, _BIJOY_SAMPLE, mode="replace")
    assert doc.raw_content != _BIJOY_SAMPLE
    assert "পরিষদ" in doc.raw_content
    assert doc.status == DocumentStatus.pending
    assert doc.error_message is None


def test_replace_leaves_plain_english_untouched():
    db, doc = _FakeDB(), _new_doc()
    set_document_content(db, doc, "Plain English content.", mode="replace")
    assert doc.raw_content == "Plain English content."


def test_append_fixes_new_chunk_and_keeps_existing_content():
    db, doc = _FakeDB(), _new_doc()
    doc.raw_content = "Existing correct notes."
    set_document_content(db, doc, _BIJOY_SAMPLE, mode="append")
    assert doc.raw_content.startswith("Existing correct notes.")
    assert "পরিষদ" in doc.raw_content


def test_append_with_no_existing_content_behaves_like_replace():
    db, doc = _FakeDB(), _new_doc()
    set_document_content(db, doc, _BIJOY_SAMPLE, mode="append")
    assert "পরিষদ" in doc.raw_content


def test_resets_error_state_on_edit():
    db, doc = _FakeDB(), _new_doc()
    doc.status = DocumentStatus.error
    doc.error_message = "previous failure"
    set_document_content(db, doc, "New content.", mode="replace")
    assert doc.status == DocumentStatus.pending
    assert doc.error_message is None


def test_first_write_on_a_new_document_does_not_snapshot_or_bump_version():
    # version's `default=1` is a mapped-column default applied by SQLAlchemy
    # at flush time, not on plain construction — set it explicitly here to
    # mirror the value a real caller would see after db.add()+commit().
    db, doc = _FakeDB(), _new_doc(persisted=False)
    doc.version = 1
    set_document_content(db, doc, "Initial content.", mode="replace")
    assert db.added == []
    assert doc.version == 1


def test_editing_a_persisted_document_snapshots_prior_content_and_bumps_version():
    db, doc = _FakeDB(), _new_doc(persisted=True)
    doc.name = "Policy"
    doc.raw_content = "Old content."
    doc.version = 1

    set_document_content(db, doc, "New content.", mode="replace", source="user")

    assert doc.raw_content == "New content."
    assert doc.version == 2
    assert len(db.added) == 1
    snapshot = db.added[0]
    assert isinstance(snapshot, AgentKnowledgeDocumentVersion)
    assert snapshot.content == "Old content."
    assert snapshot.name == "Policy"
    assert snapshot.version == 1
    assert snapshot.source == "user"


def test_first_edit_of_a_persisted_document_with_no_prior_content_still_bumps_version():
    # A pdf/url-type document that's never been edited before has no
    # raw_content captured yet, so there's nothing to snapshot — but the
    # version must still bump, or a second writer racing on the same
    # expected_version=1 would never see a conflict (the exact regression
    # this test guards against).
    db, doc = _FakeDB(), _new_doc(persisted=True)
    doc.version = 1

    set_document_content(db, doc, "First edit.", mode="replace", expected_version=1)

    assert db.added == []
    assert doc.version == 2

    with pytest.raises(VersionConflict):
        set_document_content(db, doc, "Second edit.", mode="replace", expected_version=1)


def test_matching_expected_version_succeeds():
    db, doc = _FakeDB(), _new_doc(persisted=True)
    doc.raw_content = "Old content."
    doc.version = 3

    set_document_content(db, doc, "New content.", mode="replace", expected_version=3)

    assert doc.version == 4


def test_stale_expected_version_raises_version_conflict():
    db, doc = _FakeDB(), _new_doc(persisted=True)
    doc.raw_content = "Old content."
    doc.version = 3

    with pytest.raises(VersionConflict) as exc_info:
        set_document_content(db, doc, "New content.", mode="replace", expected_version=2)

    assert exc_info.value.expected == 2
    assert exc_info.value.actual == 3
    # Rejected write must not have mutated the document at all.
    assert doc.raw_content == "Old content."
    assert doc.version == 3
    assert db.added == []


def test_replace_over_limit_raises_content_too_large_without_mutating():
    db, doc = _FakeDB(), _new_doc(persisted=True)
    doc.raw_content = "Old content."
    doc.version = 1

    with pytest.raises(ContentTooLarge) as exc_info:
        set_document_content(db, doc, "x" * 500_001, mode="replace")

    assert exc_info.value.length == 500_001
    assert exc_info.value.limit == 500_000
    assert doc.raw_content == "Old content."
    assert doc.version == 1
    assert db.added == []


def test_append_that_pushes_combined_content_over_limit_raises_content_too_large():
    # Each piece alone would be schema-legal (under 500,000 chars) — only
    # the combined result exceeds the limit, which only a check inside
    # set_document_content (not a per-request schema field) can catch.
    db, doc = _FakeDB(), _new_doc(persisted=True)
    doc.raw_content = "x" * 400_000
    doc.version = 1

    with pytest.raises(ContentTooLarge):
        set_document_content(db, doc, "y" * 200_000, mode="append")

    assert doc.raw_content == "x" * 400_000
    assert doc.version == 1
    assert db.added == []


def test_content_within_limit_succeeds():
    db, doc = _FakeDB(), _new_doc(persisted=True)
    doc.version = 1
    set_document_content(db, doc, "x" * 500_000, mode="replace")
    assert len(doc.raw_content) == 500_000
