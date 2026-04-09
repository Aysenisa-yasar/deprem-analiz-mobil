import time


def _register(client, prefix: str):
    unique = str(int(time.time() * 1000))
    username = f"{prefix}_{unique}"
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
    assert "debug_code" in request_payload

    verify_response = client.post(
        "/api/mobile/register",
        json={"email": email, "code": request_payload["debug_code"]},
    )
    assert verify_response.status_code == 200
    verify_payload = verify_response.get_json()
    assert verify_payload is not None
    assert verify_payload["success"] is True
    return username, verify_payload["token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_mobile_messages_round_trip(client):
    sender, sender_token = _register(client, "sender")
    recipient, recipient_token = _register(client, "recipient")

    send_response = client.post(
        "/api/mobile/messages",
        headers=_auth(sender_token),
        json={"to_username": recipient, "body": "Acil durum mesaj testi"},
    )
    assert send_response.status_code == 200
    send_payload = send_response.get_json()
    assert send_payload is not None
    assert send_payload["success"] is True

    inbox_response = client.get("/api/mobile/messages", headers=_auth(recipient_token))
    assert inbox_response.status_code == 200
    inbox_payload = inbox_response.get_json()
    assert inbox_payload is not None
    assert inbox_payload["success"] is True

    messages = inbox_payload["messages"]
    assert len(messages) == 1
    assert messages[0]["from_user"] == sender
    assert messages[0]["to_user"] == recipient
    assert messages[0]["body"] == "Acil durum mesaj testi"


def test_mobile_location_alert_deduplicates_same_event(client):
    owner, owner_token = _register(client, "owner")
    contact, contact_token = _register(client, "contact")

    contact_response = client.put(
        "/api/mobile/emergency-contact",
        headers=_auth(owner_token),
        json={"contact_username": contact},
    )
    assert contact_response.status_code == 200

    payload = {
        "lat": 38.4237,
        "lon": 27.1428,
        "magnitude": 5.8,
        "epicenter_lat": 38.5000,
        "epicenter_lon": 27.2000,
        "event_key": "dedupe-event-1",
    }

    first_response = client.post(
        "/api/mobile/location-alert",
        headers=_auth(owner_token),
        json=payload,
    )
    assert first_response.status_code == 200
    first_payload = first_response.get_json()
    assert first_payload is not None
    assert first_payload["success"] is True
    assert first_payload["sent"] is True

    second_response = client.post(
        "/api/mobile/location-alert",
        headers=_auth(owner_token),
        json=payload,
    )
    assert second_response.status_code == 200
    second_payload = second_response.get_json()
    assert second_payload is not None
    assert second_payload["success"] is True
    assert second_payload["sent"] is False
    assert second_payload["reason"] == "already_sent"

    inbox_response = client.get("/api/mobile/messages", headers=_auth(contact_token))
    assert inbox_response.status_code == 200
    inbox_payload = inbox_response.get_json()
    assert inbox_payload is not None

    delivered = [
        message
        for message in inbox_payload["messages"]
        if message["kind"] == "location_alert" and message["from_user"] == owner
    ]
    assert len(delivered) == 1


def test_mobile_location_alert_rejects_far_event(client):
    owner, owner_token = _register(client, "farowner")
    contact, _ = _register(client, "farcontact")

    contact_response = client.put(
        "/api/mobile/emergency-contact",
        headers=_auth(owner_token),
        json={"contact_username": contact},
    )
    assert contact_response.status_code == 200

    response = client.post(
        "/api/mobile/location-alert",
        headers=_auth(owner_token),
        json={
            "lat": 41.0082,
            "lon": 28.9784,
            "magnitude": 5.4,
            "epicenter_lat": 36.8969,
            "epicenter_lon": 30.7133,
            "event_key": "too-far-event",
        },
    )
    assert response.status_code == 400
    payload = response.get_json()
    assert payload is not None
    assert payload["success"] is False
    assert payload["error"]["code"] == "ALERT_DISTANCE_TOO_FAR"
