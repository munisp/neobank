"""
Fraud router — rule-based fraud scoring over the canonical transactions
table, with alerts persisted to `fraud_alerts`.
"""
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, List

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from database.models import Account, Transaction, FraudAlert, utcnow
from app.middleware.auth import get_current_user_from_credentials

logger = structlog.get_logger()

router = APIRouter(prefix="/fraud", tags=["fraud"])


class FraudCheckRequest(BaseModel):
    account_id: str
    amount: float = Field(..., gt=0)
    destination_account_number: Optional[str] = None
    transaction_type: str = "transfer"


class FraudCheckResponse(BaseModel):
    fraud_score: float
    risk_level: str
    flagged: bool
    rules_triggered: List[str]
    alert_id: Optional[str] = None


def _risk_level(score: float) -> str:
    if score >= 0.8:
        return "critical"
    if score >= 0.6:
        return "high"
    if score >= 0.35:
        return "medium"
    return "low"


async def _rule_based_score(
    db: AsyncSession, account: Account, amount: Decimal,
    destination_account_number: Optional[str],
) -> tuple:
    """Heuristic fraud rules. Returns (score 0..1, rules_triggered)."""
    score = 0.0
    rules: List[str] = []

    # Large amount thresholds (NGN)
    if amount > Decimal("1000000"):
        score += 0.35
        rules.append("amount_above_1m")
    elif amount > Decimal("500000"):
        score += 0.2
        rules.append("amount_above_500k")

    # Velocity: transactions in the last hour from this account
    one_hour_ago = utcnow() - timedelta(hours=1)
    velocity = await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.account_id == account.id,
            Transaction.created_at >= one_hour_ago,
        )
    )
    recent_count = velocity.scalar() or 0
    if recent_count >= 10:
        score += 0.3
        rules.append("velocity_10_plus_per_hour")
    elif recent_count >= 5:
        score += 0.15
        rules.append("velocity_5_plus_per_hour")

    # Insufficient balance / round-trip drain
    if amount > (account.available_balance or 0):
        score += 0.25
        rules.append("exceeds_available_balance")
    if account.balance and amount >= Decimal("0.95") * account.balance and amount > 0:
        score += 0.15
        rules.append("near_full_balance_drain")

    # First-time destination
    if destination_account_number:
        seen = await db.execute(
            select(func.count(Transaction.id)).where(
                Transaction.account_id == account.id,
                Transaction.destination_account_number == destination_account_number,
                Transaction.status == "completed",
            )
        )
        if (seen.scalar() or 0) == 0:
            score += 0.1
            rules.append("first_time_destination")

    return min(score, 1.0), rules


@router.post("/check-transaction", response_model=FraudCheckResponse)
async def check_transaction(
    payload: FraudCheckRequest,
    current_user: dict = Depends(get_current_user_from_credentials),
    db: AsyncSession = Depends(get_db),
):
    """Score a proposed transaction; persist an alert when risk is high."""
    result = await db.execute(
        select(Account).where(Account.id == uuid.UUID(payload.account_id))
    )
    account = result.scalar_one_or_none()
    if not account or str(account.user_id) != current_user["user_id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    amount = Decimal(str(payload.amount))
    score, rules = await _rule_based_score(
        db, account, amount, payload.destination_account_number
    )

    # ML ensemble overlay: when trained weights are available, blend the
    # rule score (precision-anchored) with the ML score (pattern coverage).
    # 60% ML / 40% rules — rules remain as interpretable safety rails.
    ml_detail = None
    try:
        from datetime import datetime as _dt
        from app.ml.inference import get_fraud_scorer
        ml = get_fraud_scorer().score({
            "amount": float(amount),
            "transaction_type": payload.transaction_type,
            "channel": "api",
            "account_balance": float(account.balance or 0),
            "account_age_days": max((utcnow() - account.created_at).days, 0) if account.created_at else 365,
            "hour": _dt.utcnow().hour,
            "weekday": _dt.utcnow().weekday(),
            "is_new_destination": "first_time_destination" in rules,
            "kyc_level": 1,
        })
        if ml.get("score") is not None:
            ml_score = float(ml["score"])
            score = round(0.4 * score + 0.6 * ml_score, 4)
            ml_detail = ml.get("models")
            rules.append(f"ml_ensemble:{ml_score:.3f}")
    except Exception as exc:  # noqa: BLE001
        logger.warning("ml scoring skipped", error=str(exc))
    level = _risk_level(score)
    flagged = score >= 0.6

    alert_id = None
    if flagged:
        alert = FraudAlert(
            id=uuid.uuid4(),
            transaction_id=uuid.uuid4(),  # placeholder until txn is created
            user_id=uuid.UUID(current_user["user_id"]),
            alert_type="pre_transaction_check",
            severity=level,
            fraud_score=score,
            detection_rules={"rules": rules, "transaction_type": payload.transaction_type},
            status="open",
        )
        db.add(alert)
        await db.commit()
        alert_id = str(alert.id)
        logger.warning("fraud alert raised", account_id=payload.account_id,
                       score=score, rules=rules)

    return FraudCheckResponse(
        fraud_score=round(score, 4),
        risk_level=level,
        flagged=flagged,
        rules_triggered=rules,
        alert_id=alert_id,
    )


@router.get("/alerts")
async def list_alerts(
    status_filter: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user_from_credentials),
    db: AsyncSession = Depends(get_db),
):
    """List fraud alerts for the caller."""
    conditions = [FraudAlert.user_id == uuid.UUID(current_user["user_id"])]
    if status_filter:
        conditions.append(FraudAlert.status == status_filter)
    result = await db.execute(
        select(FraudAlert)
        .where(*conditions)
        .order_by(desc(FraudAlert.created_at))
        .limit(min(limit, 200))
    )
    alerts = result.scalars().all()
    return {
        "alerts": [
            {
                "id": str(a.id),
                "transaction_id": str(a.transaction_id),
                "alert_type": a.alert_type,
                "severity": a.severity,
                "fraud_score": float(a.fraud_score),
                "status": a.status,
                "rules": (a.detection_rules or {}).get("rules", []),
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in alerts
        ],
        "total": len(alerts),
    }


@router.post("/report")
async def report_fraud(
    transaction_id: str,
    reason: str,
    current_user: dict = Depends(get_current_user_from_credentials),
    db: AsyncSession = Depends(get_db),
):
    """User-reported fraud: raises a critical alert on the transaction."""
    result = await db.execute(
        select(Transaction).where(Transaction.id == uuid.UUID(transaction_id))
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    account_result = await db.execute(
        select(Account).where(Account.id == txn.account_id)
    )
    account = account_result.scalar_one_or_none()
    if not account or str(account.user_id) != current_user["user_id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your transaction")

    alert = FraudAlert(
        id=uuid.uuid4(),
        transaction_id=txn.id,
        user_id=uuid.UUID(current_user["user_id"]),
        alert_type="user_report",
        severity="critical",
        fraud_score=Decimal("1.0"),
        detection_rules={"rules": ["user_report"], "reason": reason},
        status="open",
    )
    txn.fraud_flagged = True
    db.add(alert)
    await db.commit()

    logger.warning("user reported fraud", transaction_id=transaction_id)
    return {"success": True, "alert_id": str(alert.id)}
