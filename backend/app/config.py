from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    app_name: str = "Fluxa IPTV API"
    app_version: str = "1.0.0"
    api_prefix: str = "/api"
    database_path: Path = BACKEND_DIR / "data" / "fluxa.db"
    secret_key: str | None = None
    secret_key_path: Path = BACKEND_DIR / "data" / ".secret.key"
    cors_origins: str = "http://localhost:3000,http://localhost:3001,https://fluxa-iptv.abtrunk4.chatgpt.site"
    request_timeout_seconds: float = 20.0
    live_cache_seconds: int = 1800
    vod_cache_seconds: int = 21600
    series_cache_seconds: int = 21600
    epg_cache_seconds: int = 900

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_prefix="FLUXA_",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
