import asyncio
import json
import os
from typing import Any, Literal

import httpx
from fastapi import APIRouter, Header, HTTPException, Query

from ..config import get_settings
from ..database import db, utc_now
from ..security import cipher
from ..services.xtream import cached_action, profile_client, proxy_url, transcode_stream


router = APIRouter(tags=["Catalogue Xtream"])


ADULT_KEYWORDS = [
    "xxx", "+18", "18+", "porn", "playboy", "brazzers", "dorcel",
    "hustler", "penthouse", "vivid", "redlight", "red light", "erotic", "erotik",
    "evilangel", "evil angel", "centoxcento", "babes", "bangbros", "private tv",
    "for adult", "erotique", "sexe", "xxl", "x-rated", "colmax", "man-x", "passie xxx",
    "pink o", "superone", "legalporno", "nuart", "taboo", "teleclube", "tgirls",
    "french lover", "libidofun", "libido", "beate-uhse", "blue hustler", "milenia",
    "dusk tv", "porno", "hardcore"
]
ADULT_EXCLUDES = [
    "adult swim", "passion bollywood", "rtl passion", "sex and the city",
    "sex education", "prosieben maxx", "show maxx", "rmf maxxx", "pain hustlers",
    "landlust", "jasmine sandlas", "unbeaten", "sctv", "wanderlust", "district",
    "disctrict", "xander cage", "state of the union", "triple x", "battle of the sexes",
    "hardcore pawn", "pawn", "aporna", "hardcore henry", "hardcore power", "hardcoreradio"
]


def is_adult_item(item: dict[str, Any]) -> bool:
    if str(item.get("is_adult", "0")) in {"1", "true", "True"}:
        return True
    name = str(item.get("name", "")).casefold()
    if any(ex in name for ex in ADULT_EXCLUDES):
        return False
    return any(kw in name for kw in ADULT_KEYWORDS)


def extract_adult_cat_ids(categories: Any) -> set[str]:
    cat_ids = set()
    if isinstance(categories, list):
        for c in categories:
            cid = str(c.get("category_id", ""))
            if cid == "adult_all":
                continue
            cname = str(c.get("category_name", "")).casefold()
            if any(kw in cname for kw in ["xxx", "+18", "18+", "adult", "adulte", "porn", "eroti", "for adult"]):
                if not any(ex in cname for ex in ADULT_EXCLUDES):
                    cat_ids.add(cid)
    return cat_ids


def is_adult_cat(cat: dict[str, Any]) -> bool:
    cid = str(cat.get("category_id", ""))
    if cid in {"16", "382", "adult_all"}:
        return True
    cname = str(cat.get("category_name", "")).casefold()
    if any(ex in cname for ex in ADULT_EXCLUDES):
        return False
    return any(kw in cname for kw in ["xxx", "+18", "18+", "adult", "adulte", "porn", "eroti", "for adult"])


@router.get("/live/categories")
async def live_categories(profile_id: str, include_adult: bool = Query(default=True)) -> Any:
    settings = get_settings()
    cats = await cached_action(profile_id, "get_live_categories", settings.live_cache_seconds)
    if not include_adult and isinstance(cats, list):
        return [c for c in cats if not is_adult_cat(c)]
    return cats


@router.get("/live/streams")
async def live_streams(profile_id: str, category_id: str | None = None, include_adult: bool = Query(default=True)) -> Any:
    settings = get_settings()
    clean_cat = category_id.strip() if category_id else None
    params = {"category_id": clean_cat} if (clean_cat and clean_cat.lower() not in {"all", "toutes", "tous", ""}) else {}
    streams = await cached_action(profile_id, "get_live_streams", settings.live_cache_seconds, **params)
    if not include_adult and isinstance(streams, list):
        return [item for item in streams if not is_adult_item(item)]
    return streams


@router.get("/vod/categories")
async def vod_categories(profile_id: str, include_adult: bool = Query(default=True)) -> Any:
    settings = get_settings()
    cats = await cached_action(profile_id, "get_vod_categories", settings.vod_cache_seconds)
    if not include_adult and isinstance(cats, list):
        return [c for c in cats if not is_adult_cat(c)]
    return cats


