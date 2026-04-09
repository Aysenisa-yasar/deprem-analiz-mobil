import time
from threading import Lock

from flask import Blueprint, request

from app.responses import error_response, success_response
from constants.turkey_cities import TURKEY_CITIES
from forecast.predictor import load_model
from services.anomaly_service import anomaly_score_from_features
from services.data_service import load_events
from services.forecast_service import (
    forecast_city,
    forecast_point,
    get_forecast_model_health,
    get_warning_capability,
)
from services.grid_forecast_service import forecast_grid
from services.model_artifact_service import load_forecast_metadata
from services.mobile_social_db import record_earthquake_events, record_risk_predictions

forecast_bp = Blueprint("forecast", __name__)

MODEL_TYPE = "forecast_hybrid_v3_timeseriescv"
_RESPONSE_CACHE: dict[str, dict] = {}
_CACHE_LOCK = Lock()
_MAP_TTL_SEC = 180
_GRID_TTL_SEC = 300
_LOCATION_TTL_SEC = 120
_RECENT_TTL_SEC = 60


def _cache_get(key: str, ttl_sec: int):
    now = time.time()
    with _CACHE_LOCK:
        entry = _RESPONSE_CACHE.get(key)
        if not entry:
            return None
        if (now - entry["timestamp"]) > ttl_sec:
            _RESPONSE_CACHE.pop(key, None)
            return None
        return entry["payload"]


def _cache_set(key: str, payload: dict):
    with _CACHE_LOCK:
        _RESPONSE_CACHE[key] = {"timestamp": time.time(), "payload": payload}


def _risk_level(risk_score: float) -> str:
    if risk_score >= 5.5:
        return "Yuksek"
    if risk_score >= 3.5:
        return "Orta"
    return "Dusuk"


def _build_point_payload(name: str, lat: float, lon: float, pred: dict, anomaly_value: float) -> dict:
    return {
        "city": name,
        "lat": lat,
        "lon": lon,
        "region": pred.get("region"),
        "risk_score": pred["risk_score"],
        "confidence": pred.get("confidence", 0.0),
        "probability": pred["probability"],
        "time_windows": pred.get("time_windows", {}),
        "ml_probability": pred["ml_probability"],
        "etas_probability": pred["etas_probability"],
        "lstm_probability": pred.get("lstm_probability", 0.0),
        "cluster_score": pred.get("cluster_score", 0.0),
        "b_value": pred.get("b_value", 1.0),
        "b_risk": pred.get("b_risk", 0.0),
        "gnn_probability": pred.get("gnn_probability", 0.0),
        "m5_72h_probability": pred.get("m5_72h_probability", 0.0),
        "max_mag_7d_prediction": pred.get("max_mag_7d_prediction", 0.0),
        "time_to_next_event_hours_prediction": pred.get("time_to_next_event_hours_prediction"),
        "next_event_distance_km_prediction": pred.get("next_event_distance_km_prediction"),
        "next_event_magnitude_prediction": pred.get("next_event_magnitude_prediction"),
        "next_event_time_window": pred.get("next_event_time_window"),
        "locality_score": pred.get("locality_score", 0.0),
        "risk_level": _risk_level(pred["risk_score"]),
        "anomaly_score": round(anomaly_value, 2),
        "anomaly_detected": anomaly_value > 0.5,
        "top_features": pred.get("top_features", []),
        "features": pred.get("features", {}),
        "ensemble_weights": pred.get("ensemble_weights", {}),
        "signal_event_count": pred.get("signal_event_count", 0),
        "model_type": pred.get("model_type", MODEL_TYPE),
        "fault_distance": pred.get("fault_distance", 999.0),
        "fault_proximity_score": pred.get("fault_proximity_score", 0.0),
        "stress_transfer": pred.get("stress_transfer", 0.0),
        "energy_release": pred.get("energy_release", 0.0),
        "foreshock_count": pred.get("foreshock_count", 0),
        "spatial_density": pred.get("spatial_density", 0.0),
        "mag_trend": pred.get("mag_trend", 0.0),
        "depth_variance": pred.get("depth_variance", 0.0),
        "nearest_fault_segment": pred.get("nearest_fault_segment", "unknown"),
        "model_health": pred.get("model_health", {}),
        "warning_capability": pred.get("warning_capability", {}),
        "alert_advisory": pred.get("alert_advisory", {}),
        "explanation_summary": pred.get("explanation_summary"),
    }


