from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


ContentType = Literal["live", "movie", "series", "episode"]


class XtreamCredentials(BaseModel):
    server_url: HttpUrl
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=1024)

    @field_validator("server_url")
    @classmethod
    def supported_protocol(cls, value: HttpUrl) -> HttpUrl:
        if value.scheme not in {"http", "https"}:
            raise ValueError("Le serveur doit utiliser HTTP ou HTTPS.")
        return value


class ProfileCreate(XtreamCredentials):
    name: str = Field(min_length=1, max_length=80)


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    server_url: HttpUrl | None = None
    username: str | None = Field(default=None, min_length=1, max_length=255)
    password: str | None = Field(default=None, min_length=1, max_length=1024)


class ProfilePublic(BaseModel):
    id: str
    name: str
    server_url: str
    username: str
    status: str
    expires_at: str | None = None
    max_connections: int | None = None
    active_connections: int | None = None
    last_sync_at: str | None = None
    created_at: str
    updated_at: str

    model_config = ConfigDict(from_attributes=True)


class LoginResult(BaseModel):
    authenticated: bool
    status: str
    expires_at: str | None = None
    max_connections: int | None = None
    active_connections: int | None = None
    server_timezone: str | None = None


class FavoriteCreate(BaseModel):
    profile_id: str
    content_type: ContentType
    content_id: str
    title: str = Field(min_length=1, max_length=300)
    metadata: dict[str, Any] = Field(default_factory=dict)


class FavoritePublic(FavoriteCreate):
    id: int
    created_at: str


class HistoryUpsert(BaseModel):
    profile_id: str
    content_type: ContentType
    content_id: str
    title: str = Field(min_length=1, max_length=300)
    position_seconds: int = Field(default=0, ge=0)
    duration_seconds: int = Field(default=0, ge=0)
    completed: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class HistoryPublic(HistoryUpsert):
    id: int
    watched_at: str


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
