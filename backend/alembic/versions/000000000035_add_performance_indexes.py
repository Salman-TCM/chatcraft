"""Add performance indexes on major foreign keys and query columns

Revision ID: 000000000035
Revises: 000000000034
Create Date: 2026-05-21
"""

import sqlalchemy as sa

from alembic import op

revision = "000000000035"
down_revision = "000000000034"
branch_labels = None
depends_on = None

# Raw SQL used for every index so we can use IF NOT EXISTS in a single
# statement — this keeps the migration idempotent without needing SAVEPOINTs
# or per-statement try/except that would leave the transaction in an aborted
# state on failure.
_UP_STATEMENTS = [
    # messages
    "CREATE INDEX IF NOT EXISTS ix_messages_role ON messages (role)",
    "CREATE INDEX IF NOT EXISTS ix_messages_created_at ON messages (created_at)",
    # conversations
    "CREATE INDEX IF NOT EXISTS ix_conversations_status ON conversations (status)",
    "CREATE INDEX IF NOT EXISTS ix_conversations_channel ON conversations (channel)",
    "CREATE INDEX IF NOT EXISTS ix_conversations_last_message_at ON conversations (last_message_at)",
    # flow_runs
    "CREATE INDEX IF NOT EXISTS ix_flow_runs_flow_id ON flow_runs (flow_id)",
    "CREATE INDEX IF NOT EXISTS ix_flow_runs_status ON flow_runs (status)",
    # contacts
    "CREATE INDEX IF NOT EXISTS ix_contacts_email ON contacts (email)",
    "CREATE INDEX IF NOT EXISTS ix_contacts_phone ON contacts (phone)",
    # attribution_events
    "CREATE INDEX IF NOT EXISTS ix_attribution_events_utm_source ON attribution_events (utm_source)",
    # broadcast_campaigns
    "CREATE INDEX IF NOT EXISTS ix_broadcast_campaigns_scheduled_at ON broadcast_campaigns (scheduled_at)",
    # api_tokens
    "CREATE INDEX IF NOT EXISTS ix_api_tokens_token_prefix ON api_tokens (token_prefix)",
    # pgvector IVFFlat — without CONCURRENTLY so it can run inside the transaction
    (
        "CREATE INDEX IF NOT EXISTS ix_kb_chunks_embedding "
        "ON knowledge_base_chunks USING ivfflat (embedding vector_cosine_ops) "
        "WITH (lists = 100)"
    ),
]

_DOWN_STATEMENTS = [
    "DROP INDEX IF EXISTS ix_messages_role",
    "DROP INDEX IF EXISTS ix_messages_created_at",
    "DROP INDEX IF EXISTS ix_conversations_status",
    "DROP INDEX IF EXISTS ix_conversations_channel",
    "DROP INDEX IF EXISTS ix_conversations_last_message_at",
    "DROP INDEX IF EXISTS ix_flow_runs_flow_id",
    "DROP INDEX IF EXISTS ix_flow_runs_status",
    "DROP INDEX IF EXISTS ix_contacts_email",
    "DROP INDEX IF EXISTS ix_contacts_phone",
    "DROP INDEX IF EXISTS ix_attribution_events_utm_source",
    "DROP INDEX IF EXISTS ix_broadcast_campaigns_scheduled_at",
    "DROP INDEX IF EXISTS ix_api_tokens_token_prefix",
    "DROP INDEX IF EXISTS ix_kb_chunks_embedding",
]


def upgrade() -> None:
    for sql in _UP_STATEMENTS:
        op.execute(sa.text(sql))


def downgrade() -> None:
    for sql in _DOWN_STATEMENTS:
        op.execute(sa.text(sql))
