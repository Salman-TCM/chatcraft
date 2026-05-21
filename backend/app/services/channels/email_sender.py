"""
Email channel sender — outbound email via SMTP or Resend.

Config (stored in ChannelIntegration.config):
  smtp_host      SMTP hostname
  smtp_port      Port (default 587)
  smtp_user      SMTP login / username
  smtp_password  SMTP password
  from_name      Display name for From header
  from_email     Sending address (defaults to smtp_user)
  inbox_email    The address inbound emails are forwarded to (used as Reply-To)
"""
from __future__ import annotations

import asyncio
import smtplib
from email.headerregistry import Address
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from loguru import logger


class EmailSender:
    def __init__(self, config: dict[str, Any]) -> None:
        self.cfg = config

    def _from_addr(self) -> str:
        from_email = self.cfg.get("from_email") or self.cfg.get("smtp_user", "")
        from_name = self.cfg.get("from_name", "")
        if from_name and from_email:
            return f"{from_name} <{from_email}>"
        return from_email

    def _send_sync(self, to: str, subject: str, body: str, reply_to: str | None = None) -> None:
        host = self.cfg.get("smtp_host", "")
        port = int(self.cfg.get("smtp_port", 587))
        user = self.cfg.get("smtp_user", "")
        password = self.cfg.get("smtp_password", "")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = self._from_addr()
        msg["To"] = to
        if reply_to:
            msg["Reply-To"] = reply_to
        elif self.cfg.get("inbox_email"):
            msg["Reply-To"] = self.cfg["inbox_email"]

        # Send as plain text + HTML
        msg.attach(MIMEText(body, "plain"))
        html_body = body.replace("\n", "<br>")
        msg.attach(MIMEText(f"<div style='font-family:sans-serif;line-height:1.6'>{html_body}</div>", "html"))

        with smtplib.SMTP(host, port) as server:
            server.starttls()
            server.login(user, password)
            server.sendmail(self._from_addr(), [to], msg.as_string())

    async def send(self, to: str, subject: str, body: str, reply_to: str | None = None) -> None:
        """Send an email asynchronously (runs SMTP in thread pool)."""
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, lambda: self._send_sync(to, subject, body, reply_to)
            )
        except Exception as exc:
            logger.error(f"Email send failed to {to}: {exc}")
            raise
