from functools import lru_cache

from forecast.backtest import rolling_backtest
from forecast.geography import classify_turkey_region
from forecast.predictor import (
    build_model_health,
    load_model,
    predict_with_model_data,
    validate_model_runtime,
)
from services.data_service import load_events


def _optional_float(value):
    if value is None:
        return None
    return float(value)


def _window_probabilities(pred: dict) -> dict:
    base_probability = float(pred.get("probability", 0.0) or 0.0)
    m5_probability = float(pred.get("m5_72h_probability", 0.0) or 0.0)
    return {
        "6h": round(min(1.0, base_probability * 0.55), 4),
        "24h": round(base_probability, 4),
        "72h": round(min(1.0, max(base_probability * 1.18, m5_probability * 1.45)), 4),
    }


def _explanation_summary(advisory: dict, top_features: list[dict], region: str) -> str:
    reasons = advisory.get("reasons") or []
    if reasons:
        return f"{region.replace('_', ' ').title()} bolgesi icin: {' '.join(reasons[:2])}"
    if top_features:
        names = ", ".join(str(item.get("feature") or item.get("name")) for item in top_features[:3])
        return f"{region.replace('_', ' ').title()} bolgesinde en etkili sinyaller: {names}."
    return f"{region.replace('_', ' ').title()} bolgesinde rutin izleme sinyali."


def _warning_capability(model_health: dict | None) -> dict:
    ready = bool(model_health and model_health.get("available"))
    return {
        "mode": "ml_risk_advisory",
        "official_sensor_early_warning": False,
        "seconds_before_alarm_supported": False,
        "siren_alarm_supported": False,
        "special_notifications_ready": ready,
        "summary": (
            "Bu surum ML tabanli bolgesel risk uyarisi uretiyor. Saniyeler once calan resmi "
            "sismik erken uyari altyapisi bu katmanda yok."
        ),
    }


def _backtest_needs_refresh(model_data: dict | None) -> bool:
    if not model_data or "model" not in model_data:
        return False
    backtest = model_data.get("backtest") or {}
    return backtest.get("recall") is None or backtest.get("precision") is None


@lru_cache(maxsize=4)
def _runtime_backtest_for_model(trained_at: str | None) -> dict:
    if not trained_at:
        return {}

    model_data = load_model()
    if not model_data or model_data.get("trained_at") != trained_at:
        return {}

    events = load_events()
    return rolling_backtest(
        lambda history, lat, lon: predict_with_model_data(
            model_data,
            history,
            lat,
            lon,
            explain=False,
        ),
        events,
    )


def _advisory_actions(level: str) -> list[str]:
    if level == "high_alert":
        return [
            "Konum izinleri, acil kisi ve ozel uyarilar aktif olsun.",
            "Guvenli cikis plani ile toplanma noktasini hazir tut.",
            "Resmi bildirimleri ve son depremleri yakindan izle.",
        ]
    if level == "prepare":
        return [
            "Telefon sesi, kritik bildirimler ve acil kisi ayarlarini kontrol et.",
            "Acil cantasi, powerbank ve konum paylasimini hazir tut.",
            "Bulundugun binadaki guvenli alanlari gozden gecir.",
        ]
    if level == "watch":
        return [
            "Uygulamayi arka planda acik tut ve resmi kaynaklari izle.",
            "Acil kisilerini guncel tut.",
            "Yerel risk artarsa bildirim esigini dusur.",
        ]
    return [
        "Rutin izleme yeterli, resmi bildirimleri kapatma.",
        "Konum izni verirsen daha kisisel risk karti uretilir.",
        "Acil kisi ve mesajlasma bilgilerini simdiden kaydet.",
    ]


