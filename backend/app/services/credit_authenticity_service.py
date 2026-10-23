"""Credit authenticity engine — answers "is this user's financial story real?"

First-party fraud is the dominant credit-fraud typology in Nigerian digital
lending: applicants manufacture transaction history to inflate apparent
income before applying. The engine computes authenticity signals from raw
transaction history and produces an authenticity grade the credit decision
layer must respect — a high ML score on manipulated data is a decline, not
an approval.

Signals
-------
1. wash_transfer_ratio — circular flows: credits matched by near-equal
   debits to the same counterparty within 72h (money parked, not earned).
2. self_funding — transfers between the applicant's own accounts counted
   as "income" (detected via own-account destination ids).
3. income_regularity — genuine income repeats: same counterparty, similar
   amount (CV < 20%), monthly-ish interval, 3+ occurrences.
4. salary_cycle_alignment — real salaries cluster around payday windows.
5. burst_before_application — activity in the last 14 days vs the
   trailing 90-day baseline; manufactured histories spike pre-application.
6. dormant_reactivation — long silence followed by sudden heavy activity.
7. pass_through_ratio — inflow ≈ outflow within short windows: the
   account is a pipe, not a livelihood (also a mule-network signal).
8. round_number_credits — manufactured "salaries" are suspiciously round.
9. counterparty_concentration — one source providing nearly all inflow
   that is NOT a recurring employer pattern.

Output: authenticity_score (0..1), grade (authentic | review | suspicious
| manipulated), verified_income (only income that survives the filters),
and per-signal flags for the analyst and the audit trail.
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)

_WASH_WINDOW_H = 72
_WASH_AMOUNT_TOL = 0.10       # debit within 10% of prior credit
_SALARY_CV_MAX = 0.20         # amount stability for recurring income
_SALARY_MIN_OCCURRENCES = 3
_BURST_DAYS = 14
_ROUND_STEP = 10_000          # credits that are exact multiples of ₦10k


def _cv(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    if mean == 0:
        return 0.0
    var = sum((v - mean) ** 2 for v in values) / len(values)
    return (var ** 0.5) / mean


class CreditAuthenticityEngine:
    """Stateless — all computation from a transaction list."""

    def analyze(self, transactions: List[Dict[str, Any]],
                own_account_ids: Optional[List[str]] = None,
                reference_time: Optional[datetime] = None) -> Dict[str, Any]:
        now = reference_time or datetime.now(timezone.utc)
        own = set(own_account_ids or [])
        flags: Dict[str, Any] = {}

        credits = [t for t in transactions if t.get("transaction_type") == "credit"]
        debits = [t for t in transactions if t.get("transaction_type") == "debit"]
        total_in = sum(float(t["amount"]) for t in credits) or 1.0
        total_out = sum(float(t["amount"]) for t in debits)

        # --- 1+2. wash trading & self-funding --------------------------------
        wash_volume = 0.0
        self_funded = 0.0
        for c in credits:
            camt = float(c["amount"])
            if str(c.get("destination_account_id")) in own or str(c.get("source_account_id")) in own:
                self_funded += camt
                continue
            ctime = c.get("created_at", now)
            for d in debits:
                dtime = d.get("created_at", now)
                delta_h = abs((dtime - ctime).total_seconds()) / 3600
                if delta_h <= _WASH_WINDOW_H and abs(float(d["amount"]) - camt) <= camt * _WASH_AMOUNT_TOL:
                    if c.get("counterparty") and c.get("counterparty") == d.get("counterparty"):
                        wash_volume += camt
                        break
        wash_ratio = min(1.0, (wash_volume + self_funded) / total_in)
        flags["wash_transfer_ratio"] = round(wash_ratio, 3)
        flags["self_funded_volume"] = round(self_funded, 2)

        # --- 3. income regularity (recurring same-source credits) ------------
        by_source: Dict[str, List[Dict]] = defaultdict(list)
        for c in credits:
            key = str(c.get("counterparty") or c.get("description", ""))[:64]
            by_source[key].append(c)
        verified_income = 0.0
        best_regularity = 0.0
        recurring_sources = 0
        for src, txs in by_source.items():
            if len(txs) < _SALARY_MIN_OCCURRENCES:
                continue
            amounts = [float(t["amount"]) for t in txs]
            if _cv(amounts) > _SALARY_CV_MAX:
                continue
            times = sorted(t.get("created_at", now) for t in txs)
            gaps = [(times[i + 1] - times[i]).days for i in range(len(times) - 1)]
            monthlyish = sum(1 for g in gaps if 20 <= g <= 40) / max(len(gaps), 1)
            if monthlyish >= 0.6:
                recurring_sources += 1
                # verified income = trailing-3-month average for this source
                recent = [a for t, a in zip(times, amounts) if (now - t).days <= 100]
                if recent:
                    verified_income += sum(recent) / max(len(recent), 1) * (30 / 30)
                    best_regularity = max(best_regularity, monthlyish)
        flags["income_regularity"] = round(best_regularity, 3)
        flags["recurring_income_sources"] = recurring_sources
        flags["verified_monthly_income"] = round(verified_income, 2)

        # --- 4. salary cycle alignment ---------------------------------------
        if credits:
            payday_hits = sum(1 for c in credits
                              if c.get("created_at", now).day >= 25 or c.get("created_at", now).day <= 5)
            flags["salary_cycle_alignment"] = round(payday_hits / len(credits), 3)
        else:
            flags["salary_cycle_alignment"] = 0.0

        # --- 5. burst before application -------------------------------------
        recent_vol = sum(float(t["amount"]) for t in transactions
                         if (now - t.get("created_at", now)).days <= _BURST_DAYS)
        baseline_vol = sum(float(t["amount"]) for t in transactions
                           if _BURST_DAYS < (now - t.get("created_at", now)).days <= 104) / 6.4 or 1.0
        burst = min(1.0, max(0.0, (recent_vol / baseline_vol - 1.5) / 3))
        flags["burst_before_application"] = round(burst, 3)

        # --- 6. dormant reactivation ------------------------------------------
        if transactions:
            times = sorted(t.get("created_at", now) for t in transactions)
            age_days = (now - times[0]).days
            first_half_vol = sum(float(t["amount"]) for t in transactions
                                 if t.get("created_at", now) < now - timedelta(days=max(age_days // 2, 30)))
            dormancy = 1.0 - min(1.0, first_half_vol / (total_in + total_out + 1.0) * 2)
            flags["dormant_reactivation"] = round(max(0.0, dormancy) if age_days > 60 else 0.0, 3)
            flags["history_depth_days"] = age_days
        else:
            flags["dormant_reactivation"] = 0.0
            flags["history_depth_days"] = 0

        # --- 7. pass-through (mule/pipe behaviour) -----------------------------
        flags["pass_through_ratio"] = round(min(1.0, total_out / total_in), 3)

        # --- 8. round-number manufactured credits ------------------------------
        p2p_credits = [c for c in credits if float(c["amount"]) >= _ROUND_STEP]
        if p2p_credits:
            roundish = sum(1 for c in p2p_credits if float(c["amount"]) % _ROUND_STEP == 0)
            flags["round_number_credit_ratio"] = round(roundish / len(p2p_credits), 3)
        else:
            flags["round_number_credit_ratio"] = 0.0

        # --- 9. counterparty concentration -------------------------------------
        if by_source and credits:
            biggest = max(sum(float(t["amount"]) for t in txs) for txs in by_source.values())
            concentration = biggest / total_in
            # high concentration is fine when it's a verified recurring employer
            flags["counterparty_concentration"] = round(concentration, 3)
        else:
            flags["counterparty_concentration"] = 0.0

        # ------------------------------------------------------------------
        # Aggregate
        # ------------------------------------------------------------------
        deductions = (
            0.35 * flags["wash_transfer_ratio"]
            + 0.20 * flags["burst_before_application"]
            + 0.15 * flags["dormant_reactivation"]
            + 0.10 * (flags["round_number_credit_ratio"] if flags["recurring_income_sources"] == 0 else 0)
            + 0.10 * max(0.0, flags["pass_through_ratio"] - 0.9) * 10 / 1.0
            + 0.10 * (flags["counterparty_concentration"]
                      if flags["recurring_income_sources"] == 0 else 0.0)
        )
        bonuses = 0.25 * flags["income_regularity"] + 0.10 * flags["salary_cycle_alignment"]
        score = max(0.0, min(1.0, 0.75 - deductions + bonuses))

        if flags["wash_transfer_ratio"] > 0.5:
            grade = "manipulated"
        elif score >= 0.7:
            grade = "authentic"
        elif score >= 0.5:
            grade = "review"
        else:
            grade = "suspicious"

        result = {
            "authenticity_score": round(score, 4),
            "grade": grade,
            "verified_monthly_income": flags["verified_monthly_income"],
            "flags": flags,
        }
        logger.info("credit_authenticity", grade=grade, score=result["authenticity_score"])
        return result


_engine: Optional[CreditAuthenticityEngine] = None


def get_authenticity_engine() -> CreditAuthenticityEngine:
    global _engine
    if _engine is None:
        _engine = CreditAuthenticityEngine()
    return _engine
