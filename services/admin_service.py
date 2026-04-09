import logging
import os
import sqlite3

from config import DATA_DIR, EARTHQUAKE_HISTORY_FILE, FORECAST_MODEL
from forecast.predictor import load_model
from services.model_artifact_service import load_forecast_metadata
from services.mobile_social_db import DB_PATH, init_mobile_db

LOGGER = logging.getLogger(__name__)
LOG_DIR = os.path.join(DATA_DIR, "logs")
LOG_FILE = os.path.join(LOG_DIR, "deprem_analiz.log")


def _scalar(db: sqlite3.Connection, query: str, params=()):
    row = db.execute(query, params).fetchone()
    if not row:
        return 0
    if isinstance(row, sqlite3.Row):
        return list(dict(row).values())[0]
    return row[0]


def dashboard_snapshot() -> dict:
    init_mobile_db()
    os.makedirs(LOG_DIR, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        counts = {
            "users": int(_scalar(db, "SELECT COUNT(*) FROM mobile_users")),
            "messages": int(_scalar(db, "SELECT COUNT(*) FROM mobile_messages")),
            "alerts": int(_scalar(db, "SELECT COUNT(*) FROM mobile_alert_log")),
            "risk_predictions": int(_scalar(db, "SELECT COUNT(*) FROM risk_predictions")),
            "earthquake_records": int(_scalar(db, "SELECT COUNT(*) FROM earthquake_records")),
            "notifications": int(_scalar(db, "SELECT COUNT(*) FROM notification_history")),
            "devices": int(_scalar(db, "SELECT COUNT(*) FROM mobile_devices")),
        }
        recent_notifications = [
            dict(row)
            for row in db.execute(
                """
                SELECT id, username, target_username, event_key, category, status, created_at
                FROM notification_history
                ORDER BY id DESC
                LIMIT 20
                """
            ).fetchall()
        ]
        recent_predictions = [
            dict(row)
            for row in db.execute(
                """
                SELECT id, scope, subject_key, risk_score, probability, confidence, alert_level, model_version, created_at
                FROM risk_predictions
                ORDER BY id DESC
                LIMIT 20
                """
            ).fetchall()
        ]

    model = load_model()
    metadata = load_forecast_metadata()
    file_status = {
        "earthquake_history_exists": os.path.exists(EARTHQUAKE_HISTORY_FILE),
        "forecast_model_exists": os.path.exists(FORECAST_MODEL),
        "log_file_exists": os.path.exists(LOG_FILE),
        "db_exists": os.path.exists(DB_PATH),
    }

    return {
        "counts": counts,
        "recent_notifications": recent_notifications,
        "recent_predictions": recent_predictions,
        "model": {
            "version": metadata.get("version"),
            "trained_at": metadata.get("trained_at") or (model.get("trained_at") if model else None),
            "model_type": model.get("model_type") if model else metadata.get("model_type"),
            "metrics": (model or {}).get("metrics", {}),
            "backtest": (model or {}).get("backtest", {}),
        },
        "files": file_status,
        "paths": {
            "db": DB_PATH,
            "log_file": LOG_FILE,
            "model": FORECAST_MODEL,
        },
    }


def notification_history(limit: int = 50) -> list[dict]:
    init_mobile_db()
    with sqlite3.connect(DB_PATH) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute(
            """
            SELECT id, username, target_username, event_key, category, status, payload_json, created_at
            FROM notification_history
            ORDER BY id DESC
            LIMIT ?
            """,
            (max(1, min(limit, 200)),),
        ).fetchall()
    return [dict(row) for row in rows]


def tail_logs(limit: int = 120) -> list[str]:
    os.makedirs(LOG_DIR, exist_ok=True)
    if not os.path.exists(LOG_FILE):
        return []
    with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()
    return [line.rstrip("\n") for line in lines[-max(1, min(limit, 500)) :]]