def _build_alert_advisory(pred: dict) -> dict:
    model_health = pred.get("model_health") or {}
    quality_level = str(model_health.get("quality_level") or "experimental")
    quality_score = float(model_health.get("quality_score") or 0.0)

    probability = float(pred.get("probability", 0.0) or 0.0)
    m5_probability = float(pred.get("m5_72h_probability", 0.0) or 0.0)
    locality_score = float(pred.get("locality_score", 0.0) or 0.0)
    signal_event_count = int(pred.get("signal_event_count", 0) or 0)
    fault_distance = float(pred.get("fault_distance", 999.0) or 999.0)
    time_window = pred.get("next_event_time_window")
    time_prediction = _optional_float(pred.get("time_to_next_event_hours_prediction"))

    reasons = []
    reason_codes = []

    if probability >= 0.58:
        reasons.append("24 saatlik M4+ olasiligi belirgin yukselmis durumda.")
        reason_codes.append("probability_elevated")
    elif probability >= 0.35:
        reasons.append("24 saatlik risk taban seviyenin uzerinde.")
        reason_codes.append("probability_watch")

    if m5_probability >= 0.25:
        reasons.append("72 saatlik M5+ senaryosu da kayda deger.")
        reason_codes.append("m5_window_elevated")

    if locality_score >= 0.55:
        reasons.append("Konum, yerel sinyaller ve fay yakinligi nedeniyle hassas.")
        reason_codes.append("locality_high")

    if signal_event_count >= 12:
        reasons.append("Yakin bolgede yogun sinyal eventi birikmis.")
        reason_codes.append("signal_density_high")
    elif signal_event_count >= 6:
        reasons.append("Yakin bolgede izlenmeye deger sayida sinyal eventi var.")
        reason_codes.append("signal_density_watch")

    if fault_distance <= 25:
        reasons.append("Konum aktif faylara gorece yakin.")
        reason_codes.append("fault_nearby")

    if time_window in {"0-24h", "24-72h"}:
        reasons.append(f"Yardimci model sonraki olayi {time_window} penceresinde bekliyor.")
        reason_codes.append("time_window_near")
    elif time_prediction is not None and time_prediction <= 24.0:
        reasons.append("Yardimci model sonraki olayi 24 saat icinde bekliyor.")
        reason_codes.append("time_window_near")

    level = "info"
    label = "Bilgi"
    notification_tier = "silent"
    notify_recommended = False
    critical_notification_recommended = False

    if quality_level in {"high", "medium"}:
        if (
            quality_level == "high"
            and probability >= 0.72
            and m5_probability >= 0.28
            and locality_score >= 0.55
            and signal_event_count >= 12
        ):
            level = "high_alert"
            label = "Kritik hazirlik"
            notification_tier = "high_priority"
            notify_recommended = True
            critical_notification_recommended = True
        elif probability >= 0.56 and locality_score >= 0.45 and signal_event_count >= 8:
            level = "prepare"
            label = "Hazirlik"
            notification_tier = "standard"
            notify_recommended = True
        elif probability >= 0.35 or m5_probability >= 0.18 or signal_event_count >= 6:
            level = "watch"
            label = "Izleme"
            notification_tier = "standard"
    else:
        if probability >= 0.40 or signal_event_count >= 8:
            level = "watch"
            label = "Izleme"
            notification_tier = "standard"

    if not reasons:
        reasons.append("Bu bolge icin anlamli bir yukselis simdilik gorunmuyor.")
        reason_codes.append("baseline")

    summary = {
        "high_alert": "ML risk sinyali belirgin yukselmis. Bu bir resmi saniyeler-once alarmi degil, yuksek oncelikli hazirlik uyarisi.",
        "prepare": "Risk sinyali normalin uzerinde. Ozel bildirim ve hazirlik akisi aktif tutulmali.",
        "watch": "Bolgesel risk izlenmeli. Resmi kaynaklarla birlikte takip edilmeli.",
        "info": "Su anda belirgin bir yukselis yok. Rutin izleme yeterli.",
    }[level]

    limitations = [
        "Bu katman ML tabanli risk artisi uretir; resmi sismik erken uyari yerine gecmez.",
        "Saniyeler once siren caldirmak icin resmi sensornet/EEW entegrasyonu gerekir.",
    ]
    if quality_level == "experimental":
        limitations.append("Model kalitesi bu bolge icin halen deneysel seviyede.")

    return {
        "level": level,
        "label": label,
        "summary": summary,
        "notify_recommended": notify_recommended,
        "critical_notification_recommended": critical_notification_recommended,
        "notification_tier": notification_tier,
        "official_sensor_early_warning": False,
        "seconds_before_alarm_supported": False,
        "reason_codes": reason_codes,
        "reasons": reasons[:4],
        "actions": _advisory_actions(level),
        "limitations": limitations,
        "quality_level": quality_level,
        "quality_score": round(quality_score, 4),
        "next_event_time_window": time_window,
    }


