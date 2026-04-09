import os
import pickle
from functools import lru_cache

import numpy as np

from config import FORECAST_MODEL
from forecast.bvalue import compute_b_value
from forecast.clustering import detect_clusters
from forecast.etas_like import etas_like_score
from forecast.explain import explain_prediction
from forecast.features import extract_features, haversine_km
from forecast.gnn.predict import predict_gnn
from forecast.lstm_model import predict_lstm_sequence
from services.model_artifact_service import load_forecast_metadata

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

@lru_cache(maxsize=1)
def load_model():
    if not os.path.exists(FORECAST_MODEL):
        return None
    try:
        with open(FORECAST_MODEL, "rb") as f:
            model_data = pickle.load(f)
    except Exception:
        return None
    metadata = load_forecast_metadata()
    if isinstance(model_data, dict) and metadata:
        for key in (
            "version",
            "trained_at",
            "model_type",
            "feature_order",
            "metrics",
            "targets",
            "backtest",
            "feature_importance",
        ):
            if key not in model_data or model_data.get(key) in (None, {}, []):
                value = metadata.get(key)
                if value not in (None, {}, []):
                    model_data[key] = value
    return model_data


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


def _mean_score(values: list[float]) -> float:
    finite = [float(v) for v in values if v is not None]
    if not finite:
        return 0.0
    return float(np.mean(finite))


def _sigmoid(value: float) -> float:
    clipped = max(min(float(value), 60.0), -60.0)
    return float(1.0 / (1.0 + np.exp(-clipped)))


def _reshape_output(output) -> np.ndarray:
    values = np.asarray(output, dtype=np.float64)
    if values.ndim == 0:
        return values.reshape(1)
    return values


def _safe_predict_probability(model, X: np.ndarray) -> tuple[float | None, str | None]:
    if model is None:
        return None, "model_missing"

    if hasattr(model, "predict_proba"):
        try:
            proba = _reshape_output(model.predict_proba(X))
            if proba.ndim >= 2 and proba.shape[1] >= 2:
                return _clamp01(float(proba[0, 1])), None
            flattened = proba.reshape(-1)
            if flattened.size:
                return _clamp01(float(flattened[0])), None
        except Exception as exc:
            issue = str(exc).strip() or exc.__class__.__name__
        else:
            issue = None
    else:
        issue = None

    if hasattr(model, "decision_function"):
        try:
            decision = _reshape_output(model.decision_function(X)).reshape(-1)
            if decision.size:
                return _sigmoid(float(decision[0])), issue
        except Exception as exc:
            issue = str(exc).strip() or exc.__class__.__name__

    if hasattr(model, "predict"):
        try:
            prediction = _reshape_output(model.predict(X)).reshape(-1)
            if prediction.size:
                value = float(prediction[0])
                if 0.0 <= value <= 1.0:
                    return _clamp01(value), issue
                return _sigmoid(value), issue
        except Exception as exc:
            issue = str(exc).strip() or exc.__class__.__name__

    return None, issue or "probability_unavailable"


def validate_model_runtime(model_data: dict | None) -> tuple[bool, str | None]:
    if not model_data or "model" not in model_data:
        return False, "model_missing"

    feature_order = model_data.get("feature_order") or FEATURE_ORDER
    sample = np.zeros((1, len(feature_order)), dtype=np.float64)
    probability, issue = _safe_predict_probability(model_data.get("model"), sample)
    if probability is None:
        return False, issue
    return True, None


def _quality_level(score: float) -> str:
    if score >= 0.72:
        return "high"
    if score >= 0.52:
        return "medium"
    return "experimental"


def _quality_label(level: str) -> str:
    if level == "high":
        return "Yuksek guven"
    if level == "medium":
        return "Orta guven"
    if level == "fallback":
        return "Fallback"
    return "Deneysel"


