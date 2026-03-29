import os
import pickle

import numpy as np

from config import FORECAST_MODEL
from forecast.bvalue import compute_b_value
from forecast.clustering import detect_clusters
from forecast.etas_like import etas_like_score
from forecast.explain import explain_prediction
from forecast.features import extract_features, haversine_km
from forecast.gnn.predict import predict_gnn
from forecast.lstm_model import predict_lstm_sequence

MODEL_TYPE = "forecast_hybrid_v3_timeseriescv"

FEATURE_ORDER = [
    "count",
    "max_mag",
    "mean_mag",
    "mag_std",
    "min_distance",
    "mean_distance",
    "recency_energy",
    "mean_depth",
    "recent_6h_count",
    "recent_24h_count",
    "swarm_ratio",
    "fault_distance",
    "fault_proximity_score",
    "stress_transfer",
    "energy_release",
    "foreshock_count",
    "spatial_density",
    "mag_trend",
    "depth_variance",
]


def load_model():
    if not os.path.exists(FORECAST_MODEL):
        return None
    try:
        with open(FORECAST_MODEL, "rb") as f:
            return pickle.load(f)
    except Exception:
        return None


def _sorted_events(events: list) -> list:
    return sorted(
        [event for event in events if (event.get("timestamp") or 0) > 0],
        key=lambda event: float(event.get("timestamp") or 0),
    )


def _clamp01(value: float) -> float:
    return float(min(max(value, 0.0), 1.0))


def _optional_float(value, min_value=None, max_value=None):
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None

    if min_value is not None:
        numeric = max(float(min_value), numeric)
    if max_value is not None:
        numeric = min(float(max_value), numeric)
    return float(numeric)


def _lead_time_window(hours):
    lead_hours = _optional_float(hours, min_value=0.0)
    if lead_hours is None:
        return None
    if lead_hours <= 24.0:
        return "0-24h"
    if lead_hours <= 72.0:
        return "24-72h"
    if lead_hours <= 168.0:
        return "72-168h"
    return "168h+"


def _local_signal_events(
    events: list,
    lat: float,
    lon: float,
    radius_km: float = 250.0,
    lookback_hours: float = 168.0,
    min_events: int = 12,
) -> list:
    recent_events = _sorted_events(events)
    if not recent_events:
        return []

    now = float(recent_events[-1].get("timestamp") or 0)
    scored_events = []
    for event in recent_events:
        ts = float(event.get("timestamp") or 0)
        if ts <= 0:
            continue

        age_hours = (now - ts) / 3600.0
        if age_hours > lookback_hours:
            continue

        event_lat = float(event.get("lat", 0) or 0)
        event_lon = float(event.get("lon", 0) or 0)
        distance = haversine_km(lat, lon, event_lat, event_lon)
        scored_events.append((distance, age_hours, event))

    if not scored_events:
        return []

    local_events = [event for distance, _, event in scored_events if distance <= radius_km]
    if len(local_events) >= min_events:
        return sorted(local_events, key=lambda event: float(event.get("timestamp") or 0))

    scored_events.sort(key=lambda item: (item[0], item[1]))
    nearest_events = [event for _, _, event in scored_events[: max(min_events, 60)]]
    return sorted(nearest_events, key=lambda event: float(event.get("timestamp") or 0))


def _build_signal_bundle(events: list, lat: float, lon: float) -> dict:
    signal_events = _local_signal_events(events, lat, lon)
    cluster_events = signal_events[-200:] if len(signal_events) > 200 else signal_events
    bvalue_events = signal_events[-500:] if len(signal_events) > 500 else signal_events
    lstm_events = signal_events[-50:] if len(signal_events) > 50 else signal_events
    gnn_events = signal_events[-100:] if len(signal_events) > 100 else signal_events

    clusters = detect_clusters(cluster_events)
    cluster_score = _clamp01(len(clusters) / 5.0)
    b_value = compute_b_value(bvalue_events)
    b_risk = _clamp01(1.2 - b_value)
    lstm_prob = _clamp01(predict_lstm_sequence(lstm_events, lat, lon) if signal_events else 0.0)
    gnn_prob = _clamp01(predict_gnn(gnn_events))

    return {
        "cluster_score": float(cluster_score),
        "b_value": float(b_value),
        "b_risk": float(b_risk),
        "lstm_probability": float(lstm_prob),
        "gnn_probability": float(gnn_prob),
        "signal_event_count": int(len(signal_events)),
    }


