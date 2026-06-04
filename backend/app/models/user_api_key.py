import uuid

from sqlalchemy import String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

PROVIDERS = (
    # LLM providers
    "anthropic", "openai", "google", "deepseek", "groq", "perplexity", "xai",
    # Search providers
    "tavily", "brave_search", "serper", "serpapi", "bing", "you", "exa",
)


class UserApiKey(TimestampMixin, Base):
    __tablename__ = "user_api_keys"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_user_api_key_provider"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    api_key_encrypted: Mapped[str] = mapped_column(String(1000), nullable=False)
