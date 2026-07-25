from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_secret: str = ""  # legacy, unused with API-based verification
    auth_disabled: bool = True

    google_places_api_key: str = ""
    google_cse_id: str = ""      # Programmable Search Engine ID for website discovery
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5"

    resend_api_key: str = ""
    outreach_from_email: str = ""
    outreach_from_name: str = ""
    resend_webhook_secret: str = ""

    api_base_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:3000"
    internal_api_key: str = "change-me"
    environment: str = "development"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