def _dynamic_weights(features: dict) -> dict:
    weights = {
        "ml": 0.40,
        "etas": 0.20,
        "cluster": 0.10,
        "b": 0.10,
        "lstm": 0.10,
        "gnn": 0.15,
    }

    count = int(features.get("count", 0) or 0)
    max_mag = float(features.get("max_mag", 0) or 0)

    if count < 5:
        weights["ml"] = 0.20
        weights["etas"] = 0.30
        weights["cluster"] = 0.20
        weights["b"] = 0.10
        weights["lstm"] = 0.05
        weights["gnn"] = 0.15
    elif max_mag > 4.0:
        weights["ml"] = 0.50
        weights["etas"] = 0.20
        weights["cluster"] = 0.10
        weights["b"] = 0.08
        weights["lstm"] = 0.05
        weights["gnn"] = 0.07

    total = sum(weights.values())
    if total <= 0:
        return weights

    return {name: value / total for name, value in weights.items()}


def _locality_score(features: dict, signals: dict) -> float:
    min_distance_term = _clamp01(1.0 - float(features.get("min_distance", 999.0) or 999.0) / 200.0)
    fault_term = _clamp01(float(features.get("fault_proximity_score", 0.0) or 0.0))
    signal_term = _clamp01(float(signals.get("signal_event_count", 0) or 0) / 25.0)
    foreshock_term = _clamp01(float(features.get("foreshock_count", 0) or 0) / 8.0)
    return float(
        0.40 * min_distance_term
        + 0.25 * fault_term
        + 0.20 * signal_term
        + 0.15 * foreshock_term
    )


def _predict_auxiliary_targets(model_data: dict, X: np.ndarray) -> dict:
    aux_models = model_data.get("aux_models", {}) if isinstance(model_data, dict) else {}
    horizons = {}
    if isinstance(model_data, dict):
        horizons = (model_data.get("targets", {}) or {}).get("horizons_hours", {}) or {}
    next_event_horizon = _optional_float(horizons.get("time_to_next_event_hours"), min_value=1.0) or 168.0

    predictions = {
        "m5_72h_probability": 0.0,
        "max_mag_7d_prediction": 0.0,
        "time_to_next_event_hours_prediction": None,
        "next_event_distance_km_prediction": None,
        "next_event_magnitude_prediction": None,
    }

    m5_model = aux_models.get("m5_72h")
    if m5_model is not None:
        try:
            predictions["m5_72h_probability"] = float(m5_model.predict_proba(X)[0, 1])
        except Exception:
            predictions["m5_72h_probability"] = 0.0

    max_mag_model = aux_models.get("max_mag_7d")
    if max_mag_model is not None:
        try:
            predictions["max_mag_7d_prediction"] = float(max_mag_model.predict(X)[0])
        except Exception:
            predictions["max_mag_7d_prediction"] = 0.0

    time_model = aux_models.get("time_to_next_event_hours")
    if time_model is not None:
        try:
            predictions["time_to_next_event_hours_prediction"] = _optional_float(
                time_model.predict(X)[0],
                min_value=0.0,
                max_value=next_event_horizon,
            )
        except Exception:
            predictions["time_to_next_event_hours_prediction"] = None

    distance_model = aux_models.get("next_event_distance_km")
    if distance_model is not None:
        try:
            predictions["next_event_distance_km_prediction"] = _optional_float(
                distance_model.predict(X)[0],
                min_value=0.0,
            )
        except Exception:
            predictions["next_event_distance_km_prediction"] = None

    magnitude_model = aux_models.get("next_event_magnitude")
    if magnitude_model is not None:
        try:
            predictions["next_event_magnitude_prediction"] = _optional_float(
                magnitude_model.predict(X)[0],
                min_value=0.0,
            )
        except Exception:
            predictions["next_event_magnitude_prediction"] = None

    return predictions


