from forecast.geography import classify_turkey_region
from forecast.grid import generate_turkey_grid
from forecast.predictor import load_model, predict_with_model_data


def _optional_float(value):
    if value is None:
        return None
    return float(value)


def _window_probabilities(pred: dict) -> dict:
    base_probability = float(pred.get("probability", 0.0) or 0.0)
    m5_probability = float(pred.get("m5_72h_probability", 0.0) or 0.0)
    short_window = min(1.0, base_probability * 0.55)
    medium_window = base_probability
    long_window = min(1.0, max(base_probability * 1.18, m5_probability * 1.45))
    return {
        "6h": round(short_window, 4),
        "24h": round(medium_window, 4),
        "72h": round(long_window, 4),
    }


def forecast_grid(events, step=0.5, horizon_hours=24):
    grid = generate_turkey_grid(step=step)
    model_data = load_model()
    results = []
    for p in grid:
        pred = predict_with_model_data(model_data, events, p["lat"], p["lon"], explain=False, fast_mode=True)
        prob = pred["probability"]
        windows = _window_probabilities(pred)
        quality_score = float((pred.get("model_health") or {}).get("quality_score", 0.0) or 0.0)
        selected_probability = windows["24h"]
        if horizon_hours <= 6:
            selected_probability = windows["6h"]
        elif horizon_hours >= 72:
            selected_probability = windows["72h"]
        results.append({
            "id": p["id"],
            "lat": p["lat"],
            "lon": p["lon"],
            "region": p.get("region") or classify_turkey_region(p["lat"], p["lon"]),
            "probability": float(selected_probability),
            "ml_probability": float(pred.get("ml_probability", prob)),
            "etas_probability": float(pred.get("etas_probability", 0.0)),
            "lstm_probability": float(pred.get("lstm_probability", 0.0)),
            "cluster_score": float(pred.get("cluster_score", 0.0)),
            "b_value": float(pred.get("b_value", 1.0)),
            "b_risk": float(pred.get("b_risk", 0.0)),
            "gnn_probability": float(pred.get("gnn_probability", 0.0)),
            "m5_72h_probability": float(pred.get("m5_72h_probability", 0.0)),
            "max_mag_7d_prediction": float(pred.get("max_mag_7d_prediction", 0.0)),
            "time_to_next_event_hours_prediction": _optional_float(pred.get("time_to_next_event_hours_prediction")),
            "next_event_distance_km_prediction": _optional_float(pred.get("next_event_distance_km_prediction")),
            "next_event_magnitude_prediction": _optional_float(pred.get("next_event_magnitude_prediction")),
            "next_event_time_window": pred.get("next_event_time_window"),
            "locality_score": float(pred.get("locality_score", 0.0)),
            "risk_score": float(selected_probability * 10.0),
            "time_windows": windows,
            "confidence": round(quality_score, 4),
            "confidence_opacity": round(min(1.0, max(0.18, quality_score)), 4),
            "top_features": pred.get("top_features", []),
            "features": pred.get("features", {}),
            "ensemble_weights": pred.get("ensemble_weights", {}),
            "signal_event_count": int(pred.get("signal_event_count", 0)),
            "model_type": pred.get("model_type", "forecast_hybrid_v3_timeseriescv"),
            "fault_distance": float(pred.get("fault_distance", 999.0)),
            "fault_proximity_score": float(pred.get("fault_proximity_score", 0.0)),
            "stress_transfer": float(pred.get("stress_transfer", 0.0)),
            "energy_release": float(pred.get("energy_release", 0.0)),
            "foreshock_count": int(pred.get("foreshock_count", 0)),
            "spatial_density": float(pred.get("spatial_density", 0.0)),
            "mag_trend": float(pred.get("mag_trend", 0.0)),
            "depth_variance": float(pred.get("depth_variance", 0.0)),
            "nearest_fault_segment": pred.get("nearest_fault_segment", "unknown"),
        })
    return results
