"""
End-to-end regression test for the self-hosted/OpenAI-compatible agent loop:
a weak model that skips calculate_faraid and just computes a share itself in
plain text must be caught and given exactly one corrective retry, instead of
that self-computed (unverified) share ever reaching the user.

This reproduces the exact failure observed against a live self-hosted-model
agent: the model answered a real Faraid question with fractions computed in
freeform text, with no tool_call ever emitted.
"""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.api.agents import _build_builtin_tools, _run_agent_openai_compat


def _msg(content="", tool_calls=None):
    return SimpleNamespace(content=content, tool_calls=tool_calls)


def _response(content="", tool_calls=None, finish_reason="stop"):
    choice = SimpleNamespace(message=_msg(content, tool_calls), finish_reason=finish_reason)
    return SimpleNamespace(choices=[choice])


def _tool_call(name, args, call_id="call_1"):
    return SimpleNamespace(
        id=call_id,
        function=SimpleNamespace(name=name, arguments=json.dumps(args)),
    )


def _fake_agent():
    return SimpleNamespace(
        id="00000000-0000-0000-0000-000000000001",
        user_id="00000000-0000-0000-0000-000000000002",
        model="self-hosted/some-weak-model",
        max_steps=10,
    )


async def _collect_events(agent, tools):
    events = []
    async for chunk in _run_agent_openai_compat(
        agent,
        system_prompt="You are a Faraid assistant. Always call calculate_faraid.",
        tools=tools,
        mcp_map={},
        user_message="Wife, 2 sons, 1 daughter, estate 1000000, no debts.",
        history=[],
        api_key="not-needed",
        base_url="http://fake-endpoint/v1",
    ):
        for line in chunk.splitlines():
            if line.startswith("data: "):
                events.append(json.loads(line[len("data: ") :]))
    return events


@pytest.mark.asyncio
async def test_self_computed_share_is_intercepted_and_corrected():
    tools = _build_builtin_tools({"faraid": True})
    agent = _fake_agent()

    leaked_text = "স্ত্রী: ১/৮ অংশ পাবেন। প্রতি পুত্র পাবে: 7/20, কন্যা পাবে 7/40।"
    faraid_args = {
        "decedent_gender": "male",
        "gross_estate": "1000000",
        "heirs": {"sons": 2, "daughters": 1},
    }
    final_text = "The wife receives 125,000, each son 350,000, and the daughter 175,000."

    responses = [
        _response(content=leaked_text, tool_calls=None, finish_reason="stop"),
        _response(
            content="",
            tool_calls=[_tool_call("calculate_faraid", faraid_args)],
            finish_reason="tool_calls",
        ),
        _response(content=final_text, tool_calls=None, finish_reason="stop"),
    ]

    mock_create = AsyncMock(side_effect=responses)
    fake_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=mock_create)))

    with patch("app.api.agents.AsyncOpenAI", return_value=fake_client):
        events = await _collect_events(agent, tools)

    # The self-computed leak must never reach the client as a text event.
    text_events = [e["content"] for e in events if e["type"] == "text"]
    assert leaked_text not in text_events
    assert not any("১/৮" in t or "7/20" in t for t in text_events)

    # calculate_faraid must actually have been invoked.
    tool_calls = [e for e in events if e["type"] == "tool_call"]
    assert len(tool_calls) == 1
    assert tool_calls[0]["tool"] == "calculate_faraid"

    # The real, tool-verified explanation should reach the client.
    assert final_text in text_events

    # Exactly the 3 modeled turns — one retry, not an infinite loop.
    assert mock_create.await_count == 3


@pytest.mark.asyncio
async def test_only_retries_once_if_model_keeps_self_computing():
    """If the model ignores the correction and self-computes again, we must
    not loop forever — it only gets one forced retry, then the turn ends."""
    tools = _build_builtin_tools({"faraid": True})
    agent = _fake_agent()

    leaked_text_1 = "Wife: 1/8 of the estate."
    leaked_text_2 = "Wife: 1/8 of the estate, sons get 7/20 each."

    responses = [
        _response(content=leaked_text_1, tool_calls=None, finish_reason="stop"),
        _response(content=leaked_text_2, tool_calls=None, finish_reason="stop"),
    ]
    mock_create = AsyncMock(side_effect=responses)
    fake_client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=mock_create)))

    with patch("app.api.agents.AsyncOpenAI", return_value=fake_client):
        events = await _collect_events(agent, tools)

    # No tool call ever happened, and the second (still-leaking) reply is
    # allowed through rather than retrying forever.
    assert not any(e["type"] == "tool_call" for e in events)
    text_events = [e["content"] for e in events if e["type"] == "text"]
    assert leaked_text_2 in text_events
    assert mock_create.await_count == 2
