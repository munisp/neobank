"""Middleware adapters — Keycloak, Temporal, Dapr, OpenSearch, GeoLibre/Sedona.

Complements platform_integration.py (TigerBeetle + Kafka/Fluvio eventing)
with the remaining platform middleware. Every adapter is:
- lazy (imports optional deps at call time)
- graceful (returns {"ok": False, "reason": ...} instead of raising)
- env-gated (no-op until the corresponding endpoint is configured)

Stack map:
  AuthN      → Keycloak (OIDC/JWKS)         — optional token validation path
  AuthZ      → Permify (existing service)   — fine-grained permission checks
  Workflows  → Temporal                     — mortgage approval, settlement runs
  Service mesh → Dapr sidecar               — service invocation, state, pub/sub
  Search     → OpenSearch                   — transaction & event indexing
  Streaming  → Kafka (backbone) + Fluvio (edge ingestion) — see event_bus/fluvio
  Geo        → GeoLibre API + Apache Sedona SQL in the lakehouse
  Gateway    → APISIX (+OpenAppSec WAF)     — deployment/apisix/routes.yaml
  Ledger     → TigerBeetle, Mojaloop        — platform_integration.py
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)


def _settings():
    from config.settings import settings
    return settings


# ============================================================================
# Keycloak — OIDC token validation (JWKS)
# ============================================================================

class KeycloakAdapter:
    """Validate Keycloak-issued JWTs against realm JWKS.

    The platform's native JWT middleware remains the default; this adapter
    enables the Keycloak path per-deployment (federated SSO, partner IdPs).
    """

    _jwks_cache: Dict[str, Any] = {}

    @property
    def enabled(self) -> bool:
        return bool(_settings().KEYCLOAK_URL)

    @property
    def issuer(self) -> str:
        s = _settings()
        return s.KEYCLOAK_ISSUER or f"{s.KEYCLOAK_URL}/realms/{s.KEYCLOAK_REALM}"

    async def jwks(self) -> Dict[str, Any]:
        if self._jwks_cache:
            return self._jwks_cache
        import httpx
        url = f"{self.issuer}/protocol/openid-connect/certs"
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            self._jwks_cache = resp.json()
            return self._jwks_cache

    async def validate_token(self, token: str) -> Dict[str, Any]:
        """Returns {"ok": True, "claims": {...}} or {"ok": False, ...}."""
        if not self.enabled:
            return {"ok": False, "reason": "keycloak not configured"}
        try:
            import jwt as pyjwt
            from jwt import PyJWKClient
            jwks = await self.jwks()
            # Resolve signing key from cached JWKS
            from jwt.algorithms import RSAAlgorithm
            header = pyjwt.get_unverified_header(token)
            key_data = next((k for k in jwks.get("keys", []) if k.get("kid") == header.get("kid")), None)
            if not key_data:
                return {"ok": False, "reason": "unknown signing key"}
            public_key = RSAAlgorithm.from_jwk(key_data)
            claims = pyjwt.decode(token, public_key, algorithms=["RS256"],
                                  options={"verify_aud": False}, issuer=self.issuer)
            return {"ok": True, "claims": claims}
        except Exception as exc:  # noqa: BLE001
            logger.warning("keycloak.validate_failed", error=str(exc))
            return {"ok": False, "reason": str(exc)}


# ============================================================================
# Temporal — durable workflows
# ============================================================================

class TemporalAdapter:
    """Start/signal durable workflows (mortgage approval, settlement runs,
    developer app vetting SLAs). No-op until TEMPORAL_HOST is set."""

    async def _client(self):
        s = _settings()
        if not s.TEMPORAL_HOST:
            return None
        try:
            from temporalio.client import Client
            return await Client.connect(s.TEMPORAL_HOST, namespace=s.TEMPORAL_NAMESPACE)
        except Exception as exc:  # noqa: BLE001
            logger.warning("temporal.connect_failed", error=str(exc))
            return None

    async def start_workflow(self, workflow: str, workflow_id: str,
                             args: List[Any]) -> Dict[str, Any]:
        client = await self._client()
        if client is None:
            return {"started": False, "reason": "temporal not configured"}
        try:
            handle = await client.start_workflow(
                workflow, *args, id=workflow_id,
                task_queue=_settings().TEMPORAL_TASK_QUEUE)
            logger.info("temporal.workflow_started", workflow=workflow, id=workflow_id)
            return {"started": True, "workflow_id": workflow_id,
                    "run_id": getattr(handle, "run_id", None)}
        except Exception as exc:  # noqa: BLE001
            logger.warning("temporal.start_failed", workflow=workflow, error=str(exc))
            return {"started": False, "reason": str(exc)}

    async def start_mortgage_approval(self, application_id: str,
                                      user_id: str) -> Dict[str, Any]:
        return await self.start_workflow(
            "MortgageApprovalWorkflow", f"mortgage-{application_id}",
            [{"application_id": application_id, "user_id": user_id}])

    async def start_settlement_run(self, batch_reference: str) -> Dict[str, Any]:
        return await self.start_workflow(
            "SettlementBatchWorkflow", f"settlement-{batch_reference}",
            [{"reference": batch_reference}])

    async def start_vetting_sla(self, app_id: str) -> Dict[str, Any]:
        return await self.start_workflow(
            "DeveloperVettingWorkflow", f"vetting-{app_id}",
            [{"app_id": app_id}])


# ============================================================================
# Dapr — service invocation, state, pub/sub
# ============================================================================

class DaprAdapter:
    """Talks to the local Dapr sidecar over HTTP. Pub/sub component is
    backed by Kafka (DAPR_PUBSUB_NAME), so publishing via Dapr lands on the
    same backbone as the native Kafka bus."""

    @property
    def base_url(self) -> str:
        return f"http://localhost:{_settings().DAPR_HTTP_PORT}/v1.0"

    async def _request(self, method: str, path: str, **kwargs) -> Dict[str, Any]:
        import httpx
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.request(method, f"{self.base_url}{path}", **kwargs)
                if resp.status_code >= 400:
                    return {"ok": False, "status": resp.status_code, "body": resp.text[:200]}
                return {"ok": True, "status": resp.status_code,
                        "json": resp.json() if resp.text else None}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "reason": str(exc)}

    async def invoke(self, app_id: str, method: str,
                     payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Invoke a Go/Rust service through the mesh (e.g. ledger-gateway-go)."""
        return await self._request("POST", f"/invoke/{app_id}/method/{method}",
                                   json=payload or {})

    async def publish(self, topic: str, event: Dict[str, Any]) -> Dict[str, Any]:
        pubsub = _settings().DAPR_PUBSUB_NAME
        return await self._request("POST", f"/publish/{pubsub}/{topic}", json=event)

    async def save_state(self, store: str, key: str, value: Any) -> Dict[str, Any]:
        return await self._request("POST", f"/state/{store}",
                                   json=[{"key": key, "value": value}])

    async def get_state(self, store: str, key: str) -> Dict[str, Any]:
        return await self._request("GET", f"/state/{store}/{key}")


