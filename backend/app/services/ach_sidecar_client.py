"""Client for the ach-go sidecar (moov-io/ach engine).

Reachable over Dapr service invocation (app-id `ach-service`) or plain
HTTP (ACH_SIDECAR_URL). Every call degrades gracefully: when the sidecar
isn't deployed, callers fall back to the local NACHA path.
"""
import os
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)

SIDECAR_URL = os.environ.get("ACH_SIDECAR_URL", "http://localhost:8092")
USE_DAPR = os.environ.get("ACH_SIDECAR_VIA_DAPR", "1") == "1"


async def _post(path: str, body: Any, raw: bool = False) -> Optional[Dict[str, Any]]:
    """POST to the sidecar. Returns None on any failure (caller falls back)."""
    try:
        import httpx
        if USE_DAPR:
            from app.infrastructure.middleware_adapters import DaprAdapter
            method = path.lstrip("/")
            if raw:
                # Dapr invoke passes JSON; raw NACHA text goes as {"content": ...}
                resp = await DaprAdapter().invoke(
                    "ach-service", method, {"content": body})
            else:
                resp = await DaprAdapter().invoke("ach-service", method, body)
            if resp.get("ok") and resp.get("json"):
                return resp["json"]
            return None
        async with httpx.AsyncClient(timeout=15.0) as client:
            if raw:
                r = await client.post(f"{SIDECAR_URL}{path}",
                                      content=body.encode()
                                      if isinstance(body, str) else body)
            else:
                r = await client.post(f"{SIDECAR_URL}{path}", json=body)
            if r.status_code == 200:
                return r.json()
            logger.warning("ach_sidecar_http_error", status=r.status_code,
                           body=r.text[:200])
            return None
    except Exception as exc:  # noqa: BLE001
        logger.warning("ach_sidecar_unreachable", error=str(exc))
        return None


async def generate_nacha(entries: List[Dict[str, Any]], *,
                         sec_code: str = "PPD",
                         company_name: str = "NEOBANK",
                         company_id: str = "1234567890",
                         company_description: str = "PAYMENTS",
                         effective_date: str = "",
                         service_class_code: int = 200) -> Optional[Dict[str, Any]]:
    """Generate a validated NACHA file via the sidecar.

    entries: [{transaction_code, routing_number, account_number,
               amount_cents, recipient_name, identification}]
    Returns the GenerateResponse dict or None when unavailable."""
    return await _post("/api/v1/nacha/generate", {
        "sec_code": sec_code, "company_name": company_name,
        "company_id": company_id, "company_description": company_description,
        "effective_date": effective_date,
        "service_class_code": service_class_code,
        "entries": entries,
    })


async def validate_nacha(file_content: str) -> Optional[Dict[str, Any]]:
    return await _post("/api/v1/nacha/validate", file_content, raw=True)


async def parse_nacha(file_content: str) -> Optional[Dict[str, Any]]:
    """Parse an inbound file — returns extracted Addenda99 return records."""
    return await _post("/api/v1/nacha/parse", file_content, raw=True)
