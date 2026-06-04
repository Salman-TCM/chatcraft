"""wallet enhancements — join links, scanner, receipt scanning, event log, credentials

Revision ID: 000000000050
Revises: 000000000049
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "000000000050"
down_revision = "000000000049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── wallet_programs additions ──────────────────────────────────────────────
    op.add_column("wallet_programs", sa.Column("join_token", sa.String(64), nullable=True))
    op.add_column("wallet_programs", sa.Column("scanner_token", sa.String(64), nullable=True))
    op.add_column("wallet_programs", sa.Column(
        "join_form_fields", JSONB, nullable=False, server_default='["name","email"]',
    ))
    op.add_column("wallet_programs", sa.Column(
        "receipt_scanning_config", JSONB, nullable=False, server_default="{}",
    ))
    # Populate tokens for existing programs using md5 (no pgcrypto needed)
    op.execute("""
        UPDATE wallet_programs
        SET join_token    = md5(id::text || '-join-'    || clock_timestamp()::text),
            scanner_token = md5(id::text || '-scanner-' || clock_timestamp()::text)
        WHERE join_token IS NULL
    """)
    op.create_index("ix_wallet_programs_join_token",    "wallet_programs", ["join_token"],    unique=True)
    op.create_index("ix_wallet_programs_scanner_token", "wallet_programs", ["scanner_token"], unique=True)

    # ── wallet_cards additions ─────────────────────────────────────────────────
    op.add_column("wallet_cards", sa.Column("auth_token", sa.String(64), nullable=True))
    op.execute("""
        UPDATE wallet_cards
        SET auth_token = md5(id::text || '-auth-' || clock_timestamp()::text)
        WHERE auth_token IS NULL
    """)

    # ── wallet_push_subscriptions additions ────────────────────────────────────
    op.add_column("wallet_push_subscriptions", sa.Column("device_library_id", sa.String(256), nullable=True))

    # ── wallet_card_events ─────────────────────────────────────────────────────
    op.create_table(
        "wallet_card_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("card_id", UUID(as_uuid=True), sa.ForeignKey("wallet_cards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("program_id", UUID(as_uuid=True), sa.ForeignKey("wallet_programs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("delta", JSONB, nullable=False, server_default="{}"),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("source", sa.String(30), nullable=False, server_default="dashboard"),
        sa.Column("receipt_scan_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_wallet_card_events_card_id",    "wallet_card_events", ["card_id"])
    op.create_index("ix_wallet_card_events_program_id", "wallet_card_events", ["program_id"])

    # ── wallet_receipt_scans ───────────────────────────────────────────────────
    op.create_table(
        "wallet_receipt_scans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("card_id", UUID(as_uuid=True), sa.ForeignKey("wallet_cards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("program_id", UUID(as_uuid=True), sa.ForeignKey("wallet_programs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("receipt_hash", sa.String(128), nullable=False),
        sa.Column("receipt_amount", sa.Float, nullable=True),
        sa.Column("merchant_name", sa.String(255), nullable=True),
        sa.Column("receipt_date", sa.String(50), nullable=True),
        sa.Column("awarded_value", sa.Float, nullable=True),
        sa.Column("awarded_type", sa.String(10), nullable=True),
        sa.Column("image_data", sa.Text, nullable=True),
        sa.Column("ai_response", JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("program_id", "receipt_hash", name="uq_wallet_receipt_program_hash"),
    )
    op.create_index("ix_wallet_receipt_scans_card_id",    "wallet_receipt_scans", ["card_id"])
    op.create_index("ix_wallet_receipt_scans_program_id", "wallet_receipt_scans", ["program_id"])

    # ── user_wallet_credentials ────────────────────────────────────────────────
    op.create_table(
        "user_wallet_credentials",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("apple_config", JSONB, nullable=True),
        sa.Column("google_config", JSONB, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_wallet_credentials")
    op.drop_table("wallet_receipt_scans")
    op.drop_table("wallet_card_events")
    op.drop_column("wallet_push_subscriptions", "device_library_id")
    op.drop_column("wallet_cards", "auth_token")
    op.drop_index("ix_wallet_programs_scanner_token", table_name="wallet_programs")
    op.drop_index("ix_wallet_programs_join_token",    table_name="wallet_programs")
    op.drop_column("wallet_programs", "receipt_scanning_config")
    op.drop_column("wallet_programs", "join_form_fields")
    op.drop_column("wallet_programs", "scanner_token")
    op.drop_column("wallet_programs", "join_token")
