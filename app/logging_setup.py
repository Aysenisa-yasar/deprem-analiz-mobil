import logging
import os
from logging.handlers import RotatingFileHandler

from config import DATA_DIR

LOG_DIR = os.path.join(DATA_DIR, "logs")
LOG_FILE = os.path.join(LOG_DIR, "deprem_analiz.log")


def configure_logging() -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    has_file_handler = any(
        isinstance(handler, RotatingFileHandler) and getattr(handler, "baseFilename", "").endswith("deprem_analiz.log")
        for handler in root_logger.handlers
    )
    if has_file_handler:
        return

    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s %(message)s")
    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)
