import os

from config import (
    BASE_DIR,
    DATA_DIR,
    FAULTS_DIR,
    FORECAST_MODEL,
    MODEL_DIR,
    SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_URL,
)


class BaseConfig:
    SECRET_KEY = os.getenv("SECRET_KEY", "deprem-analiz-dev-secret")
    TESTING = False
    DEBUG = False
    JSON_AS_ASCII = False
    BASE_DIR = BASE_DIR
    DATA_DIR = DATA_DIR
    MODEL_DIR = MODEL_DIR
    FAULTS_DIR = FAULTS_DIR
    FORECAST_MODEL = FORECAST_MODEL
    SUPABASE_URL = SUPABASE_URL
    SUPABASE_PUBLISHABLE_KEY = SUPABASE_PUBLISHABLE_KEY
    API_VERSION = os.getenv("API_VERSION", "v2")
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")


class DevelopmentConfig(BaseConfig):
    DEBUG = True


class TestingConfig(BaseConfig):
    TESTING = True


class ProductionConfig(BaseConfig):
    DEBUG = False


def get_config():
    env = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "development").strip().lower()
    if env == "production":
        return ProductionConfig
    if env == "testing":
        return TestingConfig
    return DevelopmentConfig
