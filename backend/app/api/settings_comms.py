"""
User-level SMTP and SMS (Twilio) settings.

GET    /api/settings/smtp          — fetch saved SMTP config (password masked)
PUT    /api/settings/smtp          — create or update SMTP config
DELETE /api/settings/smtp          — remove SMTP config
POST   /api/settings/smtp/test     — send a test email via saved config

GET    /api/settings/sms           — fetch saved SMS config (auth_token masked)
PUT    /api/settings/sms           — create or update SMS config
DELETE /api/settings/sms           — remove SMS config
POST   /api/settings/sms/test      — send a test SMS via saved config
"""
import asyncio
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DBSession
from app.models.user_communication_setting import UserCommunicationSetting

router = APIRouter(prefix="/api/settings", tags=["settings-comms"])

_SMTP_SECRETS = {"smtp_password"}
_SMS_SECRETS = {"auth_token"}
_MASK = "••••••••"


def _mask(config: dict, secrets: set[str]) -> dict:
    return {k: (_MASK if k in secrets and v else v) for k, v in config.items()}


def _merge(existing: dict, incoming: dict, secrets: set[str]) -> dict:
    merged = dict(existing)
    for k, v in incoming.items():
        if k in secrets and v == _MASK:
            continue
        merged[k] = v
    return merged


async def _get_setting(user_id, type_: str, db) -> UserCommunicationSetting | None:
    result = await db.execute(
        select(UserCommunicationSetting).where(
            UserCommunicationSetting.user_id == user_id,
            UserCommunicationSetting.type == type_,
        )
    )
    return result.scalar_one_or_none()


# ─── SMTP ─────────────────────────────────────────────────────────────────────

class SmtpConfig(BaseModel):
    smtp_host: str
    smtp_port: int = 587
    smtp_user: str
    smtp_password: str
    from_name: str = ""
    from_email: str = ""


class SmtpTestRequest(BaseModel):
    to_email: str


@router.get("/smtp")
async def get_smtp(user: CurrentUser, db: DBSession) -> dict:
    row = await _get_setting(user.id, "smtp", db)
    if not row:
        return {"success": True, "data": None}
    return {"success": True, "data": _mask(row.config, _SMTP_SECRETS)}


@router.put("/smtp")
async def upsert_smtp(body: SmtpConfig, user: CurrentUser, db: DBSession) -> dict:
    row = await _get_setting(user.id, "smtp", db)
    incoming = body.model_dump()
    if row:
        row.config = _merge(row.config, incoming, _SMTP_SECRETS)
    else:
        row = UserCommunicationSetting(user_id=user.id, type="smtp", config=incoming)
        db.add(row)
    await db.commit()
    return {"success": True, "data": _mask(row.config, _SMTP_SECRETS)}


@router.delete("/smtp", status_code=status.HTTP_200_OK)
async def delete_smtp(user: CurrentUser, db: DBSession) -> dict:
    row = await _get_setting(user.id, "smtp", db)
    if row:
        await db.delete(row)
        await db.commit()
    return {"success": True, "data": None}


@router.post("/smtp/test")
async def test_smtp(body: SmtpTestRequest, user: CurrentUser, db: DBSession) -> dict:
    row = await _get_setting(user.id, "smtp", db)
    if not row:
        raise HTTPException(status_code=404, detail="No SMTP config saved")

    cfg = row.config
    host = cfg.get("smtp_host", "")
    port = int(cfg.get("smtp_port", 587))
    smtp_user = cfg.get("smtp_user", "")
    password = cfg.get("smtp_password", "")
    from_name = cfg.get("from_name", "") or smtp_user
    from_email = cfg.get("from_email", "") or smtp_user

    if not host or not smtp_user or not password:
        raise HTTPException(status_code=400, detail="SMTP config is incomplete")

    def _send() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "ChatCraft SMTP Test"
        msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
        msg["To"] = body.to_email
        msg.attach(MIMEText("This is a test email from your ChatCraft SMTP configuration.", "plain"))
        msg.attach(MIMEText("<p>This is a test email from your <strong>ChatCraft</strong> SMTP configuration.</p>", "html"))

        context = ssl.create_default_context()
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=context) as server:
                server.login(smtp_user, password)
                server.sendmail(from_email, body.to_email, msg.as_string())
        else:
            with smtplib.SMTP(host, port) as server:
                server.ehlo()
                server.starttls(context=context)
                server.login(smtp_user, password)
                server.sendmail(from_email, body.to_email, msg.as_string())

    try:
        await asyncio.get_event_loop().run_in_executor(None, _send)
        return {"success": True, "data": {"message": f"Test email sent to {body.to_email}"}}
    except Exception as exc:
        return {"success": False, "error": str(exc)[:300]}


# ─── SMS (Twilio) ──────────────────────────────────────────────────────────────

class SmsConfig(BaseModel):
    account_sid: str
    auth_token: str
    from_number: str


class SmsTestRequest(BaseModel):
    to_number: str


@router.get("/sms")
async def get_sms(user: CurrentUser, db: DBSession) -> dict:
    row = await _get_setting(user.id, "sms", db)
    if not row:
        return {"success": True, "data": None}
    return {"success": True, "data": _mask(row.config, _SMS_SECRETS)}


@router.put("/sms")
async def upsert_sms(body: SmsConfig, user: CurrentUser, db: DBSession) -> dict:
    row = await _get_setting(user.id, "sms", db)
    incoming = body.model_dump()
    if row:
        row.config = _merge(row.config, incoming, _SMS_SECRETS)
    else:
        row = UserCommunicationSetting(user_id=user.id, type="sms", config=incoming)
        db.add(row)
    await db.commit()
    return {"success": True, "data": _mask(row.config, _SMS_SECRETS)}


@router.delete("/sms", status_code=status.HTTP_200_OK)
async def delete_sms(user: CurrentUser, db: DBSession) -> dict:
    row = await _get_setting(user.id, "sms", db)
    if row:
        await db.delete(row)
        await db.commit()
    return {"success": True, "data": None}


@router.post("/sms/test")
async def test_sms(body: SmsTestRequest, user: CurrentUser, db: DBSession) -> dict:
    row = await _get_setting(user.id, "sms", db)
    if not row:
        raise HTTPException(status_code=404, detail="No SMS config saved")

    cfg = row.config
    account_sid = cfg.get("account_sid", "")
    auth_token = cfg.get("auth_token", "")
    from_number = cfg.get("from_number", "")

    if not account_sid or not auth_token or not from_number:
        raise HTTPException(status_code=400, detail="SMS config is incomplete")

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    payload = {
        "To": body.to_number,
        "From": from_number,
        "Body": "This is a test SMS from your ChatCraft SMS configuration.",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, data=payload, auth=(account_sid, auth_token))

    if resp.status_code in (200, 201):
        return {"success": True, "data": {"message": f"Test SMS sent to {body.to_number}"}}
    error = resp.json().get("message", resp.text[:200])
    return {"success": False, "error": error}
