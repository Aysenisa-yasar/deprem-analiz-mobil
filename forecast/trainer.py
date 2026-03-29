import os
import sys
import pickle
from datetime import datetime

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import average_precision_score, brier_score_loss, mean_absolute_error, mean_squared_error, roc_auc_score
from sklearn.model_selection import TimeSeriesSplit
from xgboost import XGBClassifier, XGBRegressor

# Proje kokunu path'e ekle (python forecast/trainer.py ile calistirildiginda config bulunsun)
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _root not in sys.path:
    sys.path.insert(0, _root)

from config import EARTHQUAKE_HISTORY_FILE, FORECAST_MODEL
from forecast.backtest import rolling_backtest
from forecast.calibration import compute_calibration
from forecast.explain import global_feature_importance
from forecast.features import extract_features
from forecast.multi_targets import build_multi_targets
from forecast.predictor import FEATURE_ORDER, predict_with_model_data
from services.data_service import load_events_from_file


MODEL_TYPE = "forecast_hybrid_v3_timeseriescv"
NEXT_EVENT_HORIZON_HOURS = 168.0


def _events_sorted(events: list) -> list:
    return sorted(
        [event for event in events if (event.get("timestamp") or 0) > 0],
        key=lambda event: float(event.get("timestamp") or 0),
    )


def _build_classifier(scale_pos_weight: float) -> CalibratedClassifierCV:
    clf = XGBClassifier(
        n_estimators=250,
        max_depth=5,
        learning_rate=0.05,
        scale_pos_weight=scale_pos_weight,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=42,
        eval_metric="logloss",
    )
    return CalibratedClassifierCV(clf, method="sigmoid", cv=3)


def _build_regressor() -> XGBRegressor:
    return XGBRegressor(
        n_estimators=250,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=42,
        objective="reg:squarederror",
    )


def _train_classifier(X: np.ndarray, y: np.ndarray):
    if len(np.unique(y)) < 2:
        return None

    pos = max(1, int(np.sum(y == 1)))
    neg = max(1, int(np.sum(y == 0)))
    if min(pos, neg) < 2:
        return None

    model = _build_classifier(neg / pos)
    try:
        model.fit(X, y)
    except Exception:
        return None
    return model


def _train_regressor(X: np.ndarray, y: np.ndarray):
    model = _build_regressor()
    try:
        model.fit(X, y)
    except Exception:
        return None
    return model


def _train_regressor_with_mask(X: np.ndarray, y: np.ndarray):
    mask = np.isfinite(y)
    if int(np.sum(mask)) < 2:
        return None
    return _train_regressor(X[mask], y[mask])


def _evaluate_regression_fold(X_train, X_test, y_train, y_test):
    train_mask = np.isfinite(y_train)
    test_mask = np.isfinite(y_test)
    if int(np.sum(train_mask)) < 2 or int(np.sum(test_mask)) < 1:
        return None

    model = _train_regressor(X_train[train_mask], y_train[train_mask])
    if model is None:
        return None

    truth = y_test[test_mask]
    pred = model.predict(X_test[test_mask])
    return {
        "rmse": float(np.sqrt(mean_squared_error(truth, pred))),
        "mae": float(mean_absolute_error(truth, pred)),
    }


def _mean_or_none(values):
    if not values:
        return None
    return float(np.mean(values))


def _nanmean_or_none(values: np.ndarray):
    mask = np.isfinite(values)
    if not np.any(mask):
        return None
    return float(np.mean(values[mask]))


