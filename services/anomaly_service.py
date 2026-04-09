# services/anomaly_service.py - Anomali skoru (swarm + recency_energy dahil)
from forecast.features import extract_features


def anomaly_score_from_features(feats: dict | None) -> float:
    if not feats or feats.get("count", 0) == 0:
        return 0.0
    score = 0.0
    if feats.get("count", 0) > 10:
        score += 0.20
    if feats.get("max_mag", 0) >= 4.0:
        score += 0.25
    if feats.get("min_distance", 999) < 50:
        score += 0.20
    if feats.get("swarm_ratio", 0) > 0.5:
        score += 0.20
    if feats.get("recency_energy", 0) > 6:
        score += 0.15
    return min(1.0, score)


def anomaly_score(events: list, lat: float, lon: float, time_window_hours: int = 48) -> float:
    feats = extract_features(events, lat, lon, time_window_hours=time_window_hours)
    return anomaly_score_from_features(feats)
