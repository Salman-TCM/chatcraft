"""
Email delivery via Resend (https://resend.com).
All functions are fire-and-forget safe — they log on failure and never raise.
"""
from __future__ import annotations

from loguru import logger

from app.core.config import settings


def _send(to: str, subject: str, html: str) -> None:
    if not settings.resend_api_key:
        logger.warning(f"Resend not configured — skipping email to {to}: {subject}")
        return
    try:
        import resend

        resend.api_key = settings.resend_api_key
        resend.Emails.send({
            "from": settings.resend_from_email,
            "to": [to],
            "subject": subject,
            "html": html,
        })
    except Exception as exc:
        logger.error(f"Failed to send email to {to}: {exc}")


def send_verification_email(to: str, token: str) -> None:
    verify_url = f"{settings.frontend_url}/auth/verify-email?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2>Verify your email</h2>
      <p>Thanks for signing up for ChatCraft AI. Click the button below to
         verify your email address. This link does not expire.</p>
      <p>
        <a href="{verify_url}"
           style="display:inline-block;padding:12px 24px;background:#000;
                  color:#fff;border-radius:6px;text-decoration:none">
          Verify email
        </a>
      </p>
      <p style="color:#666;font-size:13px">
        Or copy this link: <a href="{verify_url}">{verify_url}</a>
      </p>
    </div>
    """
    _send(to, "Verify your ChatCraft AI email", html)


def send_password_reset_email(to: str, token: str) -> None:
    reset_url = f"{settings.frontend_url}/auth/reset-password?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2>Reset your password</h2>
      <p>We received a request to reset your ChatCraft AI password.
         Click the button below. This link expires in 1 hour.</p>
      <p>
        <a href="{reset_url}"
           style="display:inline-block;padding:12px 24px;background:#000;
                  color:#fff;border-radius:6px;text-decoration:none">
          Reset password
        </a>
      </p>
      <p style="color:#666;font-size:13px">
        If you did not request this, you can safely ignore this email.
      </p>
    </div>
    """
    _send(to, "Reset your ChatCraft AI password", html)
