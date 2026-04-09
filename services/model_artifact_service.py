import json
import os
from typing import Any

from config import FORECAST_MODEL


def forecast_metadata_path() -> str:
    return os.path.join(os.path.dirname(FORECAST_MODEL), "forecast_latest.json")


def load_forecast_metadata() -> dict[str, Any]:
    path = forecast_metadata_path()
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}