def _build_city_points(events: list, model_data: dict | None) -> list[dict]:
    points = []
    for name, city in TURKEY_CITIES.items():
        try:
            pred = forecast_city(events, city, explain=False, model_data=model_data, fast_mode=True)
        except Exception:
            pred = forecast_city(events, city, explain=False, model_data={}, fast_mode=True)
        anomaly_value = anomaly_score_from_features(pred.get("features"))
        points.append(_build_point_payload(name, city["lat"], city["lon"], pred, anomaly_value))
    return points


def _fallback_map_payload(events: list, metadata: dict | None = None) -> dict:
    metadata = metadata or {}
    model_data: dict = {}
    points = _build_city_points(events, model_data)
    return {
        "status": "success",
        "version": metadata.get("version"),
        "model_type": "forecast_runtime_fallback",
        "trained_at": metadata.get("trained_at"),
        "analysis_window": "past_48h",
        "degraded": True,
        "model_health": get_forecast_model_health(model_data),
        "warning_capability": get_warning_capability(model_data),
        "points": points,
    }


def _fallback_location_payload(events: list, lat: float, lon: float, metadata: dict | None = None) -> dict:
    metadata = metadata or {}
    model_data: dict = {}
    pred = forecast_point(events, lat, lon, explain=False, model_data=model_data, fast_mode=True)
    anomaly_value = anomaly_score_from_features(pred.get("features"))
    point = _build_point_payload("Bulundugun konum", lat, lon, pred, anomaly_value)
    return {
        "status": "success",
        "version": metadata.get("version"),
        "model_type": "forecast_runtime_fallback",
        "trained_at": metadata.get("trained_at"),
        "analysis_window": "past_48h",
        "degraded": True,
        "model_health": get_forecast_model_health(model_data),
        "warning_capability": get_warning_capability(model_data),
        "point": point,
    }


@forecast_bp.route("/api/v2/forecast-map", methods=["GET"])
def forecast_map_v2():
    try:
        cached = _cache_get("forecast-map", _MAP_TTL_SEC)
        if cached is not None:
            return success_response(cached, message="Forecast map cache")

        events = load_events()
        record_earthquake_events(events, source="forecast_map")
        model_data = load_model()
        metadata = load_forecast_metadata()
        model_health = get_forecast_model_health(model_data)
        points = _build_city_points(events, model_data)

        payload = {
            "status": "success",
            "version": metadata.get("version"),
            "model_type": (model_data or {}).get("model_type", MODEL_TYPE) if model_health.get("available") else "forecast_runtime_fallback",
            "trained_at": metadata.get("trained_at") or (model_data or {}).get("trained_at"),
            "analysis_window": "past_48h",
            "degraded": not bool(model_health.get("available")),
            "model_health": model_health,
            "warning_capability": get_warning_capability(model_data),
            "points": points,
        }
        record_risk_predictions("forecast_map", points, model_version=MODEL_TYPE)
        _cache_set("forecast-map", payload)
        return success_response(payload)
    except Exception as exc:
        try:
            metadata = load_forecast_metadata()
            payload = _fallback_map_payload(load_events(), metadata)
            _cache_set("forecast-map", payload)
            return success_response(
                payload,
                message="Forecast fallback mode",
            )
        except Exception:
            pass
        return error_response(
            str(exc),
            code="FORECAST_MAP_FAILED",
            http_status=500,
            payload={
                "points": [],
                "model_health": {},
                "warning_capability": {},
            },
        )


@forecast_bp.route("/api/v2/forecast-grid", methods=["GET"])
def forecast_grid_v2():
    try:
        horizon_hours = int(request.args.get("hours", 24) or 24)
        horizon_hours = 6 if horizon_hours <= 6 else 72 if horizon_hours >= 72 else 24
        cached = _cache_get("forecast-grid", _GRID_TTL_SEC)
        if cached is not None and cached.get("horizon_hours") == horizon_hours:
            return success_response(cached, message="Forecast grid cache")

        events = load_events()
        record_earthquake_events(events, source="forecast_grid")
        metadata = load_forecast_metadata()
        points = forecast_grid(events, step=0.75, horizon_hours=horizon_hours)
        payload = {
            "status": "success",
            "version": metadata.get("version"),
            "model_type": MODEL_TYPE,
            "trained_at": metadata.get("trained_at"),
            "grid_step": 0.75,
            "horizon_hours": horizon_hours,
            "points": points,
        }
        record_risk_predictions("forecast_grid", points, model_version=MODEL_TYPE)
        _cache_set("forecast-grid", payload)
        return success_response(payload)
    except Exception as exc:
        return error_response(
            str(exc),
            code="FORECAST_GRID_FAILED",
            http_status=500,
            payload={"points": []},
        )


