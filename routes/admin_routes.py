import os

from flask import Blueprint, request

from app.responses import error_response, success_response
from services.admin_service import dashboard_snapshot, notification_history, tail_logs

admin_bp = Blueprint("admin", __name__)


def _require_admin():
    expected = os.getenv("ADMIN_API_KEY", "").strip()
    if not expected:
        return None
    provided = (request.headers.get("X-Admin-Key") or "").strip()
    if provided != expected:
        return error_response("Admin anahtari gecersiz", code="ADMIN_FORBIDDEN", http_status=403)
    return None


@admin_bp.route("/api/v1/admin/dashboard", methods=["GET"])
def admin_dashboard():
    err = _require_admin()
    if err:
        return err
    return success_response(dashboard_snapshot(), status="ok")


@admin_bp.route("/api/v1/admin/notifications", methods=["GET"])
def admin_notifications():
    err = _require_admin()
    if err:
        return err
    limit = min(max(1, int(request.args.get("limit", 50) or 50)), 200)
    return success_response({"items": notification_history(limit)}, status="ok")


@admin_bp.route("/api/v1/admin/logs", methods=["GET"])
def admin_logs():
    err = _require_admin()
    if err:
        return err
    limit = min(max(1, int(request.args.get("limit", 120) or 120)), 500)
    return success_response({"lines": tail_logs(limit)}, status="ok")
