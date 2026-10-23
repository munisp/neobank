"""Auto-Reconciliation Service

Matches two record sets (e.g. inbound ACH returns vs platform transfers,
wallet movements vs TigerBeetle postings) and surfaces only the unmatched
residue for human review — the core ops-productivity pattern.

- reconcile(): generic key + amount-tolerant matching, O(n) via hash index.
- reconcile_ach_returns(): wires to ACHProcessingService transfers so an
  ingested return file is reconciled against what we actually sent.
- Emits a feature event per run so match-rate trends are observable.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class ReconciliationService:
    def __init__(self):
        self.runs: List[Dict[str, Any]] = []

    def reconcile(self, source_records: List[Dict[str, Any]],
                  target_records: List[Dict[str, Any]],
                  key_fn: Callable[[Dict[str, Any]], Optional[str]],
                  amount_fn: Optional[Callable[[Dict[str, Any]], float]] = None,
                  amount_tolerance: float = 0.01) -> Dict[str, Any]:
        """Match source -> target on key (and amount within tolerance if given).

        Returns matched pairs plus both unmatched sides — the only items a
        human ever needs to see.
        """
        index: Dict[str, List[int]] = {}
        for i, t in enumerate(target_records):
            k = key_fn(t)
            if k is not None:
                index.setdefault(k, []).append(i)

        matched: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
        unmatched_source: List[Dict[str, Any]] = []
        used = set()

        for s in source_records:
            k = key_fn(s)
            hit = None
            if k is not None:
                for i in index.get(k, []):
                    if i in used:
                        continue
                    if amount_fn is not None:
                        if abs(amount_fn(s) - amount_fn(target_records[i])) > amount_tolerance:
                            continue
                    hit = i
                    break
            if hit is None:
                unmatched_source.append(s)
            else:
                used.add(hit)
                matched.append((s, target_records[hit]))

        unmatched_target = [t for i, t in enumerate(target_records) if i not in used]
        return {
            "matched_count": len(matched),
            "match_rate": round(len(matched) / len(source_records), 4) if source_records else 1.0,
            "matched": [{"source": s, "target": t} for s, t in matched],
            "unmatched_source": unmatched_source,
            "unmatched_target": unmatched_target,
            "residue_count": len(unmatched_source) + len(unmatched_target),
        }

    async def reconcile_ach_returns(self, parsed_returns: List[Dict[str, Any]],
                                    transfers: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """Match Addenda99 returns (by trace number) to outbound transfers."""
        transfer_list = [{**v, "ach_id": k} for k, v in transfers.items()]
        result = self.reconcile(
            parsed_returns, transfer_list,
            key_fn=lambda r: r.get("trace_number"),
            amount_fn=lambda r: float(r.get("amount_cents", r.get("amount", 0)) or 0),
            amount_tolerance=1.0)
        run = await self._record_run("ach_returns", result)
        return {**result, "run_id": run["run_id"]}

    async def _record_run(self, kind: str, result: Dict[str, Any]) -> Dict[str, Any]:
        run = {"run_id": str(uuid.uuid4()), "kind": kind,
               "matched_count": result["matched_count"],
               "match_rate": result["match_rate"],
               "residue_count": result["residue_count"],
               "occurred_at": datetime.now(timezone.utc).isoformat()}
        self.runs.append(run)
        try:
            from app.services.feature_integration import publish_feature_event
            await publish_feature_event("ReconciliationRunCompleted", run)
        except Exception as exc:
            logger.debug("reconciliation event emit skipped: %s", exc)
        return run


reconciliation_service = ReconciliationService()