def predict_with_model_data(
    model_data: dict | None,
    events: list,
    lat: float,
    lon: float,
    time_window_hours: int = 48,
    explain: bool = False,
) -> dict:
    feats = extract_features(events, lat, lon, time_window_hours=time_window_hours)
    X = np.array([[feats.get(key, 0) for key in FEATURE_ORDER]], dtype=np.float64)
    signals = _build_signal_bundle(events, lat, lon)
    etas_prob = float(etas_like_score(feats))
    locality_score = _locality_score(feats, signals)

    if not model_data or "model" not in model_data:
        fallback_prob = _clamp01(
            0.50 * etas_prob
            + 0.25 * signals["cluster_score"]
            + 0.25 * locality_score
        )
        return {
            "probability": fallback_prob,
            "ml_probability": 0.0,
            "etas_probability": etas_prob,
            "lstm_probability": float(signals["lstm_probability"]),
            "cluster_score": float(signals["cluster_score"]),
            "b_value": float(signals["b_value"]),
            "b_risk": float(signals["b_risk"]),
            "gnn_probability": float(signals["gnn_probability"]),
            "m5_72h_probability": 0.0,
            "max_mag_7d_prediction": 0.0,
            "time_to_next_event_hours_prediction": None,
            "next_event_distance_km_prediction": None,
            "next_event_magnitude_prediction": None,
            "next_event_time_window": None,
            "locality_score": float(locality_score),
            "ensemble_weights": _dynamic_weights(feats),
            "signal_event_count": int(signals["signal_event_count"]),
            "features": feats,
            "top_features": [],
            "model_type": "no_forecast_model",
            "fault_distance": float(feats.get("fault_distance", 999.0)),
            "fault_proximity_score": float(feats.get("fault_proximity_score", 0.0)),
            "stress_transfer": float(feats.get("stress_transfer", 0.0)),
            "energy_release": float(feats.get("energy_release", 0.0)),
            "foreshock_count": int(feats.get("foreshock_count", 0)),
            "spatial_density": float(feats.get("spatial_density", 0.0)),
            "mag_trend": float(feats.get("mag_trend", 0.0)),
            "depth_variance": float(feats.get("depth_variance", 0.0)),
            "nearest_fault_segment": feats.get("nearest_fault_segment", "unknown"),
        }

    ml_prob = float(model_data["model"].predict_proba(X)[0, 1])
    aux_predictions = _predict_auxiliary_targets(model_data, X)
    weights = _dynamic_weights(feats)

    final_prob = (
        weights["ml"] * ml_prob
        + weights["etas"] * etas_prob
        + weights["cluster"] * signals["cluster_score"]
        + weights["b"] * signals["b_risk"]
        + weights["lstm"] * signals["lstm_probability"]
        + weights["gnn"] * signals["gnn_probability"]
    )
    final_prob = _clamp01(0.88 * final_prob + 0.12 * locality_score)

    result = {
        "probability": float(final_prob),
        "ml_probability": float(ml_prob),
        "etas_probability": float(etas_prob),
        "lstm_probability": float(signals["lstm_probability"]),
        "cluster_score": float(signals["cluster_score"]),
        "b_value": float(signals["b_value"]),
        "b_risk": float(signals["b_risk"]),
        "gnn_probability": float(signals["gnn_probability"]),
        "m5_72h_probability": float(_clamp01(aux_predictions["m5_72h_probability"])),
        "max_mag_7d_prediction": float(aux_predictions["max_mag_7d_prediction"]),
        "time_to_next_event_hours_prediction": aux_predictions["time_to_next_event_hours_prediction"],
        "next_event_distance_km_prediction": aux_predictions["next_event_distance_km_prediction"],
        "next_event_magnitude_prediction": aux_predictions["next_event_magnitude_prediction"],
        "next_event_time_window": _lead_time_window(aux_predictions["time_to_next_event_hours_prediction"]),
        "locality_score": float(locality_score),
        "ensemble_weights": weights,
        "signal_event_count": int(signals["signal_event_count"]),
        "features": feats,
        "top_features": [],
        "model_type": model_data.get("model_type", MODEL_TYPE),
        "fault_distance": float(feats.get("fault_distance", 999.0)),
        "fault_proximity_score": float(feats.get("fault_proximity_score", 0.0)),
        "stress_transfer": float(feats.get("stress_transfer", 0.0)),
        "energy_release": float(feats.get("energy_release", 0.0)),
        "foreshock_count": int(feats.get("foreshock_count", 0)),
        "spatial_density": float(feats.get("spatial_density", 0.0)),
        "mag_trend": float(feats.get("mag_trend", 0.0)),
        "depth_variance": float(feats.get("depth_variance", 0.0)),
        "nearest_fault_segment": feats.get("nearest_fault_segment", "unknown"),
    }

    if explain:
        try:
            result["top_features"] = explain_prediction(
                model_data["model"], X, FEATURE_ORDER
            )
        except Exception:
            result["top_features"] = []

    return result


def predict(
    events: list,
    lat: float,
    lon: float,
    time_window_hours: int = 48,
    explain: bool = False,
) -> dict:
    return predict_with_model_data(
        load_model(),
        events,
        lat,
        lon,
        time_window_hours=time_window_hours,
        explain=explain,
    )
