"""
calculate_faraid agent-tool wiring tests — schema exposure and dispatch,
without spinning up a full agent chat loop or database.
"""

import json

import pytest

from app.api.agents import _build_builtin_tools, _execute_tool


def test_tool_schema_present_when_enabled():
    tools = _build_builtin_tools({"faraid": True})
    names = [t["name"] for t in tools]
    assert "calculate_faraid" in names
    tool = next(t for t in tools if t["name"] == "calculate_faraid")
    assert tool["input_schema"]["required"] == ["decedent_gender", "gross_estate", "heirs"]


def test_tool_schema_absent_when_disabled():
    tools = _build_builtin_tools({"faraid": False})
    assert "calculate_faraid" not in [t["name"] for t in tools]

    tools = _build_builtin_tools({})
    assert "calculate_faraid" not in [t["name"] for t in tools]


@pytest.mark.asyncio
async def test_execute_tool_dispatches_to_faraid_calculator():
    inputs = {
        "decedent_gender": "male",
        "gross_estate": "90000.00",
        "heirs": {"father": True, "mother": True, "sons": 2, "daughters": 1},
    }
    raw = await _execute_tool("calculate_faraid", inputs, mcp_map={}, ctx={})
    parsed = json.loads(raw)
    assert parsed["madhhab"] == "hanafi"
    heir_types = {h["heir_type"] for h in parsed["eligible_heirs"]}
    assert {"mother", "father", "sons", "daughters"} <= heir_types
    assert "not a fatwa" in parsed["disclaimer"]


@pytest.mark.asyncio
async def test_execute_tool_reports_invalid_input_without_guessing():
    """No heirs at all should surface a clear, model-actionable error string
    instead of raising or fabricating a result."""
    inputs = {"decedent_gender": "male", "gross_estate": "1000", "heirs": {}}
    raw = await _execute_tool("calculate_faraid", inputs, mcp_map={}, ctx={})
    assert raw.startswith("Error:")
    assert "ask the user" in raw.lower()


@pytest.mark.asyncio
async def test_execute_tool_rejects_gender_inconsistent_heir():
    inputs = {"decedent_gender": "male", "gross_estate": "1000", "heirs": {"husband": True}}
    raw = await _execute_tool("calculate_faraid", inputs, mcp_map={}, ctx={})
    assert raw.startswith("Error:")


def test_calculate_faraid_in_public_share_allowlist():
    from app.api.agents import _PUBLIC_SHARE_TOOL_ALLOWLIST

    assert "calculate_faraid" in _PUBLIC_SHARE_TOOL_ALLOWLIST


def test_faraid_tools_config_field_exists():
    from app.schemas.agent import AgentToolsConfig

    cfg = AgentToolsConfig(faraid=True)
    assert cfg.faraid is True
    assert AgentToolsConfig().faraid is False


# ─── Self-computed-share detection (bypass safety net) ─────────────────────
#
# Weak/self-hosted models sometimes skip calculate_faraid entirely and just
# compute a share themselves in freeform text, defeating the whole point of
# the deterministic tool. _looks_like_unverified_faraid_share() is the
# safety-net heuristic _run_agent_openai_compat uses to catch that and force
# one corrective retry instead of silently sending the self-computed answer.


def test_flags_reply_with_ascii_fraction():
    from app.api.agents import _looks_like_unverified_faraid_share

    reply = "স্ত্রী: ১/৮ অংশ পাবেন। প্রতি পুত্র পাবে: 7/20"
    assert _looks_like_unverified_faraid_share(reply) is True


def test_flags_reply_with_spaced_fraction():
    from app.api.agents import _looks_like_unverified_faraid_share

    assert _looks_like_unverified_faraid_share("The wife gets 1 / 8 of the estate.") is True


def test_does_not_flag_reply_with_no_fraction():
    from app.api.agents import _looks_like_unverified_faraid_share

    reply = "Could you confirm whether the deceased's parents are still living?"
    assert _looks_like_unverified_faraid_share(reply) is False


def test_does_not_flag_empty_reply():
    from app.api.agents import _looks_like_unverified_faraid_share

    assert _looks_like_unverified_faraid_share("") is False