# ============================================================================
# OpenSearch — transaction & event indexing
# ============================================================================

class OpenSearchAdapter:
    """Indexes domain documents for search/analytics UX. Documents land in
    {prefix}-{doctype}-YYYY.MM indices."""

    @property
    def enabled(self) -> bool:
        return bool(_settings().OPENSEARCH_URL)

    async def index(self, doctype: str, doc_id: str,
                    document: Dict[str, Any]) -> Dict[str, Any]:
        if not self.enabled:
            return {"indexed": False, "reason": "opensearch not configured"}
        import httpx
        s = _settings()
        month = datetime.now(timezone.utc).strftime("%Y.%m")
        index = f"{s.OPENSEARCH_INDEX_PREFIX}-{doctype}-{month}"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.put(
                    f"{s.OPENSEARCH_URL}/{index}/_doc/{doc_id}",
                    json={**document, "_indexed_at": datetime.now(timezone.utc).isoformat()})
                return {"indexed": resp.status_code < 400, "index": index}
        except Exception as exc:  # noqa: BLE001
            logger.warning("opensearch.index_failed", error=str(exc))
            return {"indexed": False, "reason": str(exc)}

    async def index_transaction_event(self, event_type: str, aggregate_id: str,
                                      payload: Dict[str, Any]) -> Dict[str, Any]:
        return await self.index("events", str(uuid.uuid4()), {
            "event_type": event_type, "aggregate_id": aggregate_id, **payload})


# ============================================================================
# GeoLibre + Apache Sedona — geospatial
# ============================================================================

class GeoAdapter:
    """Geospatial services: GeoLibre REST API for agent/branch/ATM proximity,
    Apache Sedona geo-SQL in the lakehouse for segment-by-location analytics."""

    @property
    def enabled(self) -> bool:
        return bool(_settings().GEOLIBRE_URL)

    async def nearby(self, lat: float, lon: float, kind: str = "agent",
                     radius_km: float = 5.0) -> Dict[str, Any]:
        if not self.enabled:
            return {"ok": False, "reason": "geolibre not configured", "results": []}
        import httpx
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{_settings().GEOLIBRE_URL}/v1/nearby",
                    params={"lat": lat, "lon": lon, "kind": kind, "radius_km": radius_km})
                return {"ok": resp.status_code < 400,
                        "results": resp.json() if resp.status_code < 400 else []}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "reason": str(exc), "results": []}

    async def segment_heatmap(self, segment_key: str) -> Dict[str, Any]:
        """Sedona geo-SQL: member density per LGA for a segment (analytics)."""
        if not _settings().SEDONA_ENABLED:
            return {"ok": False, "reason": "sedona not enabled", "cells": []}
        try:
            from app.services.lakehouse_service import get_lakehouse_service
            lake = get_lakehouse_service()
            rows = await lake.query_data(
                f"SELECT ST_GeoHash(geom, 5) AS cell, COUNT(*) AS members "
                f"FROM segment_memberships WHERE segment_key = '{segment_key}' "
                f"GROUP BY cell ORDER BY members DESC LIMIT 100")
            return {"ok": True, "cells": rows}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "reason": str(exc), "cells": []}


# ============================================================================
# Singletons
# ============================================================================

_keycloak: Optional[KeycloakAdapter] = None
_temporal: Optional[TemporalAdapter] = None
_dapr: Optional[DaprAdapter] = None
_opensearch: Optional[OpenSearchAdapter] = None
_geo: Optional[GeoAdapter] = None


def get_keycloak() -> KeycloakAdapter:
    global _keycloak
    if _keycloak is None:
        _keycloak = KeycloakAdapter()
    return _keycloak


def get_temporal() -> TemporalAdapter:
    global _temporal
    if _temporal is None:
        _temporal = TemporalAdapter()
    return _temporal


def get_dapr() -> DaprAdapter:
    global _dapr
    if _dapr is None:
        _dapr = DaprAdapter()
    return _dapr


def get_opensearch() -> OpenSearchAdapter:
    global _opensearch
    if _opensearch is None:
        _opensearch = OpenSearchAdapter()
    return _opensearch


def get_geo() -> GeoAdapter:
    global _geo
    if _geo is None:
        _geo = GeoAdapter()
    return _geo
