"""Behavior Intelligence Service

Learns from each user's transaction history to remove clicks and forms:

- record_action / record_suggestion_feedback: instrumented event stream with
  accept/dismiss ground truth for every suggestion the UI shows.
- next_actions: bigram transition + recency/frequency scoring over the event
  stream ("after salary credit, 80% pay rent") rendered as one-tap tiles.
- detect_recurring / due_soon: counterparty + amount + cadence clustering to
  find standing payments and warn before they hit.
- learn_category / suggest_category: user-specific then global-majority
  counterparty -> category enrichment.
- forecast_balance: balance trajectory from detected recurring inflows/outflows.

Everything is in-memory (consistent with ach/escrow services) and emits
feature events so the lakehouse can rebuild these models offline.
"""
from __future__ import annotations

import logging
import statistics
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Cadence buckets in days with tolerance
_CADENCES = {"weekly": 7, "biweekly": 14, "monthly": 30, "quarterly": 91}
_CADENCE_TOLERANCE = 0.25
_AMOUNT_TOLERANCE = 0.10


class BehaviorIntelligenceService:
    def __init__(self):
        # user_id -> [event dicts] (chronological)
        self._events: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        # user_id -> {counterparty: pattern}
        self._recurring: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
        # user_id -> {counterparty: category}; global counterparty -> {category: votes}
        self._user_categories: Dict[str, Dict[str, str]] = defaultdict(dict)
        self._global_categories: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        # suggestion_id -> {shown, accepted, dismissed}
        self._suggestions: Dict[str, Dict[str, int]] = defaultdict(
            lambda: {"shown": 0, "accepted": 0, "dismissed": 0})

    # -- event stream --------------------------------------------------------

    async def record_action(self, user_id: str, action_type: str,
                            context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        event = {
            "event_id": str(uuid.uuid4()),
            "user_id": user_id,
            "action_type": action_type,
            "context": context or {},
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }
        self._events[user_id].append(event)
        await self._emit("UserActionRecorded", event)
        return event

    async def record_suggestion_feedback(self, user_id: str, suggestion_id: str,
                                         accepted: bool) -> Dict[str, Any]:
        s = self._suggestions[suggestion_id]
        s["accepted" if accepted else "dismissed"] += 1
        await self._emit("SuggestionFeedback", {
            "user_id": user_id, "suggestion_id": suggestion_id,
            "accepted": accepted,
            "acceptance_rate": self.suggestion_stats(suggestion_id)["acceptance_rate"],
        })
        return {"suggestion_id": suggestion_id, "recorded": True}

    def mark_suggestion_shown(self, suggestion_id: str) -> None:
        self._suggestions[suggestion_id]["shown"] += 1

    def suggestion_stats(self, suggestion_id: Optional[str] = None) -> Dict[str, Any]:
        def rate(s: Dict[str, int]) -> float:
            decided = s["accepted"] + s["dismissed"]
            return round(s["accepted"] / decided, 4) if decided else 0.0
        if suggestion_id:
            s = self._suggestions.get(suggestion_id, {"shown": 0, "accepted": 0, "dismissed": 0})
            return {**s, "acceptance_rate": rate(s)}
        agg = {"shown": 0, "accepted": 0, "dismissed": 0}
        for s in self._suggestions.values():
            for k in agg:
                agg[k] += s[k]
        return {**agg, "acceptance_rate": rate(agg),
                "distinct_suggestions": len(self._suggestions)}

    # -- next-action prediction ----------------------------------------------

    def next_actions(self, user_id: str, limit: int = 3) -> List[Dict[str, Any]]:
        """Bigram transition counts blended with global action frequency.

        score(action | last) = 0.7 * P(action follows last) + 0.3 * P(action)
        recency-weighted: recent events weigh more (half-life 30 days).
        """
        events = self._events.get(user_id, [])
        if not events:
            return []
        now = datetime.now(timezone.utc)
        weights = []
        for e in events:
            try:
                age_days = (now - datetime.fromisoformat(e["occurred_at"])).days
            except (ValueError, TypeError):
                age_days = 999
            weights.append(0.5 ** (max(age_days, 0) / 30.0))

        freq: Dict[str, float] = defaultdict(float)
        for e, w in zip(events, weights):
            freq[e["action_type"]] += w
        total = sum(freq.values()) or 1.0

        last = events[-1]["action_type"]
        trans: Dict[str, float] = defaultdict(float)
        trans_total = 0.0
        for (a, b), w in zip(zip(events, events[1:]), weights[1:]):
            if a["action_type"] == last:
                trans[b["action_type"]] += w
                trans_total += w

        scores: Dict[str, float] = {}
        for action in set(freq) | set(trans):
            p_trans = (trans.get(action, 0.0) / trans_total) if trans_total else 0.0
            p_freq = freq.get(action, 0.0) / total
            scores[action] = 0.7 * p_trans + 0.3 * p_freq
        if not trans_total:  # no transition data yet: pure frequency
            scores = {a: f / total for a, f in freq.items()}

        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:limit]
        suggestions = [
            {"suggestion_id": f"next-action:{user_id}:{a}",
             "action_type": a, "score": round(s, 4),
             "label": a.replace("_", " ").title()}
            for a, s in ranked]
        for s in suggestions:
            self.mark_suggestion_shown(s["suggestion_id"])
        return suggestions

    # -- recurring-payment detection ------------------------------------------

    async def detect_recurring(self, user_id: str,
                               transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Cluster transactions by counterparty; a cluster is recurring when it
        has >=3 occurrences at a stable cadence and near-constant amount."""
        by_cp: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for t in transactions:
            cp = (t.get("counterparty") or "").strip().lower()
            if cp and t.get("occurred_at") and t.get("amount") is not None:
                by_cp[cp].append(t)

        found = []
        for cp, txns in by_cp.items():
            if len(txns) < 3:
                continue
            txns.sort(key=lambda t: t["occurred_at"])
            dates = [datetime.fromisoformat(str(t["occurred_at"])) for t in txns]
            amounts = [float(t["amount"]) for t in txns]
            gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
            if not gaps or min(gaps) <= 0:
                continue
            mean_gap = statistics.mean(gaps)
            mean_amt = statistics.mean(amounts)
            if mean_amt == 0:
                continue
            gap_stable = all(abs(g - mean_gap) <= mean_gap * _CADENCE_TOLERANCE for g in gaps)
            amt_stable = all(abs(a - mean_amt) <= abs(mean_amt) * _AMOUNT_TOLERANCE for a in amounts)
            if not (gap_stable and amt_stable):
                continue
            cadence = min(_CADENCES, key=lambda k: abs(_CADENCES[k] - mean_gap))
            pattern = {
                "counterparty": cp,
                "cadence": cadence,
                "average_amount": round(mean_amt, 2),
                "occurrences": len(txns),
                "last_at": dates[-1].isoformat(),
                "next_expected_at": (dates[-1] + timedelta(days=_CADENCES[cadence])).isoformat(),
                "direction": txns[-1].get("direction", "debit"),
            }
            self._recurring[user_id][cp] = pattern
            found.append(pattern)

        if found:
            await self._emit("RecurringPatternsDetected", {
                "user_id": user_id, "patterns": len(found)})
        return found

    def list_recurring(self, user_id: str) -> List[Dict[str, Any]]:
        return list(self._recurring.get(user_id, {}).values())

    def due_soon(self, user_id: str, within_days: int = 3) -> List[Dict[str, Any]]:
        now = datetime.now(timezone.utc)
        due = []
        for p in self._recurring.get(user_id, {}).values():
            try:
                nxt = datetime.fromisoformat(p["next_expected_at"])
            except (ValueError, KeyError):
                continue
            if nxt.tzinfo is None:
                nxt = nxt.replace(tzinfo=timezone.utc)
            delta = (nxt - now).days
            if -1 <= delta <= within_days:
                due.append({**p, "days_until": delta})
        return sorted(due, key=lambda p: p["days_until"])

    # -- category enrichment ----------------------------------------------------

    async def learn_category(self, user_id: str, counterparty: str, category: str) -> Dict[str, Any]:
        cp = counterparty.strip().lower()
        self._user_categories[user_id][cp] = category
        self._global_categories[cp][category] += 1
        await self._emit("CategoryLearned", {
            "user_id": user_id, "counterparty": cp, "category": category})
        return {"counterparty": cp, "category": category}

    def suggest_category(self, user_id: str, counterparty: str) -> Dict[str, Any]:
        cp = counterparty.strip().lower()
        if cp in self._user_categories.get(user_id, {}):
            return {"counterparty": cp, "category": self._user_categories[user_id][cp],
                    "source": "user_history"}
        votes = self._global_categories.get(cp)
        if votes:
            best = max(votes.items(), key=lambda kv: kv[1])
            return {"counterparty": cp, "category": best[0],
                    "source": "global_majority", "confidence": round(best[1] / sum(votes.values()), 4)}
        return {"counterparty": cp, "category": None, "source": "none"}

    # -- cash-flow forecasting ---------------------------------------------------

    def forecast_balance(self, user_id: str, current_balance: float,
                         days: int = 30) -> Dict[str, Any]:
        """Project balance from detected recurring inflows/outflows."""
        now = datetime.now(timezone.utc)
        horizon = now + timedelta(days=days)
        scheduled = []
        for p in self._recurring.get(user_id, {}).values():
            try:
                nxt = datetime.fromisoformat(p["next_expected_at"])
            except (ValueError, KeyError):
                continue
            if nxt.tzinfo is None:
                nxt = nxt.replace(tzinfo=timezone.utc)
            while nxt <= horizon:
                scheduled.append({"at": nxt, "amount": p["average_amount"],
                                  "direction": p.get("direction", "debit"),
                                  "counterparty": p["counterparty"]})
                nxt += timedelta(days=_CADENCES[p["cadence"]])
        scheduled.sort(key=lambda s: s["at"])

        trajectory = [{"date": now.date().isoformat(), "balance": round(current_balance, 2)}]
        balance = current_balance
        lowest = balance
        for s in scheduled:
            balance += s["amount"] if s["direction"] == "credit" else -s["amount"]
            lowest = min(lowest, balance)
            trajectory.append({"date": s["at"].date().isoformat(),
                               "balance": round(balance, 2),
                               "trigger": f"{s['counterparty']} ({s['direction']})"})
        return {"user_id": user_id, "horizon_days": days,
                "starting_balance": round(current_balance, 2),
                "projected_end_balance": round(balance, 2),
                "lowest_projected_balance": round(lowest, 2),
                "low_balance_warning": lowest < 0,
                "scheduled_events": len(scheduled),
                "trajectory": trajectory}

    # -- events ------------------------------------------------------------------

    async def _emit(self, event_type: str, payload: Dict[str, Any]) -> None:
        try:
            from app.services.feature_integration import publish_feature_event
            await publish_feature_event(event_type, payload)
        except Exception as exc:  # bus down must never break intelligence
            logger.debug("behavior event emit skipped: %s", exc)


behavior_intelligence_service = BehaviorIntelligenceService()
