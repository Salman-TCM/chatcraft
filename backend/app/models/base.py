from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """
    All SQLAlchemy models inherit from this class.
    Importing a model file side-effects Base.metadata, which Alembic reads.
    """
    pass
