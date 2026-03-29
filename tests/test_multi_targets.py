from forecast.multi_targets import build_multi_targets


def test_build_multi_targets_tracks_earliest_local_event():
    events = [
        {"lat": 40.0, "lon": 29.0, "mag": 3.2, "timestamp": 1000.0},
        {"lat": 40.0, "lon": 29.0, "mag": 4.3, "timestamp": 1000.0 + (6 * 3600)},
        {"lat": 40.1, "lon": 29.1, "mag": 5.1, "timestamp": 1000.0 + (30 * 3600)},
    ]

    targets = build_multi_targets(events, 40.0, 29.0, 1000.0)

    assert targets["m4_24h"] == 1
    assert targets["m5_72h"] == 1
    assert round(targets["time_to_next_event_hours"], 2) == 6.0
    assert round(targets["next_event_magnitude"], 2) == 4.3
    assert round(targets["max_mag_7d"], 2) == 5.1
    assert targets["next_event_distance_km"] is not None


def test_build_multi_targets_ignores_events_outside_radius():
    events = [
        {"lat": 41.5, "lon": 30.5, "mag": 5.0, "timestamp": 1000.0 + (3 * 3600)},
    ]

    targets = build_multi_targets(events, 40.0, 29.0, 1000.0, radius_km=100.0)

    assert targets["m4_24h"] == 0
    assert targets["m5_72h"] == 0
    assert targets["next_event_within_7d"] == 0
    assert targets["time_to_next_event_hours"] is None
    assert targets["next_event_distance_km"] is None
    assert targets["next_event_magnitude"] is None