def build_model_health(
    model_data: dict | None,
    signal_event_count: int | None = None,
    runtime_compatible: bool | None = None,
    runtime_issue: str | None = None,
) -> dict:
    if not model_data or "model" not in model_data:
        return {
            "available": False,
            "quality_level": "no_model",
            "quality_label": "Model yok",
            "quality_score": 0.0,
            "trained_at": None,
            "model_type": "no_forecast_model",
            "summary": "Egitilmis bir forecast modeli bulunamadi. Sonuclar yalnizca kural tabanli sinyallere dayanabilir.",
            "metrics": {},
            "backtest": {},
            "signal_event_count": int(signal_event_count or 0),
        }

    if runtime_compatible is False:
        issue = (runtime_issue or "model_runtime_issue").strip()
        return {
            "available": False,
            "quality_level": "fallback",
            "quality_label": "Fallback",
            "quality_score": 0.0,
            "trained_at": model_data.get("trained_at"),
            "model_type": model_data.get("model_type", MODEL_TYPE),
            "summary": (
                "Yuklu model artefakti bu ortamda guvenli skor uretemedi. "
                "Uygulama bu durumda sezgisel fallback risk hesabina doner."
            ),
            "metrics": model_data.get("metrics") or {},
            "backtest": model_data.get("backtest") or {},
            "signal_event_count": int(signal_event_count or 0),
            "runtime_issue": issue[:240],
        }

    metrics = model_data.get("metrics") or {}
    backtest = model_data.get("backtest") or {}

    roc_auc = _optional_float(metrics.get("roc_auc_mean"), min_value=0.0, max_value=1.0)
    pr_auc = _optional_float(metrics.get("pr_auc_mean"), min_value=0.0, max_value=1.0)
    brier = _optional_float(metrics.get("brier_mean"), min_value=0.0, max_value=1.0)
    hit_rate = _optional_float(backtest.get("hit_rate"), min_value=0.0, max_value=1.0)
    accuracy = _optional_float(backtest.get("accuracy"), min_value=0.0, max_value=1.0)
    precision = _optional_float(backtest.get("precision"), min_value=0.0, max_value=1.0)
    recall = _optional_float(backtest.get("recall"), min_value=0.0, max_value=1.0)
    f1 = _optional_float(backtest.get("f1"), min_value=0.0, max_value=1.0)
    balanced_accuracy = _optional_float(backtest.get("balanced_accuracy"), min_value=0.0, max_value=1.0)
    top_decile_precision = _optional_float(backtest.get("top_decile_precision"), min_value=0.0, max_value=1.0)
    top_decile_recall = _optional_float(backtest.get("top_decile_recall"), min_value=0.0, max_value=1.0)
    positive_rate = _optional_float(backtest.get("positive_rate"), min_value=0.0, max_value=1.0)
    hit_rate_definition = backtest.get("hit_rate_definition") or "legacy_accuracy"
    uses_legacy_backtest = False

    if recall is None and hit_rate is not None:
        uses_legacy_backtest = True
        accuracy = accuracy if accuracy is not None else hit_rate

    component_scores = []
    if roc_auc is not None:
        component_scores.append(_clamp01((roc_auc - 0.5) / 0.3))
    if pr_auc is not None and positive_rate is not None:
        lift_denom = max(0.05, 1.0 - positive_rate)
        component_scores.append(_clamp01((pr_auc - positive_rate) / lift_denom))
    if brier is not None:
        component_scores.append(_clamp01(1.0 - (brier / 0.35)))
    if recall is not None:
        component_scores.append(_clamp01(recall / 0.75))
    if precision is not None:
        component_scores.append(_clamp01(precision / 0.75))
    if f1 is not None:
        component_scores.append(_clamp01(f1 / 0.70))
    if balanced_accuracy is not None:
        component_scores.append(_clamp01((balanced_accuracy - 0.5) / 0.3))
    if top_decile_precision is not None and positive_rate is not None:
        lift_denom = max(0.05, 1.0 - positive_rate)
        component_scores.append(_clamp01((top_decile_precision - positive_rate) / lift_denom))
    if top_decile_recall is not None:
        component_scores.append(_clamp01(top_decile_recall / 0.70))
    if uses_legacy_backtest and accuracy is not None and positive_rate is not None:
        gain_denom = max(0.05, 1.0 - positive_rate)
        component_scores.append(0.55 * _clamp01((accuracy - positive_rate) / gain_denom))

    base_score = _mean_score(component_scores)
    if signal_event_count is None:
        quality_score = base_score
    else:
        signal_score = _clamp01(float(signal_event_count) / 24.0)
        quality_score = float(0.72 * base_score + 0.28 * signal_score)

    if uses_legacy_backtest:
        quality_score *= 0.92

    level = _quality_level(quality_score)
    signal_note = ""
    if signal_event_count is not None and signal_event_count < 8:
        if level == "high":
            level = "medium"
        elif level == "medium":
            level = "experimental"
        signal_note = f" Bu bolgede sinyal event sayisi dusuk ({int(signal_event_count)})."

    metrics_note = ""
    if uses_legacy_backtest:
        if level == "high":
            level = "medium"
        metrics_note = " Backtest kaydinda yeni precision/recall metrikleri yok; kalite yorumu daha temkinli tutuldu."

    if level == "high":
        summary = "Model kalibrasyon ve backtest metriklerinde guclu gorunuyor; yine de sonuc kesin zaman tahmini degil, kisa vadeli bolgesel olasilik sinyalidir."
    elif level == "medium":
        summary = "Model kullanilabilir bir risk sinyali uretiyor ancak hata payi belirgin; karar verirken resmi uyarilarla birlikte yorumlanmali."
    else:
        summary = "Model halen deneysel seviyede; cikti yalnizca destekleyici risk gostergesi olarak kullanilmali."

    summary += signal_note
    summary += metrics_note

    return {
        "available": True,
        "quality_level": level,
        "quality_label": _quality_label(level),
        "quality_score": float(round(quality_score, 4)),
        "trained_at": model_data.get("trained_at"),
        "model_type": model_data.get("model_type", MODEL_TYPE),
        "summary": summary,
        "metrics": {
            "roc_auc_mean": roc_auc,
            "pr_auc_mean": pr_auc,
            "brier_mean": brier,
            "samples": int(metrics.get("samples", 0) or 0),
            "positive_rate": _optional_float(metrics.get("positive_rate"), min_value=0.0, max_value=1.0),
            "folds": int(metrics.get("folds", 0) or 0),
        },
        "backtest": {
            "hit_rate": hit_rate,
            "accuracy": accuracy,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "balanced_accuracy": balanced_accuracy,
            "positive_rate": positive_rate,
            "alarm_rate": _optional_float(backtest.get("alarm_rate"), min_value=0.0, max_value=1.0),
            "top_decile_precision": top_decile_precision,
            "top_decile_recall": top_decile_recall,
            "samples": int(backtest.get("samples", 0) or 0),
            "threshold": _optional_float(backtest.get("threshold"), min_value=0.0, max_value=1.0),
            "mean_prob": _optional_float(backtest.get("mean_prob"), min_value=0.0, max_value=1.0),
            "hit_rate_definition": hit_rate_definition,
            "legacy": bool(uses_legacy_backtest),
        },
        "signal_event_count": int(signal_event_count or 0),
    }


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


