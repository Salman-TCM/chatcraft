"""
Twilio Voice Call Integration.

Handles inbound PSTN calls via Twilio:
  POST /webhooks/voice/{chatbot_id}          — Twilio calls this on inbound call
  POST /webhooks/voice/{chatbot_id}/gather   — After caller speaks, Twilio posts transcript
  POST /webhooks/voice/{chatbot_id}/status   — Call status updates (completed, no-answer, etc.)
  POST /webhooks/voice/{chatbot_id}/outbound — Trigger an outbound call (ElevenLabs)

Call flow:
  1. Inbound call arrives → TwiML <Gather> listens for caller speech (using Twilio's built-in STT)
  2. Caller speech transcribed → LLM generates reply → TwiML <Say> speaks it
  3. Loop continues up to max_turns
  4. On hangup/status callback: transcript saved to conversation, AI summary saved to contact
"""

import asyncio
import uuid

import httpx
from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import CurrentUser, DBSession
from app.db.session import AsyncSessionLocal
from app.models.chatbot_config import ChatbotConfig
from app.models.conversation import Conversation
from app.models.crm import Contact
from app.models.inbox import ConversationStatus
from app.services.channels.processor import process_incoming
from app.services.llm.base import ChatMessage
from app.services.llm.router import LLMRouter

router = APIRouter(prefix="/webhooks/voice", tags=["voice_calls"])

_TWIML_HEADER = "application/xml"
_MAX_TURNS = 10


# ─── Inbound call — entry point ───────────────────────────────────────────────


@router.post("/{chatbot_id}", response_class=PlainTextResponse)
async def inbound_call(
    chatbot_id: str,
    request: Request,
    CallSid: str = Form(""),
    From: str = Form(""),
    To: str = Form(""),
    CallStatus: str = Form(""),
):
    """Twilio calls this URL when an inbound call arrives."""
    try:
        cid = uuid.UUID(chatbot_id)
    except ValueError:
        return _twiml_hangup("Sorry, this number is not configured.")

    async with AsyncSessionLocal() as db:
        bot = await db.get(ChatbotConfig, cid)
    if not bot:
        return _twiml_hangup("Sorry, this number is not configured.")

    welcome = bot.welcome_message or "Hello! How can I help you today?"
    gather_url = f"{settings.api_base_url}/webhooks/voice/{chatbot_id}/gather"

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">{_xml_escape(welcome)}</Say>
  <Gather input="speech" action="{gather_url}" method="POST"
          speechTimeout="auto" language="en-US" enhanced="true"
          hints="yes,no,help,support,price,cancel,human,agent">
    <Say voice="Polly.Joanna">I'm listening.</Say>
  </Gather>
  <Say voice="Polly.Joanna">I didn't catch that. Goodbye.</Say>
</Response>"""
    return PlainTextResponse(content=twiml, media_type=_TWIML_HEADER)


# ─── Gather — caller spoke ────────────────────────────────────────────────────


@router.post("/{chatbot_id}/gather", response_class=PlainTextResponse)
async def gather_response(
    chatbot_id: str,
    CallSid: str = Form(""),
    From: str = Form(""),
    SpeechResult: str = Form(""),
    Confidence: str = Form("0"),
    CallStatus: str = Form(""),
):
    """Twilio posts the transcribed speech here after the caller speaks."""
    try:
        cid = uuid.UUID(chatbot_id)
    except ValueError:
        return _twiml_hangup("Configuration error.")

    caller_text = SpeechResult.strip()
    if not caller_text:
        return _twiml_gather(chatbot_id, "Sorry, I couldn't understand that. Could you repeat?")

    # Human-transfer keywords
    human_keywords = {"human", "agent", "representative", "person", "operator", "speak to someone"}
    if any(kw in caller_text.lower() for kw in human_keywords):
        return _twiml_transfer_or_hangup(chatbot_id)

    # Get AI response
    async with AsyncSessionLocal() as db:
        bot = await db.get(ChatbotConfig, cid)
        if not bot:
            return _twiml_hangup("Configuration error.")

        # Build conversation history from call session (stored in call context)
        history = _call_history.get(CallSid, [])
        history.append({"role": "user", "content": caller_text})

        system_prompt = (
            bot.system_prompt
            or "You are a helpful phone assistant. Keep answers brief and conversational — under 3 sentences. Do not use markdown, bullet points, or any formatting."
        )

        messages = [ChatMessage(role="system", content=system_prompt)]
        for h in history[-8:]:  # keep last 8 turns
            messages.append(ChatMessage(role=h["role"], content=h["content"]))

        llm = LLMRouter(
            model=bot.default_model or "claude-sonnet-4-6", fallback_model=bot.fallback_model
        )
        try:
            resp = await llm.complete(messages, max_tokens=256)
            reply = resp.content
        except Exception:
            reply = "I'm having trouble right now. Please try again later."

        history.append({"role": "assistant", "content": reply})
        _call_history[CallSid] = history

        # Store in DB asynchronously
        asyncio.ensure_future(_save_turn(cid, CallSid, From, caller_text, reply))

    gather_url = f"{settings.api_base_url}/webhooks/voice/{chatbot_id}/gather"
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">{_xml_escape(reply)}</Say>
  <Gather input="speech" action="{gather_url}" method="POST"
          speechTimeout="auto" language="en-US" enhanced="true">
  </Gather>
  <Say voice="Polly.Joanna">Is there anything else I can help you with?</Say>
  <Gather input="speech" action="{gather_url}" method="POST"
          speechTimeout="auto" language="en-US">
  </Gather>
  <Say voice="Polly.Joanna">Thank you for calling. Goodbye!</Say>
</Response>"""
    return PlainTextResponse(content=twiml, media_type=_TWIML_HEADER)


