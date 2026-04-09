import pytest

from app.factory import create_app
from services import mobile_social_db


@pytest.fixture(autouse=True)
def _test_env(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_ENV", "testing")
    monkeypatch.setenv("MOBILE_AUTH_DEV_MODE", "1")
    monkeypatch.setattr(mobile_social_db, "DB_PATH", str(tmp_path / "mobile_social.db"))


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client
