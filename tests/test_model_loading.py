# tests/test_model_loading.py
from forecast.predictor import load_model, predict


def test_load_model_returns_none_or_dict():
    m = load_model()
    assert m is None or isinstance(m, dict)


def test_predict_returns_dict():
    events = [{"lat": 40.0, "lon": 29.0, "mag": 3.0, "timestamp": 1000.0}]
    p = predict(events, 40.0, 29.0)
    assert isinstance(p, dict)
    assert "probability" in p
    assert 0.0 <= p["probability"] <= 1.0
    assert "model_type" in p
    assert "features" in p
    assert "time_to_next_event_hours_prediction" in p
    assert "next_event_distance_km_prediction" in p
    assert "next_event_magnitude_prediction" in p
    assert "next_event_time_window" in p
