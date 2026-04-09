from flask import jsonify


def success_response(
    payload: dict | None = None,
    *,
    message: str = "OK",
    status: str = "success",
    http_status: int = 200,
    **extra,
):
    data = payload or {}
    body = {
        "success": True,
        "status": status,
        "message": message,
        "data": data,
    }
    if isinstance(data, dict):
        for key, value in data.items():
            body.setdefault(key, value)
    body.update(extra)
    return jsonify(body), http_status


def error_response(
    message: str,
    *,
    code: str = "BAD_REQUEST",
    http_status: int = 400,
    payload: dict | None = None,
    status: str = "error",
    **extra,
):
    data = payload or {}
    body = {
        "success": False,
        "status": status,
        "message": message,
        "error": {
            "code": code,
            "message": message,
        },
        "data": data,
    }
    if isinstance(data, dict):
        for key, value in data.items():
            body.setdefault(key, value)
    body.update(extra)
    return jsonify(body), http_status
