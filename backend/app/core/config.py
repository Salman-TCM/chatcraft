from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    environment: str = "development"
    debug: bool = False
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/chatcraft"
    redis_url: str = "redis://localhost:6379/0"

    cors_origins: List[str] = ["http://localhost:3000"]

    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_ai_api_key: str = ""
    elevenlabs_api_key: str = ""

    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_connect_client_id: str = ""

    supabase_url: str = ""
    supabase_key: str = ""

    resend_api_key: str = ""
    resend_from_email: str = "noreply@chatcraft.ai"

    sentry_dsn: str = ""
    axiom_token: str = ""
    posthog_api_key: str = ""

    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_s3_bucket: str = ""
    aws_region: str = "eu-west-2"

    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    free_tier_message_cap: int = 20
    trial_tier_message_cap: int = 500
    premium_tier_message_cap: int = 5000

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()
