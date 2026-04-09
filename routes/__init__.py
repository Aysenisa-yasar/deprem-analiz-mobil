# routes - API katmani
from routes.admin_routes import admin_bp
from routes.forecast_routes import forecast_bp
from routes.metrics_routes import metrics_bp
from routes.mobile_routes import mobile_bp

__all__ = ["admin_bp", "forecast_bp", "metrics_bp", "mobile_bp"]
