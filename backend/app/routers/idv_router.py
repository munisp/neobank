"""Identity Verification (IDV) router.

Self-hosted replacement for the FaceOnLive IDKit / OpenKYC cloud functions.
Implements the same session lifecycle and webhook contract:

    NOT_STARTED -> IN_PROGRESS -> PROCESSING_IMAGES -> IN_REVIEW
                                                      -> PROCESSING_FAILED
    IN_REVIEW --(manual or auto review)--> APPROVED | DECLINED

Pipeline: PaddleOCR (text) + docling (structure) + VLM (field extraction)
+ MRZ checksum validation. Face biometrics are delegated to an optional
FaceOnLive-compatible HTTP provider (IDV_FACE_API_URL); when unset the
endpoints return ``status = "not_configured"``.

Auth: API key via ``X-API-Key`` header (settings.IDV_API_KEYS). In the
development environment with no keys configured the endpoints are open
(fail-open, consistent with PBAC middleware behaviour).
"""

from typing import Any, Dict, Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.idv import (
    IDVSessionCreateResponse,
    IDVSessionState,
    IDVSessionStatus,
    get_idv_pipeline,
)
from app.services.idv.biometrics import get_biometrics_client
from app.services.idv.liveness import get_liveness_service
from app.services.idv.models import FaceCompareResult, FaceLivenessResult, utcnow
from app.services.idv.webhooks import get_idv_webhook_service
from config.settings import settings
from database.connection import get_db
from database.models import IDVSession

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/idv", tags=["Identity Verification"])


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

async def require_idv_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    """Validate the IDV API key. Fail-open in development when unconfigured."""
    configured = [k.strip() for k in getattr(settings, "IDV_API_KEYS", "").split(",") if k.strip()]
    if not configured:
        if getattr(settings, "ENVIRONMENT", "development") == "production":
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                                detail="IDV API keys not configured")
        return  # development: no keys configured -> open access
    if not x_api_key or x_api_key not in configured:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid IDV API key")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SessionCreateRequest(BaseModel):
    vendor_id: Optional[str] = None
    user_id: Optional[str] = None


class SubmitImagesRequest(BaseModel):
    front_image: str = Field(..., description="Base64 (optionally data-URL) encoded front image")
    back_image: Optional[str] = Field(None, description="Base64 encoded back image")
    selfie_image: Optional[str] = Field(None, description="Base64 encoded selfie for face match + liveness")


class LivenessVerifyRequest(BaseModel):
    challenge: Dict[str, Any] = Field(..., description="Challenge payload returned by /liveness/challenge")
    frames: list = Field(..., description="Base64 frames captured while performing the challenge")
    observed_actions: Optional[list] = Field(None, description="Action labels reported by the capture SDK")


class ReviewRequest(BaseModel):
    approved: bool
    reason: Optional[str] = None


class FaceLivenessRequest(BaseModel):
    image: str = Field(..., description="Base64 encoded selfie image")


class FaceCompareRequest(BaseModel):
    first_image: str
    second_image: str


class WebhookTestRequest(BaseModel):
    event: str = "test"
    data: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_session(session_id: UUID, db: AsyncSession) -> IDVSession:
    result = await db.execute(select(IDVSession).where(IDVSession.id == session_id))
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IDV session not found")
    return session


def _session_state(session: IDVSession) -> IDVSessionState:
    return IDVSessionState(
        session_id=str(session.id),
        status=IDVSessionStatus(session.status),
        vendor_id=session.vendor_id,
        user_id=str(session.user_id) if session.user_id else None,
        result=session.result,
        error_message=session.error_message,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


# ---------------------------------------------------------------------------
# Session workflow
# ---------------------------------------------------------------------------

@router.post("/sessions", response_model=IDVSessionCreateResponse,
             status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_idv_api_key)])
