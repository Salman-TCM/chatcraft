"""
Email delivery — supports platform (Resend) and agency (custom SMTP) delivery paths.

All send_* functions accept an optional `agency` dict:
  {
    "from_email": "...",
    "smtp_config": {"host": ..., "port": ..., "user": ..., "password": ...},
    "logo_url": "...",
    "primary_colour": "#6366f1",
    "support_email": "...",
    "name": "Acme Agency",
  }
When present, SMTP is used (or Resend if smtp_config is absent). The platform
name/logo never appears in agency-sent emails.
"""
from __future__ import annotations

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from loguru import logger

from app.core.config import settings


# ── Low-level senders ─────────────────────────────────────────────────────────

def _send_resend(to: str, subject: str, html: str, from_email: str | None = None) -> None:
    if not settings.resend_api_key:
        logger.warning(f"Resend not configured — skipping email to {to}: {subject}")
        return
    try:
        import resend
        resend.api_key = settings.resend_api_key
        resend.Emails.send({
            "from": from_email or settings.resend_from_email,
            "to": [to],
            "subject": subject,
            "html": html,
        })
    except Exception as exc:
        logger.error(f"Failed to send email via Resend to {to}: {exc}")


def _send_smtp(to: str, subject: str, html: str, cfg: dict[str, Any], from_addr: str) -> None:
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_addr
        msg["To"] = to
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(cfg["host"], int(cfg.get("port", 587))) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.sendmail(from_addr, [to], msg.as_string())
    except Exception as exc:
        logger.error(f"Failed to send email via SMTP to {to}: {exc}")


def _send(to: str, subject: str, html: str, agency: dict | None = None) -> None:
    if agency:
        smtp_cfg = agency.get("smtp_config")
        from_addr = agency.get("from_email") or (smtp_cfg or {}).get("user") or settings.resend_from_email
        if smtp_cfg and smtp_cfg.get("host"):
            _send_smtp(to, subject, html, smtp_cfg, from_addr)
            return
        # Agency without SMTP: fall through to Resend with agency from address
        _send_resend(to, subject, html, from_email=from_addr)
    else:
        _send_resend(to, subject, html)


# ── HTML layout helpers ───────────────────────────────────────────────────────

def _branded_html(
    body_html: str,
    platform_name: str,
    primary_colour: str,
    logo_url: str | None,
    support_email: str | None,
) -> str:
    logo_block = (
        f'<img src="{logo_url}" alt="{platform_name}" style="height:40px;object-fit:contain;display:block;margin-bottom:16px" />'
        if logo_url
        else f'<span style="font-size:20px;font-weight:700;color:{primary_colour}">{platform_name}</span>'
    )
    footer_email = f'<a href="mailto:{support_email}" style="color:{primary_colour}">{support_email}</a>' if support_email else ""
    return f"""
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px 16px">
  {logo_block}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:24px" />
  {body_html}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin-top:32px;margin-bottom:16px" />
  <p style="color:#9ca3af;font-size:12px;line-height:1.5">
    {f"Questions? Reach us at {footer_email}" if footer_email else ""}
  </p>
</div>
"""


def _cta_button(url: str, label: str, colour: str) -> str:
    return (
        f'<p><a href="{url}" style="display:inline-block;padding:12px 24px;'
        f'background:{colour};color:#fff;border-radius:6px;text-decoration:none;font-weight:600">'
        f"{label}</a></p>"
    )


def _get_branding(agency: dict | None) -> tuple[str, str, str | None, str | None]:
    if agency:
        name = agency.get("name") or "Agency"
        colour = agency.get("primary_colour") or "#6366f1"
        logo = agency.get("logo_url")
        support = agency.get("support_email")
    else:
        name = "ChatCraft AI"
        colour = "#000000"
        logo = None
        support = settings.resend_from_email
    return name, colour, logo, support


# ── Public API ────────────────────────────────────────────────────────────────

def send_verification_email(to: str, token: str, agency: dict | None = None) -> None:
    name, colour, logo, support = _get_branding(agency)
    verify_url = f"{settings.frontend_url}/auth/verify-email?token={token}"
    body = f"""
    <h2 style="margin:0 0 12px">Verify your email</h2>
    <p style="color:#374151">Thanks for signing up for <strong>{name}</strong>. Click below to verify your email address.</p>
    {_cta_button(verify_url, "Verify email", colour)}
    <p style="color:#6b7280;font-size:13px">Or copy this link: <a href="{verify_url}" style="color:{colour}">{verify_url}</a></p>
    """
    html = _branded_html(body, name, colour, logo, support)
    _send(to, f"Verify your {name} email", html, agency)


def send_password_reset_email(to: str, token: str, agency: dict | None = None) -> None:
    name, colour, logo, support = _get_branding(agency)
    reset_url = f"{settings.frontend_url}/auth/reset-password?token={token}"
    body = f"""
    <h2 style="margin:0 0 12px">Reset your password</h2>
    <p style="color:#374151">We received a request to reset your <strong>{name}</strong> password.
       Click below — this link expires in 1 hour.</p>
    {_cta_button(reset_url, "Reset password", colour)}
    <p style="color:#6b7280;font-size:13px">If you did not request this, you can safely ignore this email.</p>
    """
    html = _branded_html(body, name, colour, logo, support)
    _send(to, f"Reset your {name} password", html, agency)
