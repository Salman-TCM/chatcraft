import uuid
from typing import Literal

from pydantic import BaseModel, Field

# Fixed trigger_type values — kept in sync with the model comment on
# Flow.trigger_type ("keyword/webhook/manual" in app/models/flow.py) and the
# node-generation system prompt in app/api/flows.py (_FLOW_SYSTEM_PROMPT).
FlowTriggerType = Literal["manual", "keyword", "webhook"]


# ── Flows ─────────────────────────────────────────────────────────────────────

class FlowGenerateRequest(BaseModel):
    # Stripped before length-checked so a whitespace-only description is
    # rejected, matching the previous (body.get("description") or "").strip() guard.
    model_config = {"str_strip_whitespace": True}

    description: str = Field(min_length=1, max_length=2000)
    chatbot_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None


class FlowCreate(BaseModel):
    # Stripped before length-checked, matching the previous
    # (body.get("name") or "").strip() guard.
    model_config = {"str_strip_whitespace": True}

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    chatbot_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None
    trigger_type: FlowTriggerType | None = None
    trigger_config: dict = Field(default_factory=dict)
    # Node/edge graph — free-form, not validated further (matches
    # Flow.nodes / Flow.edges JSONB columns). None means "use the default
    # start+end template", matching the previous body.get(..., default) behaviour.
    nodes: list | None = None
    edges: list | None = None


class FlowUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    trigger_type: FlowTriggerType | None = None
    trigger_config: dict | None = None
    nodes: list | None = None
    edges: list | None = None
    chatbot_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None
    starting_node_id: str | None = Field(default=None, max_length=100)


class WebhookConfigureRequest(BaseModel):
    regenerate: bool = False
    enabled: bool | None = None


class FlowTriggerRequest(BaseModel):
    contact_id: uuid.UUID | None = None
    conversation_id: uuid.UUID | None = None
    # Arbitrary seed variables for the run — free-form, matches FlowRun.context JSONB.
    data: dict = Field(default_factory=dict)


# ── Folders ───────────────────────────────────────────────────────────────────

class FlowFolderCreate(BaseModel):
    # Stripped before length-checked, matching the previous
    # (body.get("name") or "").strip() guard.
    model_config = {"str_strip_whitespace": True}

    name: str = Field(min_length=1, max_length=255)
    # Any hex colour string; the frontend picker (FOLDER_COLOURS in
    # frontend/app/dashboard/flows/page.tsx) only offers a swatch of 9, but the
    # column (FlowFolder.colour, String(20)) has no DB-level CHECK constraint —
    # mirrors the same regex-not-enum treatment used for Tag.color / Pipeline.color
    # in app/schemas/crm.py.
    colour: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class FlowFolderUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    colour: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
