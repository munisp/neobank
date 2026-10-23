"""
Feature ↔ middleware integration layer.

Wires the new feature services (multiparty escrow, virtual accounts,
credit decisioning, alt-data) into the platform middleware stack:

  Kafka/Fluvio  → domain events via platform_integration.emit (backbone bus)
  Dapr          → pub/sub mirror onto the Kafka-backed pubsub component,
                  so Go/Rust sidecar services (escrow-go, ledger-gateway-go,
                  transaction-processor-rs) can subscribe without a Kafka client
  TigerBeetle   → double-entry ledger postings for escrow fund / distribute /
                  refund (ESCROW_HOLDING / ESCROW_FEE system accounts)
  Temporal      → escrow approval-deadline workflow (auto-expiry SLA)
  Redis         → virtual-account number resolution cache, credit score cache
  OpenSearch    → credit assessments + escrow lifecycle indexed for search
  Keycloak      → unchanged (token validation upstream); role claims carried
                  in JWTs are consumed by PBACMiddleware
  Permify       → relationship tuples — see permify_integration.py
  Mojaloop      → escrow/VA payouts settle through the existing Mojaloop
                  adapter when the counterparty is off-us (platform_integration)
  GeoLibre/Sedona → segment_router already exposes geo heatmaps; gig-worker
                  segment tiles consume those endpoints

Every helper is best-effort and never raises: Postgres remains the system
of record and middleware outages degrade to logged skips.
"""
from decimal import Decimal
from typing import Any, Dict, List, Optional

import structlog

from app.infrastructure.tigerbeetle_client import Ledger, TransferCode

logger = structlog.get_logger(__name__)


# ============================================================================
# Events — Kafka/Fluvio backbone + Dapr pub/sub mirror + OpenSearch index
# ============================================================================

