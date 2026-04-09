# tests/test_forecast_api.py - Flask test client ile v2 forecast-map


class _BrokenForecastModel:
    def predict_proba(self, X):
        raise ValueError("broken model")


def test_forecast_map_v2_returns_200(client):
    r = client.get("/api/v2/forecast-map")
    assert r.status_code == 200


def test_forecast_map_v2_json(client):
    r = client.get("/api/v2/forecast-map")
    data = r.get_json()
    assert data is not None
    assert data["success"] is True
    assert "data" in data
    assert "status" in data
    assert "points" in data
    assert "model_health" in data
    assert "warning_capability" in data
    if data.get("status") == "success":
        assert len(data.get("points", [])) >= 81
        point = data.get("points", [{}])[0]
        assert "alert_advisory" in point
        assert "warning_capability" in point


def test_forecast_model_status_v2_returns_health(client):
    r = client.get("/api/v2/forecast-model-status")
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert data["success"] is True
    assert "data" in data
    assert "model_health" in data
    assert "warning_capability" in data


def test_forecast_grid_v2_supports_horizon_param(client):
    r = client.get("/api/v2/forecast-grid?hours=72")
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert data["success"] is True
    assert data["horizon_hours"] == 72


def test_forecast_location_v2_requires_coordinates(client):
    r = client.get("/api/v2/forecast-location")
    assert r.status_code == 400


def test_forecast_map_v2_falls_back_for_incompatible_runtime_model(client, monkeypatch):
    import routes.forecast_routes as forecast_routes

    forecast_routes._RESPONSE_CACHE.clear()
    monkeypatch.setattr(
        forecast_routes,
        "load_model",
        lambda: {"model": _BrokenForecastModel(), "model_type": "broken_runtime_model"},
    )

    r = client.get("/api/v2/forecast-map")
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert data["success"] is True
    assert data["degraded"] is True
    assert data["model_health"]["available"] is False
    assert len(data.get("points", [])) >= 81