# ─── Status callback — call ended ────────────────────────────────────────────


@router.post("/{chatbot_id}/status")
async def call_status(
    chatbot_id: str,
    CallSid: str = Form(""),
    CallStatus: str = Form(""),
    From: str = Form(""),
    To: str = Form(""),
    CallDuration: str = Form("0"),
    RecordingUrl: str = Form(""),
):
    """Twilio posts call status updates here (completed, no-answer, busy, failed)."""
    try:
        cid = uuid.UUID(chatbot_id)
    except ValueError:
        return {"ok": True}

    history = _call_history.pop(CallSid, [])

    if CallStatus in ("completed", "no-answer", "busy") and history:
        asyncio.ensure_future(
            _finalise_call(cid, CallSid, From, CallStatus, int(CallDuration or 0), history)
        )

    # Missed call: AI takes over via SMS
    if CallStatus == "no-answer":
        asyncio.ensure_future(_missed_call_sms(cid, From))

    return {"ok": True}


# ─── Outbound call trigger (ElevenLabs / Twilio) ─────────────────────────────


class OutboundCallRequest(BaseModel):
    to_number: str
    chatbot_id: uuid.UUID
    message: str | None = None


@router.post("/outbound")
async def trigger_outbound_call(body: OutboundCallRequest, user: CurrentUser, db: DBSession):
    """Trigger an outbound call using Twilio + ElevenLabs TTS."""
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        raise HTTPException(status_code=400, detail="Twilio not configured")

    result = await db.execute(
        select(ChatbotConfig).where(
            ChatbotConfig.id == body.chatbot_id,
            ChatbotConfig.user_id == user.id,
        )
    )
    bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Chatbot not found")

    # Get the Twilio phone number from the SMS integration (shares the same account)
    from_number = settings.twilio_phone_number
    if not from_number:
        raise HTTPException(status_code=400, detail="Twilio phone number not configured")

    webhook_url = f"{settings.api_base_url}/webhooks/voice/{body.chatbot_id}"
    status_url = f"{settings.api_base_url}/webhooks/voice/{body.chatbot_id}/status"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Calls.json",
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            data={
                "To": body.to_number,
                "From": from_number,
                "Url": webhook_url,
                "StatusCallback": status_url,
                "StatusCallbackMethod": "POST",
                "MachineDetection": "DetectMessageEnd",
            },
            timeout=30,
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Twilio error: {resp.text}")

    call_data = resp.json()
    return {
        "success": True,
        "data": {"call_sid": call_data.get("sid"), "status": call_data.get("status")},
    }


# ─── DTMF transfer ────────────────────────────────────────────────────────────


@router.post("/{chatbot_id}/dtmf", response_class=PlainTextResponse)
async def dtmf_menu(
    chatbot_id: str,
    Digits: str = Form(""),
    CallSid: str = Form(""),
):
    """Handle DTMF key press after human-transfer prompt."""
    try:
        cid = uuid.UUID(chatbot_id)
    except ValueError:
        return _twiml_hangup("Configuration error.")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ChatbotConfig).where(ChatbotConfig.id == cid))
        bot = result.scalar_one_or_none()

    # Load DTMF destinations from bot config (stored as tools config or custom field)
    # Format: {"1": "+15551234567", "2": "+15559876543"}
    dtmf_map: dict = {}
    if bot:
        tools_cfg = bot.tools if hasattr(bot, "tools") else {}
        dtmf_map = (tools_cfg or {}).get("dtmf_destinations", {})

    transfer_to = dtmf_map.get(Digits, "")
    if transfer_to:
        twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Transferring you now. Please hold.</Say>
  <Dial>{_xml_escape(transfer_to)}</Dial>
</Response>"""
    else:
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I'm sorry, that option is not available. Goodbye.</Say>
  <Hangup/>
</Response>"""
    return PlainTextResponse(content=twiml, media_type=_TWIML_HEADER)


# ─── In-memory call history (per CallSid) ────────────────────────────────────
# Keyed by Twilio CallSid; cleared on status callback.
_call_history: dict[str, list[dict]] = {}


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _twiml_hangup(message: str) -> PlainTextResponse:
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">{_xml_escape(message)}</Say>
  <Hangup/>
