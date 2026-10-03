"""Pydantic models for the ID verification (IDV) pipeline."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class IDVSessionStatus(str, Enum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    PROCESSING_IMAGES = "PROCESSING_IMAGES"
    IN_REVIEW = "IN_REVIEW"
    PROCESSING_FAILED = "PROCESSING_FAILED"
    APPROVED = "APPROVED"
    DECLINED = "DECLINED"


class DocumentImages(BaseModel):
    portrait: Optional[str] = None
    signature: Optional[str] = None
    document_front_side: Optional[str] = None
    document_back_side: Optional[str] = None


class VerificationResult(BaseModel):
    """Normalized verification result (mirrors OpenKYC VerificationResult)."""

    document_type: Optional[str] = None
    document_number: Optional[str] = None
    personal_number: Optional[str] = None
    issuing_state: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    expiration_date: Optional[str] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None
    mrz: Optional[Dict[str, Any]] = None
    document_valid: bool = False
    document_score: float = 0.0
    validation_checks: Dict[str, bool] = Field(default_factory=dict)
    ocr_data: Dict[str, Any] = Field(default_factory=dict)
    raw_text: str = ""
    image: DocumentImages = Field(default_factory=DocumentImages)
    extractor: str = "heuristic"  # vlm | heuristic
    warnings: List[str] = Field(default_factory=list)


class IDVSessionCreateResponse(BaseModel):
    success: bool = True
    session_id: str
    session_url: str
    status: IDVSessionStatus
    created_at: datetime


class IDVSessionState(BaseModel):
    session_id: str
    status: IDVSessionStatus
    vendor_id: Optional[str] = None
    user_id: Optional[str] = None
    result: Optional[VerificationResult] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class FaceLivenessResult(BaseModel):
    status: str
    is_live: Optional[bool] = None
    liveness_score: Optional[float] = None
    detail: Optional[str] = None


class FaceCompareResult(BaseModel):
    status: str
    match: Optional[bool] = None
    similarity: Optional[float] = None
    detail: Optional[str] = None


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
