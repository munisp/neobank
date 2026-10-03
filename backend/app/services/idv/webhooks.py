"""Signed webhook delivery for IDV session lifecycle events.

Mirrors the OpenKYC webhook contract: HMAC-SHA256 over the JSON payload,
delivered as X-Webhook-Signature with X-Webhook-Event.
"""

import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional

import httpx
import structlog

from config.settings import settings

logger = structlog.get_logger(__name__)


class IDVWebhookService:
    def __init__(self):
        self.url = getattr(settings, "IDV_WEBHOOK_URL", "")
        self.secret = getattr(settings, "IDV_WEBHOOK_SECRET", "")
        self.enabled = bool(getattr(settings, "IDV_WEBHOOK_ENABLED", False))

    @property
    def configured(self) -> bool:
        return self.enabled and bool(self.url and self.secret)

    def create_signature(self, payload: Dict[str, Any]) -> str:
        body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
        return hmac.new(self.secret.encode(), body, hashlib.sha256).hexdigest()

    async def send_notification(
        self,
        session_id: str,
        event: str,
        data: Dict[str, Any],
        db=None,
    ) -> bool:
        if not self.configured:
            logger.debug("idv_webhook_skipped", webhook_event=event, session_id=session_id)
            return False

        payload = {
            "event": event,
            "session_id": session_id,
            "timestamp": int(time.time() * 1000),
            "data": data,
        }
        signature = self.create_signature(payload)

        status = "success"
        response_status: Optional[int] = None
        error_message: Optional[str] = None
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    self.url,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "X-Webhook-Signature": signature,
                        "X-Webhook-Event": event,
                    },
                )
                response_status = response.status_code
        except Exception as exc:  # noqa: BLE001
            status = "failed"
            error_message = str(exc)
            logger.error("idv_webhook_failed", webhook_event=event, error=error_message)

        if db is not None:
            try:
                from database.models import IDVWebhookLog

                db.add(
                    IDVWebhookLog(
                        session_id=session_id,
                        event=event,
                        status=status,
                        response_status=response_status,
                        error=error_message,
                    )
                )
                await db.commit()
            except Exception as exc:  # noqa: BLE001
                logger.warning("idv_webhook_log_failed", error=str(exc))

        return status == "success"


_service: Optional[IDVWebhookService] = None


def get_idv_webhook_service() -> IDVWebhookService:
    global _service
    if _service is None:
        _service = IDVWebhookService()
    return _service
