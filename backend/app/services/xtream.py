import asyncio
import json
import re
import shutil
import time
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import HTTPException
from fastapi.responses import Response, StreamingResponse

from ..config import get_settings
from ..database import db, utc_now
from ..security import cipher


class XtreamError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class XtreamClient:
    def __init__(self, server_url: str, username: str, password: str) -> None:
        self.server_url = server_url.rstrip("/")
        self.username = username
        self.password = password
        self.timeout = get_settings().request_timeout_seconds

    @property
    def endpoint(self) -> str:
        return f"{self.server_url}/player_api.php"

    async def request(self, action: str | None = None, **parameters: Any) -> Any:
        params = {"username": self.username, "password": self.password, **parameters}
        if action:
            params["action"] = action
        headers = {
            "User-Agent": "IPTVSmartersPro/1.0.0 (Linux; Android 11)",
            "Accept": "application/json, */*",
        }
        # Actions volumineuses (catalogues complets avec des dizaines de milliers de lignes)
        is_heavy_action = action in {"get_live_streams", "get_vod_streams", "get_series"} and not parameters.get("category_id")
        req_timeout = httpx.Timeout(
            connect=15.0,
            read=80.0 if is_heavy_action else max(30.0, self.timeout),
            write=15.0,
            pool=15.0,
        )
        try:
            async with httpx.AsyncClient(timeout=req_timeout, follow_redirects=True, headers=headers) as client:
                response = await client.get(self.endpoint, params=params)
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException as exc:
            raise XtreamError("Le serveur IPTV ne répond pas dans le délai attendu.", 504) from exc
        except httpx.ConnectError as exc:
            raise XtreamError("Impossible de contacter le serveur IPTV.", 502) from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {401, 403}:
                raise XtreamError("Identifiants IPTV incorrects.", 401) from exc
            raise XtreamError(f"Le serveur IPTV a répondu avec l'erreur {exc.response.status_code}.") from exc
        except ValueError as exc:
            raise XtreamError("La réponse du serveur IPTV est invalide.") from exc

    async def authenticate(self) -> dict[str, Any]:
        payload = await self.request()
        user_info = payload.get("user_info") if isinstance(payload, dict) else None
        if not user_info or str(user_info.get("auth", "0")) != "1":
            raise XtreamError("Identifiants IPTV incorrects.", 401)
        status = str(user_info.get("status", "Unknown"))
        if status.lower() in {"expired", "disabled", "banned"}:
            messages = {"expired": "L'abonnement IPTV a expiré.", "disabled": "Le compte IPTV est désactivé.", "banned": "Le compte IPTV est bloqué."}
            raise XtreamError(messages[status.lower()], 403)
        return payload

    def stream_url(self, kind: str, stream_id: str, extension: str | None = None) -> str:
        safe_extension = (extension or ("m3u8" if kind == "live" else "mp4")).lstrip(".")
        if kind == "live":
            return f"{self.server_url}/live/{self.username}/{self.password}/{stream_id}.{safe_extension}"
        if kind in {"movie", "series"}:
            return f"{self.server_url}/{kind}/{self.username}/{self.password}/{stream_id}.{safe_extension}"
        raise XtreamError("Type de flux non pris en charge.", 400)

    def timeshift_url(self, stream_id: str, start: str, duration: int) -> str:
        return f"{self.server_url}/timeshift/{self.username}/{self.password}/{duration}/{start}/{stream_id}.ts"


def account_summary(payload: dict[str, Any]) -> dict[str, Any]:
    user = payload.get("user_info", {})
    server = payload.get("server_info", {})
    expiration = user.get("exp_date")
    expires_at = None
    if expiration and str(expiration).isdigit():
        expires_at = datetime.fromtimestamp(int(expiration), UTC).isoformat()
    return {
        "authenticated": str(user.get("auth", "0")) == "1",
        "status": str(user.get("status", "Unknown")).lower(),
        "expires_at": expires_at,
        "max_connections": _to_int(user.get("max_connections")),
        "active_connections": _to_int(user.get("active_cons")),
        "server_timezone": server.get("timezone"),
    }


def _to_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def profile_client(profile_id: str) -> tuple[dict[str, Any], XtreamClient]:
    profile = db.fetch_one("SELECT * FROM iptv_profiles WHERE id = ?", (profile_id,))
    if not profile:
        raise HTTPException(status_code=404, detail="Profil IPTV introuvable.")
    password = cipher.decrypt(profile["encrypted_password"])
    return profile, XtreamClient(profile["server_url"], profile["username"], password)


async def cached_action(profile_id: str, action: str, ttl_seconds: int, **parameters: Any) -> Any:
    suffix = json.dumps(parameters, sort_keys=True, separators=(",", ":"))
    cache_key = f"{profile_id}:{action}:{suffix}"
    cached = db.fetch_one("SELECT payload, expires_at FROM api_cache WHERE cache_key = ?", (cache_key,))
    now = time.time()
    if cached and float(cached["expires_at"]) > now:
        return json.loads(cached["payload"])

    _, client = profile_client(profile_id)
    try:
        payload = await client.request(action, **parameters)
        db.execute(
            """INSERT INTO api_cache(cache_key, profile_id, payload, expires_at, updated_at)
               VALUES(?, ?, ?, ?, ?)
               ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,
               expires_at=excluded.expires_at, updated_at=excluded.updated_at""",
            (cache_key, profile_id, json.dumps(payload), now + ttl_seconds, utc_now()),
        )
        return payload
    except Exception as exc:
        # En cas de timeout ou indisponibilité temporaire du fournisseur IPTV, on réutilise le cache existant !
        if cached and cached["payload"]:
            print(f"[Fluxa] Avertissement: échec réseau pour {action} ({exc}), utilisation du cache sauvegardé.")
            # Prolonge la validité pour éviter de saturer le serveur
            db.execute(
                "UPDATE api_cache SET expires_at = ?, updated_at = ? WHERE cache_key = ?",
                (now + 7200, utc_now(), cache_key),
            )
            return json.loads(cached["payload"])
        raise


