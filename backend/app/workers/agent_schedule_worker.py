"""
Agent Schedule Worker — runs scheduled agent jobs and delivers results via email/SMS.

Beat task `check_agent_schedules` fires every minute. For each active schedule
whose hour + minute + day_of_week matches the current UTC time, it spawns a
`run_scheduled_agent` task that:

  1. Loads the agent and its configuration from the DB
  2. Calls the full agent execution loop with the schedule's trigger_prompt
  3. Collects the text response
  4. Delivers it via the configured channel (email / SMS / both)
  5. Updates last_run_at and last_result_preview on the schedule row
"""

import asyncio
import uuid as _uuid

from loguru import logger

from app.workers.celery_app import celery_app


# ─── Beat task — fired every minute ──────────────────────────────────────────


@celery_app.task(
    name="workers.check_agent_schedules",
    queue="default",
    acks_late=True,
)
def check_agent_schedules() -> dict:
    """Find all active schedules due right now and kick off their agent runs."""
    return asyncio.get_event_loop().run_until_complete(_check_and_dispatch())


async def _check_and_dispatch() -> dict:
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.db.session import AsyncSessionLocal
    from app.models.agent_schedule import AgentSchedule

    now = datetime.now(UTC)
    current_dow = str(now.weekday())  # 0 = Monday

    dispatched = 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentSchedule).where(
                AgentSchedule.is_active == True,  # noqa: E712
                AgentSchedule.hour == now.hour,
                AgentSchedule.minute == now.minute,
            )
        )
        schedules = result.scalars().all()

        for schedule in schedules:
            # Check day-of-week filter
            if schedule.days_of_week != "*":
                allowed = schedule.days_of_week.split(",")
                if current_dow not in allowed:
                    continue
            celery_app.send_task(
                "workers.run_scheduled_agent",
                args=[str(schedule.id)],
                queue="default",
            )
            dispatched += 1

    logger.info(f"agent_schedules: dispatched {dispatched} runs at {now.strftime('%H:%M UTC')}")
    return {"dispatched": dispatched}


# ─── Run task — one per schedule fire ────────────────────────────────────────


@celery_app.task(
    name="workers.run_scheduled_agent",
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    queue="default",
    acks_late=True,
)
def run_scheduled_agent(self, schedule_id: str) -> dict:
    """Execute one scheduled agent run end-to-end."""
    return asyncio.get_event_loop().run_until_complete(_run(schedule_id))


async def _run(schedule_id: str) -> dict:
    from datetime import UTC, datetime

    from sqlalchemy import select

    from app.api.agents import _build_system_prompt, _build_tools_with_mcp, _resolve_api_key, _run_agent
    from app.db.session import AsyncSessionLocal
    from app.models.agent import Agent
    from app.models.agent_schedule import AgentSchedule

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentSchedule).where(AgentSchedule.id == _uuid.UUID(schedule_id))
        )
        schedule = result.scalar_one_or_none()
        if not schedule or not schedule.is_active:
            return {"skipped": True}

        agent_result = await db.execute(select(Agent).where(Agent.id == schedule.agent_id))
        agent = agent_result.scalar_one_or_none()
        if not agent or not agent.is_active:
            return {"skipped": True, "reason": "agent inactive"}

        # Run the agent
        system_prompt = await _build_system_prompt(agent, db, user_id=agent.user_id)
        tools, mcp_map = await _build_tools_with_mcp(agent, agent.user_id, db)
        _, api_key, base_url = await _resolve_api_key(
            agent.user_id, agent.model or "claude-sonnet-4-6", db
        )

        text_parts: list[str] = []
        try:
            async for chunk in _run_agent(
                agent,
                system_prompt,
                tools,
                mcp_map,
                schedule.trigger_prompt,
                [],
                api_key=api_key,
                base_url=base_url,
            ):
                if chunk.startswith("data: "):
                    import json

                    try:
                        evt = json.loads(chunk[6:])
                        if evt.get("type") == "text":
                            text_parts.append(evt["content"])
                    except Exception:
                        pass
        except Exception as exc:
            logger.error(f"Scheduled agent {schedule_id} failed: {exc}")
            return {"error": str(exc)}

        response_text = "".join(text_parts).strip()
        preview = response_text[:500]

        # Update schedule row
        schedule.last_run_at = datetime.now(UTC)
        schedule.last_result_preview = preview
        await db.commit()

    # Deliver result
    if schedule.notify_email:
        await _deliver_email(schedule, agent, response_text)
    if schedule.notify_phone:
        await _deliver_sms(schedule, agent, response_text)

    return {"delivered": True, "preview": preview[:100]}


async def _deliver_email(schedule: "AgentSchedule", agent: "Agent", body: str) -> None:
    from datetime import UTC, datetime

    from app.services.email import send_email

    subject = f"[{agent.name}] Scheduled Update — {datetime.now(UTC).strftime('%d %b %Y')}"
    html = f"""
<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px">
  <h2 style="color:#1a1a1a;margin-bottom:8px">{agent.name}</h2>
  <p style="color:#6b7280;font-size:13px;margin-bottom:20px">
    Scheduled update · {datetime.now(UTC).strftime('%d %b %Y %H:%M UTC')}
  </p>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;white-space:pre-wrap;font-size:14px;line-height:1.6;color:#111827">
{body}
  </div>
  <p style="color:#9ca3af;font-size:11px;margin-top:16px">
    Sent by {agent.name} agent schedule. To stop these updates, disable the schedule in your dashboard.
  </p>
</div>
"""
    try:
        await send_email(to=schedule.notify_email, subject=subject, html=html)
    except Exception as exc:
        logger.warning(f"Schedule email delivery failed for {schedule.id}: {exc}")


async def _deliver_sms(schedule: "AgentSchedule", agent: "Agent", body: str) -> None:
    from app.services.sms import send_sms

    # SMS: first 300 chars + source tag
    sms_body = body[:280].strip()
    if len(body) > 280:
        sms_body += "…"
    sms_body += f"\n—{agent.name}"
    try:
        await send_sms(to=schedule.notify_phone, message=sms_body)
    except Exception as exc:
        logger.warning(f"Schedule SMS delivery failed for {schedule.id}: {exc}")
