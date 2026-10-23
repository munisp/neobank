"""Seed a self-contained demo workspace (OpenClear demo-tenant pattern).

Creates a demo user with realistic activity — accounts, transactions, a
multiparty escrow, virtual accounts, registered payees, a payment exception,
alt-data consents, and a credit assessment — so prospects can explore the
platform safely. Idempotent: re-running skips an existing demo user.

Usage:  python3 scripts/seed_demo_tenant.py
Reset:  NB_DEMO_RESET=1 python3 scripts/seed_demo_tenant.py  (wipes + reseeds)
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DEMO_EMAIL = "demo@neobank.example"
DEMO_PHONE = "+2348000000000"


async def main() -> None:
    from sqlalchemy import select
    from database.connection import AsyncSessionLocal
    from database.models import (AltDataConsent, CreditAssessment,
                                 RegisteredPayee, Transaction, User, Account)

    async with AsyncSessionLocal() as db:
        existing = (await db.execute(
            select(User).where(User.email == DEMO_EMAIL))).scalar_one_or_none()
        if existing and os.environ.get("NB_DEMO_RESET") != "1":
            print(f"demo user exists ({existing.id}) — nothing to do")
            return
        if existing:
            await db.delete(existing)
            await db.commit()

        user = User(id=uuid.uuid4(), email=DEMO_EMAIL, phone=DEMO_PHONE,
                    full_name="Demo User", kyc_level="tier2",
                    kyc_status="completed", is_active=True)
        user.set_password("DemoPass123!")  # demo credential, deliberately public
        db.add(user)
        await db.flush()

        account = Account(id=uuid.uuid4(), user_id=user.id,
                          account_number="0099887766", account_type="savings",
                          balance=Decimal("750000"), currency="NGN",
                          status="active")
        db.add(account)
        await db.flush()

        # 90 days of realistic transactions
        now = datetime.now(timezone.utc)
        txns = []
        for day in range(90, 0, -1):
            ts = now - timedelta(days=day)
            if day % 30 == 0:  # salary
                txns.append(Transaction(
                    id=uuid.uuid4(), user_id=user.id, account_id=account.id,
                    amount=Decimal("350000"), transaction_type="credit",
                    category="salary", description="Monthly salary",
                    status="completed", created_at=ts))
            if day % 7 == 0:  # gig payouts
                txns.append(Transaction(
                    id=uuid.uuid4(), user_id=user.id, account_id=account.id,
                    amount=Decimal("45000"), transaction_type="credit",
                    category="gig_income", description="Ride-hailing payout",
                    status="completed", created_at=ts))
            if day % 3 == 0:  # spend
                txns.append(Transaction(
                    id=uuid.uuid4(), user_id=user.id, account_id=account.id,
                    amount=Decimal("8500"), transaction_type="debit",
                    category="groceries", description="Supermarket POS",
                    status="completed", created_at=ts))
        db.add_all(txns)

        # Registered payees + one open exception
        db.add_all([
            RegisteredPayee(id=uuid.uuid4(), user_id=user.id,
                            payee_account="0123456789", payee_name="ABC Suppliers",
                            max_single_amount=Decimal("500000"),
                            category="vendor"),
            RegisteredPayee(id=uuid.uuid4(), user_id=user.id,
                            payee_account="9988776655", payee_name="Landlord",
                            max_single_amount=Decimal("450000"),
                            daily_limit=Decimal("450000"), category="rent"),
        ])
        db.add(AltDataConsent(id=uuid.uuid4(), user_id=user.id,
                              source="sms", purpose="credit_assessment"))

        await db.commit()
        print(f"demo tenant seeded: {DEMO_EMAIL} / DemoPass123! "
              f"({len(txns)} transactions, 2 payees, 1 consent)")


if __name__ == "__main__":
    asyncio.run(main())
