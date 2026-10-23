"""ACH NACHA Router

Exposes the ach-go sidecar (moov-io/ach) capabilities:
- POST /ach/nacha/validate — validate a NACHA file's structure and control totals
- POST /ach/nacha/parse   — parse a NACHA file and extract entries + Addenda99 returns
- POST /ach/returns/ingest — ingest an inbound bank return file and auto-process returns
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.middleware.auth_middleware import get_current_user
from app.services import ach_sidecar_client as ach_sidecar
from app.services.ach_processing_service import ACHProcessingService

logger = logging.getLogger(__name__)
ach_service = ACHProcessingService()
router = APIRouter(prefix="/ach", tags=["ach-nacha"])

_MAX_FILE_CHARS = 32 * 1024 * 1024  # mirror the sidecar's 32MB cap


class NachaFilePayload(BaseModel):
    file_content: str = Field(..., min_length=1)


def _check_size(content: str) -> None:
    if len(content) > _MAX_FILE_CHARS:
        raise HTTPException(status_code=413, detail="NACHA file exceeds 32MB limit")


@router.post("/nacha/validate")
async def validate_nacha_file(
    payload: NachaFilePayload,
    current_user: dict = Depends(get_current_user),
):
    """Validate a NACHA file using moov-io/ach via the ach-go sidecar."""
    _check_size(payload.file_content)
    result = await ach_sidecar.validate_nacha(payload.file_content)
    if result is None:
        raise HTTPException(status_code=503,
                            detail="ach sidecar unavailable — cannot validate")
    return result


@router.post("/nacha/parse")
async def parse_nacha_file(
    payload: NachaFilePayload,
    current_user: dict = Depends(get_current_user),
):
    """Parse a NACHA file, returning entries and any Addenda99 returns."""
    _check_size(payload.file_content)
    result = await ach_sidecar.parse_nacha(payload.file_content)
    if result is None:
        raise HTTPException(status_code=503,
                            detail="ach sidecar unavailable — cannot parse")
    return result


@router.post("/returns/ingest")
async def ingest_return_file(
    payload: NachaFilePayload,
    current_user: dict = Depends(get_current_user),
):
    """Ingest an inbound bank return file: parse and process every return."""
    _check_size(payload.file_content)
    result = await ach_service.ingest_return_file(payload.file_content)
    if not result.get("success"):
        raise HTTPException(status_code=503, detail=result.get("error", "ingest failed"))
    logger.info("ach_returns_ingested", extra={
        "returns_found": result.get("returns_found"),
        "user_id": current_user.get("id") or current_user.get("sub"),
    })
    return result
