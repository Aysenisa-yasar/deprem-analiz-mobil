import math

import requests
from flask import Blueprint, request

from app.responses import error_response, success_response
from config import SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL
from services.mobile_social_db import (
    add_system_message,
    complete_registration,
    fetch_messages,
    get_user_settings,
    login_user,
    logout_user,
    record_notification_history,
    refresh_session_token,
    start_auth_challenge,
    start_auth_challenge_for_purpose,
    start_registration,
    register_user_device,
    reset_password_with_code,
    send_user_message,
    set_emergency_contact,
    try_record_alert,
    update_user_settings,
    upsert_user_from_supabase_identity,
    user_from_token,
    verify_auth_challenge,
)
from services.security_service import check_rate_limit, clear_rate_limit

mobile_bp = Blueprint("mobile", __name__)

MAG_THRESHOLD = 5.0
DIST_THRESHOLD_KM = 150.0


def _bearer_token() -> str | None:
    auth_header = request.headers.get("Authorization") or ""
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return None


def _client_fingerprint() -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    return forwarded_for or request.remote_addr or "unknown"


def _rate_limit(namespace: str, key: str, *, limit: int, window_sec: int):
    allowed, retry_after = check_rate_limit(namespace, key, limit=limit, window_sec=window_sec)
    if allowed:
        return None
    return error_response(
        "Cok fazla deneme yapildi. Lutfen biraz sonra tekrar deneyin.",
        code="RATE_LIMITED",
        http_status=429,
        payload={"retry_after_sec": retry_after},
    )


def _require_user():
    token = _bearer_token()
    user = user_from_token(token or "")
    if not user:
        return None, error_response("Yetkisiz", code="UNAUTHORIZED", http_status=401)
    return user, None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * radius * math.asin(min(1.0, math.sqrt(a)))


def _fetch_supabase_user(access_token: str):
    token = access_token.strip()
    if not token:
        return None, "Supabase erisim belirteci eksik"
    if not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
        return None, "Supabase backend ayarlari eksik"

    try:
        response = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_PUBLISHABLE_KEY,
            },
            timeout=10,
        )
    except requests.RequestException:
        return None, "Supabase dogrulama servisine ulasilamadi"

    if response.status_code >= 400:
        return None, "Supabase oturumu dogrulanamadi"

    try:
        payload = response.json()
    except ValueError:
        return None, "Supabase yaniti okunamadi"

    if not isinstance(payload, dict) or not payload.get("id"):
        return None, "Supabase kullanicisi alinamadi"
    return payload, None


@mobile_bp.route("/api/mobile/register", methods=["POST"])
def mobile_register():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", ""))
    limiter = _rate_limit("register_verify", f"{_client_fingerprint()}:{email}", limit=10, window_sec=900)
    if limiter:
        return limiter

    ok, payload = complete_registration(email, str(data.get("code", "")))
    if not ok:
        return error_response(
            str(payload.get("message", "Kayit dogrulanamadi")),
            code="REGISTER_FAILED",
            http_status=400,
            payload=payload,
        )

    clear_rate_limit("register_verify", f"{_client_fingerprint()}:{email}")
    return success_response(payload, status="ok")


@mobile_bp.route("/api/mobile/register/request-code", methods=["POST"])
def mobile_register_request_code():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", ""))
    email = str(data.get("email", ""))
    limiter = _rate_limit("register_request", f"{_client_fingerprint()}:{email or username}", limit=6, window_sec=900)
    if limiter:
        return limiter

    ok, payload = start_registration(
        username,
        email,
        str(data.get("password", "")),
    )
    if not ok:
        return error_response(
            str(payload.get("message", "Kayit dogrulama kodu olusturulamadi")),
            code="REGISTER_CODE_FAILED",
            http_status=400,
            payload=payload,
        )
    return success_response(payload, status="ok")


@mobile_bp.route("/api/mobile/login", methods=["POST"])
def mobile_login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", ""))
    limiter = _rate_limit("login", f"{_client_fingerprint()}:{username}", limit=8, window_sec=900)
    if limiter:
        return limiter

    token = login_user(username, str(data.get("password", "")))
    if not token:
        return error_response(
            "Kullanici veya sifre hatali",
            code="LOGIN_FAILED",
            http_status=401,
        )

    clear_rate_limit("login", f"{_client_fingerprint()}:{username}")
    return success_response({"token": token}, status="ok")


@mobile_bp.route("/api/mobile/logout", methods=["POST"])
def mobile_logout():
    token = _bearer_token() or ""
    user, err = _require_user()
    if err:
        return err
    logout_user(token)
    record_notification_history(
        username=user["username"],
        target_username=None,
        event_key=None,
        category="session",
        status="logout",
        payload={"client": _client_fingerprint()},
    )
    return success_response({}, status="ok")


