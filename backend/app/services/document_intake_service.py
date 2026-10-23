"""Document intake: cheque/payment-document field extraction.

Combines the patterns from two open-source approaches:
- ChequeScan (100ravSingh): multimodal LLM extraction via a structured
  prompt, batch ZIP processing, per-cheque signature-region isolation.
- ChequeWise (GarbhitSh): classical OCR (Google Vision / Tesseract) with
  OpenCV-style preprocessing and regex validation of extracted fields.

Design:
- Pluggable extraction providers behind a registry (see plugin_registry):
  "llm" (structured-prompt multimodal model — uses the platform's existing
  DeepSeek/LLM integration) and "ocr" (pytesseract when installed).
- Deterministic preprocessing with PIL: grayscale, autocontrast, sharpen —
  the CPU-only equivalent of ChequeWise's OpenCV enhancement stage.
- Every extracted field is validated with regexes; invalid fields are
  reported, never silently passed through.
- MICR-style cheque numbers and Nigerian cheque layouts (10-digit NUBAN
  account, 6-digit cheque number, date DDMMYYYY) are first-class.
"""
import io
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Field validation (ChequeWise pattern: regex-validate every extracted field)
# ---------------------------------------------------------------------------
FIELD_VALIDATORS = {
    "cheque_number": re.compile(r"^\d{6,8}$"),
    "account_number": re.compile(r"^\d{10}$"),          # NUBAN
    "amount_numeric": re.compile(r"^\d{1,3}(,\d{3})*(\.\d{2})?$|^\d+(\.\d{2})?$"),
    "date": re.compile(r"^\d{2}[/-]\d{2}[/-]\d{4}$|^\d{8}$"),
    "routing_number": re.compile(r"^\d{9}$|^\d{3}\d{6}$"),
}

CHEQUE_FIELDS = ["payer_name", "payee_name", "account_number", "cheque_number",
                 "amount_numeric", "amount_words", "date", "bank_name",
                 "routing_number"]

LLM_EXTRACTION_PROMPT = (
    "Extract the following fields from this bank cheque image and return ONLY "
    "a JSON object with these keys: payer_name, payee_name, account_number, "
    "cheque_number, amount_numeric (digits only, e.g. 50000.00), amount_words, "
    "date (DD/MM/YYYY), bank_name, routing_number. Use null for illegible fields."
)


def validate_fields(fields: Dict[str, Any]) -> Dict[str, List[str]]:
    """Return {'valid': [...], 'invalid': [...]} per ChequeWise's discipline."""
    valid, invalid = [], []
    for name, pattern in FIELD_VALIDATORS.items():
        value = fields.get(name)
        if value is None:
            continue
        cleaned = str(value).replace(" ", "").replace("₦", "").replace("NGN", "")
        (valid if pattern.match(cleaned) else invalid).append(name)
        if pattern.match(cleaned):
            fields[name] = cleaned
    return {"valid": valid, "invalid": invalid}


# ---------------------------------------------------------------------------
# Preprocessing (ChequeWise stage: enhance before OCR)
# ---------------------------------------------------------------------------

def preprocess_image(image_bytes: bytes) -> "Any":
    """Grayscale → autocontrast → sharpen. Returns a PIL Image."""
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    img = ImageOps.autocontrast(img, cutoff=2)
    img = ImageEnhance.Contrast(img).enhance(1.5)
    img = img.filter(ImageFilter.SHARPEN)
    return img


def crop_signature_region(image_bytes: bytes) -> bytes:
    """Isolate the signature region (bottom-right quadrant, above the MICR
    line) — ChequeScan's per-cheque signature isolation. Returns PNG bytes."""
    img = preprocess_image(image_bytes)
    w, h = img.size
    region = img.crop((int(w * 0.55), int(h * 0.55), int(w * 0.95), int(h * 0.85)))
    buf = io.BytesIO()
    region.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Extraction providers
