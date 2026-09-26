import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterator

from .config import get_settings


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class Database:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or get_settings().database_path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS iptv_profiles (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    server_url TEXT NOT NULL,
                    username TEXT NOT NULL,
                    encrypted_password TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'unknown',
                    expires_at TEXT,
                    max_connections INTEGER,
                    active_connections INTEGER,
                    last_sync_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS favorites (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    profile_id TEXT NOT NULL,
                    content_type TEXT NOT NULL,
                    content_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    UNIQUE(profile_id, content_type, content_id),
                    FOREIGN KEY(profile_id) REFERENCES iptv_profiles(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS watch_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    profile_id TEXT NOT NULL,
                    content_type TEXT NOT NULL,
                    content_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    position_seconds INTEGER NOT NULL DEFAULT 0,
                    duration_seconds INTEGER NOT NULL DEFAULT 0,
                    completed INTEGER NOT NULL DEFAULT 0,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    watched_at TEXT NOT NULL,
                    UNIQUE(profile_id, content_type, content_id),
                    FOREIGN KEY(profile_id) REFERENCES iptv_profiles(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS api_cache (
                    cache_key TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    expires_at REAL NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(profile_id) REFERENCES iptv_profiles(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS active_channels (
                    profile_id TEXT NOT NULL,
                    stream_id TEXT NOT NULL,
                    channel_data TEXT NOT NULL,
                    tested_at TEXT NOT NULL,
                    PRIMARY KEY(profile_id, stream_id),
                    FOREIGN KEY(profile_id) REFERENCES iptv_profiles(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_favorites_profile ON favorites(profile_id);
                CREATE INDEX IF NOT EXISTS idx_history_profile ON watch_history(profile_id, watched_at DESC);
                CREATE INDEX IF NOT EXISTS idx_cache_profile ON api_cache(profile_id, expires_at);
                CREATE INDEX IF NOT EXISTS idx_active_channels_profile ON active_channels(profile_id, tested_at DESC);
                """
            )

    def fetch_one(self, query: str, parameters: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        with self.connection() as connection:
            row = connection.execute(query, parameters).fetchone()
            return dict(row) if row else None

    def fetch_all(self, query: str, parameters: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self.connection() as connection:
            return [dict(row) for row in connection.execute(query, parameters).fetchall()]

    def execute(self, query: str, parameters: tuple[Any, ...] = ()) -> int:
        with self.connection() as connection:
            cursor = connection.execute(query, parameters)
            return cursor.lastrowid

    @staticmethod
    def decode_json_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for row in rows:
            if "metadata" in row:
                row["metadata"] = json.loads(row["metadata"] or "{}")
            if "completed" in row:
                row["completed"] = bool(row["completed"])
        return rows


db = Database()
