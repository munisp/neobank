"""Production inference service — CPU-only, sub-10ms scoring.

Loads champion models from the local registry (backend/models/registry.json),
serves scores with torch.inference_mode. Falls back to the rule-based
scorer when no weights are available, so the API never hard-fails.

Latency budget on a 2-vCPU container (measured, batch=1):
  fraud_mlp         ~1-2 ms
  fraud_autoencoder ~1 ms
  fraud_gnn         ~3-8 ms (neighborhood subgraph ≤ 500 nodes)
  ensemble          ~5-10 ms
"""

import json
import os
import threading
from typing import Any, Dict, List, Optional

import numpy as np
import structlog

from app.ml.features import extract_features, FEATURE_SCHEMA_VERSION

logger = structlog.get_logger(__name__)

torch = None  # lazy: backend boots without torch installed


def _torch():
    global torch
    if torch is None:
        import torch as _t
        _t.set_num_threads(max(1, (os.cpu_count() or 2) // 2))
        torch = _t
    return torch


class ModelRegistry:
    """Local registry (models/registry.json) + optional MLflow mirroring."""

    def __init__(self, models_dir: Optional[str] = None):
        self.models_dir = models_dir or os.environ.get(
            "NEOBANK_MODELS_DIR",
            os.path.join(os.path.dirname(__file__), "..", "..", "models"))
        self.registry_path = os.path.join(self.models_dir, "registry.json")

    def load(self) -> Dict[str, Any]:
        if not os.path.exists(self.registry_path):
            return {}
        return json.load(open(self.registry_path))

    def champion(self, name: str) -> Optional[Dict[str, Any]]:
        entry = self.load().get(name)
        if entry and entry.get("status") == "champion":
            return entry
        return None

    def promote(self, name: str, version: str) -> bool:
        registry = self.load()
        if name not in registry:
            return False
        registry[name]["status"] = "champion"
        registry[name]["version"] = version
        json.dump(registry, open(self.registry_path, "w"), indent=2)
        return True


class MLFraudScorer:
    """Ensemble scorer: MLP (supervised) + autoencoder (anomaly) + GNN (network)."""

    def __init__(self, registry: Optional[ModelRegistry] = None):
        self.registry = registry or ModelRegistry()
        self._lock = threading.Lock()
        self._models: Dict[str, Any] = {}
        self._meta: Dict[str, Any] = {}
        self._loaded = False

    def _ensure_loaded(self) -> bool:
        if self._loaded:
            return bool(self._models)
        with self._lock:
            if self._loaded:
                return bool(self._models)
            try:
                t = _torch()
                from app.ml.models import MODEL_REGISTRY
                for name, cls in MODEL_REGISTRY.items():
                    entry = self.registry.load().get(name)
                    if not entry:
                        continue
                    path = os.path.join(self.registry.models_dir, entry["weights"])
                    if not os.path.exists(path):
                        logger.warning("ml_weights_missing", model=name, path=path)
                        continue
                    model = cls()
                    model.load_state_dict(t.load(path, map_location="cpu", weights_only=True))
                    model.eval()
                    self._models[name] = model
                    self._meta[name] = entry
                    logger.info("ml_model_loaded", model=name,
                                version=entry["version"],
                                metrics=entry.get("metrics", {}))
            except Exception as exc:  # noqa: BLE001
                logger.warning("ml_load_failed", error=str(exc))
            self._loaded = True
        return bool(self._models)

    @property
    def available(self) -> bool:
        return self._ensure_loaded()

    def score(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Score one transaction. Returns ensemble score + per-model breakdown."""
        if not self._ensure_loaded():
            return {"available": False, "score": None,
                    "detail": "no trained weights — rule-based scorer active"}

        t = _torch()
        x = extract_features(context)
        meta = self._meta.get("fraud_mlp", {})
        norm = meta.get("normalization")
        if norm:
            x = (x - np.array(norm["mean"], dtype=np.float32)) / np.array(norm["std"], dtype=np.float32)
        xt = t.tensor(x, dtype=t.float32).unsqueeze(0)

        out: Dict[str, Any] = {"available": True, "models": {}}
        scores: List[float] = []
        with t.inference_mode():
            if "fraud_mlp" in self._models:
                s = float(self._models["fraud_mlp"](xt).item())
                scores.append(s * 2.0)  # supervised model weighted 2x
                out["models"]["fraud_mlp"] = round(s, 4)
            if "fraud_autoencoder" in self._models:
                err = float(self._models["fraud_autoencoder"].anomaly_score(xt).item())
                threshold = float(self._meta["fraud_autoencoder"].get("metrics", {}).get("threshold", 0.1))
                s = float(min(err / (threshold * 3 + 1e-9), 1.0))  # squash to [0,1]
                scores.append(s)
                out["models"]["fraud_autoencoder"] = round(s, 4)

        if not scores:
            return {"available": False, "score": None, "detail": "models unloaded"}
        out["score"] = round(float(sum(scores) / (len(scores) + (1.0 if "fraud_mlp" in self._models else 0.0))), 4)
        out["schema"] = FEATURE_SCHEMA_VERSION
        out["champion_versions"] = {n: m.get("version") for n, m in self._meta.items()}
        return out

    def score_graph(self, node_features: np.ndarray, adjacency: np.ndarray,
                    target_node: int = 0) -> Dict[str, Any]:
        """Score an account within its transaction neighborhood subgraph."""
        if "fraud_gnn" not in (self._models if self._ensure_loaded() else {}):
            return {"available": False, "detail": "fraud_gnn weights not found"}
        t = _torch()
        meta = self._meta["fraud_gnn"]
        norm = meta.get("normalization")
        X = node_features.astype(np.float32)
        if norm:
            X = (X - np.array(norm["mean"], dtype=np.float32)) / np.array(norm["std"], dtype=np.float32)
        with t.inference_mode():
            scores = t.sigmoid(self._models["fraud_gnn"](
                t.tensor(X), t.tensor(adjacency.astype(np.float32))))
        return {"available": True, "score": float(scores[target_node].item()),
                "neighborhood_size": int(adjacency.shape[0])}


_scorer: Optional[MLFraudScorer] = None


def get_fraud_scorer() -> MLFraudScorer:
    global _scorer
    if _scorer is None:
        _scorer = MLFraudScorer()
    return _scorer
