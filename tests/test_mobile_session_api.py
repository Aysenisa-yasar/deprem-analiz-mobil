import time


def _register(client):
    unique = str(int(time.time() * 1000))
    username = f"session_{unique}"
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
    code = request_payload["debug_code"]

    verify_response = client.post(
        "/api/mobile/register",
        json={"email": email, "code": code},
    )
    assert verify_response.status_code == 200
    verify_payload = verify_response.get_json()
    assert verify_payload is not None
    return username, email, verify_payload["token"]


def test_mobile_settings_and_devices(client):
    _, _, token = _register(client)

    settings_response = client.get(
        "/api/mobile/settings",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert settings_response.status_code == 200
    settings_payload = settings_response.get_json()
    assert settings_payload is not None
    assert settings_payload["success"] is True
    assert "settings" in settings_payload

    update_response = client.put(
        "/api/mobile/settings",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "notification_enabled": False,
            "location_tracking_enabled": True,
            "preferred_city": "Istanbul",
            "min_risk_score": 0.72,
        },
    )
    assert update_response.status_code == 200
    update_payload = update_response.get_json()
    assert update_payload is not None
    assert update_payload["settings"]["preferred_city"] == "Istanbul"

    device_response = client.post(
        "/api/mobile/devices",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "device_id": "device-test-1",
            "platform": "android",
            "app_version": "1.0.0",
        },
    )
    assert device_response.status_code == 200
    device_payload = device_response.get_json()
    assert device_payload is not None
    assert device_payload["success"] is True
    assert device_payload["device"]["device_id"] == "device-test-1"


def test_mobile_refresh_and_logout(client):
    username, _, token = _register(client)

    refresh_response = client.post(
        "/api/mobile/refresh",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert refresh_response.status_code == 200
    refresh_payload = refresh_response.get_json()
    assert refresh_payload is not None
    assert refresh_payload["success"] is True
    assert refresh_payload["username"] == username
    new_token = refresh_payload["token"]

    logout_response = client.post(
        "/api/mobile/logout",
        headers={"Authorization": f"Bearer {new_token}"},
    )
    assert logout_response.status_code == 200
    logout_payload = logout_response.get_json()
    assert logout_payload is not None
    assert logout_payload["success"] is True

    me_response = client.get(
        "/api/mobile/me",
        headers={"Authorization": f"Bearer {new_token}"},
    )
    assert me_response.status_code == 401
