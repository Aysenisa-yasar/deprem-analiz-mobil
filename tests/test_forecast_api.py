# tests/test_forecast_api.py - Flask test client ile v2 forecast-map
import pytest


@pytest.fixture
def client():
    from app import app
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_forecast_map_v2_returns_200(client):
    r = client.get("/api/v2/forecast-map")
    assert r.status_code == 200


def test_forecast_map_v2_json(client):
    r = client.get("/api/v2/forecast-map")
    data = r.get_json()
    assert data is not None
    assert "status" in data
    assert "points" in data
    assert "model_health" in data


def test_forecast_model_status_v2_returns_health(client):
    r = client.get("/api/v2/forecast-model-status")
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert "model_health" in data


def test_forecast_location_v2_requires_coordinates(client):
    r = client.get("/api/v2/forecast-location")
    assert r.status_code == 400