def _rewrite_playlist(playlist: str, base_url: str) -> str:
    rewritten: list[str] = []
    for line in playlist.splitlines():
        stripped = line.strip()
        if not stripped:
            rewritten.append(line)
            continue
        if stripped.startswith("#"):
            def replace_uri(match: re.Match[str]) -> str:
                absolute_url = urljoin(base_url, match.group(1))
                return f'URI="/api/stream/segment/{cipher.encrypt(absolute_url)}"'

            rewritten.append(re.sub(r'URI="([^"]+)"', replace_uri, line))
            continue
        absolute_url = urljoin(base_url, stripped)
        token = cipher.encrypt(absolute_url)
        rewritten.append(f"/api/stream/segment/{token}")
    return "\n".join(rewritten) + "\n"


async def proxy_url(url: str, range_header: str | None = None) -> Response:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="URL de flux invalide.")
    headers = {
        "User-Agent": "IPTVSmartersPro/1.0.0 (Linux; Android 11)",
        "Accept": "*/*",
        "Connection": "keep-alive",
    }
    if range_header:
        headers["Range"] = range_header
    # Connect timeout à 10s pour ne pas bloquer si un serveur est mort, read=None pour flux continu
    timeout = httpx.Timeout(connect=10.0, read=None, write=10.0, pool=None)
    client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)
    try:
        request = client.build_request("GET", url, headers=headers)
        response = await client.send(request, stream=True)
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        await client.aclose()
        raise HTTPException(
            status_code=502,
            detail=f"Le serveur IPTV a renvoyé l'erreur {exc.response.status_code}.",
        ) from exc
    except httpx.HTTPError as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail="Le flux vidéo est indisponible.") from exc

    content_type = response.headers.get("content-type", "application/octet-stream")
    if "mpegurl" in content_type or urlparse(str(response.url)).path.lower().endswith(".m3u8"):
        data = await response.aread()
        await response.aclose()
        await client.aclose()
        playlist = _rewrite_playlist(data.decode("utf-8", errors="replace"), str(response.url))
        return Response(playlist, media_type="application/vnd.apple.mpegurl", headers={"Cache-Control": "no-store"})

    if urlparse(str(response.url)).path.lower().endswith(".ts") or "mp2t" in content_type or "/live/" in url:
        content_type = "video/mp2t"

    async def iterator():
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        except Exception:
            pass
        finally:
            try:
                await response.aclose()
            except Exception:
                pass
            try:
                await client.aclose()
            except Exception:
                pass

    is_live = "/live/" in url
    forwarded_headers = {
        "Cache-Control": "no-store",
        "Accept-Ranges": response.headers.get("accept-ranges", "bytes"),
        "Access-Control-Allow-Origin": "*",
    }
    for name in ("content-length", "content-range"):
        # Pour les flux continus en direct, omettre Content-Length pour chunked
        if is_live and name == "content-length":
            continue
        if value := response.headers.get(name):
            forwarded_headers[name.title()] = value
    return StreamingResponse(iterator(), status_code=response.status_code, media_type=content_type, headers=forwarded_headers)


async def transcode_stream(url: str) -> StreamingResponse:
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        # Si ffmpeg n'est pas disponible, repli sur le proxy direct
        return await proxy_url(url)

    headers = {
        "User-Agent": "IPTVSmartersPro/1.0.0 (Linux; Android 11)",
        "Accept": "*/*",
        "Connection": "keep-alive",
    }
    timeout = httpx.Timeout(connect=10.0, read=None, write=10.0, pool=None)
    client = httpx.AsyncClient(timeout=timeout, follow_redirects=True)
    try:
        request = client.build_request("GET", url, headers=headers)
        upstream_res = await client.send(request, stream=True)
        upstream_res.raise_for_status()
    except Exception as exc:
        await client.aclose()
        raise HTTPException(status_code=502, detail="Le flux vidéo est indisponible pour le transcodage.") from exc

    cmd = [
        ffmpeg_bin,
        "-hide_banner",
        "-loglevel", "error",
        "-probesize", "500000",
        "-analyzeduration", "1000000",
        "-i", "pipe:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-f", "mpegts",
        "pipe:1",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )

    async def feed_ffmpeg():
        try:
            async for chunk in upstream_res.aiter_bytes(chunk_size=32768):
                if proc.stdin.is_closing():
                    break
                proc.stdin.write(chunk)
                await proc.stdin.drain()
        except Exception:
            pass
        finally:
            try:
                proc.stdin.close()
                await proc.stdin.wait_closed()
            except Exception:
                pass
            try:
                await upstream_res.aclose()
            except Exception:
                pass
            try:
                await client.aclose()
            except Exception:
                pass

    feeder_task = asyncio.create_task(feed_ffmpeg())

    async def stream_output():
        try:
            while True:
                data = await proc.stdout.read(16384)
                if not data:
                    break
                yield data
        except Exception:
            pass
        finally:
            try:
                proc.kill()
            except Exception:
                pass
            try:
                await proc.wait()
            except Exception:
                pass
            feeder_task.cancel()
            try:
                await upstream_res.aclose()
            except Exception:
                pass
            try:
                await client.aclose()
            except Exception:
                pass

    forwarded_headers = {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "video/mp2t",
    }
    return StreamingResponse(stream_output(), status_code=200, media_type="video/mp2t", headers=forwarded_headers)
