import pytest


@pytest.fixture
def client():
    from app import app

    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_request_code_requires_target(client):
    response = client.post("/api/mobile/auth/request-code", json={})
    assert response.status_code == 400


def test_request_code_dev_mode_returns_payload(client, monkeypatch):
    monkeypatch.setenv("MOBILE_AUTH_DEV_MODE", "1")
    response = client.post(
        "/api/mobile/auth/request-code",
        json={"target": "demo@example.com"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data is not None
    assert data["status"] == "ok"
    assert data["channel"] == "email"
    assert "debug_code" in data
