from flask import Blueprint, jsonify, request

from constants.turkey_cities import TURKEY_CITIES
from forecast.predictor import load_model
from services.anomaly_service import anomaly_score
from services.data_service import load_events
from services.forecast_service import (
    forecast_city,
    forecast_point,
    get_forecast_model_health,
)
from services.grid_forecast_service import forecast_grid

forecast_bp = Blueprint("forecast", __name__)

MODEL_TYPE = "forecast_hybrid_v3_timeseriescv"


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
        "risk_score": pred["risk_score"],
        "probability": pred["probability"],
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
    }


@forecast_bp.route("/api/v2/forecast-map", methods=["GET"])
def forecast_map_v2():
    try:
        events = load_events()
        model_data = load_model()
        model_health = get_forecast_model_health(model_data)
        points = []
        for name, city in TURKEY_CITIES.items():
            pred = forecast_city(events, city, explain=True, model_data=model_data)
            anomaly_value = anomaly_score(events, city["lat"], city["lon"])
            points.append(_build_point_payload(name, city["lat"], city["lon"], pred, anomaly_value))
        return jsonify(
            {
                "status": "success",
                "model_type": MODEL_TYPE,
                "analysis_window": "past_48h",
                "model_health": model_health,
                "points": points,
            }
        )
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc), "points": []}), 500


@forecast_bp.route("/api/v2/forecast-grid", methods=["GET"])
def forecast_grid_v2():
    try:
        events = load_events()
        points = forecast_grid(events, step=0.5)
        return jsonify(
            {
                "status": "success",
                "model_type": MODEL_TYPE,
                "grid_step": 0.5,
                "points": points,
            }
        )
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc), "points": []}), 500


@forecast_bp.route("/api/v2/forecast-model-status", methods=["GET"])
def forecast_model_status_v2():
    try:
        model_data = load_model()
        return jsonify(
            {
                "status": "success",
                "model_type": MODEL_TYPE,
                "model_health": get_forecast_model_health(model_data),
            }
        )
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc), "model_health": {}}), 500


@forecast_bp.route("/api/v2/forecast-location", methods=["GET"])
def forecast_location_v2():
    try:
        lat = float(request.args.get("lat"))
        lon = float(request.args.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Gecerli lat/lon gerekli"}), 400

    try:
        events = load_events()
        model_data = load_model()
        pred = forecast_point(events, lat, lon, explain=True, model_data=model_data)
        anomaly_value = anomaly_score(events, lat, lon)
        point = _build_point_payload("Bulundugun konum", lat, lon, pred, anomaly_value)
        return jsonify(
            {
                "status": "success",
                "model_type": MODEL_TYPE,
                "analysis_window": "past_48h",
                "model_health": get_forecast_model_health(model_data),
                "point": point,
            }
        )
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc), "point": {}}), 500


@forecast_bp.route("/api/v2/recent-earthquakes", methods=["GET"])
def recent_earthquakes_v2():
    """Recent earthquakes for mobile clients."""
    try:
        events = load_events()
        sorted_events = sorted(events, key=lambda event: -event["timestamp"])
        limit = min(max(1, int(request.args.get("limit", 80) or 80)), 200)
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
        return jsonify({"status": "success", "events": out})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc), "events": []}), 500