</Response>"""
    return PlainTextResponse(content=twiml, media_type=_TWIML_HEADER)


def _twiml_gather(chatbot_id: str, prompt: str) -> PlainTextResponse:
    gather_url = f"{settings.api_base_url}/webhooks/voice/{chatbot_id}/gather"
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">{_xml_escape(prompt)}</Say>
  <Gather input="speech" action="{gather_url}" method="POST"
          speechTimeout="auto" language="en-US" enhanced="true">
  </Gather>
</Response>"""
    return PlainTextResponse(content=twiml, media_type=_TWIML_HEADER)


def _twiml_transfer_or_hangup(chatbot_id: str) -> PlainTextResponse:
    dtmf_url = f"{settings.api_base_url}/webhooks/voice/{chatbot_id}/dtmf"
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I'll connect you with a team member. Press 1 for sales, press 2 for support, or stay on the line to leave a message.</Say>
  <Gather input="dtmf" action="{dtmf_url}" method="POST" numDigits="1" timeout="10">
  </Gather>
  <Say voice="Polly.Joanna">No option selected. Goodbye.</Say>
  <Hangup/>
</Response>"""
    return PlainTextResponse(content=twiml, media_type=_TWIML_HEADER)


def _xml_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


async def _save_turn(
    chatbot_id: uuid.UUID,
    call_sid: str,
    caller_phone: str,
    user_text: str,
    ai_text: str,
) -> None:
    """Persist one call turn via process_incoming (creates contact + conversation automatically)."""
    try:
        await process_incoming(
            chatbot_id=chatbot_id,
            channel="phone",
            sender_id=call_sid,
            text=user_text,
            sender_phone=caller_phone,
        )
    except Exception:
        pass


async def _finalise_call(
    chatbot_id: uuid.UUID,
    call_sid: str,
    caller_phone: str,
    status: str,
    duration_secs: int,
    history: list[dict],
) -> None:
    """After call ends: save full transcript + generate AI summary on contact."""
    async with AsyncSessionLocal() as db:
        bot = await db.get(ChatbotConfig, chatbot_id)
        if not bot:
            return

        # Find contact by phone
        result = await db.execute(
            select(Contact).where(Contact.user_id == bot.user_id, Contact.phone == caller_phone)
        )
        contact = result.scalar_one_or_none()

        # Build transcript text
        transcript_lines = []
        for turn in history:
            prefix = "Caller" if turn["role"] == "user" else "Agent"
            transcript_lines.append(f"{prefix}: {turn['content']}")
        transcript = "\n".join(transcript_lines)

        # Generate AI summary
        summary = await _generate_call_summary(bot, transcript, duration_secs, status)

        # Save summary as an internal note on the latest phone conversation
        conv_result = await db.execute(
            select(Conversation)
            .where(
                Conversation.chatbot_id == chatbot_id,
                Conversation.guest_id == call_sid,
            )
            .order_by(Conversation.created_at.desc())
            .limit(1)
        )
        conv = conv_result.scalar_one_or_none()
        if not conv:
            return
        from app.models.inbox import InternalNote

        note = InternalNote(
            conversation_id=conv.id,
            author_id=bot.user_id,
            content=f"📞 Call summary ({status}, {duration_secs}s):\n\n{summary}\n\n---\nFull transcript:\n{transcript}",
        )
        db.add(note)

        # Close the conversation
        conv.status = ConversationStatus.closed
        await db.commit()


async def _generate_call_summary(
    bot: ChatbotConfig, transcript: str, duration: int, status: str
) -> str:
    """Use LLM to summarise the call transcript."""
    llm = LLMRouter(
        model=bot.default_model or "claude-sonnet-4-6", fallback_model=bot.fallback_model
    )
    prompt = (
        f"Summarise this phone call transcript in 2-3 bullet points. "
        f"Call status: {status}, Duration: {duration} seconds.\n\n{transcript[:3000]}"
    )
    messages = [
        ChatMessage(
            role="system",
            content="You are a helpful assistant that summarises phone call transcripts.",
        ),
        ChatMessage(role="user", content=prompt),
    ]
    try:
        resp = await llm.complete(messages, max_tokens=300)
        return resp.content
    except Exception:
        return "Summary unavailable."


async def _missed_call_sms(chatbot_id: uuid.UUID, caller_phone: str) -> None:
    """Send an SMS follow-up when a call is missed."""
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        return
    async with AsyncSessionLocal() as db:
        bot = await db.get(ChatbotConfig, chatbot_id)
    if not bot:
        return

    sms_body = (
        f"Hi! You recently called {bot.name}. "
        "We missed your call — how can we help? Reply to this message and we'll get back to you."
    )
    async with httpx.AsyncClient() as client:
        await client.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json",
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            data={
                "To": caller_phone,
                "From": settings.twilio_phone_number,
                "Body": sms_body,
            },
            timeout=15,
        )