# ---------------------------------------------------------------------------

async def _extract_ocr(image_bytes: bytes) -> Dict[str, Any]:
    """Tesseract OCR + heuristic field spotting. Requires pytesseract;
    degrades to an empty extraction when unavailable."""
    try:
        import pytesseract
    except ImportError:
        return {"fields": {}, "provider": "ocr",
                "error": "pytesseract not installed"}
    img = preprocess_image(image_bytes)
    text = pytesseract.image_to_string(img)
    fields: Dict[str, Any] = {"raw_text": text[:2000]}
    amount = re.search(r"(?:₦|NGN|N)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)", text)
    if amount:
        fields["amount_numeric"] = amount.group(1)
    cheque_no = re.search(r"\b(\d{6,8})\b", text)
    if cheque_no:
        fields["cheque_number"] = cheque_no.group(1)
    account = re.search(r"\b(\d{10})\b", text)
    if account:
        fields["account_number"] = account.group(1)
    date = re.search(r"\b(\d{2}[/-]\d{2}[/-]\d{4})\b", text)
    if date:
        fields["date"] = date.group(1)
    return {"fields": fields, "provider": "ocr"}


async def _extract_llm(image_bytes: bytes) -> Dict[str, Any]:
    """Structured-prompt multimodal extraction (ChequeScan pattern) via the
    platform's LLM integration. Degrades cleanly when unconfigured."""
    try:
        from app.services.deepseek_kyc_integration import get_deepseek_service
        svc = get_deepseek_service()
        result = await svc.extract_document_fields(
            image_bytes=image_bytes, prompt=LLM_EXTRACTION_PROMPT)
        if isinstance(result, str):
            result = json.loads(result.strip().strip("`").removeprefix("json").strip())
        return {"fields": result, "provider": "llm"}
    except Exception as exc:  # noqa: BLE001
        logger.warning("llm_extraction_failed", error=str(exc))
        return {"fields": {}, "provider": "llm", "error": str(exc)}


PROVIDERS = {"ocr": _extract_ocr, "llm": _extract_llm}


class DocumentIntakeService:
    """Extract, validate, and audit payment-document data."""

    async def extract_cheque(self, image_bytes: bytes, *,
                             provider: str = "llm",
                             isolate_signature: bool = True) -> Dict[str, Any]:
        if provider not in PROVIDERS:
            raise ValueError(f"unknown provider: {provider}")
        extraction_id = str(uuid.uuid4())
        result = await PROVIDERS[provider](image_bytes)
        fields = result.get("fields", {})
        validation = validate_fields(fields)
        signature_png = crop_signature_region(image_bytes) if isolate_signature else None

        logger.info("cheque_extracted", extraction_id=extraction_id,
                    provider=provider, valid=len(validation["valid"]),
                    invalid=len(validation["invalid"]))
        return {
            "extraction_id": extraction_id,
            "provider": result.get("provider"),
            "fields": fields,
            "validation": validation,
            "signature_region_png": signature_png.hex() if signature_png else None,
            "error": result.get("error"),
            "extracted_at": datetime.now(timezone.utc).isoformat(),
        }

    async def extract_batch(self, images: List[bytes], *,
                            provider: str = "llm") -> Dict[str, Any]:
        """ZIP/batch processing (ChequeScan's batch mode): per-image isolation
        — one bad image never fails the batch."""
        results, failed = [], 0
        for i, image_bytes in enumerate(images):
            try:
                results.append(await self.extract_cheque(
                    image_bytes, provider=provider))
            except Exception as exc:  # noqa: BLE001
                failed += 1
                results.append({"index": i, "error": str(exc)})
        return {"total": len(images), "succeeded": len(images) - failed,
                "failed": failed, "results": results}


_service: Optional[DocumentIntakeService] = None


def get_document_intake_service() -> DocumentIntakeService:
    global _service
    if _service is None:
        _service = DocumentIntakeService()
    return _service
