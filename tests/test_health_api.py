def test_health_returns_status_payload(client):
    response = client.get("/api/health")
    assert response.status_code == 200

    data = response.get_json()
    assert data is not None
    assert data["success"] is True
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert "model" in data
    assert "version" in data
