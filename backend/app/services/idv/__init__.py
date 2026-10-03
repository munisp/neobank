"""ID Verification (OpenKYC-style) services.

Self-hosted replacement for the FaceOnLive IDKit cloud functions:
- PaddleOCR for raw OCR text extraction
- docling for structured document parsing
- VLM (OpenAI-compatible) for document classification + field extraction
- MRZ checksum validation, expiry checks, session workflow, signed webhooks

All heavy dependencies are imported lazily so the backend boots without them.
"""

from app.services.idv.models import (  # noqa: F401
    IDVSessionStatus,
    VerificationResult,
    IDVSessionCreateResponse,
    IDVSessionState,
)
from app.services.idv.pipeline import get_idv_pipeline  # noqa: F401
