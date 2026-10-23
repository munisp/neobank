"""Model Lifecycle Registry

Every model that automates a decision is registered here with a mode:
- shadow:  runs and logs, never affects outcomes
- canary:  affects a fraction of traffic, agreement tracked vs current champion
- enforce: full authority

Every automated decision is recorded with the model version, so audits can
reconstruct exactly why a decision was made (same principle as the frozen,
versioned billing statements).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

MODES = ("shadow", "canary", "enforce")


class ModelRegistry:
    def __init__(self):
        # name -> {"version": str, "mode": str, "registered_at": str, "history": [...]}
        self._models: Dict[str, Dict[str, Any]] = {}
        self._decisions: List[Dict[str, Any]] = []

    def register(self, name: str, version: str, mode: str = "shadow") -> Dict[str, Any]:
        if mode not in MODES:
            raise ValueError(f"mode must be one of {MODES}")
        entry = self._models.setdefault(name, {"history": []})
        prev = entry.get("version")
        entry.update({"version": version, "mode": mode,
                      "registered_at": datetime.now(timezone.utc).isoformat()})
        entry["history"].append({"version": version, "mode": mode,
                                 "at": entry["registered_at"], "previous": prev})
        return {"name": name, "version": version, "mode": mode}

    def set_mode(self, name: str, mode: str) -> Dict[str, Any]:
        if mode not in MODES:
            raise ValueError(f"mode must be one of {MODES}")
        if name not in self._models:
            raise KeyError(f"model '{name}' is not registered")
        self._models[name]["mode"] = mode
        self._models[name]["history"].append(
            {"version": self._models[name]["version"], "mode": mode,
             "at": datetime.now(timezone.utc).isoformat()})
        return {"name": name, "mode": mode}

    def get(self, name: str) -> Optional[Dict[str, Any]]:
        m = self._models.get(name)
        return {"name": name, **{k: v for k, v in m.items() if k != "history"}} if m else None

    def list_models(self) -> List[Dict[str, Any]]:
        return [{"name": n, "version": m.get("version"), "mode": m.get("mode"),
                 "registered_at": m.get("registered_at")}
                for n, m in self._models.items()]

    def record_decision(self, name: str, input_hash: str, decision: Any,
                        agreed_with_champion: Optional[bool] = None) -> Dict[str, Any]:
        m = self._models.get(name)
        if not m:
            raise KeyError(f"model '{name}' is not registered")
        record = {"decision_id": str(uuid.uuid4()), "model": name,
                  "version": m["version"], "mode": m["mode"],
                  "input_hash": input_hash, "decision": decision,
                  "agreed_with_champion": agreed_with_champion,
                  "occurred_at": datetime.now(timezone.utc).isoformat()}
        self._decisions.append(record)
        return record

    def agreement_rate(self, name: str, window: int = 200) -> Optional[float]:
        recent = [d for d in self._decisions[-window * 4:]
                  if d["model"] == name and d["agreed_with_champion"] is not None][-window:]
        if not recent:
            return None
        return round(sum(1 for d in recent if d["agreed_with_champion"]) / len(recent), 4)

    def can_promote(self, name: str, threshold: float = 0.95,
                    min_decisions: int = 50) -> Dict[str, Any]:
        m = self._models.get(name)
        if not m:
            raise KeyError(f"model '{name}' is not registered")
        decided = [d for d in self._decisions
                   if d["model"] == name and d["agreed_with_champion"] is not None]
        rate = self.agreement_rate(name)
        ok = (rate is not None and rate >= threshold and len(decided) >= min_decisions
              and m["mode"] == "canary")
        return {"model": name, "current_mode": m["mode"], "agreement_rate": rate,
                "decisions": len(decided), "threshold": threshold,
                "min_decisions": min_decisions, "promotable": ok}

    def decisions_for(self, name: str, limit: int = 100) -> List[Dict[str, Any]]:
        return [d for d in self._decisions if d["model"] == name][-limit:]


model_registry = ModelRegistry()