@forecast_bp.route("/api/v2/forecast-model-status", methods=["GET"])
def forecast_model_status_v2():
    try:
        model_data = load_model()
        metadata = load_forecast_metadata()
        return success_response(
            {
                "version": metadata.get("version"),
                "model_type": MODEL_TYPE,
                "trained_at": metadata.get("trained_at") or (model_data or {}).get("trained_at"),
                "model_health": get_forecast_model_health(model_data),
                "warning_capability": get_warning_capability(model_data),
            }
        )
    except Exception as exc:
        return error_response(
            str(exc),
            code="FORECAST_MODEL_STATUS_FAILED",
            http_status=500,
            payload={
                "model_health": {},
                "warning_capability": {},
            },
        )


@forecast_bp.route("/api/v2/forecast-location", methods=["GET"])
def forecast_location_v2():
    try:
        lat = float(request.args.get("lat"))
        lon = float(request.args.get("lon"))
    except (TypeError, ValueError):
        return error_response(
            "Gecerli lat/lon gerekli",
            code="INVALID_COORDINATES",
            http_status=400,
        )

    try:
        cache_key = f"forecast-location:{lat:.3f}:{lon:.3f}"
        cached = _cache_get(cache_key, _LOCATION_TTL_SEC)
        if cached is not None:
            return success_response(cached, message="Forecast location cache")

        events = load_events()
        record_earthquake_events(events, source="forecast_location")
        model_data = load_model()
        metadata = load_forecast_metadata()
        model_health = get_forecast_model_health(model_data)
        pred = forecast_point(events, lat, lon, explain=False, model_data=model_data)
        anomaly_value = anomaly_score_from_features(pred.get("features"))
        point = _build_point_payload("Bulundugun konum", lat, lon, pred, anomaly_value)
        payload = {
            "status": "success",
            "version": metadata.get("version"),
            "model_type": (model_data or {}).get("model_type", MODEL_TYPE) if model_health.get("available") else "forecast_runtime_fallback",
            "trained_at": metadata.get("trained_at") or (model_data or {}).get("trained_at"),
            "analysis_window": "past_48h",
            "degraded": not bool(model_health.get("available")),
            "model_health": model_health,
            "warning_capability": get_warning_capability(model_data),
            "point": point,
        }
        record_risk_predictions("forecast_location", [point], model_version=MODEL_TYPE)
        _cache_set(cache_key, payload)
        return success_response(payload)
    except Exception as exc:
        try:
            metadata = load_forecast_metadata()
            payload = _fallback_location_payload(load_events(), lat, lon, metadata)
            _cache_set(cache_key, payload)
            return success_response(
                payload,
                message="Forecast location fallback mode",
            )
        except Exception:
            pass
        return error_response(
            str(exc),
            code="FORECAST_LOCATION_FAILED",
            http_status=500,
            payload={
                "point": {},
                "model_health": {},
                "warning_capability": {},
            },
        )


@forecast_bp.route("/api/v2/recent-earthquakes", methods=["GET"])
def recent_earthquakes_v2():
    try:
        limit = min(max(1, int(request.args.get("limit", 80) or 80)), 200)
        cache_key = f"recent-earthquakes:{limit}"
        cached = _cache_get(cache_key, _RECENT_TTL_SEC)
        if cached is not None:
            return success_response(cached, message="Recent earthquakes cache")

        events = load_events()
        sorted_events = sorted(events, key=lambda event: -event["timestamp"])
        record_earthquake_events(sorted_events[:limit], source="recent_earthquakes")
        out = []
        for event in sorted_events[:limit]:
            event_key = (
                f"{event['lat']:.4f}_{event['lon']:.4f}_{int(event['timestamp'])}_{event['mag']:.1f}"
            )
            out.append(
                {
                    "lat": event["lat"],
                    "lon": event["lon"],
                    "mag": event["mag"],
                    "depth": event["depth"],
                    "timestamp": event["timestamp"],
                    "event_key": event_key,
                }
            )

        payload = {"status": "success", "events": out}
        _cache_set(cache_key, payload)
        return success_response(payload)
    except Exception as exc:
        return error_response(
            str(exc),
            code="RECENT_EARTHQUAKES_FAILED",
            http_status=500,
            payload={"events": []},
        )
