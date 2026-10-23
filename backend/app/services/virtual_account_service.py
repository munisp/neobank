"""Virtual accounts — user-created NUBAN-style collection numbers.

Each virtual account is a unique 10-digit number that resolves to a user's
primary wallet. Use cases: a freelancer gives each client a dedicated
account number; a trader separates collections by shop; an escrow gets its
own funding account; a savings goal gets a "pay yourself" number.

Rules:
  - Creation requires tier2 KYC (virtual accounts are a fraud/abuse vector
    if handed to anonymous users).
  - Numbers are unique, non-sequential, prefixed "99" (virtual range) and
    validated against the NUBAN checksum so they pass bank transfer forms.
  - Closing is soft (status=closed) — the number is never reissued.
"""

import random
import uuid
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import User, VirtualAccount
from app.services import permify_integration
from app.services import feature_integration

logger = structlog.get_logger(__name__)

VIRTUAL_PREFIX = "99"
MAX_PER_USER = 20

KYC_RANK = {"basic": 1, "tier1": 1, "tier2": 2, "intermediate": 2,
            "tier3": 3, "full": 3, "enhanced": 4}


def _nuban_check_digit(first_nine: str) -> int:
    """NUBAN checksum: weights 3,7,3 repeating over the first 9 digits."""
    weights = [3, 7, 3, 3, 7, 3, 3, 7, 3]
    total = sum(int(d) * w for d, w in zip(first_nine, weights))
    return (10 - (total % 10)) % 10


def _generate_number() -> str:
    body = VIRTUAL_PREFIX + "".join(str(random.randint(0, 9)) for _ in range(7))
    return body + str(_nuban_check_digit(body))


class VirtualAccountService:

    async def create(self, db: AsyncSession, user: User, account_name: str,
                     label: Optional[str] = None, purpose: str = "collections",
                     linked_account_id: Optional[str] = None,
                     escrow_id: Optional[str] = None) -> Dict[str, Any]:
        if KYC_RANK.get((user.kyc_level or "basic").lower(), 1) < 2:
            raise PermissionError("tier2 verification required to create virtual accounts")

        count = (await db.execute(select(func.count()).select_from(VirtualAccount).where(
            VirtualAccount.user_id == user.id,
            VirtualAccount.status != "closed"))).scalar() or 0
        if count >= MAX_PER_USER:
            raise ValueError(f"virtual account limit reached ({MAX_PER_USER})")

        number = await self._unique_number(db)
        va = VirtualAccount(
            id=uuid.uuid4(), user_id=user.id, account_number=number,
            account_name=account_name[:128], label=(label or "")[:64] or None,
            purpose=purpose, escrow_id=escrow_id, status="active")
        if linked_account_id:
            va.linked_account_id = uuid.UUID(str(linked_account_id))
        db.add(va)
        await db.commit()
        await permify_integration.grant_virtual_account_owner(str(va.id), str(user.id))
        await feature_integration.publish_feature_event(
            "VirtualAccountCreated",
            aggregate_id=str(va.id), aggregate_type="virtual_account",
            user_id=str(user.id),
            payload={"account_number": number, "purpose": purpose,
                     "escrow_id": escrow_id})
        logger.info("virtual_account_created", user_id=str(user.id), purpose=purpose)
        try:
            from app.services.billing_service import record_usage
            record_usage(str(user.id), "virtual_account")
        except Exception:
            pass
        return self._serialize(va)

    async def list_mine(self, db: AsyncSession, user: User) -> List[Dict[str, Any]]:
        rows = (await db.execute(select(VirtualAccount).where(
            VirtualAccount.user_id == user.id,
            VirtualAccount.status != "closed")
            .order_by(VirtualAccount.created_at.desc()))).scalars().all()
        return [self._serialize(r) for r in rows]

    async def freeze(self, db: AsyncSession, user: User, va_id: str) -> Dict[str, Any]:
        va = await self._owned(db, user, va_id)
        va.status = "frozen" if va.status == "active" else "active"
        await db.commit()
        await feature_integration.va_cache_invalidate(va.account_number)
        await feature_integration.publish_feature_event(
            "VirtualAccountStatusChanged",
            aggregate_id=str(va.id), aggregate_type="virtual_account",
            user_id=str(user.id), payload={"status": va.status})
        return self._serialize(va)

    async def close(self, db: AsyncSession, user: User, va_id: str) -> Dict[str, Any]:
        va = await self._owned(db, user, va_id)
        va.status = "closed"          # soft close; number never reissued
        await db.commit()
        await feature_integration.va_cache_invalidate(va.account_number)
        await feature_integration.publish_feature_event(
            "VirtualAccountClosed",
            aggregate_id=str(va.id), aggregate_type="virtual_account",
            user_id=str(user.id), payload={"account_number": va.account_number})
        return {"id": str(va.id), "status": "closed"}

    async def resolve(self, db: AsyncSession, account_number: str) -> Optional[Dict[str, Any]]:
        """Resolve an inbound transfer to a virtual number → owner + linked account.
        Used by the transfer/inbound-payment router to credit the right wallet.
        Redis-cached (numbers are immutable while active)."""
        cached = await feature_integration.va_cache_get(account_number)
        if cached is not None:
            return cached
        va = (await db.execute(select(VirtualAccount).where(
            VirtualAccount.account_number == account_number,
            VirtualAccount.status == "active"))).scalar_one_or_none()
        if not va:
            return None
        resolution = {"virtual_account_id": str(va.id), "user_id": str(va.user_id),
                      "linked_account_id": str(va.linked_account_id) if va.linked_account_id else None,
                      "escrow_id": va.escrow_id, "purpose": va.purpose,
                      "account_name": va.account_name}
        await feature_integration.va_cache_set(account_number, resolution)
        return resolution

    # ------------------------------------------------------------------
    async def _unique_number(self, db: AsyncSession) -> str:
        for _ in range(20):
            number = _generate_number()
            exists = (await db.execute(select(VirtualAccount).where(
                VirtualAccount.account_number == number))).scalar_one_or_none()
            if not exists:
                return number
        raise RuntimeError("could not allocate a unique virtual account number")

    async def _owned(self, db: AsyncSession, user: User, va_id: str) -> VirtualAccount:
        va = (await db.execute(select(VirtualAccount).where(
            VirtualAccount.id == uuid.UUID(str(va_id)),
            VirtualAccount.user_id == user.id))).scalar_one_or_none()
        if not va:
            raise LookupError("virtual account not found")
        return va

    @staticmethod
    def _serialize(va: VirtualAccount) -> Dict[str, Any]:
        return {
            "id": str(va.id), "account_number": va.account_number,
            "account_name": va.account_name, "label": va.label,
            "purpose": va.purpose, "status": va.status,
            "escrow_id": va.escrow_id,
            "linked_account_id": str(va.linked_account_id) if va.linked_account_id else None,
            "created_at": va.created_at.isoformat() if va.created_at else None,
        }


_service: Optional[VirtualAccountService] = None


def get_virtual_account_service() -> VirtualAccountService:
    global _service
    if _service is None:
        _service = VirtualAccountService()
    return _service
