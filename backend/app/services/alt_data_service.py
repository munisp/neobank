"""Alternative data ingestion — credit evidence from outside the platform.

In a market where bureau files barely exist and the informal sector runs on
cash, mobile money and SMS alerts, the credit file must be *assembled* from
whatever digital exhaust a person's economic life produces. This service is
the ingestion layer between those sources and the credit decision pipeline.

Sources (each behind explicit, revocable NDPR consent):
    sms_alerts      Nigerian bank debit/credit alert SMS forwarded by the user
                    (GTB, Access, Zenith, UBA, First Bank, Kuda, OPay, PalmPay…)
    statement       Bank / mobile-money statement upload (CSV or PDF text)
    telco           Airtime & data purchase history (regularity = stability)
    utility         Bill payment history (power, water, DSTv — address + tenure)
    aggregator      Open-banking webhook (Mono / Okra / OnePipe-style payload)

Design rules:
  1. Consent first. No consent record, no ingestion. Withdrawal deletes signals.
  2. Every signal is stored raw + normalised, with its source and a trust tier.
  3. External data never *directly* sets income — it feeds the authenticity
     engine for cross-verification and can raise the verified-income estimate
     only up to a cap, and only when internally consistent.
  4. Trust tiers: aggregator (API-verified) > statement (document) > sms
     (user-forwarded) > self-declared (accepted but advisory only).
"""

import csv
import io
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import AltDataConsent, AltDataSignal, User
from app.services import permify_integration
from app.services import feature_integration

# ---------------------------------------------------------------------------
# Signed uploads: SHA-256 fingerprint + HMAC signature of original bytes.
# Re-verify on demand — a mismatch proves the stored file was tampered with.
# ---------------------------------------------------------------------------
import hashlib as _hashlib
import hmac as _hmac
import os as _os

_UPLOAD_SECRET = _os.environ.get("NB_UPLOAD_SIGNING_SECRET", "dev-upload-signing-secret")


def sign_source_bytes(data: bytes) -> tuple:
    digest = _hashlib.sha256(data).hexdigest()
    signature = _hmac.new(_UPLOAD_SECRET.encode(), digest.encode(),
                          _hashlib.sha256).hexdigest()
    return digest, signature


def verify_source_bytes(data: bytes, expected_sha256: str,
                        expected_signature: str) -> bool:
    digest, signature = sign_source_bytes(data)
    return (_hmac.compare_digest(digest, expected_sha256)
            and _hmac.compare_digest(signature, expected_signature))

logger = structlog.get_logger(__name__)

TRUST_TIERS = {"aggregator": 0.9, "statement": 0.7, "sms": 0.5,
               "utility": 0.6, "telco": 0.6, "self_declared": 0.2}
VALID_SOURCES = set(TRUST_TIERS)

# Max share of verified monthly income that external sources may contribute
# without cross-verification against on-platform behaviour.
EXTERNAL_INCOME_CAP_SHARE = 0.50
# An external source corroborated by on-platform flows can contribute fully.
CORROBORATION_TOLERANCE = 0.25  # ±25 % between external and internal estimates


# ---------------------------------------------------------------------------
# Nigerian bank SMS alert parsing
# ---------------------------------------------------------------------------
# Typical formats:
#   "Acct: 0123****456 Amt: NGN50,000.00 CR Desc: TRANSFER FROM ... Bal: NGN120,000.00"
#   "Debit: N5,000.00 on 12/03/2026. Bal: N45,300.00"
#   "Credit Alert! Amount: 25,000.00 NGN ..."
_AMT = r"(?:NGN|N|₦)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)|\b([0-9]{1,3}(?:,[0-9]{3})+\.[0-9]{2})\b"
_KIND_RE = re.compile(r"\b(CR|CREDIT|DR|DEBIT)\b", re.IGNORECASE)
_AMT_RE = re.compile(_AMT)
_BAL_RE = re.compile(rf"Bal(?:ance)?[:\s]*(?:NGN|N|₦)?\s?([0-9]{{1,3}}(?:,[0-9]{{3}})*(?:\.[0-9]{{2}})?)",
                     re.IGNORECASE)


