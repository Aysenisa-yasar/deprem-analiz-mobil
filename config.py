# config.py - Merkezi yapılandırma
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_DIR = os.path.join(BASE_DIR, "models")
# Render Persistent Disk: ortamda DATA_DIR=/data gibi bağlanan yol verilebilir.
DATA_DIR = os.path.normpath(os.getenv("DATA_DIR", os.path.join(BASE_DIR, "data")))

FORECAST_MODEL = os.path.join(MODEL_DIR, "forecast_latest.pkl")

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

FAULTS_DIR = os.path.join(DATA_DIR, "faults")
FAULTS_GEOJSON = os.path.join(FAULTS_DIR, "turkey_faults.geojson")
FAULTS_SHP = os.path.join(FAULTS_DIR, "turkey_faults.shp")

GRID_STEP = 0.25
TIME_WINDOW_HOURS = 48

os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(FAULTS_DIR, exist_ok=True)
