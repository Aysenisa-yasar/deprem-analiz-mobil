import time


def _register_via_email(client):
    unique = str(int(time.time() * 1000))
    username = f"user_{unique}"
    email = f"{username}@example.com"

    request_response = client.post(
        "/api/mobile/register/request-code",
        json={
            "username": username,
            "email": email,
            "password": "1234",
        },
    )
    assert request_response.status_code == 200
    request_payload = request_response.get_json()
    assert request_payload is not None
    assert request_payload["success"] is True
    assert request_payload["channel"] == "email"
    assert "debug_code" in request_payload

    verify_response = client.post(
        "/api/mobile/register",
        json={"email": email, "code": request_payload["debug_code"]},
    )
    assert verify_response.status_code == 200
    verify_payload = verify_response.get_json()
    assert verify_payload is not None
    assert verify_payload["success"] is True
    assert verify_payload["username"] == username
    assert "token" in verify_payload
    return username, email, verify_payload["token"]


def test_register_request_requires_email_payload(client):
    response = client.post("/api/mobile/register/request-code", json={})
    assert response.status_code == 400
    data = response.get_json()
    assert data is not None
    assert data["success"] is False


def test_register_request_dev_mode_returns_payload(client, monkeypatch):
    monkeypatch.setenv("MOBILE_AUTH_DEV_MODE", "1")
    response = client.post(
        "/api/mobile/register/request-code",
        json={
            "username": f"demo_{int(time.time() * 1000)}",
            "email": f"demo_{int(time.time() * 1000)}@example.com",
            "password": "1234",
        },
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data is not None
    assert data["success"] is True
    assert data["status"] == "ok"
    assert data["channel"] == "email"
    assert "debug_code" in data


def test_login_code_flow_requires_existing_user(client, monkeypatch):
    monkeypatch.setenv("MOBILE_AUTH_DEV_MODE", "1")
    username, email, _ = _register_via_email(client)

    request_response = client.post(
        "/api/mobile/auth/request-code",
        json={"target": email},
    )
    assert request_response.status_code == 200
    request_payload = request_response.get_json()
    assert request_payload is not None
    assert request_payload["success"] is True
    assert "debug_code" in request_payload

    verify_response = client.post(
        "/api/mobile/auth/verify-code",
        json={"target": email, "code": request_payload["debug_code"]},
    )
    assert verify_response.status_code == 200
    verify_payload = verify_response.get_json()
    assert verify_payload is not None
    assert verify_payload["success"] is True
    assert verify_payload["username"] == username
    assert "token" in verify_payload
