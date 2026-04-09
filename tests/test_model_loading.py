# tests/test_model_loading.py
import numpy as np

from forecast.predictor import load_model, predict, predict_with_model_data


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


class _BrokenProbabilityModel:
    def predict_proba(self, X):
        raise ValueError(
            "XGBClassifier should either be a classifier to be used with response_method="
            "['decision_function', 'predict_proba'] or the response_method should be 'predict'."
        )

    def predict(self, X):
        return np.array([0.64])


def test_predict_with_model_data_tolerates_probability_runtime_issue():
    events = [
        {"lat": 40.0, "lon": 29.0, "mag": 3.0, "timestamp": 1000.0},
        {"lat": 40.1, "lon": 29.1, "mag": 3.4, "timestamp": 2000.0},
        {"lat": 39.9, "lon": 28.9, "mag": 2.8, "timestamp": 3000.0},
    ]
    pred = predict_with_model_data(
        {"model": _BrokenProbabilityModel(), "aux_models": {"m5_72h": _BrokenProbabilityModel()}},
        events,
        40.0,
        29.0,
        fast_mode=True,
    )
    assert isinstance(pred, dict)
    assert 0.0 <= pred["probability"] <= 1.0
    assert 0.0 <= pred["ml_probability"] <= 1.0
    assert pred["model_health"]["available"] is True


class _UnusableModel:
    def predict_proba(self, X):
        raise ValueError("broken model")


def test_predict_with_model_data_falls_back_when_model_cannot_score():
    events = [{"lat": 40.0, "lon": 29.0, "mag": 3.0, "timestamp": 1000.0}]
    pred = predict_with_model_data({"model": _UnusableModel()}, events, 40.0, 29.0, fast_mode=True)
    assert isinstance(pred, dict)
    assert 0.0 <= pred["probability"] <= 1.0
    assert pred["ml_probability"] == 0.0
    assert pred["model_health"]["available"] is False
    assert pred["model_type"] == "forecast_runtime_fallback"
