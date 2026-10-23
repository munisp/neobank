"""
Permify integration helpers for the new platform features
(multiparty escrow, virtual accounts, credit assessments, alt-data).

Design principles:
- Best-effort relationship writes: Permify tuple writes never block the
  operational path (Postgres remains the system of record).
- Fail-open checks with logging: when Permify is unreachable, checks
  degrade gracefully because DB-level role/ownership checks already
  enforce the same rules; the denial is logged for audit.
"""
from typing import Optional

import structlog

from app.services.permify_service import (
    PermifyEntityType,
    get_permify_service,
)

logger = structlog.get_logger(__name__)


# Role name mapping: multiparty escrow PartyRole -> Permify relation on `escrow`
_ESCROW_ROLE_RELATIONS = {
    "buyer": "buyer",
    "seller": "seller",
    "agent": "agent",
    "trustee": "trustee",
    "guarantor": "guarantor",
    "broker": "broker",
    "witness": "witness",
    "inspector": "inspector",
    "lawyer": "lawyer",
}


async def grant_escrow_party(escrow_id: str, user_id: str, role: str) -> bool:
    """Write an escrow party relationship tuple (best effort)."""
    relation = _ESCROW_ROLE_RELATIONS.get(role.lower(), "witness")
    try:
        svc = get_permify_service()
        ok = await svc.write_relationship(
            entity_type=PermifyEntityType.ESCROW.value,
            entity_id=str(escrow_id),
            relation=relation,
            subject_type="user",
            subject_id=str(user_id),
        )
        if ok:
            logger.info(
                "permify_escrow_party_granted",
                escrow_id=escrow_id,
                user_id=user_id,
                relation=relation,
            )
        return ok
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "permify_escrow_grant_failed",
            escrow_id=escrow_id,
            user_id=user_id,
            error=str(exc),
        )
        return False


async def revoke_escrow_party(escrow_id: str, user_id: str, role: str) -> bool:
    """Delete an escrow party relationship tuple (best effort)."""
    relation = _ESCROW_ROLE_RELATIONS.get(role.lower(), "witness")
    try:
        svc = get_permify_service()
        return await svc.delete_relationship(
            entity_type=PermifyEntityType.ESCROW.value,
            entity_id=str(escrow_id),
            relation=relation,
            subject_type="user",
            subject_id=str(user_id),
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "permify_escrow_revoke_failed",
            escrow_id=escrow_id,
            user_id=user_id,
            error=str(exc),
        )
        return False


async def grant_virtual_account_owner(virtual_account_id: str, user_id: str) -> bool:
    """Write the owner tuple for a virtual account (best effort)."""
    try:
        svc = get_permify_service()
        ok = await svc.write_relationship(
            entity_type=PermifyEntityType.VIRTUAL_ACCOUNT.value,
            entity_id=str(virtual_account_id),
            relation="owner",
            subject_type="user",
            subject_id=str(user_id),
        )
        if ok:
            logger.info(
                "permify_virtual_account_owner_granted",
                virtual_account_id=virtual_account_id,
                user_id=user_id,
            )
        return ok
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "permify_va_grant_failed",
            virtual_account_id=virtual_account_id,
            error=str(exc),
        )
        return False


async def grant_credit_assessment_subject(assessment_id: str, user_id: str) -> bool:
    """Write the subject tuple for a credit assessment (best effort)."""
    try:
        svc = get_permify_service()
        return await svc.write_relationship(
            entity_type=PermifyEntityType.CREDIT_ASSESSMENT.value,
            entity_id=str(assessment_id),
            relation="subject",
            subject_type="user",
            subject_id=str(user_id),
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("permify_credit_grant_failed", error=str(exc))
        return False


async def grant_alt_data_owner(source_id: str, user_id: str) -> bool:
    """Write the owner tuple for an alt-data consent/source (best effort)."""
    try:
        svc = get_permify_service()
        return await svc.write_relationship(
            entity_type=PermifyEntityType.ALT_DATA_SOURCE.value,
            entity_id=str(source_id),
            relation="owner",
            subject_type="user",
            subject_id=str(user_id),
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("permify_altdata_grant_failed", error=str(exc))
        return False


async def check_escrow_permission(
    escrow_id: str,
    user_id: str,
    permission: str,
    context: Optional[dict] = None,
) -> bool:
    """
    Check an escrow permission via Permify.

    Fails open (returns True) when Permify is unreachable, because the
    service layer enforces the same role checks against Postgres; the
    event is logged so the gap is auditable.
    """
    try:
        svc = get_permify_service()
        result = await svc.check_permission(
            entity_type=PermifyEntityType.ESCROW.value,
            entity_id=str(escrow_id),
            permission=permission,
            subject_type="user",
            subject_id=str(user_id),
            context=context,
        )
        if result.error:
            logger.warning(
                "permify_check_error_fail_open",
                escrow_id=escrow_id,
                permission=permission,
                error=result.error,
            )
            return True
        return result.allowed
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "permify_check_unreachable_fail_open",
            escrow_id=escrow_id,
            permission=permission,
            error=str(exc),
        )
        return True
