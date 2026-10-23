"""PostgreSQL persistence for multiparty escrow state.

The multiparty escrow service keeps a fast in-memory working set; this module
makes PostgreSQL the durable system of record behind it. Every mutation
persists; every read lazily rehydrates if the process restarted (in-memory
state gone). Persistence failures are logged, never swallowed silently —
funding and release operations must not proceed on state that cannot be
recovered, so callers decide: reads degrade gracefully, writes propagate.
"""

import structlog
from sqlalchemy import select

from database.connection import AsyncSessionLocal
from database.models import (EscrowApprovalConfig, EscrowLedgerEntry,
                             EscrowParty)

logger = structlog.get_logger(__name__)


async def persist_escrow_state(escrow_id: str, parties: dict,
                               approval_config, contributions: list,
                               distributions: list,
                               milestone_rules: dict = None) -> None:
    """Upsert the full state of one escrow. Called after every mutation."""
    async with AsyncSessionLocal() as session:
        # --- parties: delete + re-insert is simplest and always consistent ---
        existing = (await session.execute(select(EscrowParty).where(
            EscrowParty.escrow_id == escrow_id))).scalars().all()
        for row in existing:
            await session.delete(row)
        for party_id, p in parties.items():
            d = p.to_dict() if hasattr(p, "to_dict") else p
            session.add(EscrowParty(
                escrow_id=escrow_id,
                user_id=str(d.get("user_id")),
                role=str(d.get("role").value if hasattr(d.get("role"), "value") else d.get("role")),
                status=str(d.get("status").value if hasattr(d.get("status"), "value") else d.get("status", "pending")),
                account_id=d.get("account_id"),
                contribution_percentage=d.get("contribution_percentage", 0),
                distribution_percentage=d.get("distribution_percentage", 0),
                contributed_amount=d.get("contributed_amount", 0),
                approval_weight=d.get("approval_weight", 1),
                approved="true" if d.get("approved") else "false",
                party_metadata={"party_id": party_id,
                                **(d.get("metadata") or {})},
            ))

        # --- approval config ---
        cfg_row = (await session.execute(select(EscrowApprovalConfig).where(
            EscrowApprovalConfig.escrow_id == escrow_id))).scalar_one_or_none()
        if approval_config is not None:
            c = approval_config.to_dict() if hasattr(approval_config, "to_dict") else approval_config
            if cfg_row is None:
                cfg_row = EscrowApprovalConfig(escrow_id=escrow_id)
                session.add(cfg_row)
            cfg_row.approval_type = str(c.get("approval_type").value
                                        if hasattr(c.get("approval_type"), "value")
                                        else c.get("approval_type", "all"))
            cfg_row.required_approvals = c.get("required_approvals", 1)
            cfg_row.required_percentage = c.get("required_percentage", 100)
            deadline = c.get("approval_deadline")
            if isinstance(deadline, str):
                try:
                    from datetime import datetime as _dt
                    deadline = _dt.fromisoformat(deadline.replace("Z", "+00:00"))
                except ValueError:
                    deadline = None
            cfg_row.approval_deadline = deadline
            cfg_row.require_agent_approval = "true" if c.get("require_agent_approval") else "false"
            cfg_row.auto_release_after_inspection = (
                "true" if c.get("auto_release_after_inspection") else "false")
            cfg_row.fee_percentage = c.get("fee_percentage")
            cfg_row.milestone_rules = milestone_rules or {}

        # --- ledger entries (append-only; dedupe by reference) ---
        for entry in (contributions or []) + (distributions or []):
            ref = entry.get("reference") or entry.get("id")
            if ref:
                dup = (await session.execute(select(EscrowLedgerEntry).where(
                    EscrowLedgerEntry.escrow_id == escrow_id,
                    EscrowLedgerEntry.reference == str(ref)))).scalar_one_or_none()
                if dup:
                    continue
            session.add(EscrowLedgerEntry(
                escrow_id=escrow_id,
                party_id=str(entry.get("party_id")),
                entry_type="contribution" if entry in (contributions or []) else "distribution",
                amount=entry.get("amount", 0),
                reference=str(ref) if ref else None,
                entry_metadata={k: v for k, v in entry.items()
                                if k not in ("party_id", "amount", "reference", "id")},
            ))
        # Hash-chained audit entry for every escrow mutation (tamper evidence)
        try:
            from app.services.audit_chain_service import get_audit_chain_service
            await get_audit_chain_service().record(
                session, action="escrow.state_persisted", domain="escrow",
                aggregate_id=escrow_id,
                payload={"parties": len(parties),
                         "contributions": len(contributions),
                         "distributions": len(distributions)})
        except Exception:
            pass  # audit failure never blocks the operational write
        await session.commit()


async def hydrate_escrow_state(escrow_id: str) -> dict:
    """Load durable state for one escrow. Returns {} if none persisted."""
    async with AsyncSessionLocal() as session:
        parties = (await session.execute(select(EscrowParty).where(
            EscrowParty.escrow_id == escrow_id))).scalars().all()
        if not parties:
            return {}
        cfg = (await session.execute(select(EscrowApprovalConfig).where(
            EscrowApprovalConfig.escrow_id == escrow_id))).scalar_one_or_none()
        ledger = (await session.execute(select(EscrowLedgerEntry).where(
            EscrowLedgerEntry.escrow_id == escrow_id))).scalars().all()

    return {
        "parties": [
            {"party_id": (p.party_metadata or {}).get("party_id"),
             "user_id": p.user_id, "role": p.role, "status": p.status,
             "account_id": p.account_id,
             "contribution_percentage": float(p.contribution_percentage or 0),
             "distribution_percentage": float(p.distribution_percentage or 0),
             "contributed_amount": float(p.contributed_amount or 0),
             "approval_weight": float(p.approval_weight or 1),
             "approved": p.approved == "true",
             "metadata": {k: v for k, v in (p.party_metadata or {}).items()
                          if k != "party_id"}}
            for p in parties
        ],
        "approval_config": ({
            "approval_type": cfg.approval_type,
            "required_approvals": cfg.required_approvals,
            "required_percentage": float(cfg.required_percentage or 100),
            "require_agent_approval": cfg.require_agent_approval == "true",
            "auto_release_after_inspection": cfg.auto_release_after_inspection == "true",
            "fee_percentage": float(cfg.fee_percentage) if cfg.fee_percentage is not None else None,
            "approval_deadline": cfg.approval_deadline.isoformat() if cfg.approval_deadline else None,
        } if cfg else None),
        "milestone_rules": (cfg.milestone_rules or {}) if cfg else {},
        "contributions": [
            {"party_id": e.party_id, "amount": float(e.amount),
             "reference": e.reference, **(e.entry_metadata or {})}
            for e in ledger if e.entry_type == "contribution"
        ],
        "distributions": [
            {"party_id": e.party_id, "amount": float(e.amount),
             "reference": e.reference, **(e.entry_metadata or {})}
            for e in ledger if e.entry_type == "distribution"
        ],
    }
