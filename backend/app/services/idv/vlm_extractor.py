"""VLM-based field extraction + heuristic fallback.

The VLM path calls any OpenAI-compatible chat-completions endpoint (configured
via IDV_VLM_* settings) with the OCR/docling text and, optionally, the document
image. The heuristic fallback extracts fields with regexes so the pipeline is
fully functional offline.
"""

import base64
import json
import re
from datetime import date
from typing import Any, Dict, Optional

import httpx
import structlog

from config.settings import settings

logger = structlog.get_logger(__name__)

_ID_NUMBER_RE = re.compile(r"\b[A-Z0-9]{6,12}\b")
_DATE_RE = re.compile(r"\b(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})\b")

_EXTRACTION_PROMPT = """You are an identity-document parser. From the document text below, extract a JSON object with exactly these keys (null when unknown):
document_type, document_number, personal_number, issuing_state, first_name, last_name, date_of_birth (YYYY-MM-DD), expiration_date (YYYY-MM-DD), gender, nationality.
Return ONLY the JSON object, no prose.

DOCUMENT TEXT:
{text}
"""


def _normalize_date(value: str) -> Optional[str]:
    value = value.strip().replace("/", "-")
    parts = value.split("-")
    try:
        if len(parts[0]) == 4:
            year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
        else:
            day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
        date(year, month, day)
        return f"{year:04d}-{month:02d}-{day:02d}"
    except (ValueError, IndexError):
        return None


class VLMExtractor:
    """OpenAI-compatible VLM extractor with graceful fallback."""

    def __init__(self):
        self.api_url = getattr(settings, "IDV_VLM_API_URL", "")
        self.api_key = getattr(settings, "IDV_VLM_API_KEY", "")
        self.model = getattr(settings, "IDV_VLM_MODEL", "Qwen/Qwen2-VL-7B-Instruct")
        self.timeout = float(getattr(settings, "IDV_VLM_TIMEOUT", 60))

    @property
    def available(self) -> bool:
        return bool(self.api_url)

    async def extract_fields(
        self,
        text: str,
        image_bytes: Optional[bytes] = None,
    ) -> Optional[Dict[str, Any]]:
        """Extract identity fields via VLM. Returns None when unavailable/failed."""
        if not self.available or not text.strip():
            return None

        prompt = _EXTRACTION_PROMPT.format(text=text[:6000])
        message_content: Any
        if image_bytes:
            b64 = base64.b64encode(image_bytes).decode()
            message_content = [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ]
        else:
            message_content = prompt

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": message_content}],
            "temperature": 0,
            "max_tokens": 512,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.api_url.rstrip('/')}/v1/chat/completions",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                content = response.json()["choices"][0]["message"]["content"]
            match = re.search(r"\{.*\}", content, re.DOTALL)
            if not match:
                return None
            data = json.loads(match.group(0))
            logger.info("vlm_extraction_ok", keys=[k for k, v in data.items() if v])
            return {k: (v if v not in ("", "null") else None) for k, v in data.items()}
        except Exception as exc:  # noqa: BLE001
            logger.warning("vlm_extraction_failed", error=str(exc))
            return None

    def extract_fields_heuristic(self, text: str) -> Dict[str, Any]:
        """Regex-based fallback extraction from OCR text."""
        result: Dict[str, Any] = {}
        dates = [_normalize_date(m.group(0)) for m in _DATE_RE.finditer(text)]
        dates = [d for d in dates if d]
        if dates:
            # Earliest plausible date is usually birth date; latest is expiry.
            result["date_of_birth"] = min(dates)
            if len(dates) > 1:
                result["expiration_date"] = max(dates)

        for line in text.splitlines():
            upper = line.strip().upper()
            if "PASSPORT" in upper:
                result.setdefault("document_type", "Passport")
            elif "DRIVER" in upper or "DRIVING" in upper:
                result.setdefault("document_type", "Driver License")
            elif "IDENTITY" in upper or "ID CARD" in upper or "NATIONAL" in upper:
                result.setdefault("document_type", "National ID")

        numbers = [n for n in _ID_NUMBER_RE.findall(text) if any(c.isdigit() for c in n)]
        if numbers:
            result.setdefault("document_number", max(numbers, key=len))

        return result


_extractor: Optional[VLMExtractor] = None


def get_vlm_extractor() -> VLMExtractor:
    global _extractor
    if _extractor is None:
        _extractor = VLMExtractor()
    return _extractor
