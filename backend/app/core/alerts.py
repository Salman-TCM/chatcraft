"""
Post error alerts to a Slack incoming webhook.

Configure SLACK_ALERT_WEBHOOK_URL in the environment to enable.
If the URL is absent the helpers are silent no-ops.
"""
from __future__ import annotations

import traceback
from typing import Any

from loguru import logger

from app.core.config import settings


def _build_slack_payload(title: str, body: str, fields: dict[str, Any]) -> dict:
    blocks: list[dict] = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": title, "emoji": True},
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": body},
        },
    ]

    if fields:
        field_elements = [
            {
                "type": "mrkdwn",
                "text": f"*{k}*\n{v}",
            }
            for k, v in fields.items()
        ]
        # Slack limits section fields to 10 items
        for i in range(0, len(field_elements), 10):
            blocks.append(
                {
                    "type": "section",
                    "fields": field_elements[i : i + 10],
                }
            )

    blocks.append({"type": "divider"})
    return {"blocks": blocks}


def send_error_alert(
    title: str,
    body: str,
    fields: dict[str, Any] | None = None,
) -> None:
    """Post a structured error alert to the configured Slack webhook (sync)."""
    if not settings.slack_alert_webhook_url:
        return

    try:
        import httpx

        payload = _build_slack_payload(
            title,
            body,
            {"Environment": settings.environment, **(fields or {})},
        )
        response = httpx.post(
            settings.slack_alert_webhook_url,
            json=payload,
            timeout=5,
        )
        response.raise_for_status()
    except Exception:
        # Never let alerting failures crash the app
        logger.warning("Failed to send Slack alert")


def alert_on_exception(exc: BaseException, context: dict[str, Any] | None = None) -> None:
    """Convenience wrapper: format an exception and send to Slack."""
    exc_type = type(exc).__name__
    tb = traceback.format_exc()
    # Keep traceback short enough for Slack (max ~3000 chars per block)
    if len(tb) > 2800:
        tb = "..." + tb[-2800:]

    send_error_alert(
        title=f"Error: {exc_type}",
        body=f"```{tb}```",
        fields=context or {},
    )