@router.get("/vod/movies")
async def vod_movies(profile_id: str, category_id: str | None = None, include_adult: bool = Query(default=True)) -> Any:
    settings = get_settings()
    clean_cat = category_id.strip() if category_id else None
    params = {"category_id": clean_cat} if (clean_cat and clean_cat.lower() not in {"all", "toutes", "tous", ""}) else {}
    movies = await cached_action(profile_id, "get_vod_streams", settings.vod_cache_seconds, **params)
    if not include_adult and isinstance(movies, list):
        return [item for item in movies if not is_adult_item(item)]
    return movies


@router.get("/series/categories")
async def series_categories(profile_id: str, include_adult: bool = Query(default=True)) -> Any:
    settings = get_settings()
    cats = await cached_action(profile_id, "get_series_categories", settings.series_cache_seconds)
    if not include_adult and isinstance(cats, list):
        return [c for c in cats if not is_adult_cat(c)]
    return cats


@router.get("/series")
async def series(profile_id: str, category_id: str | None = None, include_adult: bool = Query(default=True)) -> Any:
    settings = get_settings()
    clean_cat = category_id.strip() if category_id else None
    params = {"category_id": clean_cat} if (clean_cat and clean_cat.lower() not in {"all", "toutes", "tous", ""}) else {}
    items = await cached_action(profile_id, "get_series", settings.series_cache_seconds, **params)
    if not include_adult and isinstance(items, list):
        return [item for item in items if not is_adult_item(item)]
    return items


@router.get("/series/{series_id}")
async def series_detail(series_id: str, profile_id: str) -> Any:
    settings = get_settings()
    return await cached_action(profile_id, "get_series_info", settings.series_cache_seconds, series_id=series_id)


@router.get("/epg/{stream_id}")
async def epg(stream_id: str, profile_id: str, limit: int = Query(default=4, ge=1, le=20)) -> Any:
    settings = get_settings()
    return await cached_action(profile_id, "get_short_epg", settings.epg_cache_seconds, stream_id=stream_id, limit=limit)


@router.get("/search")
async def search(
    profile_id: str,
    q: str = Query(min_length=2, max_length=100),
    content_type: Literal["all", "live", "movie", "series"] = "all",
    include_adult: bool = Query(default=True),
) -> dict[str, Any]:
    term = q.casefold()
    settings = get_settings()
    results: dict[str, list[Any]] = {"live": [], "movies": [], "series": []}
    if content_type in {"all", "live"}:
        items = await cached_action(profile_id, "get_live_streams", settings.live_cache_seconds)
        matches = [
            item for item in items
            if term in str(item.get("name", "")).casefold()
            and (include_adult or not is_adult_item(item))
        ]
        def rank_live(item: dict[str, Any]) -> tuple[int, int]:
            name = str(item.get("name", "")).casefold()
            is_fr = any(p in name for p in ["fr |", "fr:", "fr -", "[fr]", "(fr)", "france", "canal", "rmc", "bein", "tf1", "m6", "eurosport"])
            starts = name.startswith(term)
            return (1 if is_fr else 0, 1 if starts else 0)
        matches.sort(key=rank_live, reverse=True)
        results["live"] = matches[:250]
    if content_type in {"all", "movie"}:
        items = await cached_action(profile_id, "get_vod_streams", settings.vod_cache_seconds)
        results["movies"] = [
            item for item in items
            if term in str(item.get("name", "")).casefold()
            and (include_adult or not is_adult_item(item))
        ][:100]
    if content_type in {"all", "series"}:
        items = await cached_action(profile_id, "get_series", settings.series_cache_seconds)
        results["series"] = [
            item for item in items
            if term in str(item.get("name", "")).casefold()
            and (include_adult or not is_adult_item(item))
        ][:100]
    return {"query": q, "results": results, "total": sum(len(value) for value in results.values())}


