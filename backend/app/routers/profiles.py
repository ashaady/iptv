from uuid import uuid4

from fastapi import APIRouter, HTTPException, Response, status

from ..database import db, utc_now
from ..schemas import LoginResult, ProfileCreate, ProfilePublic, ProfileUpdate, XtreamCredentials
from ..security import cipher
from ..services.xtream import XtreamClient, account_summary


router = APIRouter(tags=["Profils IPTV"])


def public_profile(row: dict) -> ProfilePublic:
    return ProfilePublic.model_validate({key: value for key, value in row.items() if key != "encrypted_password"})


@router.post("/iptv/login", response_model=LoginResult)
async def test_login(credentials: XtreamCredentials) -> LoginResult:
    payload = await XtreamClient(str(credentials.server_url), credentials.username, credentials.password).authenticate()
    return LoginResult.model_validate(account_summary(payload))


@router.get("/profiles", response_model=list[ProfilePublic])
def list_profiles() -> list[ProfilePublic]:
    rows = db.fetch_all("SELECT * FROM iptv_profiles ORDER BY updated_at DESC")
    return [public_profile(row) for row in rows]


@router.post("/profiles", response_model=ProfilePublic, status_code=status.HTTP_201_CREATED)
async def create_profile(profile: ProfileCreate) -> ProfilePublic:
    server_url = str(profile.server_url).rstrip("/")
    payload = await XtreamClient(server_url, profile.username, profile.password).authenticate()
    account = account_summary(payload)
    profile_id, now = str(uuid4()), utc_now()
    db.execute(
        """INSERT INTO iptv_profiles(id, name, server_url, username, encrypted_password,
           status, expires_at, max_connections, active_connections, last_sync_at, created_at, updated_at)
           VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (profile_id, profile.name, server_url, profile.username, cipher.encrypt(profile.password), account["status"],
         account["expires_at"], account["max_connections"], account["active_connections"], now, now, now),
    )
    row = db.fetch_one("SELECT * FROM iptv_profiles WHERE id = ?", (profile_id,))
    assert row is not None
    return public_profile(row)


@router.get("/profiles/{profile_id}", response_model=ProfilePublic)
def get_profile(profile_id: str) -> ProfilePublic:
    row = db.fetch_one("SELECT * FROM iptv_profiles WHERE id = ?", (profile_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Profil IPTV introuvable.")
    return public_profile(row)


@router.patch("/profiles/{profile_id}", response_model=ProfilePublic)
async def update_profile(profile_id: str, update: ProfileUpdate) -> ProfilePublic:
    row = db.fetch_one("SELECT * FROM iptv_profiles WHERE id = ?", (profile_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Profil IPTV introuvable.")
    values = update.model_dump(exclude_unset=True)
    password = values.pop("password", None)
    server_url = str(values.get("server_url", row["server_url"])).rstrip("/")
    username = values.get("username", row["username"])
    plain_password = password or cipher.decrypt(row["encrypted_password"])
    payload = await XtreamClient(server_url, username, plain_password).authenticate()
    account = account_summary(payload)
    now = utc_now()
    db.execute(
        """UPDATE iptv_profiles SET name=?, server_url=?, username=?, encrypted_password=?,
           status=?, expires_at=?, max_connections=?, active_connections=?, last_sync_at=?, updated_at=? WHERE id=?""",
        (values.get("name", row["name"]), server_url, username, cipher.encrypt(plain_password), account["status"],
         account["expires_at"], account["max_connections"], account["active_connections"], now, now, profile_id),
    )
    updated = db.fetch_one("SELECT * FROM iptv_profiles WHERE id = ?", (profile_id,))
    assert updated is not None
    return public_profile(updated)


@router.delete("/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(profile_id: str) -> Response:
    if not db.fetch_one("SELECT id FROM iptv_profiles WHERE id = ?", (profile_id,)):
        raise HTTPException(status_code=404, detail="Profil IPTV introuvable.")
    db.execute("DELETE FROM iptv_profiles WHERE id = ?", (profile_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
