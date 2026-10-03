"""Pluggable face biometrics (liveness + comparison).

FaceOnLive-compatible HTTP providers can be configured with IDV_FACE_API_URL
(OpenKYC gradio-style endpoints). When unconfigured, endpoints return
status="not_configured" instead of failing.
"""

import base64
from typing import Optional

import httpx
import structlog

from config.settings import settings
from app.services.idv.models import FaceCompareResult, FaceLivenessResult

logger = structlog.get_logger(__name__)


class BiometricsClient:
    def __init__(self):
        self.api_url = getattr(settings, "IDV_FACE_API_URL", "")
        self.api_key = getattr(settings, "IDV_FACE_API_KEY", "")
        self.timeout = float(getattr(settings, "IDV_FACE_TIMEOUT", 30))
        self.similarity_threshold = float(getattr(settings, "IDV_FACE_MATCH_THRESHOLD", 0.6))

    @property
    def available(self) -> bool:
        return bool(self.api_url)

    def _headers(self):
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    @staticmethod
    def _clean(b64: str) -> str:
        if "," in b64 and b64.strip().startswith("data:"):
            return b64.split(",", 1)[1]
        return b64

    async def face_liveness(self, face_image_base64: str) -> FaceLivenessResult:
        if not self.available:
            return FaceLivenessResult(status="not_configured", detail="Set IDV_FACE_API_URL to enable liveness")
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.api_url.rstrip('/')}/face_liveness_base64",
                    json={"data": [self._clean(face_image_base64)]},
                    headers=self._headers(),
                )
                response.raise_for_status()
                data = response.json()
            result = data.get("data", data)
            is_live = result.get("result") == "genuine"
            return FaceLivenessResult(
                status="ok",
                is_live=is_live,
                liveness_score=result.get("liveness_score"),
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("face_liveness_failed", error=str(exc))
            return FaceLivenessResult(status="error", detail=str(exc))

    async def compare_faces(self, face1_base64: str, face2_base64: str) -> FaceCompareResult:
        if not self.available:
            return FaceCompareResult(status="not_configured", detail="Set IDV_FACE_API_URL to enable face match")
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.api_url.rstrip('/')}/compare_face_base64",
                    json={"data": [self._clean(face1_base64), self._clean(face2_base64)]},
                    headers=self._headers(),
                )
                response.raise_for_status()
                data = response.json()
            result = data.get("data", data)
            similarity = result.get("similarity")
            matched = result.get("result")
            if matched is None and similarity is not None:
                matched = bool(float(similarity) >= self.similarity_threshold)
            return FaceCompareResult(status="ok", match=matched, similarity=similarity)
        except Exception as exc:  # noqa: BLE001
            logger.error("face_compare_failed", error=str(exc))
            return FaceCompareResult(status="error", detail=str(exc))


_client: Optional[BiometricsClient] = None


def get_biometrics_client() -> BiometricsClient:
    global _client
    if _client is None:
        _client = BiometricsClient()
    return _client
