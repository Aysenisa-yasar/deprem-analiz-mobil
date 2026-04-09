# config.py - Merkezi yapılandırma
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_dotenv_file() -> None:
    env_path = os.path.join(BASE_DIR, ".env")
    if not os.path.exists(env_path):
        return
    try:
        with open(env_path, "r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except OSError:
        return


_load_dotenv_file()

MODEL_DIR = os.path.join(BASE_DIR, "models")
# Render Persistent Disk: ortamda DATA_DIR=/data gibi bağlanan yol verilebilir.
DATA_DIR = os.path.normpath(os.getenv("DATA_DIR", os.path.join(BASE_DIR, "data")))

FORECAST_MODEL = os.path.normpath(
    os.getenv("MODEL_PATH", os.path.join(MODEL_DIR, "forecast_latest.pkl"))
)

KANDILLI_API = os.getenv(
    "KANDILLI_API",
    "https://api.orhanaydogdu.com.tr/deprem/kandilli/live",
)
EARTHQUAKE_HISTORY_FILE = os.path.join(BASE_DIR, "earthquake_history.json")

USGS_API = os.getenv(
    "USGS_API",
    "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=200",
)
AFAD_API = os.getenv("AFAD_API", "")
FUSION_LOOKBACK_HOURS = int(os.getenv("FUSION_LOOKBACK_HOURS", "168"))

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or 587)
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "").strip()
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Deprem Risk Izleyici").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "1").strip().lower() not in {"0", "false", "no"}
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "0").strip().lower() in {"1", "true", "yes"}

FAULTS_DIR = os.path.join(DATA_DIR, "faults")
FAULTS_GEOJSON = os.path.join(FAULTS_DIR, "turkey_faults.geojson")
FAULTS_SHP = os.path.join(FAULTS_DIR, "turkey_faults.shp")

GRID_STEP = float(os.getenv("GRID_STEP", "0.25"))
TIME_WINDOW_HOURS = int(os.getenv("TIME_WINDOW_HOURS", "48"))

os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(FAULTS_DIR, exist_ok=True)