async def create_session(payload: SessionCreateRequest, request: Request,
                         db: AsyncSession = Depends(get_db)) -> IDVSessionCreateResponse:
    session = IDVSession(
        status=IDVSessionStatus.NOT_STARTED.value,
        vendor_id=payload.vendor_id,
        user_id=UUID(payload.user_id) if payload.user_id else None,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    base = getattr(settings, "IDV_SESSION_SITE_URL", "").rstrip("/")
    session_url = f"{base}/{session.id}" if base else str(request.url_for("get_idv_session", session_id=session.id))
    session.session_url = session_url
    await db.commit()

    logger.info("idv_session_created", session_id=str(session.id))
    return IDVSessionCreateResponse(
        session_id=str(session.id),
        session_url=session_url,
        status=IDVSessionStatus(session.status),
        created_at=session.created_at,
    )


@router.get("/sessions/{session_id}", response_model=IDVSessionState,
            dependencies=[Depends(require_idv_api_key)])
async def get_idv_session(session_id: UUID, db: AsyncSession = Depends(get_db)) -> IDVSessionState:
    return _session_state(await _get_session(session_id, db))


@router.post("/sessions/{session_id}/submit", response_model=IDVSessionState,
             dependencies=[Depends(require_idv_api_key)])
async def submit_images(session_id: UUID, payload: SubmitImagesRequest,
                        db: AsyncSession = Depends(get_db)) -> IDVSessionState:
    session = await _get_session(session_id, db)
    if session.status in (IDVSessionStatus.APPROVED.value, IDVSessionStatus.DECLINED.value):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Session already finalized")

    session.front_image_b64 = payload.front_image
    session.back_image_b64 = payload.back_image
    session.selfie_image_b64 = payload.selfie_image
    session.status = IDVSessionStatus.IN_PROGRESS.value
    session.updated_at = utcnow()
    await db.commit()

    await get_idv_webhook_service().send_notification(
        str(session.id), "images_submitted", {"status": session.status}, db=None)
    return _session_state(session)


@router.post("/sessions/{session_id}/process", response_model=IDVSessionState,
             dependencies=[Depends(require_idv_api_key)])
async def process_session(session_id: UUID, db: AsyncSession = Depends(get_db)) -> IDVSessionState:
    """Run the PaddleOCR + docling + VLM + MRZ pipeline over submitted images."""
    session = await _get_session(session_id, db)
    if not session.front_image_b64:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="No document images submitted")

    session.status = IDVSessionStatus.PROCESSING_IMAGES.value
    session.updated_at = utcnow()
    await db.commit()

    pipeline = get_idv_pipeline()
    try:
        result = await pipeline.process_base64(session.front_image_b64, session.back_image_b64)
    except Exception as exc:  # noqa: BLE001
        logger.error("idv_process_failed", session_id=str(session_id), error=str(exc))
        session.status = IDVSessionStatus.PROCESSING_FAILED.value
        session.error_message = str(exc)[:500]
        session.updated_at = utcnow()
        await db.commit()
        await get_idv_webhook_service().send_notification(
            str(session.id), "processing_failed", {"error": session.error_message}, db=None)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"Verification pipeline failed: {exc}")

    # --- Biometric gate: face match (selfie vs document) + liveness decision.
    # The document pipeline alone is not enough to reach IN_REVIEW clean:
    # biometrics decide whether the session is clean, flagged, or declined.
    biometrics = await _evaluate_biometrics(session)

    session.result = result.model_dump(mode="json")
    session.result["biometrics"] = biometrics
    if biometrics["decision"] == "fail":
        session.status = IDVSessionStatus.DECLINED.value
        session.error_message = "Biometric verification failed: " + ", ".join(
            biometrics.get("reasons") or biometrics.get("deepfake_flags") or ["unknown"])
    else:
        # "pass" and "review" both land IN_REVIEW; review carries flags for the analyst.
        session.status = IDVSessionStatus.IN_REVIEW.value
    session.updated_at = utcnow()
    await db.commit()

    await get_idv_webhook_service().send_notification(
        str(session.id), "verification_completed",
        {"status": session.status,
         "document_valid": result.document_valid,
         "document_score": result.document_score,
         "biometrics": biometrics.get("decision")},
        db=None)
    return _session_state(session)


async def _evaluate_biometrics(session: IDVSession) -> Dict[str, Any]:
    """Combine the stored liveness decision with selfie-vs-document face match.

    - No selfie submitted -> review (document-only, analyst must decide).
    - Liveness FAIL recorded -> fail (replay/deepfake risk).
    - Face match below threshold (when provider configured) -> fail."""
    from config.settings import settings as _settings

    out: Dict[str, Any] = {"decision": "review", "reasons": []}
    liveness = (session.biometrics_result or {}).get("liveness")
    face_match = None

    if not session.selfie_image_b64:
        out["reasons"].append("no_selfie_submitted")
        out["liveness"] = liveness
        return out

    if liveness:
        out["liveness"] = liveness
        if liveness.get("status") == "fail":
            out["decision"] = "fail"
            out["reasons"].extend(liveness.get("deepfake_flags") or ["liveness_failed"])
            return out
    else:
        out["reasons"].append("liveness_not_completed")

    client = get_biometrics_client()
    threshold = float(getattr(_settings, "IDV_FACE_MATCH_THRESHOLD", 0.80) or 0.80)
    if client.available and session.front_image_b64:
        try:
            cmp_res = await client.compare_faces(session.selfie_image_b64, session.front_image_b64)
            score = getattr(cmp_res, "similarity", None) or getattr(cmp_res, "confidence", None)
            face_match = {"score": score, "threshold": threshold,
                          "matched": bool(score is not None and score >= threshold)}
        except Exception as exc:  # noqa: BLE001
            logger.warning("idv_face_compare_failed", error=str(exc))
            face_match = {"error": str(exc)[:200]}
        out["face_match"] = face_match
        if face_match.get("matched") is False:
            out["decision"] = "fail"
            out["reasons"].append("face_mismatch")
            return out

    # Decide: clean pass needs liveness pass (+ face match when available).
    if liveness and liveness.get("status") == "pass" and (face_match is None or face_match.get("matched", True)):
        out["decision"] = "pass"
    return out


