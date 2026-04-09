import os
import sqlite3
from datetime import datetime, timezone

from flask import Blueprint

from config import DATA_DIR, EARTHQUAKE_HISTORY_FILE, FORECAST_MODEL
from forecast.predictor import load_model
from services.data_service import load_events_from_file
from services.model_artifact_service import load_forecast_metadata
from services.mobile_social_db import DB_PATH, init_mobile_db

from .responses import error_response, success_response

core_bp = Blueprint("core", __name__)


def _database_health() -> tuple[str, str | None]:
    try:
        init_mobile_db()
        db_dir = os.path.dirname(DB_PATH)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)
        with sqlite3.connect(DB_PATH, timeout=5) as db:
            db.execute("SELECT 1").fetchone()
        return "connected", None
    except Exception as exc:
        return "error", str(exc)


def _model_health() -> dict:
    model_data = load_model()
    metadata = load_forecast_metadata()
    if not model_data:
        return {
            "status": "missing",
            "loaded": False,
            "version": metadata.get("version"),
            "trained_at": metadata.get("trained_at"),
            "model_type": metadata.get("model_type"),
        }
    return {
        "status": "loaded" if "model" in model_data else "metadata_only",
        "loaded": "model" in model_data,
        "version": metadata.get("version"),
        "trained_at": metadata.get("trained_at") or model_data.get("trained_at"),
        "model_type": model_data.get("model_type"),
    }


def _database_counts() -> dict[str, int]:
    init_mobile_db()
    tables = (
        "mobile_users",
        "mobile_messages",
        "earthquake_records",
        "risk_predictions",
        "notification_history",
        "mobile_devices",
    )
    counts: dict[str, int] = {}
    try:
        with sqlite3.connect(DB_PATH, timeout=5) as db:
            for table in tables:
                counts[table] = int(db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    except Exception:
        for table in tables:
            counts.setdefault(table, 0)
    return counts


def _dataset_summary() -> dict:
    try:
        events = load_events_from_file()
    except Exception:
        events = []

    modified_at = None
    try:
        modified_at = datetime.fromtimestamp(
            os.path.getmtime(EARTHQUAKE_HISTORY_FILE),
            tz=timezone.utc,
        ).isoformat()
    except OSError:
        modified_at = None

    return {
        "local_event_count": len(events),
        "catalog_path": EARTHQUAKE_HISTORY_FILE,
        "catalog_modified_at": modified_at,
    }


@core_bp.route("/", methods=["GET"])
def home():
    return success_response(
        {
            "service": "DepremAnaliz API",
            "health": "/api/health",
            "forecast_v2": "/api/v2/forecast-map",
            "recent_quakes": "/api/v2/recent-earthquakes",
            "mobile": "/api/mobile/register/request-code",
        },
        message="DepremAnaliz API",
        status="ok",
    )


@core_bp.route("/api/health", methods=["GET"])
def health():
    database_status, database_error = _database_health()
    model = _model_health()
    metadata = load_forecast_metadata()
    metrics = metadata.get("metrics", {}) if isinstance(metadata, dict) else {}
    backtest = metadata.get("backtest", {}) if isinstance(metadata, dict) else {}
    payload = {
        "service": "DepremAnaliz API",
        "status": "ok" if database_status == "connected" else "degraded",
        "database": database_status,
        "database_error": database_error,
        "model": model["status"],
        "version": model["version"],
        "model_type": model["model_type"],
        "trained_at": model["trained_at"],
        "paths": {
            "data_dir": DATA_DIR,
            "database": DB_PATH,
            "earthquake_history": EARTHQUAKE_HISTORY_FILE,
            "forecast_model": FORECAST_MODEL,
        },
        "startup_checks": {
            "data_dir_exists": os.path.isdir(DATA_DIR),
            "database_exists": os.path.exists(DB_PATH),
            "earthquake_history_exists": os.path.exists(EARTHQUAKE_HISTORY_FILE),
            "forecast_model_exists": os.path.exists(FORECAST_MODEL),
        },
        "dataset": _dataset_summary(),
        "database_counts": _database_counts(),
        "storage": {
            "engine": "sqlite",
            "database_path": DB_PATH,
            "data_dir": DATA_DIR,
            "persistent_data_dir": os.path.isdir(DATA_DIR),
            "wal_mode_expected": True,
        },
        "model_summary": {
            "roc_auc_mean": metrics.get("roc_auc_mean"),
            "pr_auc_mean": metrics.get("pr_auc_mean"),
            "samples": metrics.get("samples"),
            "precision": backtest.get("precision"),
            "recall": backtest.get("recall"),
            "balanced_accuracy": backtest.get("balanced_accuracy"),
        },
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    if database_status != "connected":
        return error_response(
            "Health check degraded",
            code="HEALTH_DEGRADED",
            http_status=503,
            payload=payload,
            status="degraded",
        )
    return success_response(payload, message="Server is awake", status="ok")
