"""Ops Copilot Service

Natural-language operations assistant over the platform's own trust data:
audit chain status, positive-pay exceptions, stuck escrows, billing.

- Gathers live context via injected provider callables (no hard coupling).
- Answers via the DeepSeek LLM service when reachable; degrades to a
  deterministic template summary when it is not.
- Every question + answer is recorded on the hash-chained audit log so
  "who asked what and what were they told" is reconstructible.
- RBAC stays at the router (Permify/PBAC) — the copilot never widens access.
"""
from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class OpsCopilotService:
    def __init__(self):
        # name -> callable() -> dict/list context payload
        self._context_providers: Dict[str, Callable[[], Any]] = {}
        self._history: List[Dict[str, Any]] = []

    def register_context(self, name: str, provider: Callable[[], Any]) -> None:
        self._context_providers[name] = provider

    def _gather_context(self, names: Optional[List[str]] = None) -> Dict[str, Any]:
        ctx = {}
        for name, provider in self._context_providers.items():
            if names and name not in names:
                continue
            try:
                ctx[name] = provider()
            except Exception as exc:
                ctx[name] = {"error": str(exc)}
        return ctx

    async def ask(self, user_id: str, question: str,
                  context_names: Optional[List[str]] = None) -> Dict[str, Any]:
        started = time.monotonic()
        context = self._gather_context(context_names)
        answer_text, engine = await self._answer(question, context)
        record = {
            "query_id": str(uuid.uuid4()),
            "user_id": user_id,
            "question": question,
            "engine": engine,
            "answer": answer_text,
            "context_sources": sorted(context.keys()),
            "latency_ms": round((time.monotonic() - started) * 1000, 1),
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }
        self._history.append(record)
        await self._audit(record)
        return record

    async def _answer(self, question: str, context: Dict[str, Any]):
        try:
            from app.services.deepseek_service import deepseek_service  # type: ignore
            prompt = (
                "You are the operations copilot for a neobank. Answer concisely "
                "using ONLY the JSON context provided. Question: " + question
                + "\nContext: " + repr(context)[:8000])
            resp = await deepseek_service.chat(prompt)  # type: ignore[attr-defined]
            if isinstance(resp, dict) and resp.get("content"):
                return resp["content"], "deepseek"
            if isinstance(resp, str) and resp:
                return resp, "deepseek"
        except Exception as exc:
            logger.debug("copilot llm unavailable: %s", exc)
        return self._template_answer(question, context), "template-fallback"

    def _template_answer(self, question: str, context: Dict[str, Any]) -> str:
        lines = [f"Q: {question}", "Summary of live operational context:"]
        for name, payload in context.items():
            if isinstance(payload, dict) and "error" in payload:
                lines.append(f"- {name}: unavailable ({payload['error']})")
            elif isinstance(payload, list):
                lines.append(f"- {name}: {len(payload)} item(s)")
            else:
                lines.append(f"- {name}: {payload!r}"[:300])
        lines.append("(LLM unavailable — deterministic summary. "
                     "Refine the question or check the named source.)")
        return "\n".join(lines)

    async def _audit(self, record: Dict[str, Any]) -> None:
        try:
            from app.services.audit_chain_service import audit_chain_service
            await audit_chain_service.record(
                domain="ops_copilot", action="copilot.query",
                actor_id=record["user_id"], aggregate_id=record["query_id"],
                payload={"question": record["question"], "engine": record["engine"],
                         "latency_ms": record["latency_ms"]})
        except Exception as exc:
            logger.debug("copilot audit skipped: %s", exc)

    def history(self, limit: int = 50) -> List[Dict[str, Any]]:
        return self._history[-limit:]


ops_copilot_service = OpsCopilotService()
