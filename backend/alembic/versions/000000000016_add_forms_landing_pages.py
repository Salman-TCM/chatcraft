"""add forms and landing_pages tables

Revision ID: 000000000016
Revises: 000000000015
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.models.base import set_updated_at_trigger, drop_updated_at_trigger

revision = "000000000016"
down_revision = "000000000015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "forms",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chatbot_id", UUID(as_uuid=True), sa.ForeignKey("chatbot_configs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("fields", JSONB, nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("success_message", sa.String(500), nullable=False, server_default="Thank you! We'll be in touch."),
        sa.Column("submit_button_text", sa.String(100), nullable=False, server_default="Submit"),
        sa.Column("public_id", sa.String(24), nullable=False, unique=True),
    )
    op.create_index("ix_forms_user_id", "forms", ["user_id"])
    op.create_index("ix_forms_public_id", "forms", ["public_id"])
    op.execute(set_updated_at_trigger("forms"))

    op.create_table(
        "form_submissions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("form_id", UUID(as_uuid=True), sa.ForeignKey("forms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("data", JSONB, nullable=False, server_default="{}"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
    )
    op.create_index("ix_form_submissions_form_id", "form_submissions", ["form_id"])
    op.create_index("ix_form_submissions_submitted_at", "form_submissions", ["submitted_at"])

    op.create_table(
        "landing_pages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chatbot_id", UUID(as_uuid=True), sa.ForeignKey("chatbot_configs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("short_id", sa.String(12), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("html_content", sa.Text, nullable=False, server_default="''"),
        sa.Column("theme", sa.String(20), nullable=False, server_default="light"),
        sa.Column("primary_color", sa.String(7), nullable=False, server_default="#6366f1"),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("seo_meta", JSONB, nullable=False, server_default="{}"),
        sa.Column("scan_count", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_landing_pages_user_id", "landing_pages", ["user_id"])
    op.create_index("ix_landing_pages_slug", "landing_pages", ["slug"])
    op.create_index("ix_landing_pages_short_id", "landing_pages", ["short_id"])
    op.execute(set_updated_at_trigger("landing_pages"))


def downgrade() -> None:
    op.execute(drop_updated_at_trigger("landing_pages"))
    op.drop_table("landing_pages")
    op.drop_table("form_submissions")
    op.execute(drop_updated_at_trigger("forms"))
    op.drop_table("forms")