def forecast_point(
    events: list,
    lat: float,
    lon: float,
    explain: bool = False,
    model_data: dict | None = None,
    fast_mode: bool = False,
) -> dict:
    pred = predict_with_model_data(
        model_data if model_data is not None else load_model(),
        events,
        lat,
        lon,
        explain=explain,
        fast_mode=fast_mode,
    )
    prob = pred["probability"]
    risk = min(10.0, max(0.0, prob * 10.0))
    advisory = _build_alert_advisory(pred)
    model_health = pred.get("model_health", {})
    region = classify_turkey_region(lat, lon)
    windows = _window_probabilities(pred)
    top_features = pred.get("top_features", [])
    return {
        "probability": float(prob),
        "ml_probability": float(pred.get("ml_probability", prob)),
        "etas_probability": float(pred.get("etas_probability", 0.0)),
        "lstm_probability": float(pred.get("lstm_probability", 0.0)),
        "cluster_score": float(pred.get("cluster_score", 0.0)),
        "b_value": float(pred.get("b_value", 1.0)),
        "b_risk": float(pred.get("b_risk", 0.0)),
        "gnn_probability": float(pred.get("gnn_probability", 0.0)),
        "m5_72h_probability": float(pred.get("m5_72h_probability", 0.0)),
        "max_mag_7d_prediction": float(pred.get("max_mag_7d_prediction", 0.0)),
        "time_to_next_event_hours_prediction": _optional_float(pred.get("time_to_next_event_hours_prediction")),
        "next_event_distance_km_prediction": _optional_float(pred.get("next_event_distance_km_prediction")),
        "next_event_magnitude_prediction": _optional_float(pred.get("next_event_magnitude_prediction")),
        "next_event_time_window": pred.get("next_event_time_window"),
        "locality_score": float(pred.get("locality_score", 0.0)),
        "risk_score": round(risk, 2),
        "model_health": model_health,
        "warning_capability": _warning_capability(pred.get("model_health")),
        "alert_advisory": advisory,
        "top_features": top_features,
        "features": pred.get("features", {}),
        "ensemble_weights": pred.get("ensemble_weights", {}),
        "signal_event_count": int(pred.get("signal_event_count", 0)),
        "model_type": pred.get("model_type", "forecast_hybrid_v3_timeseriescv"),
        "region": region,
        "confidence": float(model_health.get("quality_score", 0.0) or 0.0),
        "time_windows": windows,
        "explanation_summary": _explanation_summary(advisory, top_features, region),
        "fault_distance": float(pred.get("fault_distance", 999.0)),
        "fault_proximity_score": float(pred.get("fault_proximity_score", 0.0)),
        "stress_transfer": float(pred.get("stress_transfer", 0.0)),
        "energy_release": float(pred.get("energy_release", 0.0)),
        "foreshock_count": int(pred.get("foreshock_count", 0)),
        "spatial_density": float(pred.get("spatial_density", 0.0)),
        "mag_trend": float(pred.get("mag_trend", 0.0)),
        "depth_variance": float(pred.get("depth_variance", 0.0)),
        "nearest_fault_segment": pred.get("nearest_fault_segment", "unknown"),
    }


def forecast_city(
    events: list,
    city: dict,
    explain: bool = False,
    model_data: dict | None = None,
    fast_mode: bool = False,
) -> dict:
    return forecast_point(
        events,
        city["lat"],
        city["lon"],
        explain=explain,
        model_data=model_data,
        fast_mode=fast_mode,
    )


def get_forecast_model_health(model_data: dict | None = None) -> dict:
    resolved_model = model_data if model_data is not None else load_model()
    if _backtest_needs_refresh(resolved_model):
        refreshed_backtest = _runtime_backtest_for_model(resolved_model.get("trained_at"))
        if refreshed_backtest:
            resolved_model["backtest"] = refreshed_backtest
    runtime_compatible, runtime_issue = validate_model_runtime(resolved_model)
    return build_model_health(
        resolved_model,
        runtime_compatible=runtime_compatible,
        runtime_issue=runtime_issue,
    )


def get_warning_capability(model_data: dict | None = None) -> dict:
    return _warning_capability(get_forecast_model_health(model_data))
