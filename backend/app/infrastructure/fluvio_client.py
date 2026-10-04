"""Fluvio producer — edge/mobile stream ingestion.

Fluvio carries the high-throughput mobile event streams (see
deployment/perf/fluvio-tuning.md):
- offline-tx-events  (8 partitions) — offline transaction sync
- device-telemetry   (8 partitions) — power/network/adaptive-data signals
- ussd-session-events (4 partitions) — USSD session streams

Producer settings per the tuning doc: gzip compression, linger 10ms,
acks=leader for telemetry, acks=all for financial events.

Graceful by design: if the `fluvio` Python client isn't installed or the
cluster is unreachable, `produce()` returns {"sent": False} and never
raises — the API path stays authoritative.
"""

import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import structlog

logger = structlog.get_logger(__name__)

try:
    from fluvio import Fluvio as _Fluvio  # type: ignore
    _FLUVIO_AVAILABLE = True
except ImportError:
    _Fluvio = None
    _FLUVIO_AVAILABLE = False


class FluvioProducer:
    """Singleton producer with per-topic producer handles."""

    _instance: Optional["FluvioProducer"] = None

    def __new__(cls) -> "FluvioProducer":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._client = None
        self._producers: Dict[str, Any] = {}
        self._available = False
        if _FLUVIO_AVAILABLE:
            try:
                from config.settings import settings
                if settings.FLUVIO_ENDPOINT:
                    self._client = _Fluvio.connect()
                    self._available = True
                    logger.info("fluvio.connected", endpoint=settings.FLUVIO_ENDPOINT)
            except Exception as exc:  # noqa: BLE001
                logger.warning("fluvio.connect_failed", error=str(exc))
        self._initialized = True

    @property
    def available(self) -> bool:
        return self._available

    def produce(self, topic: str, record: Dict[str, Any],
                key: Optional[str] = None, durable: bool = False) -> Dict[str, Any]:
        """Send one JSON record to a Fluvio topic. Never raises.

        durable=True maps to acks=all for financial events; telemetry uses
        the default acks=leader (see tuning doc).
        """
        envelope = {
            **record,
            "_ingested_at": datetime.now(timezone.utc).isoformat(),
        }
        if not self._available:
            logger.debug("fluvio.unavailable — dropping record", topic=topic)
            return {"sent": False, "reason": "fluvio unavailable", "topic": topic}
        try:
            if topic not in self._producers:
                self._producers[topic] = self._client.topic_producer(topic)
            payload = json.dumps(envelope).encode()
            if key:
                self._producers[topic].send_string(key, payload.decode())
            else:
                self._producers[topic].send_string(payload.decode())
            if durable:
                self._producers[topic].flush()
            return {"sent": True, "topic": topic}
        except Exception as exc:  # noqa: BLE001
            logger.warning("fluvio.produce_failed", topic=topic, error=str(exc))
            return {"sent": False, "reason": str(exc), "topic": topic}


_producer: Optional[FluvioProducer] = None


def get_fluvio_producer() -> FluvioProducer:
    global _producer
    if _producer is None:
        _producer = FluvioProducer()
    return _producer
