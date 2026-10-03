"""Document verification pipeline: PaddleOCR + docling + VLM + MRZ."""

import base64
from datetime import date
from typing import Any, Dict, List, Optional

import structlog

from app.services.idv.docling_parser import get_docling_parser
from app.services.idv.models import DocumentImages, VerificationResult
from app.services.idv.mrz import find_mrz_lines, parse_mrz
from app.services.idv.ocr_engine import decode_base64_image, get_ocr_engine
from app.services.idv.vlm_extractor import get_vlm_extractor

logger = structlog.get_logger(__name__)


class DocumentVerificationPipeline:
    """Runs the full self-hosted document verification flow."""

    def __init__(self, ocr_lang: str = "en"):
        self.ocr = get_ocr_engine(ocr_lang)
        self.docling = get_docling_parser()
        self.vlm = get_vlm_extractor()

    async def process_base64(
        self,
        front_base64: str,
        back_base64: Optional[str] = None,
    ) -> VerificationResult:
        front_bytes = decode_base64_image(front_base64)
        back_bytes = decode_base64_image(back_base64) if back_base64 else None
        return await self.process(front_bytes, back_bytes)

    async def process(
        self,
        front_bytes: bytes,
        back_bytes: Optional[bytes] = None,
    ) -> VerificationResult:
        warnings: List[str] = []

        # 1. OCR (PaddleOCR) — front always, back when present.
        front_ocr = self.ocr.extract_text(front_bytes)
        back_ocr = self.ocr.extract_text(back_bytes) if back_bytes else {"text": "", "lines": []}
        if not front_ocr.get("available"):
            warnings.append("paddleocr_unavailable")
        if not front_ocr.get("text") and not back_ocr.get("text"):
            logger.warning("idv_ocr_empty")

        # 2. docling structured parse (front only; IDs are single-image docs).
        docling_result = self.docling.parse(front_bytes, filename="front.png")
        if not docling_result.get("available"):
            warnings.append("docling_unavailable")

        combined_text = "\n".join(
            part for part in [front_ocr.get("text", ""), back_ocr.get("text", ""), docling_result.get("text", "")] if part
        )

        # 3. MRZ detection + checksum validation.
        mrz_lines = find_mrz_lines(combined_text)
        mrz = parse_mrz(mrz_lines) if mrz_lines else None

        # 4. VLM extraction with heuristic fallback.
        fields: Dict[str, Any] = {}
        extractor = "heuristic"
        vlm_fields = await self.vlm.extract_fields(combined_text, image_bytes=front_bytes)
        if vlm_fields:
            fields.update(vlm_fields)
            extractor = "vlm"
        heuristic_fields = self.vlm.extract_fields_heuristic(combined_text)
        for key, value in heuristic_fields.items():
            fields.setdefault(key, value)

        # 5. Merge MRZ (highest trust) over extracted fields.
        if mrz:
            fields.setdefault("document_number", mrz.get("document_number"))
            fields.setdefault("issuing_state", mrz.get("issuing_state"))
            fields.setdefault("nationality", mrz.get("nationality"))
            fields.setdefault("date_of_birth", mrz.get("date_of_birth"))
            fields.setdefault("expiration_date", mrz.get("expiration_date"))
            if mrz.get("surname"):
                fields.setdefault("last_name", mrz["surname"])
            if mrz.get("given_names"):
                fields.setdefault("first_name", mrz["given_names"].split(" ")[0])
            fields.setdefault("gender", mrz.get("sex"))
            fields.setdefault("document_type", "Passport" if mrz["format"] == "TD3" else "National ID")

        # 6. Validation checks + score.
        checks = self._validate(fields, mrz)
        score = sum(1 for ok in checks.values() if ok) / max(len(checks), 1)
        document_valid = score >= 0.6 and checks.get("mrz_checksums", True)

        first = fields.get("first_name")
        last = fields.get("last_name")
        full_name = " ".join(part for part in [first, last] if part) or None

        return VerificationResult(
            document_type=fields.get("document_type"),
            document_number=fields.get("document_number"),
            personal_number=fields.get("personal_number"),
            issuing_state=fields.get("issuing_state"),
            first_name=first,
            last_name=last,
            full_name=full_name,
            date_of_birth=fields.get("date_of_birth"),
            expiration_date=fields.get("expiration_date"),
            gender=fields.get("gender"),
            nationality=fields.get("nationality"),
            mrz=mrz,
            document_valid=document_valid,
            document_score=round(score, 4),
            validation_checks=checks,
            ocr_data={
                "front_lines": len(front_ocr.get("lines", [])),
                "back_lines": len(back_ocr.get("lines", [])),
                "engine": "paddleocr" if front_ocr.get("available") else None,
                "docling": bool(docling_result.get("text")),
            },
            raw_text=combined_text[:10000],
            image=DocumentImages(
                document_front_side=base64.b64encode(front_bytes).decode(),
                document_back_side=base64.b64encode(back_bytes).decode() if back_bytes else None,
            ),
            extractor=extractor,
            warnings=warnings,
        )

    @staticmethod
    def _validate(fields: Dict[str, Any], mrz: Optional[Dict[str, Any]]) -> Dict[str, bool]:
        checks: Dict[str, bool] = {
            "has_document_type": bool(fields.get("document_type")),
            "has_document_number": bool(fields.get("document_number")),
            "has_name": bool(fields.get("first_name") or fields.get("last_name")),
            "has_date_of_birth": bool(fields.get("date_of_birth")),
        }
        if mrz:
            checks["mrz_checksums"] = bool(mrz.get("valid"))
        expiry = fields.get("expiration_date")
        if expiry:
            try:
                checks["not_expired"] = date.fromisoformat(expiry) >= date.today()
            except ValueError:
                checks["not_expired"] = False
        return checks


_pipeline: Optional[DocumentVerificationPipeline] = None


def get_idv_pipeline() -> DocumentVerificationPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = DocumentVerificationPipeline()
    return _pipeline
