"""docling-based structured document parsing.

docling converts document images/PDFs to structured markdown/text. Imported
lazily; when unavailable the pipeline proceeds with OCR text only.
"""

import io
from typing import Any, Dict, Optional

import structlog

logger = structlog.get_logger(__name__)


class DoclingParser:
    """Lazy wrapper around docling's DocumentConverter."""

    def __init__(self):
        self._converter = None
        self._init_error: Optional[str] = None

    @property
    def available(self) -> bool:
        return self._ensure_init() is not None

    def _ensure_init(self):
        if self._converter is not None:
            return self._converter
        if self._init_error is not None:
            return None
        try:
            from docling.document_converter import DocumentConverter  # noqa: WPS433

            self._converter = DocumentConverter()
            logger.info("docling_initialized")
            return self._converter
        except Exception as exc:  # noqa: BLE001
            self._init_error = str(exc)
            logger.warning("docling_unavailable", error=self._init_error)
            return None

    def parse(self, source_bytes: bytes, filename: str = "document.png") -> Dict[str, Any]:
        """Parse a document image/PDF into structured text.

        Returns {available, markdown, text}.
        """
        converter = self._ensure_init()
        if converter is None:
            return {"available": False, "markdown": "", "text": ""}

        try:
            import tempfile
            from pathlib import Path

            suffix = Path(filename).suffix or ".png"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
                tmp.write(source_bytes)
                tmp.flush()
                result = converter.convert(tmp.name)

            document = result.document
            markdown = document.export_to_markdown() if hasattr(document, "export_to_markdown") else ""
            text = markdown or getattr(document, "text", "") or ""
            return {"available": True, "markdown": markdown, "text": text}
        except Exception as exc:  # noqa: BLE001
            logger.error("docling_parse_failed", error=str(exc))
            return {"available": True, "markdown": "", "text": "", "error": str(exc)}


_parser: Optional[DoclingParser] = None


def get_docling_parser() -> DoclingParser:
    global _parser
    if _parser is None:
        _parser = DoclingParser()
    return _parser
