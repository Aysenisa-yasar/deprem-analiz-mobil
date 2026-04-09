import json
import os

from config import DATA_DIR
from forecast.features import extract_features
from services.data_service import load_events


def main():
    events = load_events(use_api=False, use_file_fallback=True)
    if not events:
        raise SystemExit("Feature olusturmak icin event bulunamadi")
    latest = events[-1]
    features = extract_features(events, latest["lat"], latest["lon"])
    os.makedirs(DATA_DIR, exist_ok=True)
    output_path = os.path.join(DATA_DIR, "feature_preview.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(features, f, ensure_ascii=False, indent=2)
    print(f"[build_features] Feature preview yazildi: {output_path}")


if __name__ == "__main__":
    main()
