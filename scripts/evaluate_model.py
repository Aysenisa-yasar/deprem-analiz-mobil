import json
import os

from config import MODEL_DIR
from forecast.predictor import load_model


def main():
    model = load_model()
    if not model:
        raise SystemExit("Model bulunamadi")
    summary = {
        "trained_at": model.get("trained_at"),
        "model_type": model.get("model_type"),
        "metrics": model.get("metrics", {}),
        "backtest": model.get("backtest", {}),
        "feature_importance": model.get("feature_importance", []),
    }
    output_path = os.path.join(MODEL_DIR, "evaluation_summary.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"[evaluate_model] Degerlendirme ozeti yazildi: {output_path}")


if __name__ == "__main__":
    main()
