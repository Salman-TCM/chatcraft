from pgvector.sqlalchemy import Vector
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """
    All SQLAlchemy models inherit from this class.
    Importing a model file side-effects Base.metadata, which Alembic reads.

    pgvector's Vector type is registered here so Alembic autogenerate
    can detect and diff Vector columns correctly.
    """

    type_annotation_map = {
        # Allows: embedding: Mapped[Vector] in model definitions
    }
