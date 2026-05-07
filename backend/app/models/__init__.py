# Import all models here so Base.metadata is fully populated when
# Alembic reads it in env.py. Add each new model file as it is created.
from app.models.base import Base, TimestampMixin  # noqa: F401
