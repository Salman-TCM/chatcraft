"""Unit tests for Pydantic schema validation edge cases."""

import pytest
from pydantic import ValidationError

from app.schemas.chat import (
    ChatbotCreateRequest,
    ChatbotUpdateRequest,
    ChatRequest,
)


def test_chatbot_create_name_required():
    with pytest.raises(ValidationError):
        ChatbotCreateRequest(name="")  # min_length=1


def test_chatbot_create_name_max_length():
    with pytest.raises(ValidationError):
        ChatbotCreateRequest(name="x" * 256)  # max 255


def test_chatbot_create_defaults():
    req = ChatbotCreateRequest(name="My Bot")
    assert req.default_model == "claude-sonnet-4-6"
    assert req.allow_model_switch is False
    assert req.system_prompt is None


def test_chatbot_update_colour_validation():
    with pytest.raises(ValidationError):
        ChatbotUpdateRequest(primary_colour="not-a-hex")


def test_chatbot_update_valid_colour():
    req = ChatbotUpdateRequest(primary_colour="#6366f1")
    assert req.primary_colour == "#6366f1"


def test_chatbot_update_bubble_style_validation():
    with pytest.raises(ValidationError):
        ChatbotUpdateRequest(bubble_style="oval")  # not in rounded|square|pill


def test_chatbot_update_valid_bubble_styles():
    for style in ("rounded", "square", "pill"):
        req = ChatbotUpdateRequest(bubble_style=style)
        assert req.bubble_style == style


def test_chat_request_empty_message():
    with pytest.raises(ValidationError):
        ChatRequest(message="")  # min_length=1


def test_chat_request_message_too_long():
    with pytest.raises(ValidationError):
        ChatRequest(message="x" * 32_001)  # max 32000


def test_chat_request_valid():
    req = ChatRequest(message="Hello!")
    assert req.conversation_id is None
    assert req.model is None
