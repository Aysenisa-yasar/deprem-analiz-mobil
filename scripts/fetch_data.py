import json
import os

from config import DATA_DIR
from services.data_service import load_events


def main():
    events = load_events(use_api=True, use_file_fallback=True)
    os.makedirs(DATA_DIR, exist_ok=True)
    output_path = os.path.join(DATA_DIR, "fused_events.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(events, f, ensure_ascii=False, indent=2)
    print(f"[fetch_data] {len(events)} event yazildi: {output_path}")


if __name__ == "__main__":
    main()
