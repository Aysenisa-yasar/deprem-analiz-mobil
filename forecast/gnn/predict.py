import os

from config import MODEL_DIR


GNN_MODEL_PATH = os.path.join(MODEL_DIR, "gnn_latest.pt")
_GNN_CACHE = {
    "model": None,
    "torch": None,
    "build_graph_from_events": None,
    "path_mtime": None,
}


def _gnn_runtime_enabled() -> bool:
    flag = os.getenv("ENABLE_GNN_RUNTIME")
    if flag is not None:
        return flag.strip().lower() in {"1", "true", "yes", "on"}
    return os.name != "nt"


def _load_runtime():
    if not _gnn_runtime_enabled():
        return None, None, None

    try:
        import torch

        from forecast.gnn.dataset import build_graph_from_events
        from forecast.gnn.model import EarthquakeGNN
    except Exception:
        return None, None, None

    return torch, build_graph_from_events, EarthquakeGNN


def load_gnn():
    if not os.path.exists(GNN_MODEL_PATH):
        _GNN_CACHE["model"] = None
        _GNN_CACHE["path_mtime"] = None
        return None

    current_mtime = os.path.getmtime(GNN_MODEL_PATH)
    if _GNN_CACHE["model"] is not None and _GNN_CACHE["path_mtime"] == current_mtime:
        return _GNN_CACHE["model"]

    torch, build_graph_from_events, EarthquakeGNN = _load_runtime()
    if torch is None:
        return None

    model = EarthquakeGNN(in_channels=6, hidden_channels=32)
    try:
        state_dict = torch.load(GNN_MODEL_PATH, map_location="cpu")
        model.load_state_dict(state_dict)
        model.eval()
    except Exception:
        return None

    _GNN_CACHE["model"] = model
    _GNN_CACHE["torch"] = torch
    _GNN_CACHE["build_graph_from_events"] = build_graph_from_events
    _GNN_CACHE["path_mtime"] = current_mtime
    return model


def predict_gnn(events):
    model = load_gnn()
    if model is None:
        return 0.0

    recent = sorted(
        [event for event in events if (event.get("timestamp") or 0) > 0],
        key=lambda event: event["timestamp"],
    )[-50:]

    build_graph_from_events = _GNN_CACHE["build_graph_from_events"]
    torch = _GNN_CACHE["torch"]
    if not recent or build_graph_from_events is None or torch is None:
        return 0.0

    graph = build_graph_from_events(recent)
    if graph is None:
        return 0.0

    x, edge_index, edge_weight = graph
    batch = torch.zeros(x.size(0), dtype=torch.long)

    with torch.no_grad():
        out = model(x, edge_index, batch, edge_weight=edge_weight).item()

    return float(out)
