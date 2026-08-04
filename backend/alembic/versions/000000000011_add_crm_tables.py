"""add CRM tables: contacts, tags, custom_fields, pipelines

Revision ID: 000000000011
Revises: 000000000010
Create Date: 2026-05-13 00:00:11.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.models.base import drop_updated_at_trigger, set_updated_at_trigger

revision: str = "000000000011"
down_revision: str | None = "000000000010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── contacts ──────────────────────────────────────────────────────────────
    op.create_table(
        "contacts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("public_id", sa.String(255), nullable=True),
        sa.Column("contact_id", sa.String(255), nullable=True),
        sa.Column("first_name", sa.String(255), nullable=True),
        sa.Column("last_name", sa.String(255), nullable=True),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("company", sa.String(255), nullable=True),
        sa.Column("source", sa.String(100), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contacts_user_id", "contacts", ["user_id"])
    op.create_index("ix_contacts_email", "contacts", ["email"])
    op.create_index("ix_contacts_phone", "contacts", ["phone"])
    op.create_index("ix_contacts_public_id", "contacts", ["public_id"])
    op.create_index("ix_contacts_contact_id", "contacts", ["contact_id"])
    op.execute(set_updated_at_trigger("contacts"))

    # ── tags ─────────────────────────────────────────────────────────────────
    op.create_table(
        "tags",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("color", sa.String(7), nullable=False, server_default="#6366f1"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_tags_user_name"),
    )
    op.create_index("ix_tags_user_id", "tags", ["user_id"])
    op.execute(set_updated_at_trigger("tags"))

    # ── contact_tags ──────────────────────────────────────────────────────────
    op.create_table(
        "contact_tags",
        sa.Column(
            "contact_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contacts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tag_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tags.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("contact_id", "tag_id"),
    )

    # ── custom_fields ─────────────────────────────────────────────────────────
    op.create_table(
        "custom_fields",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "chatbot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("field_key", sa.String(100), nullable=False),
        sa.Column(
            "field_type",
            sa.Enum(
                "text",
                "number",
                "date",
                "email",
                "phone",
                "url",
                "textarea",
                "select",
                "checkbox",
                name="custom_field_type",
            ),
            nullable=False,
        ),
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("default_value", sa.Text(), nullable=True),
        sa.Column("scope", sa.String(50), nullable=False, server_default="contact"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_custom_fields_user_id", "custom_fields", ["user_id"])
    op.create_index("ix_custom_fields_chatbot_id", "custom_fields", ["chatbot_id"])
    op.create_index("ix_custom_fields_field_key", "custom_fields", ["field_key"])
    op.execute(set_updated_at_trigger("custom_fields"))

    # ── contact_field_values ──────────────────────────────────────────────────
    op.create_table(
        "contact_field_values",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "contact_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contacts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "field_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("custom_fields.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("value", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("contact_id", "field_id", name="uq_contact_field"),
    )
    op.create_index("ix_contact_field_values_contact_id", "contact_field_values", ["contact_id"])
    op.create_index("ix_contact_field_values_field_id", "contact_field_values", ["field_id"])

    # ── pipelines ─────────────────────────────────────────────────────────────
    op.create_table(
        "pipelines",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "chatbot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chatbot_configs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(7), nullable=False, server_default="#6366f1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pipelines_user_id", "pipelines", ["user_id"])
    op.execute(set_updated_at_trigger("pipelines"))

    # ── pipeline_stages ────────────────────────────────────────────────────────
    op.create_table(
        "pipeline_stages",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "pipeline_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pipelines.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("color", sa.String(7), nullable=False, server_default="#6366f1"),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pipeline_stages_pipeline_id", "pipeline_stages", ["pipeline_id"])
    op.execute(set_updated_at_trigger("pipeline_stages"))

    # ── pipeline_deals ────────────────────────────────────────────────────────
    op.create_table(
        "pipeline_deals",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "pipeline_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pipelines.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "stage_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pipeline_stages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "contact_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contacts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("deal_value", sa.Float(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pipeline_deals_pipeline_id", "pipeline_deals", ["pipeline_id"])
    op.create_index("ix_pipeline_deals_stage_id", "pipeline_deals", ["stage_id"])
    op.create_index("ix_pipeline_deals_contact_id", "pipeline_deals", ["contact_id"])
    op.execute(set_updated_at_trigger("pipeline_deals"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("pipeline_deals"))
    op.drop_table("pipeline_deals")
    op.execute(drop_updated_at_trigger("pipeline_stages"))
    op.drop_table("pipeline_stages")
    op.execute(drop_updated_at_trigger("pipelines"))
    op.drop_table("pipelines")
    op.drop_table("contact_field_values")
    op.execute(drop_updated_at_trigger("custom_fields"))
    op.drop_table("custom_fields")
    op.execute(op.get_bind().execute(sa.text("DROP TYPE IF EXISTS custom_field_type")))
    op.drop_table("contact_tags")
    op.execute(drop_updated_at_trigger("tags"))
    op.drop_table("tags")
    op.execute(drop_updated_at_trigger("contacts"))
    op.drop_table("contacts")
