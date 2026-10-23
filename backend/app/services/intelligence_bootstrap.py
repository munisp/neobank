"""Intelligence Bootstrap

Wires the intelligence layer into the running platform at startup:

- Registers live context providers for the ops copilot (open exceptions,
  audit-chain status, model registry summary) — each provider fails safe so
  one broken source never breaks a copilot answer.
- Registers the platform's decision models in the lifecycle registry with
  their initial modes (shadow until promoted by agreement-rate evidence).
- Never raises: intelligence must not gate API startup.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)

_BOOTSTRAPPED = False


def _open_exceptions_context() -> Dict[str, Any]:
    try:
        from app.services.exception_triage_service import exception_triage_service
        return {"triage": exception_triage_service.stats()}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def _audit_status_context() -> Dict[str, Any]:
    try:
        from app.services.audit_chain_service import audit_chain_service  # type: ignore
        return {"audit_chain": "available"}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def _models_context() -> Any:
    try:
        from app.services.model_lifecycle import model_registry
        return model_registry.list_models()
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def register_copilot_contexts() -> None:
    from app.services.ops_copilot_service import ops_copilot_service
    ops_copilot_service.register_context("exception_triage", _open_exceptions_context)
    ops_copilot_service.register_context("audit_chain", _audit_status_context)
    ops_copilot_service.register_context("model_registry", _models_context)


def register_platform_models() -> None:
    """Register known decision models. Existing production behavior starts in
    enforce (it already decides); new learned scorers start in shadow and must
    earn promotion via canary agreement evidence."""
    from app.services.model_lifecycle import model_registry
    defaults = [
        ("credit-blend", "1.0.0", "enforce"),          # existing credit decisioning
        ("positive-pay-recommend", "1.0.0", "enforce"),  # existing heuristic
        ("triage-scorer", "1.0.0", "shadow"),          # learned queue ranking
        ("next-action", "1.0.0", "shadow"),            # behavior predictions
        ("recurring-detector", "1.0.0", "shadow"),
    ]
    for name, version, mode in defaults:
        if model_registry.get(name) is None:
            model_registry.register(name, version, mode)


def bootstrap_intelligence() -> Dict[str, Any]:
    global _BOOTSTRAPPED
    if _BOOTSTRAPPED:
        return {"bootstrapped": False, "reason": "already done"}
    try:
        register_copilot_contexts()
        register_platform_models()
        _BOOTSTRAPPED = True
        logger.info("intelligence bootstrap complete")
        return {"bootstrapped": True}
    except Exception as exc:  # noqa: BLE001
        logger.warning("intelligence bootstrap degraded: %s", exc)
        return {"bootstrapped": False, "reason": str(exc)}