@router.get("/sessions/{session_id}/result", dependencies=[Depends(require_idv_api_key)])
async def get_session_result(session_id: UUID, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    session = await _get_session(session_id, db)
    if session.result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No verification result yet — process the session first")
    return session.result


@router.post("/sessions/{session_id}/review", response_model=IDVSessionState,
             dependencies=[Depends(require_idv_api_key)])
async def review_session(session_id: UUID, payload: ReviewRequest,
                         db: AsyncSession = Depends(get_db)) -> IDVSessionState:
    session = await _get_session(session_id, db)
    if session.status != IDVSessionStatus.IN_REVIEW.value:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Session is {session.status}, not IN_REVIEW")

    session.status = (IDVSessionStatus.APPROVED if payload.approved
                      else IDVSessionStatus.DECLINED).value
    if payload.reason:
        session.error_message = payload.reason[:500]
    session.updated_at = utcnow()
    await db.commit()

    await get_idv_webhook_service().send_notification(
        str(session.id),
        "verification_approved" if payload.approved else "verification_declined",
        {"status": session.status, "reason": payload.reason},
        db=None)
    return _session_state(session)


# ---------------------------------------------------------------------------
# Liveness challenge-response (anti-replay / anti-deepfake)
# ---------------------------------------------------------------------------

@router.post("/sessions/{session_id}/liveness/challenge",
             dependencies=[Depends(require_idv_api_key)])
async def issue_liveness_challenge(session_id: UUID,
                                   db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Issue a server-signed action challenge bound to this session (120s TTL)."""
    session = await _get_session(session_id, db)
    return get_liveness_service().issue_challenge(str(session.id))


@router.post("/sessions/{session_id}/liveness/verify",
             dependencies=[Depends(require_idv_api_key)])
async def verify_liveness(session_id: UUID, payload: LivenessVerifyRequest,
                          db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Verify challenge frames: signature/expiry, injection forensics, passive score."""
    session = await _get_session(session_id, db)
    if str(payload.challenge.get("session_id")) != str(session.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Challenge does not belong to this session")
    decision = await get_liveness_service().evaluate(
        str(session.id), payload.challenge, payload.frames, payload.observed_actions)
    bio = session.biometrics_result or {}
    bio["liveness"] = decision.to_dict()
    session.biometrics_result = bio
    if decision.status == "pass" and payload.frames:
        # Keep the first verified frame as the session selfie when none was submitted.
        if not session.selfie_image_b64:
            session.selfie_image_b64 = payload.frames[0]
    session.updated_at = utcnow()
    await db.commit()
    await get_idv_webhook_service().send_notification(
        str(session.id), "liveness_completed", decision.to_dict(), db=None)
    return decision.to_dict()


# ---------------------------------------------------------------------------
# Webhooks + biometrics
# ---------------------------------------------------------------------------

@router.post("/webhooks/test", dependencies=[Depends(require_idv_api_key)])
async def test_webhook(payload: WebhookTestRequest,
                       db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    service = get_idv_webhook_service()
    delivered = await service.send_notification("00000000-0000-0000-0000-000000000000",
                                                payload.event, payload.data, db=db)
    return {"configured": service.configured, "delivered": delivered}


@router.post("/face/liveness", response_model=FaceLivenessResult,
             dependencies=[Depends(require_idv_api_key)])
async def face_liveness(payload: FaceLivenessRequest) -> FaceLivenessResult:
    return await get_biometrics_client().face_liveness(payload.image)


@router.post("/face/compare", response_model=FaceCompareResult,
             dependencies=[Depends(require_idv_api_key)])
async def face_compare(payload: FaceCompareRequest) -> FaceCompareResult:
    return await get_biometrics_client().compare_faces(payload.first_image, payload.second_image)
