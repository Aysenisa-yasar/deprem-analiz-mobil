import math

from flask import Blueprint, jsonify, request
import requests

from config import SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL
from services.mobile_social_db import (
    add_system_message,
    fetch_messages,
    login_user,
    register_user,
    send_user_message,
    set_emergency_contact,
    start_auth_challenge,
    try_record_alert,
    upsert_user_from_supabase_identity,
    user_from_token,
    verify_auth_challenge,
)

mobile_bp = Blueprint("mobile", __name__)

MAG_THRESHOLD = 5.0
DIST_THRESHOLD_KM = 150.0


def _bearer_token() -> str | None:
    auth_header = request.headers.get("Authorization") or ""
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return None


def _require_user():
    token = _bearer_token()
    user = user_from_token(token or "")
    if not user:
        return None, (jsonify({"status": "error", "message": "Yetkisiz"}), 401)
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
    ok, message = register_user(str(data.get("username", "")), str(data.get("password", "")))
    if not ok:
        return jsonify({"status": "error", "message": message}), 400
    return jsonify({"status": "ok", "token": message})


@mobile_bp.route("/api/mobile/login", methods=["POST"])
def mobile_login():
    data = request.get_json(silent=True) or {}
    token = login_user(str(data.get("username", "")), str(data.get("password", "")))
    if not token:
        return jsonify({"status": "error", "message": "Kullanici veya sifre hatali"}), 401
    return jsonify({"status": "ok", "token": token})


@mobile_bp.route("/api/mobile/auth/request-code", methods=["POST"])
def mobile_request_code():
    data = request.get_json(silent=True) or {}
    ok, payload = start_auth_challenge(str(data.get("target", "")))
    if not ok:
        return jsonify({"status": "error", **payload}), 400
    return jsonify({"status": "ok", **payload})


@mobile_bp.route("/api/mobile/auth/verify-code", methods=["POST"])
def mobile_verify_code():
    data = request.get_json(silent=True) or {}
    ok, payload = verify_auth_challenge(
        str(data.get("target", "")),
        str(data.get("code", "")),
    )
    if not ok:
        return jsonify({"status": "error", **payload}), 400
    return jsonify({"status": "ok", **payload})


@mobile_bp.route("/api/mobile/auth/supabase-exchange", methods=["POST"])
def mobile_supabase_exchange():
    data = request.get_json(silent=True) or {}
    payload, error = _fetch_supabase_user(str(data.get("access_token", "")))
    if error:
        return jsonify({"status": "error", "message": error}), 400

    ok, result = upsert_user_from_supabase_identity(payload)
    if not ok:
        return jsonify({"status": "error", **result}), 400
    return jsonify({"status": "ok", **result})


@mobile_bp.route("/api/mobile/me", methods=["GET"])
def mobile_me():
    user, err = _require_user()
    if err:
        return err
    return jsonify(
        {
            "status": "ok",
            "username": user["username"],
            "emergency_contact": user["emergency_contact"],
            "phone": user.get("phone"),
            "email": user.get("email"),
            "auth_channel": user.get("auth_channel", "password"),
        }
    )


@mobile_bp.route("/api/mobile/emergency-contact", methods=["PUT", "POST"])
def mobile_emergency_contact():
    user, err = _require_user()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    contact = data.get("contact_username") or data.get("username")
    ok, message = set_emergency_contact(user["username"], contact if contact else None)
    if not ok:
        return jsonify({"status": "error", "message": message}), 400
    refreshed = user_from_token(_bearer_token() or "")
    return jsonify(
        {
            "status": "ok",
            "emergency_contact": refreshed.get("emergency_contact") if refreshed else None,
        }
    )


@mobile_bp.route("/api/mobile/messages", methods=["GET"])
def mobile_messages_get():
    user, err = _require_user()
    if err:
        return err
    since_id = int(request.args.get("since_id", 0) or 0)
    rows = fetch_messages(user["username"], since_id=since_id, limit=150)
    return jsonify({"status": "ok", "messages": rows})


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
        return jsonify({"status": "error", "message": message}), 400
    return jsonify({"status": "ok"})


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
        return jsonify({"status": "error", "message": "Eksik veya hatali koordinat"}), 400

    if magnitude < MAG_THRESHOLD:
        return jsonify({"status": "error", "message": "Esik: magnitud 5.0 ve uzeri"}), 400

    distance = _haversine_km(lat, lon, epicenter_lat, epicenter_lon)
    if distance > DIST_THRESHOLD_KM + 5:
        return jsonify(
            {
                "status": "error",
                "message": f"Konum deprem merkezine {distance:.0f} km; esik {DIST_THRESHOLD_KM} km",
            }
        ), 400

    contact = user.get("emergency_contact")
    if not contact:
        return jsonify({"status": "error", "message": "Acil iletisim kullanicisi secilmemis"}), 400

    event_key = str(data.get("event_key") or "").strip()
    if not event_key:
        event_key = f"{epicenter_lat:.3f}_{epicenter_lon:.3f}_{magnitude:.1f}"

    if not try_record_alert(user["username"], event_key):
        return jsonify({"status": "ok", "sent": False, "reason": "already_sent"})

    body = (
        f"[ACIL KONUM] {user['username']} - Yakininda M{magnitude:.1f} deprem bildirildi.\n"
        f"Konumum: {lat:.5f}, {lon:.5f}\n"
        f"Episantr: {epicenter_lat:.5f}, {epicenter_lon:.5f} (~{distance:.0f} km)\n"
        f"(DepremAnaliz uygulamasi otomatik mesaji)"
    )
    add_system_message(user["username"], contact, body, "location_alert")
    return jsonify({"status": "ok", "sent": True})
