"""Tests for FastAPI endpoints."""

from fastapi.testclient import TestClient

from api.app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    """Verify /health returns 200 OK and expected keys."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "disclaimer" in data
    assert isinstance(data["artifacts_ready"], bool)


def test_demo_prediction_endpoint() -> None:
    """Verify /predict/demo returns expected multi-vessel structure and clinical disclaimer."""
    response = client.get("/predict/demo")
    assert response.status_code == 200
    data = response.json()
    assert "cad_probability" in data
    assert "vessels" in data
    assert set(data["vessels"].keys()) == {"LAD", "LCX", "RCA"}
    assert all(v["is_illustrative"] is True for v in data["vessels"].values())
    assert "clinical_disclaimer" in data