@mobile_bp.route("/api/mobile/refresh", methods=["POST"])
def mobile_refresh():
    token = _bearer_token() or ""
    ok, payload = refresh_session_token(token)
    if not ok:
        return error_response(
            str(payload.get("message", "Yetkisiz")),
            code="SESSION_REFRESH_FAILED",
            http_status=401,
        )
    return success_response(payload, status="ok")


@mobile_bp.route("/api/mobile/auth/request-code", methods=["POST"])
def mobile_request_code():
    data = request.get_json(silent=True) or {}
    target = str(data.get("target", ""))
    limiter = _rate_limit("request_code", f"{_client_fingerprint()}:{target}", limit=6, window_sec=600)
    if limiter:
        return limiter

    ok, payload = start_auth_challenge_for_purpose(target, purpose="login")
    if not ok:
        return error_response(
            str(payload.get("message", "Kod gonderilemedi")),
            code="AUTH_CHALLENGE_FAILED",
            http_status=400,
            payload=payload,
        )
    return success_response(payload, status="ok")


@mobile_bp.route("/api/mobile/auth/verify-code", methods=["POST"])
def mobile_verify_code():
    data = request.get_json(silent=True) or {}
    target = str(data.get("target", ""))
    limiter = _rate_limit("verify_code", f"{_client_fingerprint()}:{target}", limit=10, window_sec=600)
    if limiter:
        return limiter

    ok, payload = verify_auth_challenge(target, str(data.get("code", "")))
    if not ok:
        return error_response(
            str(payload.get("message", "Kod dogrulanamadi")),
            code="AUTH_VERIFY_FAILED",
            http_status=400,
            payload=payload,
        )
    clear_rate_limit("verify_code", f"{_client_fingerprint()}:{target}")
    return success_response(payload, status="ok")


@mobile_bp.route("/api/mobile/auth/reset-request", methods=["POST"])
def mobile_reset_request():
    data = request.get_json(silent=True) or {}
    target = str(data.get("target", ""))
    limiter = _rate_limit("reset_request", f"{_client_fingerprint()}:{target}", limit=5, window_sec=900)
    if limiter:
        return limiter
    ok, payload = start_auth_challenge_for_purpose(target, purpose="reset")
    if not ok:
        return error_response(
            str(payload.get("message", "Sifre sifirlama kodu olusturulamadi")),
            code="PASSWORD_RESET_REQUEST_FAILED",
            http_status=400,
            payload=payload,
        )
    payload["message"] = "Sifre sifirlama kodu hazir"
    return success_response(payload, status="ok")


@mobile_bp.route("/api/mobile/auth/reset-confirm", methods=["POST"])
def mobile_reset_confirm():
    data = request.get_json(silent=True) or {}
    target = str(data.get("target", ""))
    limiter = _rate_limit("reset_confirm", f"{_client_fingerprint()}:{target}", limit=8, window_sec=900)
    if limiter:
        return limiter
    ok, payload = reset_password_with_code(
        target,
        str(data.get("code", "")),
        str(data.get("new_password", "")),
    )
    if not ok:
        return error_response(
            str(payload.get("message", "Sifre sifirlanamadi")),
            code="PASSWORD_RESET_CONFIRM_FAILED",
            http_status=400,
            payload=payload,
        )
    clear_rate_limit("reset_confirm", f"{_client_fingerprint()}:{target}")
    return success_response(payload, status="ok")


@mobile_bp.route("/api/mobile/auth/supabase-exchange", methods=["POST"])
def mobile_supabase_exchange():
    data = request.get_json(silent=True) or {}
    payload, error = _fetch_supabase_user(str(data.get("access_token", "")))
    if error:
        return error_response(error, code="SUPABASE_EXCHANGE_FAILED", http_status=400)

    ok, result = upsert_user_from_supabase_identity(payload)
    if not ok:
        return error_response(
            str(result.get("message", "Supabase kullanicisi kaydedilemedi")),
            code="SUPABASE_UPSERT_FAILED",
            http_status=400,
            payload=result,
        )
    return success_response(result, status="ok")


@mobile_bp.route("/api/mobile/me", methods=["GET"])
def mobile_me():
    user, err = _require_user()
    if err:
        return err
    settings = get_user_settings(user["username"])
    return success_response(
        {
            "username": user["username"],
            "emergency_contact": user["emergency_contact"],
            "phone": user.get("phone"),
            "email": user.get("email"),
            "auth_channel": user.get("auth_channel", "password"),
            "settings": settings,
        },
        status="ok",
    )


@mobile_bp.route("/api/mobile/settings", methods=["GET"])
def mobile_settings_get():
    user, err = _require_user()
    if err:
        return err
    return success_response({"settings": get_user_settings(user["username"])}, status="ok")