def _build_fast_signal_bundle(features: dict) -> dict:
    recent_6h = int(features.get("recent_6h_count", 0) or 0)
    recent_24h = int(features.get("recent_24h_count", 0) or 0)
    count = int(features.get("count", 0) or 0)
    swarm_ratio = _clamp01(float(features.get("swarm_ratio", 0.0) or 0.0))
    fault_score = _clamp01(float(features.get("fault_proximity_score", 0.0) or 0.0))
    stress_score = _clamp01(float(features.get("stress_transfer", 0.0) or 0.0))
    density_score = _clamp01(float(features.get("spatial_density", 0.0) or 0.0) / 6.0)
    max_mag_score = _clamp01(float(features.get("max_mag", 0.0) or 0.0) / 6.0)
    mag_trend_score = _clamp01((float(features.get("mag_trend", 0.0) or 0.0) + 2.0) / 4.0)

    signal_event_count = max(recent_24h, min(count, 24))
    cluster_score = _clamp01(0.50 * swarm_ratio + 0.25 * _clamp01(recent_6h / 8.0) + 0.25 * density_score)
    b_value = float(max(0.7, min(1.3, 1.18 - 0.18 * _clamp01(signal_event_count / 18.0) - 0.08 * max_mag_score)))
    b_risk = _clamp01(1.2 - b_value)
    lstm_prob = _clamp01(0.55 * swarm_ratio + 0.25 * _clamp01(recent_6h / 10.0) + 0.20 * mag_trend_score)
    gnn_prob = _clamp01(0.45 * fault_score + 0.30 * stress_score + 0.25 * density_score)

    return {
        "cluster_score": float(cluster_score),
        "b_value": float(b_value),
        "b_risk": float(b_risk),
        "lstm_probability": float(lstm_prob),
        "gnn_probability": float(gnn_prob),
        "signal_event_count": int(signal_event_count),
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
        probability, _ = _safe_predict_probability(m5_model, X)
        predictions["m5_72h_probability"] = float(probability or 0.0)

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


def _heuristic_prediction(
    model_data: dict | None,
    feats: dict,
    signals: dict,
    etas_prob: float,
    locality_score: float,
    runtime_issue: str | None = None,
) -> dict:
    model_health = build_model_health(
        model_data,
        signal_event_count=signals["signal_event_count"],
        runtime_compatible=False if runtime_issue else None,
        runtime_issue=runtime_issue,
    )
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
        "model_health": model_health,
        "features": feats,
        "top_features": [],
        "model_type": "forecast_runtime_fallback" if runtime_issue else "no_forecast_model",
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


def predict_with_model_data(
    model_data: dict | None,
    events: list,
    lat: float,
    lon: float,
    time_window_hours: int = 48,
    explain: bool = False,
    fast_mode: bool = False,
) -> dict:
    feats = extract_features(events, lat, lon, time_window_hours=time_window_hours)
    X = np.array([[feats.get(key, 0) for key in FEATURE_ORDER]], dtype=np.float64)
    signals = _build_fast_signal_bundle(feats) if fast_mode else _build_signal_bundle(events, lat, lon)
    etas_prob = float(etas_like_score(feats))
    locality_score = _locality_score(feats, signals)

    if not model_data or "model" not in model_data:
        return _heuristic_prediction(model_data, feats, signals, etas_prob, locality_score)

    ml_prob, runtime_issue = _safe_predict_probability(model_data.get("model"), X)
    if ml_prob is None:
        return _heuristic_prediction(
            model_data,
            feats,
            signals,
            etas_prob,
            locality_score,
            runtime_issue=runtime_issue,
        )

    aux_predictions = _predict_auxiliary_targets(model_data, X)
    weights = _dynamic_weights(feats)
    model_health = build_model_health(
        model_data,
        signal_event_count=signals["signal_event_count"],
        runtime_compatible=True,
    )

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
        "model_health": model_health,
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
