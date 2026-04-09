import os
import pickle

from flask import Blueprint

from app.responses import error_response, success_response
from config import FORECAST_MODEL

metrics_bp = Blueprint("metrics", __name__)


def _load_model_data():
    if not os.path.exists(FORECAST_MODEL):
        return None

    with open(FORECAST_MODEL, "rb") as f:
        return pickle.load(f)


@metrics_bp.route("/api/v2/forecast-metrics", methods=["GET"])
def forecast_metrics_v2():
    try:
        data = _load_model_data()
        if data is None:
            return error_response(
                "Forecast modeli bulunamadi.",
                code="MODEL_NOT_FOUND",
                http_status=404,
                payload={
                    "metrics": {},
                    "targets": {},
                    "feature_importance": [],
                },
                status="no_model",
            )

        return success_response(
            {
                "trained_at": data.get("trained_at"),
                "model_type": data.get("model_type", "forecast_hybrid_v3_timeseriescv"),
                "feature_order": data.get("feature_order", []),
                "metrics": data.get("metrics", {}),
                "targets": data.get("targets", {}),
                "calibration": data.get("calibration", {}),
                "backtest": data.get("backtest", {}),
                "feature_importance": data.get("feature_importance", []),
            }
        )
    except Exception as e:
        return error_response(str(e), code="FORECAST_METRICS_FAILED", http_status=500)


@metrics_bp.route("/api/v2/feature-importance", methods=["GET"])
def feature_importance_v2():
    try:
        data = _load_model_data()
        if data is None:
            return error_response(
                "Forecast modeli bulunamadi.",
                code="MODEL_NOT_FOUND",
                http_status=404,
                payload={"items": []},
                status="no_model",
            )

        return success_response(
            {
                "model_type": data.get("model_type", "forecast_hybrid_v3_timeseriescv"),
                "items": data.get("feature_importance", []),
            }
        )
    except Exception as e:
        return error_response(
            str(e),
            code="FEATURE_IMPORTANCE_FAILED",
            http_status=500,
            payload={"items": []},
        )


@metrics_bp.route("/api/v2/backtest", methods=["GET"])
def backtest_v2():
    try:
        data = _load_model_data()
        if data is None:
            return error_response(
                "Forecast modeli bulunamadi.",
                code="MODEL_NOT_FOUND",
                http_status=404,
                payload={"backtest": {}},
                status="no_model",
            )

        return success_response(
            {
                "model_type": data.get("model_type", "forecast_hybrid_v3_timeseriescv"),
                "backtest": data.get("backtest", {}),
            }
        )
    except Exception as e:
        return error_response(
            str(e),
            code="BACKTEST_FAILED",
            http_status=500,
            payload={"backtest": {}},
        )
