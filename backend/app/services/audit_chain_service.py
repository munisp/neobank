"""Tamper-evident, hash-chained audit log.

Inspired by OpenClear's immutable action log: each entry's hash covers its
own fields plus the *previous* entry's hash in the same domain, so deleting
or reordering rows — not just editing them — breaks the chain. Entries are
HMAC-SHA256 keyed with a server secret (upgrade path: ECDSA key pairs, one
per signing purpose, as OpenClear does).

Verification recomputes every hash from scratch — proof, not a cached flag.
"""
import hashlib
import hmac
import json
import os
from typing import Any, Dict, List, Optional

import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import AuditChainEntry

logger = structlog.get_logger(__name__)

# Server-side signing secret. In production this comes from a secrets
# manager; the dev default is deliberately public and must not ship.
AUDIT_SECRET = os.environ.get("NB_AUDIT_CHAIN_SECRET", "dev-audit-chain-secret")

GENESIS = "0" * 64


def _canonical(entry: Dict[str, Any]) -> bytes:
    return json.dumps(entry, sort_keys=True, separators=(",", ":"),
                      default=str).encode()


def compute_hash(domain: str, sequence: int, action: str,
                 actor_id: Optional[str], aggregate_id: Optional[str],
                 payload: Dict[str, Any], prev_hash: str) -> str:
    body = _canonical({
        "domain": domain, "sequence": sequence, "action": action,
        "actor_id": actor_id, "aggregate_id": aggregate_id,
        "payload": payload, "prev_hash": prev_hash,
    })
    return hmac.new(AUDIT_SECRET.encode(), body, hashlib.sha256).hexdigest()


class AuditChainService:
    """Append-only, per-domain hash-chained audit log."""

    async def record(self, db: AsyncSession, *, action: str,
                     domain: str = "platform",
                     actor_id: Optional[str] = None,
                     aggregate_id: Optional[str] = None,
                     payload: Optional[Dict[str, Any]] = None) -> AuditChainEntry:
        last = (await db.execute(
            select(AuditChainEntry)
            .where(AuditChainEntry.domain == domain)
            .order_by(AuditChainEntry.sequence.desc())
            .limit(1))).scalar_one_or_none()
        sequence = (last.sequence + 1) if last else 1
        prev_hash = last.entry_hash if last else GENESIS
        payload = payload or {}
        entry_hash = compute_hash(domain, sequence, action, actor_id,
                                  aggregate_id, payload, prev_hash)
        entry = AuditChainEntry(
            domain=domain, sequence=sequence, action=action,
            actor_id=actor_id, aggregate_id=aggregate_id, payload=payload,
            prev_hash=prev_hash, entry_hash=entry_hash)
        db.add(entry)
        await db.flush()
        return entry

    async def verify_chain(self, db: AsyncSession, domain: str = "platform",
                           limit: int = 10000) -> Dict[str, Any]:
        """Recompute the whole chain; report the first broken link if any."""
        entries = (await db.execute(
            select(AuditChainEntry)
            .where(AuditChainEntry.domain == domain)
            .order_by(AuditChainEntry.sequence)
            .limit(limit))).scalars().all()
        prev_hash = GENESIS
        expected_seq = 0
        for entry in entries:
            expected_seq += 1
            if entry.sequence != expected_seq:
                return {"valid": False, "broken_at": entry.sequence,
                        "reason": "sequence gap — deletion detected"}
            if entry.prev_hash != prev_hash:
                return {"valid": False, "broken_at": entry.sequence,
                        "reason": "prev_hash mismatch — reordering or deletion detected"}
            recomputed = compute_hash(entry.domain, entry.sequence, entry.action,
                                      entry.actor_id, entry.aggregate_id,
                                      entry.payload or {}, entry.prev_hash)
            if not hmac.compare_digest(recomputed, entry.entry_hash):
                return {"valid": False, "broken_at": entry.sequence,
                        "reason": "hash mismatch — entry tampered"}
            prev_hash = entry.entry_hash
        return {"valid": True, "entries_checked": len(entries), "domain": domain}


_service: Optional[AuditChainService] = None


def get_audit_chain_service() -> AuditChainService:
    global _service
    if _service is None:
        _service = AuditChainService()
    return _service
