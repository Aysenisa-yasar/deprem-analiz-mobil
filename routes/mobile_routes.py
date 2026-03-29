# Mobil uygulama: kayıt, mesajlaşma, acil kişiye konum bildirimi
import math

from flask import Blueprint, jsonify, request

from services.mobile_social_db import (
    add_system_message,
    fetch_messages,
    login_user,
    register_user,
    send_user_message,
    set_emergency_contact,
    try_record_alert,
    user_from_token,
)

mobile_bp = Blueprint("mobile", __name__)

MAG_THRESHOLD = 5.0
DIST_THRESHOLD_KM = 150.0


def _bearer_token() -> str | None:
    h = request.headers.get("Authorization") or ""
    if h.lower().startswith("bearer "):
        return h[7:].strip()
    return None


def _require_user():
    tok = _bearer_token()
    u = user_from_token(tok or "")
    if not u:
        return None, (jsonify({"status": "error", "message": "Yetkisiz"}), 401)
    return u, None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


@mobile_bp.route("/api/mobile/register", methods=["POST"])
def mobile_register():
    data = request.get_json(silent=True) or {}
    ok, msg = register_user(str(data.get("username", "")), str(data.get("password", "")))
    if not ok:
        return jsonify({"status": "error", "message": msg}), 400
    return jsonify({"status": "ok", "token": msg})


@mobile_bp.route("/api/mobile/login", methods=["POST"])
def mobile_login():
    data = request.get_json(silent=True) or {}
    tok = login_user(str(data.get("username", "")), str(data.get("password", "")))
    if not tok:
        return jsonify({"status": "error", "message": "Kullanıcı veya şifre hatalı"}), 401
    return jsonify({"status": "ok", "token": tok})


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
        }
    )


@mobile_bp.route("/api/mobile/emergency-contact", methods=["PUT", "POST"])
def mobile_emergency_contact():
    user, err = _require_user()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    contact = data.get("contact_username") or data.get("username")
    ok, msg = set_emergency_contact(user["username"], contact if contact else None)
    if not ok:
        return jsonify({"status": "error", "message": msg}), 400
    u2 = user_from_token(_bearer_token() or "")
    return jsonify(
        {
            "status": "ok",
            "emergency_contact": u2.get("emergency_contact") if u2 else None,
        }
    )


@mobile_bp.route("/api/mobile/messages", methods=["GET"])
def mobile_messages_get():
    user, err = _require_user()
    if err:
        return err
    since = int(request.args.get("since_id", 0) or 0)
    rows = fetch_messages(user["username"], since_id=since, limit=150)
    return jsonify({"status": "ok", "messages": rows})


@mobile_bp.route("/api/mobile/messages", methods=["POST"])
def mobile_messages_post():
    user, err = _require_user()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    to_u = str(data.get("to_username", ""))
    body = str(data.get("body", ""))
    ok, msg = send_user_message(user["username"], to_u, body)
    if not ok:
        return jsonify({"status": "error", "message": msg}), 400
    return jsonify({"status": "ok"})


@mobile_bp.route("/api/mobile/location-alert", methods=["POST"])
def mobile_location_alert():
    """
    M≥5 ve epicenter ≤150 km iken istemci mevcut konumu gönderir;
    aynı deprem için tekrar gönderilmez (event_key ile).
    """
    user, err = _require_user()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    try:
        lat = float(data.get("lat"))
        lon = float(data.get("lon"))
        mag = float(data.get("magnitude"))
        elat = float(data.get("epicenter_lat"))
        elon = float(data.get("epicenter_lon"))
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Eksik veya hatalı koordinat"}), 400

    if mag < MAG_THRESHOLD:
        return jsonify({"status": "error", "message": "Eşik: magnitüd 5.0 ve üzeri"}), 400

    dist = _haversine_km(lat, lon, elat, elon)
    if dist > DIST_THRESHOLD_KM + 5:
        return jsonify(
            {
                "status": "error",
                "message": f"Konum deprem merkezine {dist:.0f} km; eşik {DIST_THRESHOLD_KM} km",
            }
        ), 400

    contact = user.get("emergency_contact")
    if not contact:
        return jsonify({"status": "error", "message": "Acil iletişim kullanıcısı seçilmemiş"}), 400

    event_key = str(data.get("event_key") or "").strip()
    if not event_key:
        event_key = f"{elat:.3f}_{elon:.3f}_{mag:.1f}"

    if not try_record_alert(user["username"], event_key):
        return jsonify({"status": "ok", "sent": False, "reason": "already_sent"})

    body = (
        f"[ACİL KONUM] {user['username']} — Yakınında M{mag:.1f} deprem bildirildi.\n"
        f"Konumum: {lat:.5f}, {lon:.5f}\n"
        f"Episantr: {elat:.5f}, {elon:.5f} (~{dist:.0f} km)\n"
        f"(DepremAnaliz uygulaması otomatik mesajı)"
    )
    add_system_message(user["username"], contact, body, "location_alert")
    return jsonify({"status": "ok", "sent": True})
