import os

os.environ.setdefault("NODE_ENV", "test")
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://shopscale:shopscale@localhost:5432/shopscale")
os.environ.setdefault("JWT_ACCESS_SECRET", "test-access-secret-that-is-long-enough")
os.environ.setdefault("JWT_REFRESH_SECRET", "test-refresh-secret-that-is-long-enough")

from fastapi.testclient import TestClient

from app.main import app


def test_health_routes_and_metrics() -> None:
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/api/health").json()["status"] == "ok"
        assert client.get("/metrics").json()["http.requests"] >= 3


def test_validation_uses_legacy_error_envelope() -> None:
    with TestClient(app) as client:
        response = client.post("/api/auth/login", json={"email": "bad", "password": "short"})
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "BAD_REQUEST"
        assert response.json()["error"]["message"] == "Invalid request"
