from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Personal GPS Tracker"
    api_token: str
    secret_key: str
    database_url: str = "sqlite:///./gps_tracker.db"
    authorized_telegram_user_id: int = 0
    telegram_bot_token: str = ""
    cors_origins: str = "http://localhost:8080,http://127.0.0.1:8080"
    max_history_limit: int = 100
    rate_limit_per_minute: int = 60

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