@mobile_bp.route("/api/mobile/settings", methods=["PUT", "POST"])
def mobile_settings_put():
    user, err = _require_user()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    settings = update_user_settings(user["username"], data)
    return success_response({"settings": settings}, status="ok")


@mobile_bp.route("/api/mobile/devices", methods=["POST"])
def mobile_devices_post():
    user, err = _require_user()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    try:
        device = register_user_device(
            user["username"],
            device_id=str(data.get("device_id", "")),
            platform=str(data.get("platform", "")),
            push_token=str(data.get("push_token", "")),
            app_version=str(data.get("app_version", "")),
        )
    except ValueError as exc:
        return error_response(str(exc), code="DEVICE_REGISTRATION_FAILED", http_status=400)
    return success_response({"device": device}, status="ok")


@mobile_bp.route("/api/mobile/emergency-contact", methods=["PUT", "POST"])
def mobile_emergency_contact():
    user, err = _require_user()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    contact = data.get("contact_username") or data.get("username")
    ok, message = set_emergency_contact(user["username"], contact if contact else None)
    if not ok:
        return error_response(message, code="EMERGENCY_CONTACT_FAILED", http_status=400)
    refreshed = user_from_token(_bearer_token() or "")
    return success_response(
        {
            "emergency_contact": refreshed.get("emergency_contact") if refreshed else None,
        },
        status="ok",
    )


@mobile_bp.route("/api/mobile/messages", methods=["GET"])
def mobile_messages_get():
    user, err = _require_user()
    if err:
        return err
    since_id = int(request.args.get("since_id", 0) or 0)
    rows = fetch_messages(user["username"], since_id=since_id, limit=150)
    return success_response({"messages": rows}, status="ok")


@mobile_bp.route("/api/mobile/messages", methods=["POST"])
def mobile_messages_post():
    user, err = _require_user()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    ok, message = send_user_message(
        user["username"],
        str(data.get("to_username", "")),
        str(data.get("body", "")),
    )
    if not ok:
        return error_response(message, code="MESSAGE_SEND_FAILED", http_status=400)
    return success_response({}, status="ok")


@mobile_bp.route("/api/mobile/location-alert", methods=["POST"])
def mobile_location_alert():
    user, err = _require_user()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    try:
        lat = float(data.get("lat"))
        lon = float(data.get("lon"))
        magnitude = float(data.get("magnitude"))
        epicenter_lat = float(data.get("epicenter_lat"))
        epicenter_lon = float(data.get("epicenter_lon"))
    except (TypeError, ValueError):
        return error_response(
            "Eksik veya hatali koordinat",
            code="INVALID_ALERT_COORDINATES",
            http_status=400,
        )

    if magnitude < MAG_THRESHOLD:
        return error_response(
            "Esik: magnitud 5.0 ve uzeri",
            code="MAGNITUDE_BELOW_THRESHOLD",
            http_status=400,
        )

    distance = _haversine_km(lat, lon, epicenter_lat, epicenter_lon)
    if distance > DIST_THRESHOLD_KM + 5:
        return error_response(
            f"Konum deprem merkezine {distance:.0f} km; esik {DIST_THRESHOLD_KM} km",
            code="ALERT_DISTANCE_TOO_FAR",
            http_status=400,
        )

    contact = user.get("emergency_contact")
    if not contact:
        return error_response(
            "Acil iletisim kullanicisi secilmemis",
            code="NO_EMERGENCY_CONTACT",
            http_status=400,
        )

    event_key = str(data.get("event_key") or "").strip()
    if not event_key:
        event_key = f"{epicenter_lat:.3f}_{epicenter_lon:.3f}_{magnitude:.1f}"

    if not try_record_alert(user["username"], event_key):
        record_notification_history(
            username=user["username"],
            target_username=contact,
            event_key=event_key,
            category="location_alert",
            status="already_sent",
            payload={"magnitude": magnitude, "distance_km": round(distance, 2)},
        )
        return success_response({"sent": False, "reason": "already_sent"}, status="ok")

    body = (
        f"[ACIL KONUM] {user['username']} - Yakininda M{magnitude:.1f} deprem bildirildi.\n"
        f"Konumum: {lat:.5f}, {lon:.5f}\n"
        f"Episantr: {epicenter_lat:.5f}, {epicenter_lon:.5f} (~{distance:.0f} km)\n"
        f"(DepremAnaliz uygulamasi otomatik mesaji)"
    )
    add_system_message(user["username"], contact, body, "location_alert")
    record_notification_history(
        username=user["username"],
        target_username=contact,
        event_key=event_key,
        category="location_alert",
        status="sent",
        payload={
            "magnitude": magnitude,
            "distance_km": round(distance, 2),
            "lat": lat,
            "lon": lon,
            "epicenter_lat": epicenter_lat,
            "epicenter_lon": epicenter_lon,
        },
    )
    return success_response({"sent": True}, status="ok")
