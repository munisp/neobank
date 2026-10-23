"""Exception Triage Service

Turns FIFO exception queues into risk-ranked work lists and learns from the
human decisions the platform already collects (positive-pay `agreed_with_model`
labels are a supervised dataset).

- score_exception: weighted heuristic over amount-vs-limits, payee history and
  prior rejection signals.
- rank_queue: any list of items with a scorer -> sorted by descending risk;
  used for positive-pay exceptions, anomaly queues, ops review lists.
- learn_from_decision: nudges feature weights up/down based on whether the
  human agreed with the model recommendation (per-feature attribution).
"""
from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

_DEFAULT_WEIGHTS = {
    "over_single_limit": 0.35,
    "over_daily_limit": 0.25,
    "unregistered_payee": 0.25,
    "amount_outlier": 0.15,   # amount far above payee's historical average
    "prior_rejections": 0.20, # payee/account rejected before
}


class ExceptionTriageService:
    def __init__(self):
        self.weights = dict(_DEFAULT_WEIGHTS)
        self._decisions_seen = 0
        self._agreements = 0

    # -- scoring ---------------------------------------------------------------

    def score_exception(self, exception: Dict[str, Any],
                        payee_history: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Return a 0..1 risk score plus the contributing factors."""
        factors: Dict[str, float] = {}
        reason = exception.get("reason") or exception.get("code") or ""
        if "single_limit" in reason or exception.get("over_single_limit"):
            factors["over_single_limit"] = 1.0
        if "daily_limit" in reason or exception.get("over_daily_limit"):
            factors["over_daily_limit"] = 1.0
        if "unregistered" in reason or exception.get("unregistered_payee"):
            factors["unregistered_payee"] = 1.0

        hist = payee_history or {}
        avg = hist.get("average_amount")
        amount = float(exception.get("amount") or 0)
        if avg and avg > 0 and amount > 3 * avg:
            factors["amount_outlier"] = min(amount / (5 * avg), 1.0)
        priors = int(hist.get("prior_rejections") or exception.get("prior_rejections") or 0)
        if priors > 0:
            factors["prior_rejections"] = min(priors / 3.0, 1.0)

        total_w = sum(self.weights.get(k, 0) for k in factors) or 1.0
        score = sum(self.weights.get(k, 0) * v for k, v in factors.items()) / max(
            sum(self.weights.values()), 1e-9)
        _ = total_w  # kept for future normalization modes
        return {"risk_score": round(min(score, 1.0), 4),
                "factors": factors,
                "auto_approvable": score < 0.25 and not factors.get("unregistered_payee")}

    # -- ranking -----------------------------------------------------------------

    def rank_queue(self, items: List[Dict[str, Any]],
                   scorer: Optional[Callable[[Dict[str, Any]], float]] = None,
                   history_lookup: Optional[Callable[[Dict[str, Any]], Dict[str, Any]]] = None
                   ) -> List[Dict[str, Any]]:
        """Sort a queue by descending risk. Items get risk_score/auto_approvable
        annotations; original order is preserved within equal scores (stable)."""
        scored = []
        for idx, item in enumerate(items):
            if scorer:
                s = float(scorer(item))
                scored.append((idx, item, {"risk_score": round(s, 4), "factors": {},
                                           "auto_approvable": s < 0.25}))
            else:
                hist = history_lookup(item) if history_lookup else None
                ann = self.score_exception(item, hist)
                scored.append((idx, item, ann))
        scored.sort(key=lambda t: (-t[2]["risk_score"], t[0]))
        return [{**item, **ann, "queue_position": pos}
                for pos, (_, item, ann) in enumerate(scored)]

    def split_auto_vs_review(self, ranked: List[Dict[str, Any]]) -> Dict[str, Any]:
        auto = [i for i in ranked if i.get("auto_approvable")]
        review = [i for i in ranked if not i.get("auto_approvable")]
        return {"auto_approvable": auto, "needs_review": review,
                "auto_count": len(auto), "review_count": len(review)}

    # -- learning from human decisions --------------------------------------------

    def learn_from_decision(self, exception: Dict[str, Any], model_recommendation: str,
                            human_decision: str, lr: float = 0.05) -> Dict[str, Any]:
        """Adjust feature weights from one labeled decision.

        Human agreed -> reinforce the weights of present factors.
        Human disagreed -> decay them (and slightly boost the rest).
        """
        agreed = (model_recommendation == human_decision)
        self._decisions_seen += 1
        self._agreements += int(agreed)
        present = self.score_exception(exception).get("factors", {})
        adjusted = []
        for k in self.weights:
            if k in present:
                self.weights[k] = self.weights[k] * (1 + lr) if agreed else self.weights[k] * (1 - lr)
                adjusted.append(k)
            elif not agreed:
                self.weights[k] = self.weights[k] * (1 + lr / 4)
        # renormalize to keep the total mass stable
        total = sum(self.weights.values()) or 1.0
        base = sum(_DEFAULT_WEIGHTS.values())
        self.weights = {k: v * base / total for k, v in self.weights.items()}
        return {"agreed": agreed, "adjusted_factors": adjusted,
                "weights": {k: round(v, 4) for k, v in self.weights.items()},
                "agreement_rate": round(self._agreements / self._decisions_seen, 4)}

    def stats(self) -> Dict[str, Any]:
        return {"decisions_seen": self._decisions_seen,
                "agreement_rate": round(self._agreements / self._decisions_seen, 4)
                if self._decisions_seen else None,
                "weights": {k: round(v, 4) for k, v in self.weights.items()}}


exception_triage_service = ExceptionTriageService()
