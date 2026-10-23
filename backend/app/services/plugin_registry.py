"""Plugin registry: pluggable parsers and extraction providers.

OpenClear's entry-point pattern, adapted for an offline/monorepo deployment:
extensions register themselves in-process (bank SMS parsers, statement
formats, document extraction providers), and the operator allowlists them
via the NB_PLUGINS env var. A plugin that isn't allowlisted, fails to load,
or collides on a name is skipped and reported — the app still starts.

  import os; NB_PLUGINS="gtb_sms,zenith_sms"   # comma-separated allowlist
"""
import os
from typing import Any, Callable, Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)


class PluginRegistry:
    """Registry keyed by (kind, name). Kinds: 'sms_parser',
    'statement_format', 'doc_provider', 'scoring_model'."""

    def __init__(self) -> None:
        self._plugins: Dict[str, Dict[str, Any]] = {}
        self._skipped: List[Dict[str, str]] = []

    # ------------------------------------------------------------------
    def register(self, kind: str, name: str, handler: Callable[..., Any], *,
                 version: str = "1.0") -> bool:
        """Register a plugin. Respects the NB_PLUGINS allowlist when set."""
        allowlist = os.environ.get("NB_PLUGINS", "").strip()
        if allowlist:
            allowed = {p.strip() for p in allowlist.split(",")}
            if name not in allowed:
                self._skipped.append({"name": name, "reason": "not allowlisted"})
                logger.info("plugin_skipped", name=name, reason="not allowlisted")
                return False
        key = f"{kind}:{name}"
        if key in self._plugins:
            self._skipped.append({"name": name, "reason": "name collision"})
            logger.warning("plugin_collision", name=name, kind=kind)
            return False
        self._plugins[key] = {"kind": kind, "name": name,
                              "handler": handler, "version": version}
        logger.info("plugin_registered", kind=kind, name=name, version=version)
        return True

    def get(self, kind: str, name: str) -> Optional[Callable[..., Any]]:
        entry = self._plugins.get(f"{kind}:{name}")
        return entry["handler"] if entry else None

    def list_plugins(self, kind: Optional[str] = None) -> List[Dict[str, str]]:
        return [{"kind": e["kind"], "name": e["name"], "version": e["version"]}
                for e in self._plugins.values()
                if kind is None or e["kind"] == kind]

    def skipped(self) -> List[Dict[str, str]]:
        return list(self._skipped)


_registry: Optional[PluginRegistry] = None


def get_plugin_registry() -> PluginRegistry:
    global _registry
    if _registry is None:
        _registry = PluginRegistry()
        _register_builtins(_registry)
    return _registry


def _register_builtins(reg: PluginRegistry) -> None:
    """Built-ins register through the same path as external plugins."""
    from app.services.alt_data_service import parse_bank_sms
    reg.register("sms_parser", "generic_nigerian_bank", parse_bank_sms,
                 version="1.0")
    from app.services.document_intake_service import PROVIDERS
    for name, provider in PROVIDERS.items():
        reg.register("doc_provider", name, provider, version="1.0")
