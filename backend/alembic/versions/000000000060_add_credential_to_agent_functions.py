"""add credential_id and extended http methods to agent_functions

Revision ID: 000000000060
Revises: 000000000059
Create Date: 2026-08-19
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "000000000060"
down_revision = "000000000059"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agent_functions",
        sa.Column(
            "credential_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_agent_functions_credential_id",
        "agent_functions",
        "integration_credentials",
        ["credential_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_agent_functions_credential_id", "agent_functions", type_="foreignkey")
    op.drop_column("agent_functions", "credential_id")
