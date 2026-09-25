from pathlib import Path

from fastapi.testclient import TestClient

from app.database import db
from app.main import app


def account_payload() -> dict:
    return {
        "user_info": {
            "auth": 1,
            "status": "Active",
            "exp_date": "1797552000",
            "max_connections": "2",
            "active_cons": "1",
        },
        "server_info": {"timezone": "Africa/Dakar"},
    }


def test_health(tmp_path: Path) -> None:
    db.path = tmp_path / "health.db"
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_profile_favorites_and_history(tmp_path: Path, monkeypatch) -> None:
    db.path = tmp_path / "fluxa.db"

    async def fake_authenticate(_self):
        return account_payload()

    monkeypatch.setattr("app.routers.profiles.XtreamClient.authenticate", fake_authenticate)

    with TestClient(app) as client:
        created = client.post(
            "/api/profiles",
            json={
                "name": "Maison",
                "server_url": "https://iptv.example.test:8080",
                "username": "demo",
                "password": "secret-value",
            },
        )
        assert created.status_code == 201
        profile = created.json()
        assert profile["status"] == "active"
        assert "password" not in profile
        assert "encrypted_password" not in profile

        favorite = client.post(
            "/api/favorites",
            json={
                "profile_id": profile["id"],
                "content_type": "live",
                "content_id": "42",
                "title": "Sunu Info",
                "metadata": {"logo": "https://example.test/logo.png"},
            },
        )
        assert favorite.status_code == 201
        assert client.get("/api/favorites", params={"profile_id": profile["id"]}).json()[0]["content_id"] == "42"

        removed = client.delete(
            "/api/favorites",
            params={
                "profile_id": profile["id"],
                "content_type": "live",
                "content_id": "42",
            },
        )
        assert removed.status_code == 204
        assert client.get("/api/favorites", params={"profile_id": profile["id"]}).json() == []

        history = client.post(
            "/api/history",
            json={
                "profile_id": profile["id"],
                "content_type": "movie",
                "content_id": "99",
                "title": "Sous le baobab",
                "position_seconds": 720,
                "duration_seconds": 5400,
            },
        )
        assert history.status_code == 200
        assert history.json()["position_seconds"] == 720
        assert client.get("/api/history", params={"profile_id": profile["id"]}).json()[0]["title"] == "Sous le baobab"

        # Test timeshift client URL construction
        from app.services.xtream import profile_client
        _, pclient = profile_client(profile["id"])
        ts_url = pclient.timeshift_url("42", "2026-09-09:14-00", 60)
        assert "/timeshift/demo/secret-value/60/2026-09-09:14-00/42.ts" in ts_url

        deleted = client.delete(f"/api/profiles/{profile['id']}")
        assert deleted.status_code == 204
        assert client.get("/api/profiles").json() == []