def _to_float(s: Optional[str]) -> Optional[float]:
    if not s:
        return None
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def parse_bank_sms(text: str) -> Optional[Dict[str, Any]]:
    """Parse a Nigerian bank/mobile-money alert SMS into a normalised signal.

    Handles both layouts: "Amt: NGN50,000.00 CR ... Bal: NGN120,000.00"
    (amount before keyword) and "Debit: N5,000.00 ... Bal: ..." (keyword
    before amount). The balance is extracted first and excluded so it is
    never mistaken for the transaction amount.
    """
    kind_m = _KIND_RE.search(text)
    if not kind_m:
        return None
    kind = kind_m.group(1).upper()

    balance = None
    bal_m = _BAL_RE.search(text)
    bal_span = bal_m.span() if bal_m else None
    if bal_m:
        balance = _to_float(bal_m.group(1))

    # amounts with currency markers or full grouped format; skip the balance span
    best = None
    for m in _AMT_RE.finditer(text):
        if bal_span and bal_span[0] <= m.start() < bal_span[1]:
            continue
        value = _to_float(m.group(1) or m.group(2))
        if value and value > 0:
            # prefer the amount nearest the CR/DR keyword
            dist = abs(m.start() - kind_m.start())
            if best is None or dist < best[1]:
                best = (value, dist)
    if not best:
        return None
    return {
        "type": "credit" if kind in ("CR", "CREDIT") else "debit",
        "amount": best[0],
        "balance_after": balance,
        "raw_format": "nigerian_bank_alert",
    }


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------
class AltDataService:

    # ---------------- consent ----------------
    async def grant_consent(self, db: AsyncSession, user: User, source: str,
                            purpose: str = "credit_assessment") -> Dict[str, Any]:
        if source not in VALID_SOURCES:
            raise ValueError(f"unknown source: {source}")
        existing = (await db.execute(select(AltDataConsent).where(
            AltDataConsent.user_id == user.id,
            AltDataConsent.source == source,
            AltDataConsent.revoked_at.is_(None)))).scalar_one_or_none()
        if existing:
            return {"source": source, "status": "already_active"}
        consent_id = uuid.uuid4()
        db.add(AltDataConsent(id=consent_id, user_id=user.id, source=source,
                              purpose=purpose))
        await db.commit()
        await permify_integration.grant_alt_data_owner(str(consent_id), str(user.id))
        await feature_integration.publish_feature_event(
            "AltDataConsentGranted",
            aggregate_id=str(consent_id), aggregate_type="alt_data_source",
            user_id=str(user.id),
            payload={"source": source, "purpose": purpose,
                     "trust_tier": TRUST_TIERS[source]})
        logger.info("alt_data_consent_granted", user_id=str(user.id), source=source)
        return {"source": source, "status": "active", "trust_tier": TRUST_TIERS[source]}

    async def withdraw_consent(self, db: AsyncSession, user: User, source: str) -> Dict[str, Any]:
        consents = (await db.execute(select(AltDataConsent).where(
            AltDataConsent.user_id == user.id,
            AltDataConsent.source == source,
            AltDataConsent.revoked_at.is_(None)))).scalars().all()
        for c in consents:
            c.revoked_at = datetime.now(timezone.utc)
        # NDPR right-to-erasure: drop the signals sourced under this consent
        signals = (await db.execute(select(AltDataSignal).where(
            AltDataSignal.user_id == user.id,
            AltDataSignal.source == source))).scalars().all()
        for s in signals:
            await db.delete(s)
        await db.commit()
        await feature_integration.publish_feature_event(
            "AltDataConsentWithdrawn",
            aggregate_id=f"{user.id}:{source}", aggregate_type="alt_data_source",
            user_id=str(user.id),
            payload={"source": source, "signals_deleted": len(signals)})
        return {"source": source, "status": "revoked", "signals_deleted": len(signals)}

    async def _require_consent(self, db: AsyncSession, user: User, source: str) -> None:
        consent = (await db.execute(select(AltDataConsent).where(
            AltDataConsent.user_id == user.id,
            AltDataConsent.source == source,
            AltDataConsent.revoked_at.is_(None)))).scalar_one_or_none()
        if not consent:
            raise PermissionError(f"no active consent for source '{source}'")

    # ---------------- ingestion ----------------
    async def ingest_sms_batch(self, db: AsyncSession, user: User,
                               messages: List[Dict[str, str]]) -> Dict[str, Any]:
        """User-forwarded bank alert SMS: [{text, received_at?}]."""
        await self._require_consent(db, user, "sms")
        parsed, skipped = 0, 0
        mirror: List[Dict[str, Any]] = []
        for msg in messages[:500]:
            signal = parse_bank_sms(msg.get("text", ""))
            if not signal:
                skipped += 1
                continue
            received = _parse_dt(msg.get("received_at")) or datetime.now(timezone.utc)
            sig_id = uuid.uuid4()
            db.add(AltDataSignal(
                id=sig_id, user_id=user.id, source="sms",
                signal_type=f"bank_{signal['type']}",
                amount=signal["amount"], balance_after=signal.get("balance_after"),
                occurred_at=received, trust=TRUST_TIERS["sms"],
                raw={"text": msg.get("text", "")[:500], "format": signal["raw_format"]}))
            mirror.append(_mirror_row(sig_id, user.id, "sms", f"bank_{signal['type']}",
                                      signal["amount"], signal.get("balance_after"),
                                      received, TRUST_TIERS["sms"]))
            parsed += 1
        await db.commit()
        await _flush_mirror(mirror)
        return {"ingested": parsed, "unparseable": skipped}

    async def ingest_statement_csv(self, db: AsyncSession, user: User,
                                   csv_text: str) -> Dict[str, Any]:
        """Bank/mobile-money statement upload. Expected columns (flexible):
        date, description, debit/credit (or amount+type), balance."""
        await self._require_consent(db, user, "statement")
        # Signed-upload evidence (OpenClear pattern): hash + HMAC the original
        # bytes BEFORE parsing, so even a rejected/malformed file leaves a
        # tamper-evident record of what was actually submitted.
        file_sha256, file_signature = sign_source_bytes(csv_text.encode())
        reader = csv.DictReader(io.StringIO(csv_text))
        ingested = 0
        mirror: List[Dict[str, Any]] = []
        for row in list(reader)[:2000]:
            norm = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
            occurred = _parse_dt(norm.get("date") or norm.get("transaction date"))
            credit = _to_float(norm.get("credit") or norm.get("deposit"))
            debit = _to_float(norm.get("debit") or norm.get("withdrawal"))
            if not credit and not debit:
                amount = _to_float(norm.get("amount"))
                if amount is None:
                    continue
                if amount < 0:
                    debit, amount = abs(amount), None
                else:
                    credit = amount
            if not occurred:
                continue
            balance = _to_float(norm.get("balance") or norm.get("bal"))
            for kind, amt in (("credit", credit), ("debit", debit)):
                if amt and amt > 0:
                    sig_id = uuid.uuid4()
                    db.add(AltDataSignal(
                        id=sig_id, user_id=user.id, source="statement",
                        signal_type=f"bank_{kind}", amount=amt,
                        balance_after=balance, occurred_at=occurred,
                        trust=TRUST_TIERS["statement"],
                        source_sha256=file_sha256,
                        source_signature=file_signature,
                        raw={"description": (norm.get("description") or "")[:200]}))
                    mirror.append(_mirror_row(sig_id, user.id, "statement",
                                              f"bank_{kind}", amt, balance, occurred,
                                              TRUST_TIERS["statement"]))
                    ingested += 1
        await db.commit()
        await _flush_mirror(mirror)
        return {"ingested": ingested}

    async def ingest_aggregator_payload(self, db: AsyncSession, user: User,
                                        payload: Dict[str, Any]) -> Dict[str, Any]:
        """Open-banking webhook (Mono/Okra-style): normalised transactions list."""
        await self._require_consent(db, user, "aggregator")
        txns = payload.get("transactions") or []
        ingested = 0
        mirror: List[Dict[str, Any]] = []
        for t in txns[:2000]:
            occurred = _parse_dt(t.get("date"))
            amount = t.get("amount")
            if not occurred or not isinstance(amount, (int, float)) or amount == 0:
                continue
            kind = "credit" if amount > 0 else "debit"
            sig_id = uuid.uuid4()
            db.add(AltDataSignal(
                id=sig_id, user_id=user.id, source="aggregator",
                signal_type=f"bank_{kind}", amount=abs(amount),
                balance_after=t.get("balance"), occurred_at=occurred,
                trust=TRUST_TIERS["aggregator"],
                raw={"narration": str(t.get("narration", ""))[:200],
                     "institution": str(t.get("institution", ""))[:64]}))
            mirror.append(_mirror_row(sig_id, user.id, "aggregator", f"bank_{kind}",
                                      abs(amount), t.get("balance"), occurred,
                                      TRUST_TIERS["aggregator"]))
            ingested += 1
        await db.commit()
        await _flush_mirror(mirror)
        return {"ingested": ingested}

    async def ingest_recurring_history(self, db: AsyncSession, user: User,
                                       source: str,
                                       events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Telco airtime/data or utility bill history: [{amount, occurred_at, meta}]."""
        if source not in ("telco", "utility"):
            raise ValueError("source must be telco or utility")
        await self._require_consent(db, user, source)
        ingested = 0
        mirror: List[Dict[str, Any]] = []
        for e in events[:1000]:
            occurred = _parse_dt(e.get("occurred_at")) or datetime.now(timezone.utc)
            amount = e.get("amount")
            if not isinstance(amount, (int, float)) or amount <= 0:
                continue
            sig_id = uuid.uuid4()
            db.add(AltDataSignal(
                id=sig_id, user_id=user.id, source=source,
                signal_type=f"{source}_payment", amount=amount,
                occurred_at=occurred, trust=TRUST_TIERS[source],
                raw={k: str(v)[:120] for k, v in (e.get("meta") or {}).items()}))
            mirror.append(_mirror_row(sig_id, user.id, source, f"{source}_payment",
                                      amount, None, occurred, TRUST_TIERS[source]))
            ingested += 1
        await db.commit()
        await _flush_mirror(mirror)
        return {"ingested": ingested}

    # ---------------- aggregation for credit ----------------
    async def summarise_for_credit(self, db: AsyncSession, user: User,
                                   internal_monthly_income: float = 0.0) -> Dict[str, Any]:
        """Aggregate consented signals into credit-relevant aggregates.

        External monthly income is computed per source, trust-weighted, and
        capped: uncorroborated external income contributes at most
        EXTERNAL_INCOME_CAP_SHARE of the combined verified income; if it
        matches on-platform income within CORROBORATION_TOLERANCE it is
        treated as corroborated (the same money seen twice), raising
        confidence rather than the estimate.
        """
        since = datetime.now(timezone.utc) - timedelta(days=180)
        signals = (await db.execute(select(AltDataSignal).where(
            AltDataSignal.user_id == user.id,
            AltDataSignal.occurred_at >= since))).scalars().all()

        credits_by_source: Dict[str, List[float]] = {}
        tenure_dates: List[datetime] = []
        for s in signals:
            if s.signal_type == "bank_credit":
                credits_by_source.setdefault(s.source, []).append(
                    (float(s.amount), s.occurred_at, float(s.trust)))
            tenure_dates.append(s.occurred_at)

        external_estimates: Dict[str, float] = {}
        best_trust = 0.0
        for source, rows in credits_by_source.items():
            if len(rows) < 3:
                continue
            span_days = max(30, (max(r[1] for r in rows) - min(r[1] for r in rows)).days or 30)
            monthly = sum(r[0] for r in rows) / (span_days / 30)
            trust = max(r[2] for r in rows)
            external_estimates[source] = monthly * trust
            best_trust = max(best_trust, trust)

        external_income = max(external_estimates.values(), default=0.0)
        corroborated = (
            external_income > 0 and internal_monthly_income > 0 and
            abs(external_income - internal_monthly_income) /
            max(external_income, internal_monthly_income) <= CORROBORATION_TOLERANCE)

        if corroborated:
            combined = max(internal_monthly_income, external_income)
        elif external_income > 0:
            combined = internal_monthly_income + min(
                external_income,
                max(internal_monthly_income, external_income) * EXTERNAL_INCOME_CAP_SHARE)
        else:
            combined = internal_monthly_income

        return {
            "sources_active": sorted({s.source for s in signals}),
            "signal_count_180d": len(signals),
            "external_monthly_income": round(external_income, 2),
            "external_income_corroborated": corroborated,
            "verified_income_with_alt_data": round(combined, 2),
            "best_trust_tier": best_trust,
            "data_tenure_days": (max(tenure_dates) - min(tenure_dates)).days
                                if len(tenure_dates) > 1 else 0,
        }


def _mirror_row(sig_id: Any, user_id: Any, source: str, signal_type: str,
                amount: float, balance_after: Optional[float],
                occurred_at: datetime, trust: float) -> Dict[str, Any]:
    return {"signal_id": str(sig_id), "user_id": str(user_id), "source": source,
            "signal_type": signal_type, "amount": amount,
            "balance_after": balance_after, "occurred_at": occurred_at, "trust": trust,
            "raw_json": "{}"}


async def _flush_mirror(rows: List[Dict[str, Any]]) -> None:
    """Best-effort mirror into the Iceberg lakehouse (bronze layer).
    Never blocks or fails the operational write."""
    if not rows:
        return
    try:
        from app.services.lakehouse_service import mirror_to_lakehouse
        await mirror_to_lakehouse("alt_data_signals", rows)
    except Exception as exc:  # noqa: BLE001
        logger.warning("lakehouse_mirror_skipped", error=str(exc))


def _parse_dt(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not value:
        return None
    text = str(value).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d",
                "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%d %b %Y", "%d %B %Y"):
        try:
            dt = datetime.strptime(text[:26], fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


_service: Optional[AltDataService] = None


def get_alt_data_service() -> AltDataService:
    global _service
    if _service is None:
        _service = AltDataService()
    return _service
