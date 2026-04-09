import logging

from flask import Flask, make_response, request
try:
    from flask_cors import CORS
except ImportError:  # pragma: no cover - fallback for limited local runtimes
    def CORS(app, resources=None):
        return app

from app.logging_setup import configure_logging
from routes.admin_routes import admin_bp
from routes.forecast_routes import forecast_bp
from routes.metrics_routes import metrics_bp
from routes.mobile_routes import mobile_bp

from .config import get_config
from .core_routes import core_bp
from .responses import error_response

logger = logging.getLogger(__name__)


def _add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Accept"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE"
    response.headers["Access-Control-Max-Age"] = "86400"
    return response


def _register_middlewares(app: Flask):
    @app.before_request
    def handle_cors_preflight():
        if request.method == "OPTIONS":
            response = make_response("", 200)
            return _add_cors_headers(response)
        if request.path.startswith("/api/"):
            logger.info(
                "[API] %s %s | Origin: %s",
                request.method,
                request.path,
                request.origin or request.referrer or "-",
            )
        return None

    @app.after_request
    def add_cors_headers(response):
        return _add_cors_headers(response)


def _register_error_handlers(app: Flask):
    @app.errorhandler(Exception)
    def log_exception(error):
        logger.exception("[API ERROR] %s %s: %s", request.method, request.path, error)
        if request.path.startswith("/api/"):
            return error_response(
                str(error),
                code="UNHANDLED_EXCEPTION",
                http_status=500,
            )
        raise error


def create_app(config_object=None) -> Flask:
    configure_logging()
    app = Flask(__name__)
    app.config.from_object(config_object or get_config())

    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": "*",
                "methods": ["GET", "POST", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization", "Accept"],
            }
        },
    )

    _register_middlewares(app)
    _register_error_handlers(app)

    app.register_blueprint(core_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(forecast_bp)
    app.register_blueprint(metrics_bp)
    app.register_blueprint(mobile_bp)
    return app
