"""
Pure-logic tests for the agent Run-chat attachment endpoint's helpers —
MIME/extension resolution and truncation, without spinning up a full
request/DB (the endpoint itself just wires these to _get_owned_agent and
the existing KB extractor functions, both already covered elsewhere).
"""

from app.api.agents import (
    _ATTACHMENT_MAX_CHARS,
    _resolve_attachment_doc_type,
    _truncate_attachment_text,
)


def test_resolves_doc_type_from_mime():
    assert _resolve_attachment_doc_type("application/pdf", "whatever.bin") == "pdf"
    assert (
        _resolve_attachment_doc_type(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "whatever.bin",
        )
        == "docx"
    )
    assert _resolve_attachment_doc_type("text/plain", "whatever.bin") == "txt"


def test_falls_back_to_extension_when_mime_missing_or_generic():
    assert _resolve_attachment_doc_type(None, "notice.PDF") == "pdf"
    assert _resolve_attachment_doc_type("application/octet-stream", "contract.docx") == "docx"
    assert _resolve_attachment_doc_type("", "notes.txt") == "txt"


def test_returns_none_for_unsupported_type():
    assert _resolve_attachment_doc_type("image/png", "photo.png") is None
    assert _resolve_attachment_doc_type(None, "archive.zip") is None
    assert _resolve_attachment_doc_type(None, None) is None


def test_truncate_leaves_short_text_untouched():
    text, truncated = _truncate_attachment_text("  hello world  ")
    assert text == "hello world"
    assert truncated is False


def test_truncate_caps_long_text_and_flags_it():
    long_text = "a" * (_ATTACHMENT_MAX_CHARS + 500)
    text, truncated = _truncate_attachment_text(long_text)
    assert len(text) == _ATTACHMENT_MAX_CHARS
    assert truncated is True


def test_truncate_boundary_exact_limit_not_flagged():
    exact = "a" * _ATTACHMENT_MAX_CHARS
    text, truncated = _truncate_attachment_text(exact)
    assert text == exact
    assert truncated is False
