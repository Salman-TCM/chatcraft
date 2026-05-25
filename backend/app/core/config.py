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

    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_oauth_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    frontend_url: str = "http://localhost:3000"
    api_url: str = "http://localhost:8000"

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
    slack_alert_webhook_url: str = ""
    axiom_token: str = ""
    axiom_dataset: str = "chatcraft-logs"
    posthog_api_key: str = ""

    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_s3_bucket: str = ""
    aws_region: str = "us-east-1"
    email_from: str = "noreply@chatcraft.ai"

    # Twilio (SMS + voice)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # WhatsApp Cloud API
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: str = ""

    # X / Twitter API v2
    x_api_key: str = ""
    x_api_secret: str = ""

    # Apple Wallet PKPass signing
    apple_pass_type_identifier: str = ""
    apple_team_identifier: str = ""
    apple_pass_cert_pem: str = ""
    apple_pass_key_pem: str = ""
    apple_wwdr_pem: str = ""

    # Apple Push Notifications (wallet updates)
    apple_push_key_id: str = ""
    apple_push_key_pem: str = ""

    # Google Wallet API
    google_wallet_issuer_id: str = ""
    google_wallet_service_account: str = ""  # JSON string of service account credentials

    # Public API base URL (used in pass callbacks, QR links, etc.)
    api_base_url: str = "http://localhost:8000"

    # Additional LLM providers
    groq_api_key: str = ""
    deepseek_api_key: str = ""
    perplexity_api_key: str = ""
    xai_api_key: str = ""

    # Cloud browser (Browserbase)
    browserbase_api_key: str = ""
    browserbase_project_id: str = ""

    # Web Push (VAPID)
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_email: str = "mailto:admin@chatcraft.ai"

    # ClamAV virus scanning (optional — upload proceeds if not configured)
    clamav_host: str = ""        # e.g. "clamav" (Docker service name)
    clamav_port: int = 3310
    clamav_socket: str = ""      # Unix socket path (overrides host when set)

    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    free_tier_message_cap: int = 20
    trial_tier_message_cap: int = 500
    premium_tier_message_cap: int = 5000
    default_fallback_model: str = "gpt-4o-mini"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


settings = Settings()
