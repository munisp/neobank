"""Billing engine: metered fee schedules → frozen monthly statements.

OpenClear-inspired: a fee schedule is a catalog of billable metrics
(per escrow deal, per virtual account, per credit assessment, per BNPL
purchase...), each with a unit price, optional step tiers, and a monthly
minimum. Usage is metered via record_usage(); finalize_period() freezes a
statement (re-finalizing saves a new version, never edits history).
"""
import uuid
from collections import defaultdict
from decimal import Decimal
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import BillingStatement, FeeScheduleItem, User
from app.services import feature_integration
from app.services.audit_chain_service import get_audit_chain_service

logger = structlog.get_logger(__name__)

# In-process usage meters; flushed to statements at finalize. (A Redis
# counter backend can slot in here for multi-instance deployments.)
_USAGE: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
# key: f"{user_id}:{period}:{metric}"


def _period_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m")


def record_usage(user_id: str, metric: str, quantity: int = 1,
                 period: Optional[str] = None) -> None:
    """Meter one billable event. Called by feature services (escrow deal
    created, virtual account active, credit assessment run, ...)."""
    period = period or _period_now()
    _USAGE[f"{user_id}:{period}"][metric] += quantity


def get_usage(user_id: str, period: Optional[str] = None) -> Dict[str, int]:
    return dict(_USAGE.get(f"{user_id}:{period or _period_now()}", {}))


def _price_with_tiers(item: FeeScheduleItem, quantity: int) -> Decimal:
    """Step-tier pricing: each bracket priced at its own unit rate."""
    tiers = item.tiers or []
    if not tiers:
        return Decimal(str(item.unit_price)) * quantity
    total = Decimal("0")
    remaining = quantity
    lower = 0
    sorted_tiers = sorted(tiers, key=lambda t: t.get("up_to") or 10**12)
    for tier in sorted_tiers:
        up_to = tier.get("up_to")
        bracket = (up_to - lower) if up_to is not None else remaining
        take = min(remaining, max(bracket, 0))
        if take > 0:
            total += Decimal(str(tier.get("unit_price", 0))) * take
            remaining -= take
            lower = up_to or lower
        if remaining <= 0:
            break
    if remaining > 0:  # above the last bracket → last tier's price
        total += Decimal(str(sorted_tiers[-1].get("unit_price", 0))) * remaining
    return total


class BillingService:
    async def get_schedule(self, db: AsyncSession,
                           schedule: str = "default") -> List[Dict[str, Any]]:
        rows = (await db.execute(select(FeeScheduleItem).where(
            FeeScheduleItem.schedule == schedule,
            FeeScheduleItem.active.is_(True)))).scalars().all()
        return [{"metric": r.metric, "unit_price": str(r.unit_price),
                 "currency": r.currency, "tiers": r.tiers,
                 "monthly_minimum": str(r.monthly_minimum) if r.monthly_minimum else None}
                for r in rows]

    async def upsert_fee(self, db: AsyncSession, *, metric: str,
                         unit_price: float, schedule: str = "default",
                         currency: str = "NGN",
                         tiers: Optional[List[Dict[str, Any]]] = None,
                         monthly_minimum: Optional[float] = None) -> Dict[str, Any]:
        item = (await db.execute(select(FeeScheduleItem).where(
            FeeScheduleItem.schedule == schedule,
            FeeScheduleItem.metric == metric))).scalar_one_or_none()
        if item is None:
            item = FeeScheduleItem(id=uuid.uuid4(), schedule=schedule, metric=metric)
            db.add(item)
        item.unit_price = unit_price
        item.currency = currency
        item.tiers = tiers or []
        item.monthly_minimum = monthly_minimum
        item.active = True
        await db.commit()
        await get_audit_chain_service().record(
            db, action="billing.fee_upserted", domain="billing",
            aggregate_id=f"{schedule}:{metric}",
            payload={"unit_price": unit_price})
        await db.commit()
        return {"metric": metric, "schedule": schedule, "unit_price": str(unit_price)}

    async def calculate_period(self, db: AsyncSession, user: User,
                               period: Optional[str] = None,
                               schedule: str = "default") -> Dict[str, Any]:
        """Live statement calculation for any period."""
        period = period or _period_now()
        usage = get_usage(str(user.id), period)
        items = (await db.execute(select(FeeScheduleItem).where(
            FeeScheduleItem.schedule == schedule,
            FeeScheduleItem.active.is_(True)))).scalars().all()
        by_metric = {i.metric: i for i in items}

        lines: List[Dict[str, Any]] = []
        total = Decimal("0")
        currency = "NGN"
        for metric, quantity in sorted(usage.items()):
            item = by_metric.get(metric)
            if item is None or quantity <= 0:
                continue
            amount = _price_with_tiers(item, quantity)
            if item.monthly_minimum is not None:
                amount = max(amount, Decimal(str(item.monthly_minimum)))
            currency = item.currency
            lines.append({"metric": metric, "quantity": quantity,
                          "unit_price": str(item.unit_price),
                          "amount": str(amount)})
            total += amount
        return {"user_id": str(user.id), "period": period, "lines": lines,
                "total": str(total), "currency": currency}

    async def finalize_period(self, db: AsyncSession, user: User,
                              period: Optional[str] = None,
                              schedule: str = "default") -> Dict[str, Any]:
        """Freeze the statement. Re-finalizing stores a replacement version."""
        period = period or _period_now()
        calc = await self.calculate_period(db, user, period, schedule)
        existing = (await db.execute(select(BillingStatement).where(
            BillingStatement.user_id == user.id,
            BillingStatement.period == period).order_by(
            BillingStatement.version.desc()))).scalars().first()
        version = (existing.version + 1) if existing else 1
        stmt = BillingStatement(
            id=uuid.uuid4(), user_id=user.id, period=period,
            lines=calc["lines"], total=Decimal(calc["total"]),
            currency=calc["currency"], version=version)
        db.add(stmt)
        await db.commit()
        await get_audit_chain_service().record(
            db, action="billing.statement_finalized", domain="billing",
            actor_id=str(user.id), aggregate_id=str(stmt.id),
            payload={"period": period, "total": calc["total"],
                     "version": version})
        await db.commit()
        await feature_integration.publish_feature_event(
            "BillingStatementFinalized", aggregate_id=str(stmt.id),
            aggregate_type="billing", user_id=str(user.id),
            payload={"period": period, "total": calc["total"],
                     "version": version})
        return {"id": str(stmt.id), "period": period, "total": calc["total"],
                "currency": calc["currency"], "version": version,
                "lines": calc["lines"]}

    async def list_statements(self, db: AsyncSession,
                              user: User) -> List[Dict[str, Any]]:
        rows = (await db.execute(select(BillingStatement).where(
            BillingStatement.user_id == user.id).order_by(
            BillingStatement.period.desc()))).scalars().all()
        return [{"id": str(r.id), "period": r.period, "total": str(r.total),
                 "currency": r.currency, "version": r.version,
                 "lines": r.lines} for r in rows]


_service: Optional[BillingService] = None


def get_billing_service() -> BillingService:
    global _service
    if _service is None:
        _service = BillingService()
    return _service
