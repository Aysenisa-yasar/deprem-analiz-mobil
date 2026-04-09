from forecast.trainer import train_forecast
from services.data_service import load_events_from_file


def main():
    events = load_events_from_file()
    if len(events) < 200:
        raise SystemExit(f"En az 200 event gerekli. Mevcut: {len(events)}")
    train_forecast(events)


if __name__ == "__main__":
    main()
