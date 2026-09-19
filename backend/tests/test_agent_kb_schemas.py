"""
AgentDocumentUpdateRequest/AgentTextIngestRequest.content and
AgentDocumentInstructRequest.instruction must reject whitespace-only input.
min_length alone doesn't catch it (a single space has length 1), and if it
slips through, set_document_content strips it to "" — which is falsy, so
extract_text_for_document silently falls back to re-extracting the
document's original file/URL instead of the edit actually taking effect.
"""

import pytest
from pydantic import ValidationError

from app.schemas.agent_kb import (
    AgentDocumentInstructRequest,
    AgentDocumentUpdateRequest,
    AgentTextIngestRequest,
)


def test_update_request_rejects_whitespace_only_content():
    with pytest.raises(ValidationError):
        AgentDocumentUpdateRequest(content="   ")


def test_update_request_accepts_real_content():
    req = AgentDocumentUpdateRequest(content="Real content.")
    assert req.content == "Real content."


def test_text_ingest_rejects_whitespace_only_content():
    with pytest.raises(ValidationError):
        AgentTextIngestRequest(content="\n\t ", name="Doc")


def test_instruct_request_rejects_whitespace_only_instruction():
    with pytest.raises(ValidationError):
        AgentDocumentInstructRequest(instruction="   ")


def test_instruct_request_accepts_real_instruction():
    req = AgentDocumentInstructRequest(instruction="Update the refund window to 30 days.")
    assert req.instruction == "Update the refund window to 30 days."
