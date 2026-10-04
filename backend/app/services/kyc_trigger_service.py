"""Event-driven KYC trigger engine.

Answers: "what events would trigger a KYC on the platform?" — in code.

Trigger families
----------------
1. **Transaction-threshold (CBN-style tiers)** — daily/monthly cumulative
   outflows and single-transfer amounts per tier. Tier ceilings (NGN):
       tier1/basic : ₦50k/day,  ₦300k balance-class activity
       tier2       : ₦200k/day, ₦500k single transfer
       tier3/full  : unlimited
2. **Velocity / behavioural** — bursts of transfers, amount far above the
   user's trailing median, first international/remittance transfer.
3. **Product-onboarding (regulated products)** — NGX trading, stablecoin
   ramps, mortgages, BNPL, insurance claims above threshold: these require
   verified identity before first use (tier2+ / tier3 for investment).
4. **Risk & compliance** — sanctions/PEP hits, fraud/chargeback flags,
   device change combined with high-value movement, dormant-account
   reactivation, document expiry.

A fired trigger creates a KycTriggerEvent (open), emits a Kafka/Fluvio
event, notifies the user, and — when the event is a gated action — the
caller receives a ``KycRequired`` decision it must enforce (HTTP 428-style
response or saga abort). Satisfied automatically when the user's
kyc_level reaches the required level (checked on auth validate and on
every trigger evaluation).
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import KycTriggerEvent, Transaction, User

logger = structlog.get_logger(__name__)

LEVEL_ORDER = {"basic": 1, "tier1": 1, "tier2": 2, "intermediate": 2,
               "tier3": 3, "full": 3, "enhanced": 4}


def _rank(level: Optional[str]) -> int:
    return LEVEL_ORDER.get((level or "basic").lower(), 1)


# ---------------------------------------------------------------------------
# Trigger rules
# ---------------------------------------------------------------------------
# Each rule: key, required_level, applies(event_type) -> context matches,
# describe() for user-facing copy.

TIER_CEILINGS = {
    # level -> (single_transfer_ngn, daily_cumulative_ngn)
    1: (50_000, 50_000),        # CBN Tier 1
    2: (500_000, 200_000),      # CBN Tier 2 (single higher, daily capped)
}

TRIGGERS: List[Dict[str, Any]] = [
    # --- 1. thresholds -------------------------------------------------
    {"key": "single_transfer_above_tier", "required_level": "tier2",
     "events": {"transfer"},
     "describe": "Single transfer above your tier's limit"},
    {"key": "daily_cumulative_above_tier", "required_level": "tier2",
     "events": {"transfer"},
     "describe": "Daily transfers exceed your tier's daily limit"},
    {"key": "monthly_volume_review", "required_level": "tier3",
     "events": {"transfer"},
     "monthly_ceiling": 5_000_000,
     "describe": "Monthly volume requires enhanced due diligence"},
    # --- 2. velocity / behavioural ------------------------------------
    {"key": "velocity_burst", "required_level": "tier2",
     "events": {"transfer"}, "burst_count": 10, "burst_window_min": 60,
     "describe": "Unusually high transfer frequency"},
    {"key": "first_international_transfer", "required_level": "tier2",
     "events": {"international_transfer"},
     "describe": "First cross-border transfer requires verified identity"},
    # --- 3. product onboarding ----------------------------------------
    {"key": "ngx_onboarding", "required_level": "tier3",
     "events": {"ngx_order"},
     "describe": "Stock trading requires full KYC (SEC Nigeria rules)"},
    {"key": "stablecoin_ramp", "required_level": "tier3",
     "events": {"stablecoin_ramp"},
     "describe": "Crypto/stablecoin activity requires full KYC"},
    {"key": "mortgage_application", "required_level": "tier3",
     "events": {"mortgage_application"},
     "describe": "A mortgage application requires full identity verification"},
    {"key": "bnpl_credit", "required_level": "tier2",
     "events": {"bnpl_order"},
     "describe": "Credit products require verified identity"},
    {"key": "loan_application", "required_level": "tier2",
     "events": {"loan_application"},
     "describe": "Loan applications require verified identity"},
    # --- 4. risk & compliance ------------------------------------------
    {"key": "sanctions_pep_hit", "required_level": "enhanced",
     "events": {"sanctions_hit"},
     "describe": "Compliance screening requires enhanced due diligence"},
    {"key": "fraud_chargeback_flag", "required_level": "tier3",
     "events": {"fraud_flag", "chargeback"},
     "describe": "Account flagged for review — re-verify identity"},
    {"key": "device_change_high_value", "required_level": "tier2",
     "events": {"transfer"}, "high_value": 100_000,
     "describe": "High-value transfer from a new device"},
    {"key": "dormant_reactivation", "required_level": "tier2",
     "events": {"dormant_login"},
     "describe": "Reactivating a dormant account requires re-verification"},
    {"key": "document_expired", "required_level": "tier2",
     "events": {"document_expired"},
     "describe": "Your identity document has expired"},
]


class KycTriggerService:
    def __init__(self):
        self._pi = None

    # ------------------------------------------------------------------
    async def evaluate_event(self, db: AsyncSession, user: User,
                             event_type: str,
                             context: Optional[Dict[str, Any]] = None) -> List[KycTriggerEvent]:
        """Evaluate all rules for an event; fire triggers the user's level
        doesn't already satisfy. Returns fired events (possibly empty)."""
        context = context or {}
        user_rank = _rank(user.kyc_level)
        fired: List[KycTriggerEvent] = []

        for rule in TRIGGERS:
            if event_type not in rule["events"]:
                continue
            required_rank = _rank(rule["required_level"])
            if user_rank >= required_rank:
                continue
            if not await self._matches(db, user, rule, context):
                continue
            ev = await self._fire(db, user, rule, event_type, context)
            if ev:
                fired.append(ev)

        if fired:
            await db.commit()
            for ev in fired:
                await self._notify(db, user, ev)
                self._emit(user, ev)
            logger.info("kyc_triggers_fired", user_id=str(user.id),
                        triggers=[e.trigger_key for e in fired])
        return fired

    # ------------------------------------------------------------------
    async def _matches(self, db: AsyncSession, user: User,
                       rule: Dict[str, Any], context: Dict[str, Any]) -> bool:
        key = rule["key"]
        amount = float(context.get("amount") or 0)
        user_rank = _rank(user.kyc_level)

        if key == "single_transfer_above_tier":
            ceiling = TIER_CEILINGS.get(user_rank, TIER_CEILINGS[1])[0]
            return amount > ceiling
        if key == "daily_cumulative_above_tier":
            ceiling = TIER_CEILINGS.get(user_rank, TIER_CEILINGS[1])[1]
            today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0)
            daily = await self._sum_outflows(db, user.id, today)
            return (daily + amount) > ceiling
        if key == "monthly_volume_review":
            month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0)
            monthly = await self._sum_outflows(db, user.id, month)
            return (monthly + amount) > rule.get("monthly_ceiling", 5_000_000)
        if key == "velocity_burst":
            since = datetime.now(timezone.utc) - timedelta(minutes=rule.get("burst_window_min", 60))
            count = await self._count_outflows(db, user.id, since)
            return (count + 1) >= rule.get("burst_count", 10)
        if key == "device_change_high_value":
            return bool(context.get("new_device")) and amount >= rule.get("high_value", 100_000)
        # Onboarding/risk events always match when they occur.
        return True

    async def _fire(self, db: AsyncSession, user: User, rule: Dict[str, Any],
                    event_type: str, context: Dict[str, Any]) -> Optional[KycTriggerEvent]:
        # De-duplicate: one open event per (user, trigger_key).
        existing = (await db.execute(select(KycTriggerEvent).where(
            KycTriggerEvent.user_id == user.id,
            KycTriggerEvent.trigger_key == rule["key"],
            KycTriggerEvent.status == "open"))).scalar_one_or_none()
        if existing:
            return None
        ev = KycTriggerEvent(
            user_id=user.id, trigger_key=rule["key"], event_type=event_type,
            current_level=user.kyc_level or "basic",
            required_level=rule["required_level"],
            context={k: v for k, v in context.items() if isinstance(v, (str, int, float, bool))},
            status="open")
        db.add(ev)
        await db.flush()
        return ev

    # ------------------------------------------------------------------
    async def check_gate(self, db: AsyncSession, user: User,
                         event_type: str,
                         context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Gate helper for money-movement/product endpoints.

        Returns {"allowed": bool, "triggers": [...], "required_level": str?}.
        Endpoints call this BEFORE executing; when not allowed they must
        return 403 with the payload so the client can route the user into
        the KYC step-up flow."""
        fired = await self.evaluate_event(db, user, event_type, context)
        if not fired:
            return {"allowed": True, "triggers": []}
        # Threshold/velocity triggers are advisory (post-hoc review);
        # onboarding/risk triggers hard-block the action.
        hard = [e for e in fired if e.trigger_key in {
            "ngx_onboarding", "stablecoin_ramp", "mortgage_application",
            "bnpl_credit", "loan_application", "sanctions_pep_hit",
            "fraud_chargeback_flag", "document_expired"}]
        return {
            "allowed": not hard,
            "required_level": hard[0].required_level if hard else None,
            "triggers": [{"key": e.trigger_key, "required_level": e.required_level,
                          "event_id": str(e.id)} for e in fired],
        }

    async def satisfy_open_triggers(self, db: AsyncSession, user: User) -> int:
        """Close open triggers the user's current level now satisfies.
        Called on auth validate and after KYC completion."""
        open_events = (await db.execute(select(KycTriggerEvent).where(
            KycTriggerEvent.user_id == user.id,
            KycTriggerEvent.status == "open"))).scalars().all()
        rank = _rank(user.kyc_level)
        closed = 0
        for ev in open_events:
            if rank >= _rank(ev.required_level):
                ev.status = "satisfied"
                ev.satisfied_at = datetime.now(timezone.utc)
                closed += 1
        if closed:
            await db.commit()
            logger.info("kyc_triggers_satisfied", user_id=str(user.id), count=closed)
        return closed

    # ------------------------------------------------------------------
    async def _sum_outflows(self, db: AsyncSession, user_id, since: datetime) -> float:
        total = (await db.execute(select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == user_id,
            Transaction.transaction_type == "debit",
            Transaction.created_at >= since))).scalar()
        return float(total or 0)

    async def _count_outflows(self, db: AsyncSession, user_id, since: datetime) -> int:
        return int((await db.execute(select(func.count()).where(
            Transaction.user_id == user_id,
            Transaction.transaction_type == "debit",
            Transaction.created_at >= since))).scalar() or 0)

    async def _notify(self, db: AsyncSession, user: User, ev: KycTriggerEvent) -> None:
        try:
            from database.models import Notification
            rule = next((r for r in TRIGGERS if r["key"] == ev.trigger_key), {})
            db.add(Notification(
                user_id=user.id,
                title="Identity verification needed",
                body=f"{rule.get('describe', 'This action requires identity verification')}. "
                     f"Please upgrade to {ev.required_level.upper()} to continue.",
                type="alert",
                data={"trigger": ev.trigger_key, "required_level": ev.required_level,
                      "route": "/kyc/upgrade"}))
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            logger.warning("kyc_trigger_notify_failed", error=str(exc))

    def _emit(self, user: User, ev: KycTriggerEvent) -> None:
        try:
            from app.services.platform_integration import get_platform_integration
            pi = get_platform_integration()
            import asyncio
            asyncio.create_task(pi.emit(
                name="kyc.trigger.fired", aggregate_id=str(ev.id),
                aggregate_type="kyc_trigger",
                payload={"trigger_key": ev.trigger_key,
                         "required_level": ev.required_level,
                         "event_type": ev.event_type},
                user_id=str(user.id)))
        except Exception:  # noqa: BLE001
            pass  # event bus optional — triggers already persisted


_service: Optional[KycTriggerService] = None


def get_kyc_trigger_service() -> KycTriggerService:
    global _service
    if _service is None:
        _service = KycTriggerService()
    return _service


def require_kyc_level(level: str):
    """FastAPI dependency factory: hard-gate an endpoint on a KYC tier.

    Usage:  @router.post("/orders", dependencies=[Depends(require_kyc_level("tier3"))])
    """
    from fastapi import Depends, HTTPException
    from app.middleware.auth import get_current_user
    from database.connection import get_db

    async def _dep(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
        import uuid as _uuid
        db_user = (await db.execute(select(User).where(
            User.id == _uuid.UUID(str(user["user_id"]))))).scalar_one_or_none()
        if db_user is None:
            raise HTTPException(status_code=401, detail="User not found")
        if _rank(db_user.kyc_level) < _rank(level):
            raise HTTPException(status_code=403, detail={
                "error": "kyc_required", "required_level": level,
                "current_level": db_user.kyc_level, "route": "/kyc/upgrade"})
        return db_user
    return _dep