@router.post("/catalog/refresh")
def refresh_catalog(profile_id: str) -> dict[str, str]:
    profile_client(profile_id)
    now = utc_now()
    db.execute("DELETE FROM api_cache WHERE profile_id = ?", (profile_id,))
    db.execute("UPDATE iptv_profiles SET last_sync_at = ?, updated_at = ? WHERE id = ?", (now, now, profile_id))
    return {"status": "ok", "last_sync_at": now}


@router.get("/stream/{profile_id}/{kind}/{stream_id}")
async def stream(
    profile_id: str,
    kind: Literal["live", "movie", "series"],
    stream_id: str,
    extension: str | None = None,
    transcode: bool = Query(default=False),
    range_header: str | None = Header(default=None, alias="Range"),
):
    _, client = profile_client(profile_id)
    target_url = client.stream_url(kind, stream_id, extension)
    if transcode:
        return await transcode_stream(target_url)
    return await proxy_url(target_url, range_header)


@router.get("/timeshift/{profile_id}/{stream_id}")
async def timeshift_stream(
    profile_id: str,
    stream_id: str,
    start: str = Query(description="Format YYYY-MM-DD:HH-MM"),
    duration: int = Query(default=60, ge=1, le=1440, description="Durée en minutes"),
    range_header: str | None = Header(default=None, alias="Range"),
):
    _, client = profile_client(profile_id)
    return await proxy_url(client.timeshift_url(stream_id, start, duration), range_header)


@router.get("/stream/segment/{token:path}")
async def stream_segment(token: str, range_header: str | None = Header(default=None, alias="Range")):
    try:
        url = cipher.decrypt(token)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail="Jeton de segment invalide.") from exc
    return await proxy_url(url, range_header)


@router.post("/live/probe-batch")
async def probe_batch(payload: dict[str, Any]) -> dict[str, Any]:
    profile_id = str(payload.get("profile_id", "")).strip()
    stream_ids = payload.get("stream_ids", [])
    if not profile_id or not stream_ids:
        return {"active_ids": []}

    try:
        _, client = profile_client(profile_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Profil IPTV introuvable.") from exc

    headers = {
        "User-Agent": "IPTVSmartersPro/1.0.0 (Linux; Android 11)",
        "Range": "bytes=0-100",
        "Connection": "keep-alive",
    }
    timeout = httpx.Timeout(connect=1.5, read=1.5, write=1.5, pool=2.0)
    limits = httpx.Limits(max_keepalive_connections=60, max_connections=80)
    active_ids: list[str] = []

    async with httpx.AsyncClient(timeout=timeout, limits=limits, follow_redirects=True, verify=False) as http:
        async def check_stream(sid: Any) -> None:
            url = client.stream_url("live", str(sid), "ts")
            try:
                resp = await http.get(url, headers=headers)
                if resp.status_code in {200, 206}:
                    active_ids.append(str(sid))
            except Exception:
                pass

        await asyncio.gather(*(check_stream(sid) for sid in stream_ids))

    return {"active_ids": active_ids}


@router.get("/live/active-channels")
def get_active_channels(profile_id: str) -> list[dict[str, Any]]:
    rows = db.fetch_all(
        "SELECT channel_data FROM active_channels WHERE profile_id = ? ORDER BY tested_at DESC",
        (profile_id,),
    )
    res = []
    for r in rows:
        try:
            res.append(json.loads(r["channel_data"]))
        except Exception:
            pass
    return res


@router.post("/live/active-channels")
def save_active_channels(payload: dict[str, Any]) -> dict[str, Any]:
    profile_id = str(payload.get("profile_id", "")).strip()
    channels = payload.get("channels", [])
    if not profile_id or not channels:
        return {"status": "ok", "saved": 0}
    now = utc_now()
    with db.connection() as conn:
        for ch in channels:
            sid = str(ch.get("stream_id", "")).strip()
            if not sid:
                continue
            conn.execute(
                """INSERT INTO active_channels(profile_id, stream_id, channel_data, tested_at)
                   VALUES(?, ?, ?, ?)
                   ON CONFLICT(profile_id, stream_id) DO UPDATE SET
                   channel_data=excluded.channel_data, tested_at=excluded.tested_at""",
                (profile_id, sid, json.dumps(ch), now),
            )
    return {"status": "ok", "saved": len(channels)}