def train_forecast(events: list, time_window_hours: int = 48) -> dict:
    sorted_events = _events_sorted(events)
    if len(sorted_events) < 200:
        raise ValueError("En az 200 event gerekli.")

    X = []
    y_m4 = []
    y_m5 = []
    y_max_mag = []
    y_time_to_next_event = []
    y_next_event_distance = []
    y_next_event_magnitude = []
    y_next_event_within_7d = []

    for index in range(100, len(sorted_events) - 100):
        ref = sorted_events[index]
        ref_ts = float(ref.get("timestamp") or 0)
        lat = float(ref.get("lat", 0) or 0)
        lon = float(ref.get("lon", 0) or 0)

        past = sorted_events[: index + 1]
        feats = extract_features(past, lat, lon, time_window_hours=time_window_hours)
        X.append([feats.get(key, 0) for key in FEATURE_ORDER])

        targets = build_multi_targets(sorted_events, lat, lon, ref_ts)
        y_m4.append(int(targets["m4_24h"]))
        y_m5.append(int(targets["m5_72h"]))
        y_max_mag.append(float(targets["max_mag_7d"]))
        y_next_event_within_7d.append(int(targets["next_event_within_7d"]))
        y_time_to_next_event.append(
            float(targets["time_to_next_event_hours"])
            if targets["time_to_next_event_hours"] is not None else np.nan
        )
        y_next_event_distance.append(
            float(targets["next_event_distance_km"])
            if targets["next_event_distance_km"] is not None else np.nan
        )
        y_next_event_magnitude.append(
            float(targets["next_event_magnitude"])
            if targets["next_event_magnitude"] is not None else np.nan
        )

    X = np.array(X, dtype=np.float64)
    y_m4 = np.array(y_m4, dtype=np.int32)
    y_m5 = np.array(y_m5, dtype=np.int32)
    y_max_mag = np.array(y_max_mag, dtype=np.float64)
    y_time_to_next_event = np.array(y_time_to_next_event, dtype=np.float64)
    y_next_event_distance = np.array(y_next_event_distance, dtype=np.float64)
    y_next_event_magnitude = np.array(y_next_event_magnitude, dtype=np.float64)
    y_next_event_within_7d = np.array(y_next_event_within_7d, dtype=np.int32)

    if len(X) < 12:
        raise ValueError("TimeSeriesSplit icin yeterli egitim ornegi olusmadi.")
    if len(np.unique(y_m4)) < 2:
        raise ValueError("Primary target tek sinifli kaldi.")

    n_splits = min(5, len(X) - 1)
    if n_splits < 2:
        raise ValueError("TimeSeriesSplit icin en az 2 fold gerekli.")

    tscv = TimeSeriesSplit(n_splits=n_splits)

    roc_scores = []
    pr_scores = []
    brier_scores = []
    time_rmse_scores = []
    time_mae_scores = []
    distance_rmse_scores = []
    distance_mae_scores = []
    magnitude_rmse_scores = []
    magnitude_mae_scores = []
    calibration_y = []
    calibration_prob = []
    last_model = None

    for train_idx, test_idx in tscv.split(X):
        X_train, X_test = X[train_idx], X[test_idx]
        y_train, y_test = y_m4[train_idx], y_m4[test_idx]

        model = _train_classifier(X_train, y_train)
        if model is None:
            continue

        probs = model.predict_proba(X_test)[:, 1]

        roc = roc_auc_score(y_test, probs) if len(np.unique(y_test)) > 1 else 0.0
        pr_auc = average_precision_score(y_test, probs) if len(np.unique(y_test)) > 1 else 0.0
        brier = brier_score_loss(y_test, probs)

        roc_scores.append(float(roc))
        pr_scores.append(float(pr_auc))
        brier_scores.append(float(brier))
        calibration_y.extend(y_test.tolist())
        calibration_prob.extend(probs.tolist())
        last_model = model

        time_metrics = _evaluate_regression_fold(
            X_train, X_test,
            y_time_to_next_event[train_idx], y_time_to_next_event[test_idx],
        )
        if time_metrics:
            time_rmse_scores.append(time_metrics["rmse"])
            time_mae_scores.append(time_metrics["mae"])

        distance_metrics = _evaluate_regression_fold(
            X_train, X_test,
            y_next_event_distance[train_idx], y_next_event_distance[test_idx],
        )
        if distance_metrics:
            distance_rmse_scores.append(distance_metrics["rmse"])
            distance_mae_scores.append(distance_metrics["mae"])

        magnitude_metrics = _evaluate_regression_fold(
            X_train, X_test,
            y_next_event_magnitude[train_idx], y_next_event_magnitude[test_idx],
        )
        if magnitude_metrics:
            magnitude_rmse_scores.append(magnitude_metrics["rmse"])
            magnitude_mae_scores.append(magnitude_metrics["mae"])

    if last_model is None or not roc_scores:
        raise ValueError("TimeSeriesSplit fold'larinda gecerli model egitilemedi.")

    primary_model = _train_classifier(X, y_m4) or last_model
    aux_models = {
        "m5_72h": _train_classifier(X, y_m5),
        "max_mag_7d": _train_regressor(X, y_max_mag),
        "time_to_next_event_hours": _train_regressor_with_mask(X, y_time_to_next_event),
        "next_event_distance_km": _train_regressor_with_mask(X, y_next_event_distance),
        "next_event_magnitude": _train_regressor_with_mask(X, y_next_event_magnitude),
    }

    calibration = compute_calibration(calibration_y, calibration_prob, bins=10)
    feature_importance = global_feature_importance(primary_model, FEATURE_ORDER)

    preview_model_data = {
        "model": primary_model,
        "aux_models": aux_models,
        "model_type": MODEL_TYPE,
        "feature_order": FEATURE_ORDER,
    }
    backtest = rolling_backtest(
        lambda history, lat, lon: predict_with_model_data(
            preview_model_data,
            history,
            lat,
            lon,
            time_window_hours=time_window_hours,
            explain=False,
        ),
        sorted_events,
    )

    model_data = {
        "model": primary_model,
        "aux_models": aux_models,
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "model_type": MODEL_TYPE,
        "feature_order": FEATURE_ORDER,
        "targets": {
            "primary": "m4_24h",
            "auxiliary": [
                "m5_72h",
                "max_mag_7d",
                "time_to_next_event_hours",
                "next_event_distance_km",
                "next_event_magnitude",
            ],
            "radius_km": 100,
            "horizons_hours": {
                "m4_24h": 24,
                "m5_72h": 72,
                "max_mag_7d": 168,
                "time_to_next_event_hours": NEXT_EVENT_HORIZON_HOURS,
            },
            "event_scenario": {
                "conditional_targets": [
                    "time_to_next_event_hours",
                    "next_event_distance_km",
                    "next_event_magnitude",
                ],
                "window_hours": NEXT_EVENT_HORIZON_HOURS,
            },
        },
        "metrics": {
            "roc_auc_mean": float(np.mean(roc_scores)),
            "roc_auc_std": float(np.std(roc_scores)),
            "pr_auc_mean": float(np.mean(pr_scores)),
            "pr_auc_std": float(np.std(pr_scores)),
            "brier_mean": float(np.mean(brier_scores)),
            "brier_std": float(np.std(brier_scores)),
            "samples": int(len(y_m4)),
            "positive_rate": float(np.mean(y_m4)),
            "m5_72h_positive_rate": float(np.mean(y_m5)),
            "max_mag_7d_mean": float(np.mean(y_max_mag)),
            "next_event_within_7d_rate": float(np.mean(y_next_event_within_7d)),
            "time_to_next_event_hours_mean": _nanmean_or_none(y_time_to_next_event),
            "time_to_next_event_hours_rmse_mean": _mean_or_none(time_rmse_scores),
            "time_to_next_event_hours_mae_mean": _mean_or_none(time_mae_scores),
            "next_event_distance_km_mean": _nanmean_or_none(y_next_event_distance),
            "next_event_distance_km_rmse_mean": _mean_or_none(distance_rmse_scores),
            "next_event_distance_km_mae_mean": _mean_or_none(distance_mae_scores),
            "next_event_magnitude_mean": _nanmean_or_none(y_next_event_magnitude),
            "next_event_magnitude_rmse_mean": _mean_or_none(magnitude_rmse_scores),
            "next_event_magnitude_mae_mean": _mean_or_none(magnitude_mae_scores),
            "folds": int(len(roc_scores)),
        },
        "calibration": calibration,
        "backtest": backtest,
        "feature_importance": feature_importance[:10],
    }

    os.makedirs(os.path.dirname(FORECAST_MODEL), exist_ok=True)
    with open(FORECAST_MODEL, "wb") as f:
        pickle.dump(model_data, f)

    print("[forecast] ROC-AUC mean:", model_data["metrics"]["roc_auc_mean"])
    print("[forecast] PR-AUC mean:", model_data["metrics"]["pr_auc_mean"])
    print("[forecast] Brier mean:", model_data["metrics"]["brier_mean"])
    print("[forecast] Backtest hit rate:", model_data["backtest"]["hit_rate"])
    print("[forecast] Model kaydedildi:", FORECAST_MODEL)

    return model_data


if __name__ == "__main__":
    events = load_events_from_file(EARTHQUAKE_HISTORY_FILE)
    if len(events) < 200:
        print("En az 200 event gerekli. earthquake_history.json dolu olmali. Mevcut:", len(events))
    else:
        train_forecast(events)
