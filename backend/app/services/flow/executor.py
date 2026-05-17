"""
Flow Execution Engine.

Processes a flow graph node-by-node from a FlowRun's current position.
Handles branching (condition nodes), waiting states (user_input, delay),
LLM calls (ai_response), HTTP requests, and action nodes.

Execution lifecycle:
  start_run(flow, contact_id?, conversation_id?, trigger_data?) → FlowRun
  execute(run) → runs until 'waiting' (needs user input / delay) or 'completed'/'failed'
  resume(run, input_value?) → resumes from waiting state
"""
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.flow import Flow, FlowRun
from app.services.llm import ChatMessage, LLMRouter, sanitize

# Max nodes to visit before aborting (prevents infinite loops)
_MAX_STEPS = 200


class FlowExecutor:
    def __init__(self, flow: Flow, run: FlowRun, db: AsyncSession) -> None:
        self.flow = flow
        self.run = run
        self.db = db
        self._node_map: dict[str, dict] = {n["id"]: n for n in (flow.nodes or [])}
        self._edges: list[dict] = flow.edges or []

    # ── Public entry points ───────────────────────────────────────────────────

    async def execute(self) -> None:
        """Run the flow from the current node until stopped."""
        self.run.status = "running"
        steps = 0

        current_id = self.run.current_node_id or self._find_start_node_id()
        if not current_id:
            await self._fail("No start node found")
            return

        try:
            while current_id and steps < _MAX_STEPS:
                steps += 1
                node = self._node_map.get(current_id)
                if not node:
                    await self._fail(f"Node {current_id} not found")
                    return

                self.run.current_node_id = current_id
                result = await self._execute_node(node)

                if result["status"] == "waiting":
                    self.run.status = "waiting"
                    await self.db.commit()
                    return
                elif result["status"] == "done":
                    break
                elif result["status"] == "error":
                    await self._fail(result.get("error", "Unknown error"))
                    return

                # Find next node
                handle = result.get("handle", "default")
                current_id = self._next_node_id(current_id, handle)

            self.run.status = "completed"
            self.run.completed_at = datetime.now(timezone.utc)
            await self.db.commit()

        except Exception as exc:
            await self._fail(str(exc))

    async def resume(self, input_value: str | None = None) -> None:
        """Resume a waiting run (after user_input or delay)."""
        if self.run.status not in ("waiting",):
            return

        if input_value is not None:
            # Store the input under the waiting variable name
            var_name = (self.run.context or {}).get("_waiting_var", "input")
            ctx = dict(self.run.context or {})
            ctx[var_name] = input_value
            ctx.pop("_waiting_var", None)
            self.run.context = ctx

        self.run.resumed_at = datetime.now(timezone.utc)
        # Advance past the user_input node
        handle = "default"
        next_id = self._next_node_id(self.run.current_node_id or "", handle)
        if next_id:
            self.run.current_node_id = next_id
        await self.execute()

    # ── Node dispatcher ───────────────────────────────────────────────────────

    async def _execute_node(self, node: dict) -> dict:
        node_type: str = node.get("type", "")
        data: dict = node.get("data", {})

        match node_type:
            case "start":
                return {"status": "continue"}
            case "end":
                return {"status": "done"}
            case "notes":
                return {"status": "continue"}
            case "send_message":
                return await self._exec_send_message(data)
            case "user_input":
                return await self._exec_user_input(data)
            case "condition":
                return await self._exec_condition(data)
            case "ai_response":
                return await self._exec_ai_response(data)
            case "delay":
                return await self._exec_delay(data)
            case "http_request":
                return await self._exec_http_request(data)
            case "action":
                return await self._exec_action(data)
            case "jump_to":
                return await self._exec_jump_to(data)
            case "randomizer":
                return await self._exec_randomizer(data)
            case _:
                # Unknown node type — skip
                return {"status": "continue"}

    # ── Node handlers ─────────────────────────────────────────────────────────

    async def _exec_send_message(self, data: dict) -> dict:
        text = self._resolve(data.get("text", ""))
        if text and self.run.conversation_id:
            await self._send_to_conversation(text)
        return {"status": "continue"}

    async def _exec_user_input(self, data: dict) -> dict:
        # Send prompt if present
        prompt = self._resolve(data.get("prompt", ""))
        if prompt and self.run.conversation_id:
            await self._send_to_conversation(prompt)

        # Save variable name for resume
        var_name = data.get("variable", "input")
        ctx = dict(self.run.context or {})
        ctx["_waiting_var"] = var_name
        self.run.context = ctx
        return {"status": "waiting"}

    async def _exec_condition(self, data: dict) -> dict:
        field = data.get("field", "")
        operator = data.get("operator", "eq")
        value = data.get("value", "")

        ctx = self.run.context or {}
        actual = str(ctx.get(field, ""))
        expected = str(value)

        match operator:
            case "eq":
                result = actual == expected
            case "neq":
                result = actual != expected
            case "contains":
                result = expected.lower() in actual.lower()
            case "not_contains":
                result = expected.lower() not in actual.lower()
            case "gt":
                result = float(actual or 0) > float(expected or 0)
            case "lt":
                result = float(actual or 0) < float(expected or 0)
            case "empty":
                result = not actual
            case "not_empty":
                result = bool(actual)
            case "has_tag":
                result = await self._contact_has_tag(value)
            case _:
                result = False

        return {"status": "continue", "handle": "yes" if result else "no"}

    async def _exec_ai_response(self, data: dict) -> dict:
        prompt = self._resolve(data.get("prompt", ""))
        model = data.get("model", "claude-sonnet-4-6")
        save_to = data.get("save_to", "")
        send_reply = data.get("send_reply", True)

        if not prompt:
            return {"status": "continue"}

        llm = LLMRouter(model=model)
        messages = [ChatMessage(role="user", content=prompt)]
        try:
            resp = await llm.complete(messages, max_tokens=1024)
            text = resp.content.strip()

            if save_to:
                ctx = dict(self.run.context or {})
                ctx[save_to] = text
                self.run.context = ctx

            if send_reply and self.run.conversation_id:
                await self._send_to_conversation(text)
        except Exception:
            pass

        return {"status": "continue"}

    async def _exec_delay(self, data: dict) -> dict:
        amount = int(data.get("amount", 1))
        unit = data.get("unit", "seconds")

        seconds_map = {"seconds": 1, "minutes": 60, "hours": 3600, "days": 86400}
        delay_seconds = amount * seconds_map.get(unit, 1)

        # Schedule Celery task to resume this run
        from app.workers.flow_worker import resume_flow_run
        resume_flow_run.apply_async(
            args=[str(self.run.id)],
            countdown=delay_seconds,
        )

        self.run.status = "waiting"
        await self.db.commit()
        return {"status": "waiting"}

    async def _exec_http_request(self, data: dict) -> dict:
        method = data.get("method", "GET").upper()
        url = self._resolve(data.get("url", ""))
        headers = data.get("headers", {})
        body = data.get("body", {})
        save_to = data.get("save_to", "http_response")

        if not url:
            return {"status": "continue"}

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.request(method, url, headers=headers, json=body or None)
                try:
                    resp_data = r.json()
                except Exception:
                    resp_data = r.text

            ctx = dict(self.run.context or {})
            ctx[save_to] = resp_data
            ctx[f"{save_to}_status"] = r.status_code
            self.run.context = ctx
        except Exception as exc:
            ctx = dict(self.run.context or {})
            ctx[f"{save_to}_error"] = str(exc)
            self.run.context = ctx

        return {"status": "continue"}

    async def _exec_action(self, data: dict) -> dict:
        action = data.get("action", "")
        match action:
            case "set_field":
                await self._action_set_field(data)
            case "add_tag":
                await self._action_add_tag(data)
            case "remove_tag":
                await self._action_remove_tag(data)
            case "close_conversation":
                await self._action_close_conversation()
            case "send_webhook":
                await self._action_send_webhook(data)
            case "assign_conversation":
                await self._action_assign_conversation(data)
        return {"status": "continue"}

    async def _exec_jump_to(self, data: dict) -> dict:
        target_node_id = data.get("target_node_id", "")
        if target_node_id and target_node_id in self._node_map:
            self.run.current_node_id = target_node_id
            # Re-execute from here without incrementing steps counter via recursion
            # by returning a special 'jump' result with the node id
            return {"status": "jump", "node_id": target_node_id}
        return {"status": "continue"}

    async def _exec_randomizer(self, data: dict) -> dict:
        import random
        paths = data.get("paths", [])
        if not paths:
            return {"status": "continue", "handle": "default"}
        # Weighted or equal distribution
        weights = [p.get("weight", 1) for p in paths]
        chosen = random.choices(paths, weights=weights, k=1)[0]
        return {"status": "continue", "handle": chosen.get("handle", "0")}

    # ── Action helpers ────────────────────────────────────────────────────────

    async def _action_set_field(self, data: dict) -> None:
        field_key = data.get("field_key", "")
        value = self._resolve(str(data.get("value", "")))
        if not field_key or not self.run.contact_id:
            return

        from app.models.crm import Contact, ContactFieldValue, CustomField
        result = await self.db.execute(
            select(CustomField).where(
                CustomField.field_key == field_key,
                CustomField.user_id == self.flow.user_id,
            )
        )
        field = result.scalar_one_or_none()
        if not field:
            return

        val_result = await self.db.execute(
            select(ContactFieldValue).where(
                ContactFieldValue.contact_id == self.run.contact_id,
                ContactFieldValue.field_id == field.id,
            )
        )
        fv = val_result.scalar_one_or_none()
        if fv:
            fv.value = value
        else:
            fv = ContactFieldValue(
                contact_id=self.run.contact_id, field_id=field.id, value=value
            )
            self.db.add(fv)
        # Also save to run context
        ctx = dict(self.run.context or {})
        ctx[field_key] = value
        self.run.context = ctx

    async def _action_add_tag(self, data: dict) -> None:
        tag_name = data.get("tag", "")
        if not tag_name or not self.run.contact_id:
            return
        from app.models.crm import Contact, Tag, ContactTag
        result = await self.db.execute(
            select(Tag).where(Tag.name == tag_name, Tag.user_id == self.flow.user_id)
        )
        tag = result.scalar_one_or_none()
        if not tag:
            return
        existing = await self.db.execute(
            select(ContactTag).where(
                ContactTag.contact_id == self.run.contact_id,
                ContactTag.tag_id == tag.id,
            )
        )
        if not existing.scalar_one_or_none():
            self.db.add(ContactTag(contact_id=self.run.contact_id, tag_id=tag.id))

    async def _action_remove_tag(self, data: dict) -> None:
        tag_name = data.get("tag", "")
        if not tag_name or not self.run.contact_id:
            return
        from app.models.crm import Tag, ContactTag
        result = await self.db.execute(
            select(Tag).where(Tag.name == tag_name, Tag.user_id == self.flow.user_id)
        )
        tag = result.scalar_one_or_none()
        if not tag:
            return
        ct_result = await self.db.execute(
            select(ContactTag).where(
                ContactTag.contact_id == self.run.contact_id,
                ContactTag.tag_id == tag.id,
            )
        )
        ct = ct_result.scalar_one_or_none()
        if ct:
            await self.db.delete(ct)

    async def _action_close_conversation(self) -> None:
        if not self.run.conversation_id:
            return
        from app.models.conversation import Conversation
        conv = await self.db.get(Conversation, self.run.conversation_id)
        if conv:
            conv.status = "closed"

    async def _action_send_webhook(self, data: dict) -> None:
        url = self._resolve(data.get("url", ""))
        if not url:
            return
        payload = {"flow_id": str(self.flow.id), "run_id": str(self.run.id), "context": self.run.context}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(url, json=payload)
        except Exception:
            pass

    async def _action_assign_conversation(self, data: dict) -> None:
        if not self.run.conversation_id:
            return
        user_id_str = data.get("user_id", "")
        if not user_id_str:
            return
        from app.models.inbox import InboxAssignment
        from sqlalchemy import select
        result = await self.db.execute(
            select(InboxAssignment).where(
                InboxAssignment.conversation_id == self.run.conversation_id
            )
        )
        assignment = result.scalar_one_or_none()
        uid = uuid.UUID(user_id_str)
        if assignment:
            assignment.assigned_to_user_id = uid
        else:
            self.db.add(InboxAssignment(
                conversation_id=self.run.conversation_id,
                assigned_to_user_id=uid,
            ))

    # ── Graph helpers ─────────────────────────────────────────────────────────

    def _find_start_node_id(self) -> str | None:
        for node in (self.flow.nodes or []):
            if node.get("type") == "start":
                return node["id"]
        # Fallback: first node with no incoming edges
        targets = {e["target"] for e in self._edges}
        for node in (self.flow.nodes or []):
            if node["id"] not in targets:
                return node["id"]
        return None

    def _next_node_id(self, from_id: str, handle: str = "default") -> str | None:
        for edge in self._edges:
            if edge.get("source") != from_id:
                continue
            src_handle = edge.get("sourceHandle") or "default"
            if src_handle == handle or handle == "default":
                return edge.get("target")
        return None

    # ── Utility helpers ───────────────────────────────────────────────────────

    def _resolve(self, text: str) -> str:
        """Replace {{variable}} placeholders from run context."""
        ctx = self.run.context or {}
        import re
        def replacer(m: re.Match) -> str:
            key = m.group(1).strip()
            val = ctx
            for part in key.split("."):
                if isinstance(val, dict):
                    val = val.get(part, "")
                else:
                    val = ""
                    break
            return str(val)
        return re.sub(r"\{\{(.+?)\}\}", replacer, text)

    async def _send_to_conversation(self, text: str) -> None:
        """Persist a message and deliver it via the conversation's channel."""
        from app.models.conversation import Conversation
        from app.models.message import Message, MessageRole
        from datetime import timezone

        conv = await self.db.get(Conversation, self.run.conversation_id)
        if not conv:
            return

        msg = Message(
            conversation_id=conv.id,
            role=MessageRole.assistant,
            content=text,
        )
        self.db.add(msg)
        conv.last_message_at = datetime.now(timezone.utc)

        # Send outbound via channel
        if conv.channel and conv.channel != "web" and conv.guest_id:
            from app.models.channel_integration import ChannelIntegration
            from app.services.channels import get_sender
            result = await self.db.execute(
                select(ChannelIntegration).where(
                    ChannelIntegration.chatbot_id == conv.chatbot_id,
                    ChannelIntegration.channel == conv.channel,
                    ChannelIntegration.is_active.is_(True),
                )
            )
            integration = result.scalar_one_or_none()
            if integration:
                try:
                    sender = get_sender(conv.channel, integration.config)
                    await sender.send(conv.guest_id, text)
                except Exception:
                    pass

    async def _contact_has_tag(self, tag_name: str) -> bool:
        if not self.run.contact_id:
            return False
        from app.models.crm import Tag, ContactTag
        result = await self.db.execute(
            select(Tag).where(Tag.name == tag_name, Tag.user_id == self.flow.user_id)
        )
        tag = result.scalar_one_or_none()
        if not tag:
            return False
        ct = await self.db.execute(
            select(ContactTag).where(
                ContactTag.contact_id == self.run.contact_id,
                ContactTag.tag_id == tag.id,
            )
        )
        return ct.scalar_one_or_none() is not None

    async def _fail(self, error: str) -> None:
        self.run.status = "failed"
        self.run.error = error
        self.run.completed_at = datetime.now(timezone.utc)
        await self.db.commit()


# ── Factory ────────────────────────────────────────────────────────────────────

async def start_run(
    flow: Flow,
    db: AsyncSession,
    contact_id: uuid.UUID | None = None,
    conversation_id: uuid.UUID | None = None,
    trigger_data: dict | None = None,
) -> FlowRun:
    """Create a FlowRun and begin execution."""
    run = FlowRun(
        flow_id=flow.id,
        contact_id=contact_id,
        conversation_id=conversation_id,
        status="running",
        context=trigger_data or {},
    )
    db.add(run)
    await db.flush()

    executor = FlowExecutor(flow, run, db)
    await executor.execute()
    return run
