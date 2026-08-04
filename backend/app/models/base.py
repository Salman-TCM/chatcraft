import uuid
from datetime import datetime

from sqlalchemy import DateTime, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """
    DeclarativeBase for all SQLAlchemy models.
    Import this in alembic/env.py so autogenerate picks up all tables.
    """

    pass


class TimestampMixin:
    """
    Adds id (UUIDv4), created_at, and updated_at to any model.

    - id          : server-generated UUID primary key (never exposed as int)
    - created_at  : set once at INSERT time by the DB server clock
    - updated_at  : refreshed by the DB server on every UPDATE via a trigger

    The trigger is created in the first Alembic migration that uses this mixin.
    """

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        sort_order=-3,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        sort_order=-2,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        sort_order=-1,
    )


# SQL that creates a reusable trigger function for updated_at.
# Applied once in the pgvector migration; all subsequent table migrations
# call: op.execute(set_updated_at_trigger("<table_name>"))
SET_UPDATED_AT_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""


def set_updated_at_trigger(table_name: str) -> str:
    """Return SQL that attaches the set_updated_at trigger to a table."""
    return f"""
CREATE OR REPLACE TRIGGER trg_{table_name}_updated_at
BEFORE UPDATE ON {table_name}
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
"""


def drop_updated_at_trigger(table_name: str) -> str:
    """Return SQL that removes the trigger (for migration downgrade)."""
    return f"DROP TRIGGER IF EXISTS trg_{table_name}_updated_at ON {table_name};"
