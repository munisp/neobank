"""Segmentation service — rule matching and auto-enrollment.

Sits between the existing user/KYC infrastructure and the segment store:
- `user_features(user)` derives matchable traits from the existing User
  model (age from date_of_birth, kyc_level, kyc_status, country).
- `matches(criteria, features)` evaluates a segment's JSONB criteria.
  Supported keys (all optional; a segment matches when ALL provided
  keys pass):
    age_range:   [min, max]     — derived from users.date_of_birth
    kyc_levels:  [str, ...]     — users.kyc_level (e.g. ["tier2", "tier3"])
    countries:   [str, ...]     — users.country ISO-2
    kyc_status:  [str, ...]     — users.kyc_status values
- `evaluate_and_enroll(db, user)` idempotently enrolls the user into
  every active segment they match (source="rule"), and removes stale
  rule-based memberships that no longer match.

Called lazily from GET /app-store (so enrollment follows KYC/profile
changes with no extra wiring) and exposed as POST /app-store/evaluate
for explicit re-evaluation (e.g. after KYC completion events).
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import Segment, UserSegment

logger = structlog.get_logger(__name__)


def user_features(user: Any) -> Dict[str, Any]:
    """Derive matchable traits from the existing users row."""
    age: Optional[int] = None
    dob = getattr(user, "date_of_birth", None)
    if dob:
        now = datetime.now(timezone.utc)
        if dob.tzinfo is None:
            dob = dob.replace(tzinfo=timezone.utc)
        age = (now - dob).days // 365
    return {
        "age": age,
        "kyc_level": (getattr(user, "kyc_level", None) or "").lower(),
        "kyc_status": (getattr(user, "kyc_status", None) or "").lower(),
        "country": (getattr(user, "country", None) or "").upper(),
    }


def matches(criteria: Optional[Dict[str, Any]], features: Dict[str, Any]) -> bool:
    """AND-semantics rule matcher. Empty criteria never auto-match —
    those segments are join-by-choice only."""
    if not criteria:
        return False

    age_range = criteria.get("age_range")
    if age_range:
        if features["age"] is None:
            return False
        lo, hi = age_range[0], age_range[1]
        if not (lo <= features["age"] <= hi):
            return False

    kyc_levels = [v.lower() for v in criteria.get("kyc_levels", [])]
    if kyc_levels and features["kyc_level"] not in kyc_levels:
        return False

    statuses = [v.lower() for v in criteria.get("kyc_status", [])]
    if statuses and features["kyc_status"] not in statuses:
        return False

    countries = [v.upper() for v in criteria.get("countries", [])]
    if countries and features["country"] not in countries:
        return False

    return True


async def evaluate_and_enroll(db: AsyncSession, user: Any) -> List[str]:
    """Enroll `user` into all active segments whose criteria they match.
    Returns the list of segment keys the user belongs to after evaluation.
    Idempotent; never touches memberships with source 'manual' or 'admin'.
    """
    uid = user.id if isinstance(user.id, uuid.UUID) else uuid.UUID(str(user.id))
    features = user_features(user)

    segments = (await db.execute(
        select(Segment).where(Segment.is_active.is_(True)))).scalars().all()

    existing = (await db.execute(
        select(UserSegment).where(UserSegment.user_id == uid))).scalars().all()
    by_segment = {m.segment_id: m for m in existing}

    matched_keys: List[str] = []
    changed = False
    for seg in segments:
        hit = matches(seg.criteria, features)
        membership = by_segment.get(seg.id)
        if hit:
            matched_keys.append(seg.key)
            if membership is None:
                db.add(UserSegment(id=uuid.uuid4(), user_id=uid,
                                   segment_id=seg.id, source="rule"))
                changed = True
                logger.info("segments.auto_enrolled", user=str(uid), segment=seg.key)
        elif membership is not None and membership.source == "rule":
            # Rule no longer matches (e.g. aged out) — drop only rule-based rows.
            await db.delete(membership)
            changed = True
            logger.info("segments.auto_unenrolled", user=str(uid), segment=seg.key)

    # Manual/admin memberships always count as belonging.
    for m in existing:
        if m.source in ("manual", "admin"):
            seg = next((s for s in segments if s.id == m.segment_id), None)
            if seg and seg.key not in matched_keys:
                matched_keys.append(seg.key)

    if changed:
        await db.commit()
    return matched_keys
