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
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.flow import Flow, FlowRun
from app.services.llm import ChatMessage, LLMRouter

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
            self.run.completed_at = datetime.now(UTC)
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

        self.run.resumed_at = datetime.now(UTC)
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
            case "carousel":
                return await self._exec_carousel(data)
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
            case "ai_tasks":
                return await self._exec_ai_tasks(data)
            case "ai_web":
                return await self._exec_ai_web(data)
            case _:
                # Unknown node type — skip
                return {"status": "continue"}

    # ── Node handlers ─────────────────────────────────────────────────────────

    async def _exec_send_message(self, data: dict) -> dict:
        text = self._resolve(data.get("text", ""))
        channel_override = data.get("channel")  # "omni" means use conversation's channel
        if text and self.run.conversation_id:
            await self._send_to_conversation(text, channel_override=channel_override)
        return {"status": "continue"}

    async def _exec_carousel(self, data: dict) -> dict:
        """Emit a <<<RICH>>> carousel block to the conversation."""
        import json as _json

        cards = data.get("cards", [])
        if not cards or not self.run.conversation_id:
            return {"status": "continue"}
        # Resolve template variables in card text fields
        resolved_cards = []
        for card in cards:
            resolved_cards.append(
                {
                    "title": self._resolve(card.get("title", "")),
                    "subtitle": self._resolve(card.get("subtitle", "")),
                    "image_url": self._resolve(card.get("image_url", "")),
                    "buttons": [
                        {
                            "type": btn.get("type", "url"),
                            "label": self._resolve(btn.get("label", "")),
                            "value": self._resolve(btn.get("value", "")),
                        }
                        for btn in card.get("buttons", [])
                    ],
                }
            )
        rich_json = _json.dumps({"type": "carousel", "items": resolved_cards})
        rich_block = f"<<<RICH>>>{rich_json}<<<END>>>"
        channel_override = data.get("channel")
        await self._send_to_conversation(rich_block, channel_override=channel_override)
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
            # ── Fields & tags ─────────────────────────────────────────────────
            case "set_field":
                await self._action_set_field(data)
            case "clear_field":
                await self._action_clear_field(data)
            case "add_tag":
                await self._action_add_tag(data)
            case "remove_tag":
                await self._action_remove_tag(data)
            # ── Conversation ──────────────────────────────────────────────────
            case "close_conversation":
                await self._action_close_conversation()
            case "clear_chat_history":
                await self._action_clear_chat_history()
            case "internal_note":
                await self._action_internal_note(data)
            case "pause_conversation":
                await self._action_pause_conversation(True)
            case "resume_conversation":
                await self._action_pause_conversation(False)
            # ── Contact ───────────────────────────────────────────────────────
            case "delete_contact":
                await self._action_delete_contact()
            case "opt_out":
                await self._action_set_contact_flag("opted_out", True)
            case "opt_in":
                await self._action_set_contact_flag("opted_out", False)
            case "block_contact":
                await self._action_set_contact_flag("is_blocked", True)
            case "unblock_contact":
                await self._action_set_contact_flag("is_blocked", False)
            # ── Sequences & pipelines ──────────────────────────────────────────
            case "assign_sequence":
                await self._action_assign_sequence(data)
            case "unassign_sequence":
                await self._action_unassign_sequence(data)
            case "pipeline_add":
                await self._action_pipeline_add(data)
            case "pipeline_move":
                await self._action_pipeline_move(data)
            case "pipeline_remove":
                await self._action_pipeline_remove(data)
            case "pipeline_update_value":
                await self._action_pipeline_update_value(data)
            # ── Flows ─────────────────────────────────────────────────────────
            case "cancel_pending_flow":
                await self._action_cancel_pending_flow(data)
            # ── Outbound ──────────────────────────────────────────────────────
            case "send_sms":
                await self._action_send_sms(data)
            case "send_email":
                await self._action_send_email(data)
            case "send_push":
                await self._action_send_push(data)
            case "send_team_notification":
                await self._action_send_team_notification(data)
            case "outbound_call":
                await self._action_outbound_call(data)
            case "transfer_call":
                await self._action_transfer_call(data)
            case "end_call":
                await self._action_end_call(data)
            # ── Web ───────────────────────────────────────────────────────────
            case "send_webhook":
                await self._action_send_webhook(data)
            case "web_fetch":
                await self._action_web_fetch(data)
            # ── AI ────────────────────────────────────────────────────────────
            case "ai_generate":
                await self._action_ai_generate(data)
            case "extract_data":
                await self._action_extract_data(data)
            case "execute_js":
                await self._action_execute_js(data)
            # ── Assignment ────────────────────────────────────────────────────
            case "assign_conversation":
                await self._action_assign_conversation(data)
            # ── Wallet ────────────────────────────────────────────────────────
            case "wallet_action":
                await self._action_wallet(data)
            case "wallet_push":
                await self._action_wallet_push(data)
            # ── Google Sheets ─────────────────────────────────────────────────
            case "google_sheets":
                await self._action_google_sheets(data)
            # ── Google Docs ───────────────────────────────────────────────────
            case "google_docs":
                await self._action_google_docs(data)
            # ── WhatsApp Template ─────────────────────────────────────────────
            case "whatsapp_template":
                await self._action_whatsapp_template(data)
            # ── Channel config ────────────────────────────────────────────────
            case "set_persistent_menu":
                await self._action_channel_menu(data, set_mode=True)
            case "delete_persistent_menu":
                await self._action_channel_menu(data, set_mode=False)
            case "set_telegram_commands":
                await self._action_telegram_commands(data, set_mode=True)
            case "delete_telegram_commands":
                await self._action_telegram_commands(data, set_mode=False)
            # ── Discord ───────────────────────────────────────────────────────
            case "discord_action":
                await self._action_discord(data)
            # ── Social ────────────────────────────────────────────────────────
            case "social_post":
                await self._action_social_post(data)
            case "comment_on_post":
                await self._action_comment_on_post(data)
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

    async def _exec_ai_tasks(self, data: dict) -> dict:
        """
        AI Tasks node — drives a multi-step checklist via AI.
        Each task is sent as a message; AI responses are evaluated for completion.
        Branches to 'complete' or 'maxnudges' output handle.
        """
        tasks: list[str] = data.get("tasks", [])
        model = data.get("model", "gpt-4o-mini")
        max_nudges = int(data.get("max_nudges", 3))
        gentle = data.get("gentle", True)

        if not tasks:
            return {"status": "continue", "handle": "complete"}

        ctx = dict(self.run.context or {})
        completed = ctx.get("_ai_tasks_completed", [])
        nudge_count = int(ctx.get("_ai_tasks_nudges", 0))

        pending = [t for t in tasks if t not in completed]
        if not pending:
            return {"status": "continue", "handle": "complete"}

        if nudge_count >= max_nudges:
            return {"status": "continue", "handle": "maxnudges"}

        # Send next pending task as a message
        task_text = pending[0]
        tone = "gently remind" if gentle else "firmly ask"
        prompt = f"Please {tone} the user to complete the following task: {task_text}"
        llm = LLMRouter(model=model)
        try:
            resp = await llm.complete([ChatMessage(role="user", content=prompt)], max_tokens=256)
            if self.run.conversation_id:
                await self._send_to_conversation(resp.content.strip())
        except Exception:
            if self.run.conversation_id:
                await self._send_to_conversation(task_text)

        ctx["_ai_tasks_nudges"] = nudge_count + 1
        self.run.context = ctx
        return {"status": "waiting"}  # wait for user response to advance

    async def _exec_ai_web(self, data: dict) -> dict:
        """
        AI Web node — Search, Fetch, or Browse mode.
        Saves result to context variable; optionally sends summary as reply.
        """
        mode = data.get("mode", "fetch")  # "search" | "fetch" | "browse"
        query_or_url = self._resolve(data.get("query", data.get("url", "")))
        save_to = data.get("save_to", "web_result")
        send_reply = data.get("send_reply", False)
        model = data.get("model", "gpt-4o-mini")

        result_text = ""
        try:
            if mode == "fetch":
                async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                    resp = await client.get(query_or_url, headers={"User-Agent": "ChatCraft/1.0"})
                    # Strip HTML tags crudely for context injection
                    import re as _re

                    raw = resp.text[:8000]
                    result_text = _re.sub(r"<[^>]+>", " ", raw).strip()

            elif mode == "search":
                # Use Perplexity or fall back to a DuckDuckGo instant answer
                from app.core.config import settings

                if settings.perplexity_api_key:
                    llm = LLMRouter(model="sonar", provider_override="perplexity")
                    r = await llm.complete(
                        [ChatMessage(role="user", content=query_or_url)],
                        max_tokens=512,
                    )
                    result_text = r.content.strip()
                else:
                    async with httpx.AsyncClient(timeout=10) as client:
                        r = await client.get(
                            "https://api.duckduckgo.com/",
                            params={"q": query_or_url, "format": "json", "no_html": 1},
                        )
                        data_json = r.json()
                        result_text = data_json.get("AbstractText") or data_json.get("Answer") or ""

            elif mode == "browse":
                # Direct URL visit via browser service
                from app.services.browser import BrowserService

                bs = BrowserService()
                result_text = await bs.fetch_content(query_or_url)

            elif mode == "research":
                # Autonomous multi-page research: search + visit top results
                from app.services.browser import BrowserService

                max_pages = int(data.get("max_pages", 5))
                bs = BrowserService()
                result_text = await bs.research(query_or_url, max_pages=max(1, min(max_pages, 10)))

        except Exception as exc:
            result_text = f"[web error: {exc}]"

        ctx = dict(self.run.context or {})
        ctx[save_to] = result_text
        self.run.context = ctx

        if send_reply and result_text and self.run.conversation_id:
            llm = LLMRouter(model=model)
            try:
                summary = await llm.complete(
                    [
                        ChatMessage(
                            role="user",
                            content=f"Summarise this in 2-3 sentences:\n{result_text[:3000]}",
                        )
                    ],
                    max_tokens=256,
                )
                await self._send_to_conversation(summary.content.strip())
            except Exception:
                pass

        return {"status": "continue"}

    # ── Action helpers ────────────────────────────────────────────────────────

    async def _action_set_field(self, data: dict) -> None:
        field_key = data.get("field_key", "")
        value = self._resolve(str(data.get("value", "")))
        if not field_key or not self.run.contact_id:
            return

        from app.models.crm import ContactFieldValue, CustomField

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
            fv = ContactFieldValue(contact_id=self.run.contact_id, field_id=field.id, value=value)
            self.db.add(fv)
        # Also save to run context
        ctx = dict(self.run.context or {})
        ctx[field_key] = value
        self.run.context = ctx

    async def _action_add_tag(self, data: dict) -> None:
        tag_name = data.get("tag", "")
        if not tag_name or not self.run.contact_id:
            return
        from app.models.crm import ContactTag, Tag

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
        from app.models.crm import ContactTag, Tag

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
        payload = {
            "flow_id": str(self.flow.id),
            "run_id": str(self.run.id),
            "context": self.run.context,
        }
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
        from sqlalchemy import select

        from app.models.inbox import InboxAssignment

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
            self.db.add(
                InboxAssignment(
                    conversation_id=self.run.conversation_id,
                    assigned_to_user_id=uid,
                )
            )

    async def _action_clear_field(self, data: dict) -> None:
        field_key = data.get("field_key", "")
        if not field_key or not self.run.contact_id:
            return
        from app.models.crm import ContactFieldValue, CustomField

        result = await self.db.execute(
            select(CustomField).where(
                CustomField.field_key == field_key,
                CustomField.user_id == self.flow.user_id,
            )
        )
        field = result.scalar_one_or_none()
        if not field:
            return
        fv_result = await self.db.execute(
            select(ContactFieldValue).where(
                ContactFieldValue.contact_id == self.run.contact_id,
                ContactFieldValue.field_id == field.id,
            )
        )
        fv = fv_result.scalar_one_or_none()
        if fv:
            await self.db.delete(fv)

    async def _action_clear_chat_history(self) -> None:
        if not self.run.conversation_id:
            return
        from sqlalchemy import delete

        from app.models.message import Message

        await self.db.execute(
            delete(Message).where(Message.conversation_id == self.run.conversation_id)
        )

    async def _action_internal_note(self, data: dict) -> None:
        if not self.run.conversation_id:
            return
        note_text = self._resolve(data.get("note", ""))
        if not note_text:
            return
        from app.models.inbox import InternalNote

        self.db.add(
            InternalNote(
                conversation_id=self.run.conversation_id,
                content=note_text,
            )
        )

    async def _action_pause_conversation(self, paused: bool) -> None:
        if not self.run.conversation_id:
            return
        from app.models.conversation import Conversation

        conv = await self.db.get(Conversation, self.run.conversation_id)
        if conv:
            conv.ai_paused = paused

    async def _action_delete_contact(self) -> None:
        if not self.run.contact_id:
            return
        from app.models.crm import Contact

        contact = await self.db.get(Contact, self.run.contact_id)
        if contact:
            await self.db.delete(contact)

    async def _action_set_contact_flag(self, flag: str, value: bool) -> None:
        if not self.run.contact_id:
            return
        from app.models.crm import Contact

        contact = await self.db.get(Contact, self.run.contact_id)
        if contact and hasattr(contact, flag):
            setattr(contact, flag, value)

    async def _action_assign_sequence(self, data: dict) -> None:
        sequence_id_str = data.get("sequence_id", "")
        if not sequence_id_str or not self.run.contact_id:
            return
        from app.models.automation import SequenceEnrollment

        sid = uuid.UUID(sequence_id_str)
        existing = await self.db.execute(
            select(SequenceEnrollment).where(
                SequenceEnrollment.sequence_id == sid,
                SequenceEnrollment.contact_id == self.run.contact_id,
            )
        )
        if not existing.scalar_one_or_none():
            self.db.add(
                SequenceEnrollment(
                    sequence_id=sid,
                    contact_id=self.run.contact_id,
                    current_step=0,
                )
            )

    async def _action_unassign_sequence(self, data: dict) -> None:
        sequence_id_str = data.get("sequence_id", "")
        if not sequence_id_str or not self.run.contact_id:
            return
        from sqlalchemy import delete

        from app.models.automation import SequenceEnrollment

        sid = uuid.UUID(sequence_id_str)
        await self.db.execute(
            delete(SequenceEnrollment).where(
                SequenceEnrollment.sequence_id == sid,
                SequenceEnrollment.contact_id == self.run.contact_id,
            )
        )

    async def _action_pipeline_add(self, data: dict) -> None:
        pipeline_id_str = data.get("pipeline_id", "")
        stage_id_str = data.get("stage_id", "")
        if not pipeline_id_str or not self.run.contact_id:
            return
        from app.models.crm import Deal

        self.db.add(
            Deal(
                pipeline_id=uuid.UUID(pipeline_id_str),
                stage_id=uuid.UUID(stage_id_str) if stage_id_str else None,
                contact_id=self.run.contact_id,
                user_id=self.flow.user_id,
                title=self._resolve(data.get("title", "Deal")),
                value=float(data.get("value", 0)),
            )
        )

    async def _action_pipeline_move(self, data: dict) -> None:
        deal_id_str = data.get("deal_id", "")
        stage_id_str = data.get("stage_id", "")
        if not deal_id_str or not stage_id_str:
            return
        from app.models.crm import Deal

        deal = await self.db.get(Deal, uuid.UUID(deal_id_str))
        if deal:
            deal.stage_id = uuid.UUID(stage_id_str)

    async def _action_pipeline_remove(self, data: dict) -> None:
        deal_id_str = data.get("deal_id", "")
        if not deal_id_str:
            return
        from app.models.crm import Deal

        deal = await self.db.get(Deal, uuid.UUID(deal_id_str))
        if deal:
            await self.db.delete(deal)

    async def _action_pipeline_update_value(self, data: dict) -> None:
        deal_id_str = data.get("deal_id", "")
        if not deal_id_str:
            return
        from app.models.crm import Deal

        deal = await self.db.get(Deal, uuid.UUID(deal_id_str))
        if deal:
            deal.value = float(self._resolve(str(data.get("value", 0))))

    async def _action_cancel_pending_flow(self, data: dict) -> None:
        if not self.run.contact_id:
            return
        from sqlalchemy import update

        from app.models.flow import FlowRun

        target_flow_id_str = data.get("flow_id", "")
        stmt = update(FlowRun).where(
            FlowRun.contact_id == self.run.contact_id,
            FlowRun.status.in_(["running", "waiting"]),
            FlowRun.id != self.run.id,
        )
        if target_flow_id_str:
            stmt = stmt.where(FlowRun.flow_id == uuid.UUID(target_flow_id_str))
        await self.db.execute(stmt.values(status="cancelled"))

    async def _action_send_sms(self, data: dict) -> None:
        to = self._resolve(data.get("to", ""))
        body = self._resolve(data.get("body", ""))
        if not to or not body:
            return
        from app.core.config import settings

        if not settings.twilio_account_sid:
            return
        try:
            from twilio.rest import Client

            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            client.messages.create(body=body, from_=settings.twilio_phone_number, to=to)
        except Exception:
            pass

    async def _action_send_email(self, data: dict) -> None:
        to = self._resolve(data.get("to", ""))
        subject = self._resolve(data.get("subject", ""))
        body = self._resolve(data.get("body", ""))
        if not to or not subject:
            return
        from app.services.email import send_custom_email

        try:
            await send_custom_email(to=to, subject=subject, html=body)
        except Exception:
            pass

    async def _action_send_push(self, data: dict) -> None:
        title = self._resolve(data.get("title", ""))
        body = self._resolve(data.get("body", ""))
        contact_id = self.run.contact_id
        if not contact_id or not title:
            return
        try:
            from app.services.push import send_push_to_contact

            await send_push_to_contact(contact_id=contact_id, title=title, body=body, db=self.db)
        except Exception:
            pass

    async def _action_send_team_notification(self, data: dict) -> None:
        message = self._resolve(data.get("message", ""))
        if not message:
            return
        from app.core.config import settings

        if settings.slack_alert_webhook_url:
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    await client.post(
                        settings.slack_alert_webhook_url,
                        json={"text": f"[Flow: {self.flow.name}] {message}"},
                    )
            except Exception:
                pass

    async def _action_outbound_call(self, data: dict) -> None:
        to = self._resolve(data.get("to", ""))
        if not to:
            return
        from app.core.config import settings

        if not settings.twilio_account_sid:
            return
        try:
            from twilio.rest import Client

            twiml_url = self._resolve(
                data.get("twiml_url", f"{settings.api_base_url}/api/webhooks/twilio/voice/answer")
            )
            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            client.calls.create(to=to, from_=settings.twilio_phone_number, url=twiml_url)
        except Exception:
            pass

    async def _action_transfer_call(self, data: dict) -> None:
        """Redirect an active Twilio call to a new phone number using Twilio REST API."""
        to = self._resolve(data.get("to", ""))
        message = self._resolve(data.get("message", "Transferring you now. Please hold."))
        if not to or not self.run.conversation_id:
            return
        from app.core.config import settings

        if not settings.twilio_account_sid:
            return
        try:
            from app.models.conversation import Conversation

            conv = await self.db.get(Conversation, self.run.conversation_id)
            if not conv or conv.channel != "phone" or not conv.guest_id:
                return
            call_sid = conv.guest_id
            safe_msg = message.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            safe_to = to.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            twiml = (
                '<?xml version="1.0" encoding="UTF-8"?>'
                f'<Response><Say voice="Polly.Joanna">{safe_msg}</Say>'
                f"<Dial>{safe_to}</Dial></Response>"
            )
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Calls/{call_sid}.json",
                    auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                    data={"Twiml": twiml},
                )
        except Exception:
            pass

    async def _action_end_call(self, data: dict) -> None:
        """Terminate an active Twilio call, optionally playing a goodbye message first."""
        message = self._resolve(data.get("message", ""))
        if not self.run.conversation_id:
            return
        from app.core.config import settings

        if not settings.twilio_account_sid:
            return
        try:
            from app.models.conversation import Conversation

            conv = await self.db.get(Conversation, self.run.conversation_id)
            if not conv or conv.channel != "phone" or not conv.guest_id:
                return
            call_sid = conv.guest_id
            async with httpx.AsyncClient(timeout=10) as client:
                if message:
                    safe_msg = (
                        message.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    )
                    twiml = (
                        '<?xml version="1.0" encoding="UTF-8"?>'
                        f'<Response><Say voice="Polly.Joanna">{safe_msg}</Say><Hangup/></Response>'
                    )
                    await client.post(
                        f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Calls/{call_sid}.json",
                        auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                        data={"Twiml": twiml},
                    )
                else:
                    await client.post(
                        f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Calls/{call_sid}.json",
                        auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                        data={"Status": "completed"},
                    )
        except Exception:
            pass

    async def _action_web_fetch(self, data: dict) -> None:
        url = self._resolve(data.get("url", ""))
        save_to = data.get("save_to", "fetch_result")
        if not url:
            return
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "ChatCraft/1.0"})
                import re as _re

                text = _re.sub(r"<[^>]+>", " ", resp.text[:6000]).strip()
            ctx = dict(self.run.context or {})
            ctx[save_to] = text
            self.run.context = ctx
        except Exception as exc:
            ctx = dict(self.run.context or {})
            ctx[f"{save_to}_error"] = str(exc)
            self.run.context = ctx

    async def _action_ai_generate(self, data: dict) -> None:
        prompt = self._resolve(data.get("prompt", ""))
        model = data.get("model", "gpt-4o-mini")
        save_to = data.get("save_to", "ai_result")
        if not prompt:
            return
        llm = LLMRouter(model=model)
        try:
            resp = await llm.complete([ChatMessage(role="user", content=prompt)], max_tokens=1024)
            ctx = dict(self.run.context or {})
            ctx[save_to] = resp.content.strip()
            self.run.context = ctx
        except Exception:
            pass

    async def _action_extract_data(self, data: dict) -> None:
        schema_desc = data.get("schema", "")
        save_to = data.get("save_to", "extracted")
        conversation_context = ""
        if self.run.conversation_id:
            from sqlalchemy import select as _select

            from app.models.message import Message

            msgs = await self.db.execute(
                _select(Message)
                .where(Message.conversation_id == self.run.conversation_id)
                .order_by(Message.created_at.desc())
                .limit(10)
            )
            conversation_context = "\n".join(
                f"{m.role}: {m.content}" for m in reversed(msgs.scalars().all())
            )
        prompt = (
            f"Extract the following data from this conversation as JSON: {schema_desc}\n\n"
            f"Conversation:\n{conversation_context}\n\n"
            "Return only valid JSON, no explanation."
        )
        llm = LLMRouter(model="gpt-4o-mini")
        try:
            resp = await llm.complete([ChatMessage(role="user", content=prompt)], max_tokens=512)
            import json as _json

            extracted = _json.loads(resp.content.strip().strip("```json").strip("```"))
            ctx = dict(self.run.context or {})
            ctx[save_to] = extracted
            if isinstance(extracted, dict):
                ctx.update(extracted)
            self.run.context = ctx
        except Exception:
            pass

    async def _action_execute_js(self, data: dict) -> None:
        code = data.get("code", "")
        save_to = data.get("save_to", "js_result")
        if not code:
            return
        ctx = dict(self.run.context or {})
        # Sandboxed exec with restricted builtins + context injection
        sandbox: dict = {
            "__builtins__": {
                "str": str,
                "int": int,
                "float": float,
                "bool": bool,
                "list": list,
                "dict": dict,
                "len": len,
                "range": range,
                "print": lambda *a: None,
            },
            "context": dict(ctx),
            "result": None,
        }
        try:
            exec(compile(code, "<flow_js>", "exec"), sandbox)  # noqa: S102
            ctx[save_to] = sandbox.get("result")
            self.run.context = ctx
        except Exception as exc:
            ctx[f"{save_to}_error"] = str(exc)
            self.run.context = ctx

    async def _action_wallet(self, data: dict) -> None:
        serial = self._resolve(data.get("serial", ""))
        action = data.get("wallet_action", "")
        if not serial or not action:
            return
        try:
            from app.services.wallet.service import WalletService

            ws = WalletService(db=self.db)
            message = self._resolve(data.get("message", "")) or None
            silent = bool(data.get("silent", False))
            await ws.perform_action(
                serial=serial,
                action=action,
                value=data.get("value"),
                user_id=self.flow.user_id,
                source="flow",
                message=message,
                silent=silent,
            )
        except Exception:
            pass

    async def _action_wallet_push(self, data: dict) -> None:
        serial = self._resolve(data.get("serial", ""))
        message = self._resolve(data.get("message", "Your pass has been updated."))
        if not serial:
            return
        try:
            from sqlalchemy import select

            from app.models.wallet import WalletCard, WalletProgram

            result = await self.db.execute(select(WalletCard).where(WalletCard.serial == serial))
            card = result.scalar_one_or_none()
            if not card:
                return
            program = await self.db.get(WalletProgram, card.program_id)
            if not program or program.user_id != self.flow.user_id:
                return
            from app.api.wallet import _push_card_devices, _render_message

            rendered = _render_message(message, card, program)
            await _push_card_devices(card, program, rendered, self.db)
        except Exception:
            pass

    async def _action_google_sheets(self, data: dict) -> None:
        """Google Sheets action: append_row / update_row / get_row / search_rows."""
        sheet_id = self._resolve(data.get("sheet_id", ""))
        tab = self._resolve(data.get("tab", "Sheet1"))
        op = data.get("operation", "append_row")
        save_to = data.get("save_to", "sheets_result")
        if not sheet_id:
            return
        try:
            import gspread
            from google.oauth2.service_account import Credentials

            from app.core.config import settings

            creds_json = getattr(settings, "google_service_account_json", None)
            if not creds_json:
                return
            import json as _json

            creds = Credentials.from_service_account_info(
                _json.loads(creds_json),
                scopes=["https://www.googleapis.com/auth/spreadsheets"],
            )
            gc = gspread.authorize(creds)
            sh = gc.open_by_key(sheet_id)
            ws = sh.worksheet(tab)

            ctx = dict(self.run.context or {})
            if op == "append_row":
                # Support both list row_data and comma-separated row_text
                row_text = self._resolve(data.get("row_text", ""))
                row_data: list = (
                    [v.strip() for v in row_text.split(",")]
                    if row_text
                    else data.get("row_data", [])
                )
                resolved = [self._resolve(str(v)) for v in row_data]
                ws.append_row(resolved)
                ctx[save_to] = {"appended": resolved}
            elif op == "get_row":
                row_num = int(self._resolve(str(data.get("row_number", 1))))
                row = ws.row_values(row_num)
                ctx[save_to] = row
            elif op == "search_rows":
                query = self._resolve(data.get("query", ""))
                all_rows = ws.get_all_records()
                matches = [r for r in all_rows if query.lower() in str(r).lower()]
                ctx[save_to] = matches[:10]
            elif op == "update_row":
                row_num = int(self._resolve(str(data.get("row_number", 1))))
                row_text = self._resolve(data.get("row_text", ""))
                row_data = (
                    [v.strip() for v in row_text.split(",")]
                    if row_text
                    else data.get("row_data", [])
                )
                resolved = [self._resolve(str(v)) for v in row_data]
                ws.update(f"A{row_num}", [resolved])
                ctx[save_to] = {"updated_row": row_num}
            elif op == "get_multiple_rows":
                start_row = int(self._resolve(str(data.get("start_row", 1))))
                end_row = int(self._resolve(str(data.get("end_row", 10))))
                rows = [ws.row_values(r) for r in range(start_row, end_row + 1)]
                ctx[save_to] = rows
            elif op == "get_random_row":
                all_rows = ws.get_all_values()
                import random as _random

                skip_header = data.get("skip_header", True)
                eligible = all_rows[1:] if skip_header and len(all_rows) > 1 else all_rows
                ctx[save_to] = _random.choice(eligible) if eligible else []
            elif op == "clear_row":
                row_num = int(self._resolve(str(data.get("row_number", 1))))
                num_cols = int(data.get("num_columns", 10))
                cell_range = f"A{row_num}:{chr(ord('A') + num_cols - 1)}{row_num}"
                ws.batch_clear([cell_range])
                ctx[save_to] = {"cleared_row": row_num}
            self.run.context = ctx
        except Exception as exc:
            ctx = dict(self.run.context or {})
            ctx[f"{save_to}_error"] = str(exc)
            self.run.context = ctx

    async def _action_google_docs(self, data: dict) -> None:
        """Google Docs action: create a new doc or update (append to) an existing doc."""
        op = data.get("operation", "create")
        title = self._resolve(data.get("title", "Untitled Document"))
        content = self._resolve(data.get("content", ""))
        doc_id = self._resolve(data.get("doc_id", ""))
        save_to = data.get("save_to", "doc_result")
        try:
            import json as _json

            from google.oauth2.service_account import Credentials
            from googleapiclient.discovery import build

            from app.core.config import settings

            creds_json = getattr(settings, "google_service_account_json", None)
            if not creds_json:
                return
            creds = Credentials.from_service_account_info(
                _json.loads(creds_json),
                scopes=["https://www.googleapis.com/auth/documents"],
            )
            service = build("docs", "v1", credentials=creds, cache_discovery=False)
            ctx = dict(self.run.context or {})

            if op == "create":
                doc = service.documents().create(body={"title": title}).execute()
                created_id = doc.get("documentId", "")
                if content and created_id:
                    service.documents().batchUpdate(
                        documentId=created_id,
                        body={
                            "requests": [
                                {"insertText": {"location": {"index": 1}, "text": content}}
                            ]
                        },
                    ).execute()
                ctx[save_to] = {
                    "doc_id": created_id,
                    "title": title,
                    "url": f"https://docs.google.com/document/d/{created_id}/edit",
                }

            elif op == "update" and doc_id:
                doc = service.documents().get(documentId=doc_id).execute()
                body_content = doc.get("body", {}).get("content", [])
                end_index = max(1, (body_content[-1].get("endIndex", 2) - 1) if body_content else 1)
                if content:
                    service.documents().batchUpdate(
                        documentId=doc_id,
                        body={
                            "requests": [
                                {"insertText": {"location": {"index": end_index}, "text": content}}
                            ]
                        },
                    ).execute()
                ctx[save_to] = {
                    "doc_id": doc_id,
                    "updated": True,
                    "url": f"https://docs.google.com/document/d/{doc_id}/edit",
                }

            self.run.context = ctx
        except Exception as exc:
            ctx = dict(self.run.context or {})
            ctx[f"{save_to}_error"] = str(exc)
            self.run.context = ctx

    async def _action_whatsapp_template(self, data: dict) -> None:
        """Send a WhatsApp template message via the conversation's WhatsApp integration."""
        template_name = self._resolve(data.get("template_name", ""))
        language_code = data.get("language_code", "en")
        components: list = data.get("components", [])
        if not template_name or not self.run.conversation_id:
            return
        try:
            from sqlalchemy import select as _sel

            from app.models.channel_integration import ChannelIntegration
            from app.models.conversation import Conversation

            conv = await self.db.get(Conversation, self.run.conversation_id)
            if not conv:
                return
            r = await self.db.execute(
                _sel(ChannelIntegration).where(
                    ChannelIntegration.chatbot_id == conv.chatbot_id,
                    ChannelIntegration.channel == "whatsapp",
                    ChannelIntegration.is_active.is_(True),
                )
            )
            integ = r.scalar_one_or_none()
            if not integ:
                return
            from app.services.channels.whatsapp import WhatsAppSender

            sender = WhatsAppSender(integ.config)
            # Resolve component text placeholders
            resolved_components = []
            for comp in components:
                rc = dict(comp)
                if "parameters" in rc:
                    rc["parameters"] = [
                        {**p, "text": self._resolve(p.get("text", ""))}
                        if p.get("type") == "text"
                        else p
                        for p in rc["parameters"]
                    ]
                resolved_components.append(rc)
            recipient_id = conv.guest_id or ""
            if not recipient_id:
                return
            await sender.send_rich(
                recipient_id,
                {
                    "type": "template",
                    "template": {
                        "name": template_name,
                        "language": {"code": language_code},
                        "components": resolved_components,
                    },
                },
            )
        except Exception:
            pass

    async def _action_channel_menu(self, data: dict, set_mode: bool) -> None:
        """Set or delete a Messenger/Instagram persistent menu."""
        channel = data.get("channel", "facebook")
        menu_items: list = data.get("menu_items", [])
        if not self.run.conversation_id:
            return
        try:
            from sqlalchemy import select as _sel

            from app.models.channel_integration import ChannelIntegration
            from app.models.conversation import Conversation

            conv = await self.db.get(Conversation, self.run.conversation_id)
            if not conv:
                return
            r = await self.db.execute(
                _sel(ChannelIntegration).where(
                    ChannelIntegration.chatbot_id == conv.chatbot_id,
                    ChannelIntegration.channel == channel,
                    ChannelIntegration.is_active.is_(True),
                )
            )
            integ = r.scalar_one_or_none()
            if not integ:
                return
            from app.services.channels.facebook import FacebookSender

            sender = FacebookSender(integ.config)
            if set_mode:
                await sender.set_persistent_menu(menu_items)
            else:
                await sender.delete_persistent_menu()
        except Exception:
            pass

    async def _action_telegram_commands(self, data: dict, set_mode: bool) -> None:
        """Set or delete Telegram bot commands."""
        commands: list = data.get("commands", [])
        if not self.run.conversation_id:
            return
        try:
            from sqlalchemy import select as _sel

            from app.models.channel_integration import ChannelIntegration
            from app.models.conversation import Conversation

            conv = await self.db.get(Conversation, self.run.conversation_id)
            if not conv:
                return
            r = await self.db.execute(
                _sel(ChannelIntegration).where(
                    ChannelIntegration.chatbot_id == conv.chatbot_id,
                    ChannelIntegration.channel == "telegram",
                    ChannelIntegration.is_active.is_(True),
                )
            )
            integ = r.scalar_one_or_none()
            if not integ:
                return
            from app.services.channels.telegram import TelegramSender

            sender = TelegramSender(integ.config)
            if set_mode:
                await sender.set_commands(commands)
            else:
                await sender.delete_commands()
        except Exception:
            pass

    async def _action_discord(self, data: dict) -> None:
        """Discord actions: send_message / send_embed / add_role / remove_role."""
        op = data.get("discord_op", "send_message")
        if not self.run.conversation_id:
            return
        try:
            from sqlalchemy import select as _sel

            from app.models.channel_integration import ChannelIntegration
            from app.models.conversation import Conversation

            conv = await self.db.get(Conversation, self.run.conversation_id)
            if not conv:
                return
            r = await self.db.execute(
                _sel(ChannelIntegration).where(
                    ChannelIntegration.chatbot_id == conv.chatbot_id,
                    ChannelIntegration.channel == "discord",
                    ChannelIntegration.is_active.is_(True),
                )
            )
            integ = r.scalar_one_or_none()
            if not integ:
                return
            from app.services.channels.discord import DiscordSender

            sender = DiscordSender(integ.config)
            channel_id = self._resolve(data.get("channel_id", "")) or conv.guest_id or ""
            if op == "send_message":
                text = self._resolve(data.get("message", ""))
                if text and channel_id:
                    await sender.send(channel_id, text)
            elif op == "send_embed":
                embed = {k: self._resolve(str(v)) for k, v in data.get("embed", {}).items()}
                if channel_id:
                    await sender.send_rich(channel_id, {"type": "embed", "embed": embed})
            elif op == "add_role":
                guild_id = self._resolve(data.get("guild_id", ""))
                user_id = self._resolve(data.get("user_id", ""))
                role_id = self._resolve(data.get("role_id", ""))
                if guild_id and user_id and role_id:
                    await sender.add_role(guild_id, user_id, role_id)
            elif op == "remove_role":
                guild_id = self._resolve(data.get("guild_id", ""))
                user_id = self._resolve(data.get("user_id", ""))
                role_id = self._resolve(data.get("role_id", ""))
                if guild_id and user_id and role_id:
                    await sender.remove_role(guild_id, user_id, role_id)
        except Exception:
            pass

    async def _action_social_post(self, data: dict) -> None:
        """Post to connected social accounts (Facebook, Instagram, X)."""
        content = self._resolve(data.get("content", ""))
        image_url = self._resolve(data.get("image_url", "")) or None
        platforms: list[str] = data.get("platforms", ["facebook"])
        if not content:
            return
        try:
            from sqlalchemy import select as _sel

            from app.models.broadcast import SocialAccount

            r = await self.db.execute(
                _sel(SocialAccount).where(
                    SocialAccount.user_id == self.flow.user_id,
                    SocialAccount.platform.in_(platforms),
                )
            )
            accounts = r.scalars().all()
            import httpx

            _GRAPH = "https://graph.facebook.com/v19.0"
            async with httpx.AsyncClient(timeout=15) as client:
                for account in accounts:
                    token = account.access_token
                    if account.platform == "facebook" and account.page_id:
                        params: dict = {"message": content, "access_token": token}
                        if image_url:
                            params["link"] = image_url
                        await client.post(f"{_GRAPH}/{account.page_id}/feed", params=params)
                    elif account.platform == "instagram" and account.page_id and image_url:
                        c = await client.post(
                            f"{_GRAPH}/{account.page_id}/media",
                            params={
                                "image_url": image_url,
                                "caption": content,
                                "access_token": token,
                            },
                        )
                        cid = c.json().get("id")
                        if cid:
                            await client.post(
                                f"{_GRAPH}/{account.page_id}/media_publish",
                                params={"creation_id": cid, "access_token": token},
                            )
        except Exception:
            pass

    async def _action_comment_on_post(self, data: dict) -> None:
        """Post a comment on an Instagram media object via the Graph API."""
        media_id = self._resolve(data.get("media_id", ""))
        message = self._resolve(data.get("message", ""))
        if not media_id or not message:
            return
        try:
            from sqlalchemy import select as _sel

            from app.models.channel_integration import ChannelIntegration

            r = await self.db.execute(
                _sel(ChannelIntegration).where(
                    ChannelIntegration.chatbot_id == self.flow.chatbot_id,
                    ChannelIntegration.channel == "instagram",
                    ChannelIntegration.is_active.is_(True),
                )
            )
            integ = r.scalar_one_or_none()
            if not integ:
                return
            token = integ.config.get("page_access_token", "")
            if not token:
                return
            _GRAPH = "https://graph.facebook.com/v19.0"
            async with httpx.AsyncClient(timeout=15) as client:
                await client.post(
                    f"{_GRAPH}/{media_id}/comments",
                    json={"message": message},
                    params={"access_token": token},
                )
        except Exception:
            pass

    # ── Graph helpers ─────────────────────────────────────────────────────────

    def _find_start_node_id(self) -> str | None:
        # Explicit entry point set by user
        if self.flow.starting_node_id:
            return self.flow.starting_node_id
        for node in self.flow.nodes or []:
            if node.get("type") == "start":
                return node["id"]
        # Fallback: first node with no incoming edges
        targets = {e["target"] for e in self._edges}
        for node in self.flow.nodes or []:
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

    async def _send_to_conversation(self, text: str, channel_override: str | None = None) -> None:
        """Persist a message and deliver it via the conversation's channel."""
        from app.models.conversation import Conversation
        from app.models.message import Message, MessageRole

        conv = await self.db.get(Conversation, self.run.conversation_id)
        if not conv:
            return

        msg = Message(
            conversation_id=conv.id,
            role=MessageRole.assistant,
            content=text,
        )
        self.db.add(msg)
        conv.last_message_at = datetime.now(UTC)

        # Determine which channel to use
        effective_channel = (
            channel_override if channel_override and channel_override != "omni" else conv.channel
        )

        # Send outbound via channel
        if effective_channel and effective_channel not in ("web", "web_widget") and conv.guest_id:
            from app.models.channel_integration import ChannelIntegration
            from app.services.channels import (
                META_WINDOW_CHANNELS,
                get_sender,
                is_within_meta_window,
            )

            result = await self.db.execute(
                select(ChannelIntegration).where(
                    ChannelIntegration.chatbot_id == conv.chatbot_id,
                    ChannelIntegration.channel == effective_channel,
                    ChannelIntegration.is_active.is_(True),
                )
            )
            integration = result.scalar_one_or_none()
            if integration:
                # Enforce 24-hour window for Meta channels on proactive outbound
                if effective_channel in META_WINDOW_CHANNELS and not is_within_meta_window(
                    effective_channel, conv.last_user_message_at
                ):
                    # Outside window — skip delivery (WhatsApp could fall back to a template
                    # but that requires a pre-approved template name we don't have here)
                    pass
                else:
                    try:
                        sender = get_sender(effective_channel, integration.config)
                        await sender.send(conv.guest_id, text)
                    except Exception:
                        pass

    async def _contact_has_tag(self, tag_name: str) -> bool:
        if not self.run.contact_id:
            return False
        from app.models.crm import ContactTag, Tag

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
        self.run.completed_at = datetime.now(UTC)
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
