import numpy as np

from forecast.targets import build_binary_target


def _extract_probability(prediction):
    if isinstance(prediction, dict):
        return float(prediction.get("probability", prediction.get("ml_probability", 0.0)))
    return float(prediction)


def _safe_ratio(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return float(numerator / denominator)


def rolling_backtest(
    predict_fn,
    events,
    min_history=200,
    horizon_hours=24,
    radius_km=100,
    min_mag=4.0,
):
    sorted_events = sorted(
        [event for event in events if (event.get("timestamp") or 0) > 0],
        key=lambda event: float(event.get("timestamp") or 0),
    )

    results = []

    for index in range(min_history, len(sorted_events) - 1):
        ref = sorted_events[index]
        ref_ts = float(ref.get("timestamp") or 0)
        if ref_ts <= 0:
            continue

        past = sorted_events[: index + 1]
        prob = _extract_probability(
            predict_fn(
                past,
                float(ref.get("lat", 0) or 0),
                float(ref.get("lon", 0) or 0),
            )
        )

        label = build_binary_target(
            sorted_events,
            float(ref.get("lat", 0) or 0),
            float(ref.get("lon", 0) or 0),
            ref_ts,
            horizon_hours=horizon_hours,
            dist_km=radius_km,
            min_mag=min_mag,
        )
        results.append((prob, label))

    if not results:
        return {
            "mean_prob": 0.0,
            "hit_rate": 0.0,
            "accuracy": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "f1": 0.0,
            "specificity": 0.0,
            "balanced_accuracy": 0.0,
            "positive_rate": 0.0,
            "alarm_rate": 0.0,
            "top_decile_precision": 0.0,
            "top_decile_recall": 0.0,
            "samples": 0,
            "threshold": 0.5,
            "hit_rate_definition": "recall",
        }

    probs = np.array([item[0] for item in results], dtype=np.float64)
    labels = np.array([item[1] for item in results], dtype=np.int32)
    preds = probs >= 0.5

    tp = int(np.sum((preds == 1) & (labels == 1)))
    tn = int(np.sum((preds == 0) & (labels == 0)))
    fp = int(np.sum((preds == 1) & (labels == 0)))
    fn = int(np.sum((preds == 0) & (labels == 1)))

    precision = _safe_ratio(tp, tp + fp)
    recall = _safe_ratio(tp, tp + fn)
    specificity = _safe_ratio(tn, tn + fp)
    f1 = _safe_ratio(2.0 * precision * recall, precision + recall)
    accuracy = float(np.mean(preds == labels))

    top_k = max(1, int(np.ceil(len(probs) * 0.10)))
    top_indices = np.argsort(-probs)[:top_k]
    top_labels = labels[top_indices]
    positive_total = int(np.sum(labels == 1))

    return {
        "mean_prob": float(np.mean(probs)),
        "hit_rate": float(recall),
        "accuracy": accuracy,
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "specificity": float(specificity),
        "balanced_accuracy": float((recall + specificity) / 2.0),
        "positive_rate": float(np.mean(labels)),
        "alarm_rate": float(np.mean(preds)),
        "top_decile_precision": float(np.mean(top_labels)) if len(top_labels) else 0.0,
        "top_decile_recall": _safe_ratio(float(np.sum(top_labels)), float(positive_total)),
        "samples": int(len(results)),
        "threshold": 0.5,
        "hit_rate_definition": "recall",
    }
