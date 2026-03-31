import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, r"C:\Temp\apiruntime")
runpy.run_path(str(ROOT / "app.py"), run_name="__main__")
