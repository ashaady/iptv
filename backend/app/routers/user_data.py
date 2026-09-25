import json

from fastapi import APIRouter, HTTPException, Response, status

from ..database import db, utc_now
from ..schemas import FavoriteCreate, FavoritePublic, HistoryPublic, HistoryUpsert


router = APIRouter(tags=["Favoris et historique"])


def ensure_profile(profile_id: str) -> None:
    if not db.fetch_one("SELECT id FROM iptv_profiles WHERE id = ?", (profile_id,)):
        raise HTTPException(status_code=404, detail="Profil IPTV introuvable.")


@router.get("/favorites", response_model=list[FavoritePublic])
def list_favorites(profile_id: str) -> list[dict]:
    ensure_profile(profile_id)
    rows = db.fetch_all("SELECT * FROM favorites WHERE profile_id = ? ORDER BY created_at DESC", (profile_id,))
    return db.decode_json_rows(rows)


@router.post("/favorites", response_model=FavoritePublic, status_code=status.HTTP_201_CREATED)
def add_favorite(favorite: FavoriteCreate) -> dict:
    ensure_profile(favorite.profile_id)
    now = utc_now()
    db.execute(
        """INSERT INTO favorites(profile_id, content_type, content_id, title, metadata, created_at)
           VALUES(?, ?, ?, ?, ?, ?)
           ON CONFLICT(profile_id, content_type, content_id) DO UPDATE SET
           title=excluded.title, metadata=excluded.metadata""",
        (favorite.profile_id, favorite.content_type, favorite.content_id, favorite.title, json.dumps(favorite.metadata), now),
    )
    row = db.fetch_one("SELECT * FROM favorites WHERE profile_id=? AND content_type=? AND content_id=?", (favorite.profile_id, favorite.content_type, favorite.content_id))
    assert row is not None
    return db.decode_json_rows([row])[0]


@router.delete("/favorites/{favorite_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_favorite(favorite_id: int) -> Response:
    if not db.fetch_one("SELECT id FROM favorites WHERE id = ?", (favorite_id,)):
        raise HTTPException(status_code=404, detail="Favori introuvable.")
    db.execute("DELETE FROM favorites WHERE id = ?", (favorite_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/favorites", status_code=status.HTTP_204_NO_CONTENT)
def delete_favorite_by_content(profile_id: str, content_type: str, content_id: str) -> Response:
    ensure_profile(profile_id)
    db.execute(
        "DELETE FROM favorites WHERE profile_id = ? AND content_type = ? AND content_id = ?",
        (profile_id, content_type, content_id),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/history", response_model=list[HistoryPublic])
def list_history(profile_id: str, limit: int = 100) -> list[dict]:
    ensure_profile(profile_id)
    safe_limit = max(1, min(limit, 500))
    rows = db.fetch_all("SELECT * FROM watch_history WHERE profile_id = ? ORDER BY watched_at DESC LIMIT ?", (profile_id, safe_limit))
    return db.decode_json_rows(rows)


@router.post("/history", response_model=HistoryPublic)
def upsert_history(item: HistoryUpsert) -> dict:
    ensure_profile(item.profile_id)
    now = utc_now()
    db.execute(
        """INSERT INTO watch_history(profile_id, content_type, content_id, title, position_seconds,
           duration_seconds, completed, metadata, watched_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(profile_id, content_type, content_id) DO UPDATE SET title=excluded.title,
           position_seconds=excluded.position_seconds, duration_seconds=excluded.duration_seconds,
           completed=excluded.completed, metadata=excluded.metadata, watched_at=excluded.watched_at""",
        (item.profile_id, item.content_type, item.content_id, item.title, item.position_seconds,
         item.duration_seconds, int(item.completed), json.dumps(item.metadata), now),
    )
    row = db.fetch_one("SELECT * FROM watch_history WHERE profile_id=? AND content_type=? AND content_id=?", (item.profile_id, item.content_type, item.content_id))
    assert row is not None
    return db.decode_json_rows([row])[0]


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
def clear_history(profile_id: str) -> Response:
    ensure_profile(profile_id)
    db.execute("DELETE FROM watch_history WHERE profile_id = ?", (profile_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
