"""add branding/voice fields to chatbot_configs and create widget_configs

Revision ID: 000000000009
Revises: 000000000008
Create Date: 2026-05-12 00:00:09.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.models.base import drop_updated_at_trigger, set_updated_at_trigger

revision: str = "000000000009"
down_revision: Union[str, None] = "000000000008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Branding columns on chatbot_configs ───────────────────────────────────
    op.add_column("chatbot_configs", sa.Column("logo_url", sa.String(2048), nullable=True))
    op.add_column("chatbot_configs", sa.Column("primary_colour", sa.String(7), server_default="#6366f1", nullable=False))
    op.add_column("chatbot_configs", sa.Column("secondary_colour", sa.String(7), server_default="#f3f4f6", nullable=False))
    op.add_column("chatbot_configs", sa.Column("background_colour", sa.String(7), server_default="#ffffff", nullable=False))
    op.add_column("chatbot_configs", sa.Column("font_family", sa.String(100), server_default="Inter", nullable=False))
    op.add_column("chatbot_configs", sa.Column("welcome_message", sa.String(500), nullable=True))
    op.add_column("chatbot_configs", sa.Column("placeholder_text", sa.String(200), server_default="Ask me anything…", nullable=False))
    op.add_column("chatbot_configs", sa.Column("bubble_style", sa.String(20), server_default="rounded", nullable=False))
    op.add_column("chatbot_configs", sa.Column("dark_mode", sa.Boolean(), server_default="false", nullable=False))

    # ── Voice columns on chatbot_configs ──────────────────────────────────────
    op.add_column("chatbot_configs", sa.Column("tts_enabled", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("chatbot_configs", sa.Column("stt_enabled", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("chatbot_configs", sa.Column("auto_play_tts", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("chatbot_configs", sa.Column("voice_id", sa.String(100), nullable=True))
    op.add_column("chatbot_configs", sa.Column("voice_stability", sa.Float(), server_default="0.5", nullable=False))
    op.add_column("chatbot_configs", sa.Column("voice_similarity_boost", sa.Float(), server_default="0.75", nullable=False))

    # ── widget_configs table ──────────────────────────────────────────────────
    op.create_table(
        "widget_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("chatbot_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("allowed_domains", sa.Text(), nullable=True),
        sa.Column("position", sa.String(20), server_default="bottom-right", nullable=False),
        sa.Column("show_branding", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("embed_token", sa.String(64), nullable=False),
        sa.ForeignKeyConstraint(["chatbot_id"], ["chatbot_configs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chatbot_id", name="uq_widget_configs_chatbot_id"),
        sa.UniqueConstraint("embed_token", name="uq_widget_configs_embed_token"),
    )
    op.create_index("ix_widget_configs_chatbot_id", "widget_configs", ["chatbot_id"])
    op.create_index("ix_widget_configs_embed_token", "widget_configs", ["embed_token"])
    op.execute(set_updated_at_trigger("widget_configs"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("widget_configs"))
    op.drop_index("ix_widget_configs_embed_token", table_name="widget_configs")
    op.drop_index("ix_widget_configs_chatbot_id", table_name="widget_configs")
    op.drop_table("widget_configs")

    for col in [
        "voice_similarity_boost", "voice_stability", "voice_id",
        "auto_play_tts", "stt_enabled", "tts_enabled",
        "dark_mode", "bubble_style", "placeholder_text",
        "welcome_message", "font_family", "background_colour",
        "secondary_colour", "primary_colour", "logo_url",
    ]:
        op.drop_column("chatbot_configs", col)
