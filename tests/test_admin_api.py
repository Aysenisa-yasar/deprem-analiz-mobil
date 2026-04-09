def test_admin_dashboard_returns_counts(client, monkeypatch):
    monkeypatch.delenv("ADMIN_API_KEY", raising=False)
    response = client.get("/api/v1/admin/dashboard")
    assert response.status_code == 200
    data = response.get_json()
    assert data is not None
    assert data["success"] is True
    assert "counts" in data
    assert "model" in data


def test_admin_logs_endpoint_returns_lines(client, monkeypatch):
    monkeypatch.delenv("ADMIN_API_KEY", raising=False)
    response = client.get("/api/v1/admin/logs?limit=5")
    assert response.status_code == 200
    data = response.get_json()
    assert data is not None
    assert data["success"] is True
    assert "lines" in data