async def publish_feature_event(
    name: str,
    *,
    aggregate_id: str,
    aggregate_type: str,
    payload: Dict[str, Any],
    user_id: Optional[str] = None,
    topic: Optional[str] = None,
) -> bool:
    """Emit a domain event on the backbone bus, mirror via Dapr pub/sub
    (Kafka) for Go/Rust consumers, and index into OpenSearch. Never raises."""
    ok = True
    try:
        from app.services.platform_integration import get_platform_integration
        ok = await get_platform_integration().emit(
            name, aggregate_id=aggregate_id, aggregate_type=aggregate_type,
            payload=payload, user_id=user_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("feature_event.bus_failed", type=name, error=str(exc))
        ok = False

    try:
        from app.infrastructure.middleware_adapters import DaprAdapter
        await DaprAdapter().publish(topic or f"neobank.{aggregate_type}", {
            "event_type": name,
            "aggregate_id": aggregate_id,
            "aggregate_type": aggregate_type,
            "user_id": user_id,
            "payload": payload,
        })
    except Exception as exc:  # noqa: BLE001
        logger.warning("feature_event.dapr_failed", type=name, error=str(exc))

    try:
        from app.infrastructure.middleware_adapters import OpenSearchAdapter
        await OpenSearchAdapter().index_transaction_event(
            name, aggregate_id, {"aggregate_type": aggregate_type, **payload})
    except Exception as exc:  # noqa: BLE001
        logger.warning("feature_event.search_failed", type=name, error=str(exc))

    return ok


# ============================================================================
# TigerBeetle — escrow ledger postings
# ============================================================================

def post_escrow_funding(*, buyer_user_id: str, amount: Decimal,
                        escrow_id: str) -> Dict[str, Any]:
    """Buyer wallet → escrow holding system account."""
    try:
        from app.services.platform_integration import get_platform_integration
        pi = get_platform_integration()
        pi.ensure_system_account("escrow_holding")
        return pi.post_transfer(
            debit_user=buyer_user_id, credit_system="escrow_holding",
            amount=amount, ledger=Ledger.ESCROW_HOLDING,
            code=TransferCode.ESCROW_FUND,
            reference=f"escrow-fund:{escrow_id}:{buyer_user_id}")
    except Exception as exc:  # noqa: BLE001
        logger.warning("ledger.escrow_fund_failed", error=str(exc))
        return {"posted": False, "reason": str(exc)}


def post_escrow_distribution(*, seller_user_id: str, amount: Decimal,
                             escrow_id: str) -> Dict[str, Any]:
    """Escrow holding → seller wallet."""
    try:
        from app.services.platform_integration import get_platform_integration
        return get_platform_integration().post_transfer(
            debit_system="escrow_holding", credit_user=seller_user_id,
            amount=amount, ledger=Ledger.ESCROW_HOLDING,
            code=TransferCode.ESCROW_RELEASE,
            reference=f"escrow-release:{escrow_id}:{seller_user_id}")
    except Exception as exc:  # noqa: BLE001
        logger.warning("ledger.escrow_release_failed", error=str(exc))
        return {"posted": False, "reason": str(exc)}


def post_escrow_fee(*, amount: Decimal, escrow_id: str) -> Dict[str, Any]:
    """Escrow holding → platform fee revenue."""
    try:
        from app.services.platform_integration import get_platform_integration
        pi = get_platform_integration()
        pi.ensure_system_account("fee_revenue")
        return pi.post_transfer(
            debit_system="escrow_holding", credit_system="fee_revenue",
            amount=amount, ledger=Ledger.FEE,
            code=TransferCode.FEE_COLLECTION,
            reference=f"escrow-fee:{escrow_id}")
    except Exception as exc:  # noqa: BLE001
        logger.warning("ledger.escrow_fee_failed", error=str(exc))
        return {"posted": False, "reason": str(exc)}


def post_escrow_refund(*, buyer_user_id: str, amount: Decimal,
                       escrow_id: str) -> Dict[str, Any]:
    """Escrow holding → buyer wallet (deadline expiry / cancellation)."""
    try:
        from app.services.platform_integration import get_platform_integration
        return get_platform_integration().post_transfer(
            debit_system="escrow_holding", credit_user=buyer_user_id,
            amount=amount, ledger=Ledger.ESCROW_HOLDING,
            code=TransferCode.ESCROW_REFUND,
            reference=f"escrow-refund:{escrow_id}:{buyer_user_id}")
    except Exception as exc:  # noqa: BLE001
        logger.warning("ledger.escrow_refund_failed", error=str(exc))
        return {"posted": False, "reason": str(exc)}


# ============================================================================
# Temporal — escrow approval-deadline workflow
# ============================================================================

async def start_escrow_deadline_workflow(*, escrow_id: str,
                                         deadline_iso: str) -> Dict[str, Any]:
    """Start a Temporal workflow that wakes at the approval deadline and
    calls back into POST /escrow/{id}/check-expiry. Never raises."""
    try:
        from app.infrastructure.middleware_adapters import TemporalAdapter
        return await TemporalAdapter().start_workflow(
            workflow="EscrowDeadlineWorkflow",
            workflow_id=f"escrow-deadline-{escrow_id}",
            args=[{"escrow_id": escrow_id, "deadline": deadline_iso}],
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("temporal.escrow_deadline_failed", error=str(exc))
        return {"ok": False, "reason": str(exc)}


# ============================================================================
# Redis — virtual account resolution & credit score caching
# ============================================================================

VA_CACHE_TTL = 3600        # 1h — numbers are immutable while active
SCORE_CACHE_TTL = 300      # 5m — credit score snapshot

async def va_cache_set(number: str, resolution: Dict[str, Any]) -> None:
    from app.services.response_cache import cache_set
    await cache_set("va-resolve", resolution, VA_CACHE_TTL, number)


async def va_cache_get(number: str) -> Optional[Dict[str, Any]]:
    from app.services.response_cache import cache_get
    return await cache_get("va-resolve", number)


async def va_cache_invalidate(number: str) -> None:
    from app.services.response_cache import cache_invalidate
    await cache_invalidate("va-resolve", number)


async def credit_score_cache_set(user_id: str, score: Dict[str, Any]) -> None:
    from app.services.response_cache import cache_set
    await cache_set("credit-score", score, SCORE_CACHE_TTL, user_id)


# ============================================================================
# OpenSearch — credit assessment documents
# ============================================================================

async def index_credit_assessment(assessment_id: str,
                                  document: Dict[str, Any]) -> Dict[str, Any]:
    try:
        from app.infrastructure.middleware_adapters import OpenSearchAdapter
        return await OpenSearchAdapter().index(
            "credit-assessments", assessment_id, document)
    except Exception as exc:  # noqa: BLE001
        logger.warning("opensearch.credit_index_failed", error=str(exc))
        return {"indexed": False, "reason": str(exc)}
