from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FILES = [
    ROOT / "models" / "forecast_latest.pkl",
    ROOT / "earthquake_history.json",
]


def main() -> int:
    missing = [path for path in REQUIRED_FILES if not path.exists()]
    if missing:
        print("Render deploy durduruldu. Eksik dosyalar:")
        for path in missing:
            print(f"- {path.relative_to(ROOT)}")
        return 1

    print("Render deploy asset kontrolu basarili.")
    for path in REQUIRED_FILES:
        size_mb = path.stat().st_size / (1024 * 1024)
        print(f"- {path.relative_to(ROOT)} | {size_mb:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
