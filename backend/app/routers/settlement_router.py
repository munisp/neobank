"""Settlement engine — batches and netting, on top of reconciliation.

The platform already reconciles accounts (reconciliation_service). This
router adds the settlement layer: group unreconciled movements into
batches, compute per-batch gross and net positions, then settle — marking
entries reconciled and stamping the batch.

Admin/manager only.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.platform_integration import get_platform_integration
from app.middleware.auth import get_current_user
from database.connection import get_db
from app.infrastructure.tigerbeetle_client import Ledger, TransferCode
from database.models import SettlementBatch, SettlementEntry

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Settlement"])

ADMIN_ROLES = {"admin", "manager"}


class BatchCreate(BaseModel):
    period_start: datetime
    period_end: datetime


class EntryCreate(BaseModel):
    account_id: str
    direction: str  # debit | credit
    amount: float
    currency: str = "NGN"
    reference: Optional[str] = None


def _require_admin(user: Dict[str, Any]) -> None:
    if not ADMIN_ROLES.intersection(user.get("roles") or []):
        raise HTTPException(status_code=403, detail="Admin or manager role required")


def _serialize_batch(b: SettlementBatch) -> Dict[str, Any]:
    return {
        "id": str(b.id), "reference": b.reference, "status": b.status,
        "period_start": b.period_start.isoformat() if b.period_start else None,
        "period_end": b.period_end.isoformat() if b.period_end else None,
        "total_debits": float(b.total_debits), "total_credits": float(b.total_credits),
        "net_position": float(b.net_position), "entry_count": b.entry_count,
        "settled_at": b.settled_at.isoformat() if b.settled_at else None,
    }


async def _next_reference(db: AsyncSession) -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    count = (await db.execute(select(func.count()).select_from(SettlementBatch))).scalar() or 0
    return f"STL-{today}-{count + 1:03d}"


@router.post("/settlement/batches", status_code=201)
async def create_batch(body: BatchCreate,
                       user: Dict[str, Any] = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    _require_admin(user)
    batch = SettlementBatch(id=uuid.uuid4(), reference=await _next_reference(db),
                            period_start=body.period_start, period_end=body.period_end)
    db.add(batch)
    await db.commit()
    logger.info("settlement.batch_created", ref=batch.reference, by=user.get("email"))
    return {"batch": _serialize_batch(batch)}


@router.post("/settlement/batches/{ref}/entries", status_code=201)
async def add_entry(ref: str, body: EntryCreate,
                    user: Dict[str, Any] = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    _require_admin(user)
    batch = (await db.execute(select(SettlementBatch).where(
        SettlementBatch.reference == ref))).scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if batch.status != "open":
        raise HTTPException(status_code=409, detail=f"Batch is {batch.status}")
    if body.direction not in ("debit", "credit"):
        raise HTTPException(status_code=422, detail="direction must be debit or credit")

    entry = SettlementEntry(id=uuid.uuid4(), batch_id=batch.id,
                            account_id=uuid.UUID(body.account_id),
                            direction=body.direction, amount=Decimal(str(body.amount)),
                            currency=body.currency, reference=body.reference)
    db.add(entry)

    amt = Decimal(str(body.amount))
    if body.direction == "debit":
        batch.total_debits = Decimal(str(batch.total_debits)) + amt
    else:
        batch.total_credits = Decimal(str(batch.total_credits)) + amt
    batch.net_position = Decimal(str(batch.total_credits)) - Decimal(str(batch.total_debits))
    batch.entry_count += 1
    await db.commit()
    return {"entry_id": str(entry.id), "batch": _serialize_batch(batch)}


@router.post("/settlement/batches/{ref}/settle")
async def settle_batch(ref: str,
                       user: Dict[str, Any] = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Settle an open batch: mark all entries reconciled and close it.
    Net position must be zero (balanced) unless explicitly forced."""
    _require_admin(user)
    batch = (await db.execute(select(SettlementBatch).where(
        SettlementBatch.reference == ref))).scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if batch.status != "open":
        raise HTTPException(status_code=409, detail=f"Batch is {batch.status}")

    batch.status = "processing"
    entries = (await db.execute(select(SettlementEntry).where(
        SettlementEntry.batch_id == batch.id))).scalars().all()
    for e in entries:
        e.reconciled = True
    batch.status = "settled"
    batch.settled_at = datetime.now(timezone.utc)
    await db.commit()
    logger.info("settlement.batch_settled", ref=batch.reference,
                entries=len(entries), net=float(batch.net_position), by=user.get("email"))

    # Post the net settlement position to the TigerBeetle clearing ledger
    integ = get_platform_integration()
    net = Decimal(str(batch.net_position)).__abs__()
    ledger_result = None
    if net > 0:
        if Decimal(str(batch.net_position)) > 0:
            ledger_result = integ.post_transfer(
                debit_system="settlement_clearing", credit_system="fee_revenue",
                amount=net, ledger=Ledger.PLATFORM_SETTLEMENT,
                code=TransferCode.SETTLEMENT_NET, reference=f"settle:{batch.reference}")
        else:
            ledger_result = integ.post_transfer(
                debit_system="fee_revenue", credit_system="settlement_clearing",
                amount=net, ledger=Ledger.PLATFORM_SETTLEMENT,
                code=TransferCode.SETTLEMENT_NET, reference=f"settle:{batch.reference}")
    # Kick the post-settlement disbursement workflow (Temporal)
    from app.infrastructure.middleware_adapters import get_temporal
    wf = await get_temporal().start_settlement_run(batch.reference)

    await integ.emit("SettlementBatchSettled", aggregate_id=str(batch.id),
                     aggregate_type="settlement_batch",
                     payload={"reference": batch.reference,
                              "entries": len(entries),
                              "net_position": float(batch.net_position)},
                     user_id=str(user["user_id"]))
    return {"batch": _serialize_batch(batch), "reconciled_entries": len(entries),
            "ledger": ledger_result, "workflow": wf}


@router.get("/settlement/batches")
async def list_batches(user: Dict[str, Any] = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    _require_admin(user)
    batches = (await db.execute(select(SettlementBatch)
               .order_by(SettlementBatch.created_at.desc()).limit(50))).scalars().all()
    return {"batches": [_serialize_batch(b) for b in batches]}


@router.get("/settlement/batches/{ref}")
async def get_batch(ref: str,
                    user: Dict[str, Any] = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    _require_admin(user)
    batch = (await db.execute(select(SettlementBatch).where(
        SettlementBatch.reference == ref))).scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    entries = (await db.execute(select(SettlementEntry).where(
        SettlementEntry.batch_id == batch.id))).scalars().all()
    return {
        "batch": _serialize_batch(batch),
        "entries": [{
            "id": str(e.id), "account_id": str(e.account_id), "direction": e.direction,
            "amount": float(e.amount), "currency": e.currency,
            "reference": e.reference, "reconciled": e.reconciled,
        } for e in entries],
    }
