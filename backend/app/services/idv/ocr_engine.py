"""PaddleOCR-backed OCR engine for ID documents.

PaddleOCR is imported lazily. If it (or paddlepaddle) is not installed, the
engine reports itself unavailable and the pipeline falls back to docling/VLM
text only.
"""

import base64
import io
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)


class PaddleOCREngine:
    """Thin wrapper around PaddleOCR with lazy initialization."""

    def __init__(self, lang: str = "en", use_angle_cls: bool = True):
        self.lang = lang
        self.use_angle_cls = use_angle_cls
        self._ocr = None
        self._init_error: Optional[str] = None

    @property
    def available(self) -> bool:
        return self._ensure_init() is not None

    def _ensure_init(self):
        if self._ocr is not None:
            return self._ocr
        if self._init_error is not None:
            return None
        try:
            from paddleocr import PaddleOCR  # noqa: WPS433 (lazy heavy import)

            # PaddleOCR >= 2.7: use_angle_cls; >=3.x renamed to use_textline_orientation
            try:
                self._ocr = PaddleOCR(use_angle_cls=self.use_angle_cls, lang=self.lang, show_log=False)
            except TypeError:
                self._ocr = PaddleOCR(use_textline_orientation=self.use_angle_cls, lang=self.lang)
            logger.info("paddleocr_initialized", lang=self.lang)
            return self._ocr
        except Exception as exc:  # noqa: BLE001
            self._init_error = str(exc)
            logger.warning("paddleocr_unavailable", error=self._init_error)
            return None

    @staticmethod
    def _to_numpy(image_bytes: bytes):
        import numpy as np
        from PIL import Image

        with Image.open(io.BytesIO(image_bytes)) as img:
            return np.array(img.convert("RGB"))

    def extract_text(self, image_bytes: bytes) -> Dict[str, Any]:
        """Run OCR on an image; returns {text, lines:[{text, confidence, box}]}."""
        ocr = self._ensure_init()
        if ocr is None:
            return {"available": False, "text": "", "lines": []}

        try:
            img = self._to_numpy(image_bytes)
            result = ocr.ocr(img, cls=self.use_angle_cls)
            lines: List[Dict[str, Any]] = []
            for page in result or []:
                if not page:
                    continue
                for entry in page:
                    try:
                        box, (text, confidence) = entry[0], entry[1]
                    except (TypeError, ValueError):
                        continue
                    lines.append(
                        {
                            "text": str(text),
                            "confidence": round(float(confidence), 4),
                            "box": [[round(float(x), 1), round(float(y), 1)] for x, y in box],
                        }
                    )
            text = "\n".join(line["text"] for line in lines)
            return {"available": True, "text": text, "lines": lines}
        except Exception as exc:  # noqa: BLE001
            logger.error("paddleocr_extract_failed", error=str(exc))
            return {"available": True, "text": "", "lines": [], "error": str(exc)}


def decode_base64_image(data: str) -> bytes:
    """Decode a base64 image, tolerating data-URL prefixes."""
    if "," in data and data.strip().startswith("data:"):
        data = data.split(",", 1)[1]
    return base64.b64decode(data)


_engine: Optional[PaddleOCREngine] = None


def get_ocr_engine(lang: str = "en") -> PaddleOCREngine:
    global _engine
    if _engine is None:
        _engine = PaddleOCREngine(lang=lang)
    return _engine
