"""add automation, sequence, keyword tables

Revision ID: 000000000015
Revises: 000000000014
Create Date: 2026-05-17
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op
from app.models.base import drop_updated_at_trigger, set_updated_at_trigger

revision = "000000000015"
down_revision = "000000000014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "automations",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("trigger_type", sa.String(80), nullable=False),
        sa.Column("trigger_config", JSONB, nullable=False, server_default="{}"),
        sa.Column("action_type", sa.String(80), nullable=False),
        sa.Column("action_config", JSONB, nullable=False, server_default="{}"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("execution_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_executed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_automations_user_id", "automations", ["user_id"])
    op.execute(set_updated_at_trigger("automations"))

    op.create_table(
        "sequences",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "chatbot_id",
            UUID(as_uuid=True),
            sa.ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("auto_enroll", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("reply_behavior", sa.String(20), nullable=False, server_default="stop"),
        sa.Column("steps", JSONB, nullable=False, server_default="[]"),
    )
    op.create_index("ix_sequences_user_id", "sequences", ["user_id"])
    op.execute(set_updated_at_trigger("sequences"))

    op.create_table(
        "sequence_enrollments",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "sequence_id",
            UUID(as_uuid=True),
            sa.ForeignKey("sequences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "contact_id",
            UUID(as_uuid=True),
            sa.ForeignKey("contacts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("current_step", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "enrolled_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("sequence_id", "contact_id", name="uq_seq_enrollment"),
    )
    op.create_index("ix_seq_enrollments_sequence_id", "sequence_enrollments", ["sequence_id"])
    op.create_index("ix_seq_enrollments_contact_id", "sequence_enrollments", ["contact_id"])
    op.create_index("ix_seq_enrollments_status", "sequence_enrollments", ["status"])

    op.create_table(
        "keywords",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "chatbot_id",
            UUID(as_uuid=True),
            sa.ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("keywords", JSONB, nullable=False, server_default="[]"),
        sa.Column("match_type", sa.String(20), nullable=False, server_default="contains"),
        sa.Column("response_type", sa.String(20), nullable=False, server_default="text"),
        sa.Column("response_text", sa.Text, nullable=True),
        sa.Column(
            "flow_id",
            UUID(as_uuid=True),
            sa.ForeignKey("flows.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("priority", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_keywords_user_id", "keywords", ["user_id"])
    op.create_index("ix_keywords_chatbot_id", "keywords", ["chatbot_id"])
    op.execute(set_updated_at_trigger("keywords"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("keywords"))
    op.drop_table("keywords")
    op.drop_table("sequence_enrollments")
    op.execute(drop_updated_at_trigger("sequences"))
    op.drop_table("sequences")
    op.execute(drop_updated_at_trigger("automations"))
    op.drop_table("automations")
