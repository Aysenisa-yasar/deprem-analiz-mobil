import json
import os

from config import DATA_DIR
from services.data_service import _dedup_events, _quality_filter, load_events_from_file


def main():
    events = load_events_from_file()
    cleaned = _dedup_events(_quality_filter(events, min_mag=1.5))
    os.makedirs(DATA_DIR, exist_ok=True)
    output_path = os.path.join(DATA_DIR, "cleaned_events.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, ensure_ascii=False, indent=2)
    print(f"[clean_data] {len(cleaned)} temiz event yazildi: {output_path}")


if __name__ == "__main__":
    main()
