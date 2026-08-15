"""add agent design fields

Revision ID: 000000000056
Revises: 000000000055
Create Date: 2026-08-15
"""

from alembic import op
import sqlalchemy as sa

revision = "000000000056"
down_revision = "000000000055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("primary_colour", sa.String(20), nullable=False, server_default="#6366f1"))
    op.add_column("agents", sa.Column("logo_url", sa.String(2048), nullable=True))
    op.add_column("agents", sa.Column("dark_mode", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("agents", sa.Column("show_branding", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("agents", sa.Column("font_family", sa.String(100), nullable=False, server_default="system-ui"))
    op.add_column("agents", sa.Column("bubble_style", sa.String(20), nullable=False, server_default="rounded"))
    op.add_column("agents", sa.Column("placeholder_text", sa.String(200), nullable=False, server_default="Type a message…"))


def downgrade() -> None:
    op.drop_column("agents", "placeholder_text")
    op.drop_column("agents", "bubble_style")
    op.drop_column("agents", "font_family")
    op.drop_column("agents", "show_branding")
    op.drop_column("agents", "dark_mode")
    op.drop_column("agents", "logo_url")
    op.drop_column("agents", "primary_colour")
