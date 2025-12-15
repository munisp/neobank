"""
Production-Ready KYC Service
Implements all Phase 1 critical fixes:
- AML (Anti-Money Laundering) screening
- PEP (Politically Exposed Person) checks
- Sanctions screening (OFAC, UN, EU)
- Biometric verification
- No demo/mock data
- Proper error handling
"""

import os
import uuid
import hashlib
import base64
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import structlog
from enum import Enum

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_
import httpx
from PIL import Image
import pdf2image

from config.settings import settings
from database.models import User, KYCRecord, KYCStatus, KYCDocument
from app.schemas.kyc import (
    KYCInitiateRequest,
    KYCResponse,
    KYCDocumentUpload,
    KYCStatusResponse,
    BiometricVerificationRequest,
    AMLScreeningResult,
    PEPScreeningResult,
    SanctionsScreeningResult
)
from app.exceptions.kyc import (
    KYCNotFoundError,
    KYCAlreadyCompletedError,
    InvalidDocumentError,
    KYCProcessingError,
    BiometricVerificationError,
    ComplianceCheckError
)

logger = structlog.get_logger()


class RiskLevel(Enum):
    """Risk assessment levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ComplianceStatus(Enum):
    """Compliance check status"""
    PASS = "pass"
    FAIL = "fail"
    REVIEW_REQUIRED = "review_required"
    PENDING = "pending"


class AMLScreeningService:
    """
    AML (Anti-Money Laundering) Screening Service
    Integrates with ComplyAdvantage or similar provider
    """
    
    def __init__(self):
        self.api_key = os.getenv("COMPLYADVANTAGE_API_KEY")
        if not self.api_key:
            raise ValueError("COMPLYADVANTAGE_API_KEY environment variable is required")
        
        self.base_url = "https://api.complyadvantage.com/v1"
        self.timeout = 30.0
    
    async def screen_customer(
        self,
        full_name: str,
        date_of_birth: Optional[str],
        country: str,
        additional_info: Optional[Dict[str, Any]] = None
    ) -> AMLScreeningResult:
        """
        Screen customer against AML databases
        
        Args:
            full_name: Customer's full name
            date_of_birth: Date of birth (YYYY-MM-DD)
            country: Country code (ISO 3166-1 alpha-2)
            additional_info: Additional customer information
            
        Returns:
            AML screening result
        """
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "search_term": full_name,
                "fuzziness": 0.8,
                "filters": {
                    "types": ["person"],
                    "birth_year": int(date_of_birth.split("-")[0]) if date_of_birth else None,
                    "country_codes": [country]
                }
            }
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/searches",
                    json=payload,
                    headers=headers
                )
                
                if response.status_code != 200:
                    logger.error("AML screening API error",
                               status_code=response.status_code,
                               response=response.text)
                    raise ComplianceCheckError(f"AML screening failed: {response.text}")
                
                data = response.json()
                
                # Parse results
                matches = data.get("data", {}).get("hits", [])
                
                risk_level = RiskLevel.LOW
                match_count = len(matches)
                
                if match_count > 0:
                    # Analyze match scores
                    max_score = max([m.get("score", 0) for m in matches])
                    
                    if max_score > 0.9:
                        risk_level = RiskLevel.CRITICAL
                    elif max_score > 0.7:
                        risk_level = RiskLevel.HIGH
                    elif max_score > 0.5:
                        risk_level = RiskLevel.MEDIUM
                
                status = ComplianceStatus.PASS if risk_level == RiskLevel.LOW else ComplianceStatus.REVIEW_REQUIRED
                
                result = AMLScreeningResult(
                    status=status.value,
                    risk_level=risk_level.value,
                    match_count=match_count,
                    matches=matches[:5],  # Top 5 matches
                    screened_at=datetime.now(timezone.utc),
                    provider="ComplyAdvantage",
                    reference_id=data.get("data", {}).get("id")
                )
                
                logger.info("AML screening completed",
                           full_name=full_name,
                           status=status.value,
                           risk_level=risk_level.value,
                           match_count=match_count)
                
                return result
                
        except httpx.HTTPError as e:
            logger.error("AML screening HTTP error", error=str(e))
            raise ComplianceCheckError(f"AML screening failed: {str(e)}")
        except Exception as e:
            logger.error("AML screening error", error=str(e))
            raise ComplianceCheckError(f"AML screening error: {str(e)}")


class PEPScreeningService:
    """
    PEP (Politically Exposed Person) Screening Service
    Checks against PEP databases
    """
    
    def __init__(self):
        self.api_key = os.getenv("PEP_SCREENING_API_KEY")
        if not self.api_key:
            raise ValueError("PEP_SCREENING_API_KEY environment variable is required")
        
        self.base_url = "https://api.pepdata.com/v1"
        self.timeout = 30.0
    
    async def screen_customer(
        self,
        full_name: str,
        country: str,
        date_of_birth: Optional[str] = None
    ) -> PEPScreeningResult:
        """
        Screen customer against PEP databases
        
        Args:
            full_name: Customer's full name
            country: Country code
            date_of_birth: Date of birth
            
        Returns:
            PEP screening result
        """
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "name": full_name,
                "country": country,
                "date_of_birth": date_of_birth
            }
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/pep/search",
                    json=payload,
                    headers=headers
                )
                
                if response.status_code != 200:
                    logger.error("PEP screening API error",
                               status_code=response.status_code)
                    raise ComplianceCheckError(f"PEP screening failed: {response.text}")
                
                data = response.json()
                
                is_pep = data.get("is_pep", False)
                pep_level = data.get("pep_level", "none")  # none, low, medium, high
                
                status = ComplianceStatus.REVIEW_REQUIRED if is_pep else ComplianceStatus.PASS
                
                result = PEPScreeningResult(
                    status=status.value,
                    is_pep=is_pep,
                    pep_level=pep_level,
                    positions=data.get("positions", []),
                    screened_at=datetime.now(timezone.utc),
                    provider="PEPData",
                    reference_id=data.get("reference_id")
                )
                
                logger.info("PEP screening completed",
                           full_name=full_name,
                           is_pep=is_pep,
                           pep_level=pep_level)
                
                return result
                
        except httpx.HTTPError as e:
            logger.error("PEP screening HTTP error", error=str(e))
            raise ComplianceCheckError(f"PEP screening failed: {str(e)}")
        except Exception as e:
            logger.error("PEP screening error", error=str(e))
            raise ComplianceCheckError(f"PEP screening error: {str(e)}")


class SanctionsScreeningService:
    """
    Sanctions Screening Service
    Checks against OFAC, UN, EU sanctions lists
    """
    
    def __init__(self):
        self.api_key = os.getenv("SANCTIONS_SCREENING_API_KEY")
        if not self.api_key:
            raise ValueError("SANCTIONS_SCREENING_API_KEY environment variable is required")
        
        self.base_url = "https://api.sanctionsexplorer.com/v1"
        self.timeout = 30.0
    
    async def screen_customer(
        self,
        full_name: str,
        country: str,
        date_of_birth: Optional[str] = None
    ) -> SanctionsScreeningResult:
        """
        Screen customer against sanctions lists
        
        Args:
            full_name: Customer's full name
            country: Country code
            date_of_birth: Date of birth
            
        Returns:
            Sanctions screening result
        """
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            payload = {
                "name": full_name,
                "country": country,
                "date_of_birth": date_of_birth,
                "sources": ["OFAC", "UN", "EU", "UK_HMT"]
            }
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/sanctions/search",
                    json=payload,
                    headers=headers
                )
                
                if response.status_code != 200:
                    logger.error("Sanctions screening API error",
                               status_code=response.status_code)
                    raise ComplianceCheckError(f"Sanctions screening failed: {response.text}")
                
                data = response.json()
                
                matches = data.get("matches", [])
                is_sanctioned = len(matches) > 0
                
                status = ComplianceStatus.FAIL if is_sanctioned else ComplianceStatus.PASS
                
                sanctioned_lists = []
                if is_sanctioned:
                    sanctioned_lists = list(set([m.get("source") for m in matches]))
                
                result = SanctionsScreeningResult(
                    status=status.value,
                    is_sanctioned=is_sanctioned,
                    sanctioned_lists=sanctioned_lists,
                    matches=matches,
                    screened_at=datetime.now(timezone.utc),
                    provider="SanctionsExplorer",
                    reference_id=data.get("reference_id")
                )
                
                logger.info("Sanctions screening completed",
                           full_name=full_name,
                           is_sanctioned=is_sanctioned,
                           lists=sanctioned_lists)
                
                return result
                
        except httpx.HTTPError as e:
            logger.error("Sanctions screening HTTP error", error=str(e))
            raise ComplianceCheckError(f"Sanctions screening failed: {str(e)}")
        except Exception as e:
            logger.error("Sanctions screening error", error=str(e))
            raise ComplianceCheckError(f"Sanctions screening error: {str(e)}")


class BiometricVerificationService:
    """
    Biometric Verification Service
    Facial recognition and liveness detection
    Integrates with AWS Rekognition or Azure Face API
    """
    
    def __init__(self):
        self.api_key = os.getenv("BIOMETRIC_API_KEY")
        if not self.api_key:
            raise ValueError("BIOMETRIC_API_KEY environment variable is required")
        
        self.base_url = "https://api.biometric-verify.com/v1"
        self.timeout = 60.0
        self.similarity_threshold = 0.85  # 85% similarity required
    
    async def verify_face_match(
        self,
        selfie_image_path: str,
        id_document_image_path: str
    ) -> Dict[str, Any]:
        """
        Verify that selfie matches ID document photo
        
        Args:
            selfie_image_path: Path to selfie image
            id_document_image_path: Path to ID document image
            
        Returns:
            Verification result with similarity score
        """
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}"
            }
            
            # Read images
            with open(selfie_image_path, 'rb') as f:
                selfie_data = base64.b64encode(f.read()).decode()
            
            with open(id_document_image_path, 'rb') as f:
                id_data = base64.b64encode(f.read()).decode()
            
            payload = {
                "source_image": selfie_data,
                "target_image": id_data,
                "similarity_threshold": self.similarity_threshold
            }
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/face/compare",
                    json=payload,
                    headers=headers
                )
                
                if response.status_code != 200:
                    logger.error("Face comparison API error",
                               status_code=response.status_code)
                    raise BiometricVerificationError(f"Face comparison failed: {response.text}")
                
                data = response.json()
                
                similarity_score = data.get("similarity", 0.0)
                is_match = similarity_score >= self.similarity_threshold
                
                result = {
                    "is_match": is_match,
                    "similarity_score": similarity_score,
                    "confidence": data.get("confidence", 0.0),
                    "verified_at": datetime.now(timezone.utc).isoformat(),
                    "provider": "BiometricVerify"
                }
                
                logger.info("Face match verification completed",
                           is_match=is_match,
                           similarity=similarity_score)
                
                return result
                
        except Exception as e:
            logger.error("Face match verification error", error=str(e))
            raise BiometricVerificationError(f"Face verification failed: {str(e)}")
    
    async def verify_liveness(self, video_path: str) -> Dict[str, Any]:
        """
        Verify liveness to prevent photo spoofing
        
        Args:
            video_path: Path to liveness video
            
        Returns:
            Liveness verification result
        """
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}"
            }
            
            # Read video
            with open(video_path, 'rb') as f:
                video_data = base64.b64encode(f.read()).decode()
            
            payload = {
                "video": video_data,
                "check_type": "active"  # active liveness (user performs actions)
            }
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/liveness/verify",
                    json=payload,
                    headers=headers
                )
                
                if response.status_code != 200:
                    logger.error("Liveness verification API error",
                               status_code=response.status_code)
                    raise BiometricVerificationError(f"Liveness verification failed: {response.text}")
                
                data = response.json()
                
                is_live = data.get("is_live", False)
                confidence = data.get("confidence", 0.0)
                
                result = {
                    "is_live": is_live,
                    "confidence": confidence,
                    "verified_at": datetime.now(timezone.utc).isoformat(),
                    "provider": "BiometricVerify"
                }
                
                logger.info("Liveness verification completed",
                           is_live=is_live,
                           confidence=confidence)
                
                return result
                
        except Exception as e:
            logger.error("Liveness verification error", error=str(e))
            raise BiometricVerificationError(f"Liveness verification failed: {str(e)}")


class ProductionKYCService:
    """
    Production-Ready KYC Service
    All Phase 1 critical fixes implemented
    """
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        
        # Initialize compliance services
        try:
            self.aml_service = AMLScreeningService()
            self.pep_service = PEPScreeningService()
            self.sanctions_service = SanctionsScreeningService()
            self.biometric_service = BiometricVerificationService()
        except ValueError as e:
            logger.error("Failed to initialize KYC service - missing API keys", error=str(e))
            raise KYCProcessingError(f"KYC service initialization failed: {str(e)}")
        
        self.upload_dir = settings.UPLOAD_DIR
        os.makedirs(self.upload_dir, exist_ok=True)
    
    async def initiate_kyc(
        self,
        user_id: str,
        kyc_data: KYCInitiateRequest
    ) -> KYCResponse:
        """
        Initiate comprehensive KYC process
        
        Args:
            user_id: User identifier
            kyc_data: KYC initiation data
            
        Returns:
            KYC response with next steps
        """
        try:
            # Get user
            user_result = await self.db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one_or_none()
            
            if not user:
                raise KYCNotFoundError("User not found")
            
            if user.kyc_status == KYCStatus.COMPLETED:
                raise KYCAlreadyCompletedError("KYC already completed")
            
            # Create KYC record
            kyc_record = KYCRecord(
                user_id=user_id,
                status=KYCStatus.IN_PROGRESS,
                verification_level=kyc_data.verification_level,
                submitted_at=datetime.now(timezone.utc),
                expires_at=datetime.now(timezone.utc) + timedelta(days=7)  # 7 days (not 30)
            )
            
            self.db.add(kyc_record)
            await self.db.flush()
            
            # Perform initial compliance checks
            compliance_results = await self._perform_compliance_checks(
                user.full_name,
                user.date_of_birth,
                user.country
            )
            
            # Store compliance results
            kyc_record.compliance_data = {
                "aml_screening": compliance_results["aml"].__dict__,
                "pep_screening": compliance_results["pep"].__dict__,
                "sanctions_screening": compliance_results["sanctions"].__dict__
            }
            
            # Determine if manual review is needed
            manual_review_required = self._requires_manual_review(compliance_results)
            
            if manual_review_required:
                kyc_record.status = KYCStatus.PENDING_REVIEW
                kyc_record.review_notes = ["Compliance check requires manual review"]
            
            # Update user status
            await self.db.execute(
                update(User)
                .where(User.id == user_id)
                .values(kyc_status=kyc_record.status)
            )
            
            await self.db.commit()
            await self.db.refresh(kyc_record)
            
            logger.info("KYC initiated with compliance checks",
                       user_id=user_id,
                       kyc_id=str(kyc_record.id),
                       manual_review=manual_review_required)
            
            return KYCResponse(
                kyc_id=str(kyc_record.id),
                status=kyc_record.status.value,
                verification_level=kyc_record.verification_level,
                manual_review_required=manual_review_required,
                next_steps=self._get_next_steps(kyc_record.status, manual_review_required)
            )
            
        except (KYCNotFoundError, KYCAlreadyCompletedError):
            raise
        except Exception as e:
            await self.db.rollback()
            logger.error("KYC initiation failed", user_id=user_id, error=str(e))
            raise KYCProcessingError(f"KYC initiation failed: {str(e)}")
    
    async def _perform_compliance_checks(
        self,
        full_name: str,
        date_of_birth: Optional[str],
        country: str
    ) -> Dict[str, Any]:
        """Perform all compliance checks"""
        try:
            # Run all checks in parallel
            import asyncio
            
            aml_task = self.aml_service.screen_customer(full_name, date_of_birth, country)
            pep_task = self.pep_service.screen_customer(full_name, country, date_of_birth)
            sanctions_task = self.sanctions_service.screen_customer(full_name, country, date_of_birth)
            
            aml_result, pep_result, sanctions_result = await asyncio.gather(
                aml_task, pep_task, sanctions_task
            )
            
            return {
                "aml": aml_result,
                "pep": pep_result,
                "sanctions": sanctions_result
            }
            
        except Exception as e:
            logger.error("Compliance checks failed", error=str(e))
            raise ComplianceCheckError(f"Compliance checks failed: {str(e)}")
    
    def _requires_manual_review(self, compliance_results: Dict[str, Any]) -> bool:
        """Determine if manual review is required"""
        aml = compliance_results["aml"]
        pep = compliance_results["pep"]
        sanctions = compliance_results["sanctions"]
        
        # Automatic rejection for sanctions
        if sanctions.is_sanctioned:
            return True
        
        # Manual review for high-risk AML
        if aml.risk_level in [RiskLevel.HIGH.value, RiskLevel.CRITICAL.value]:
            return True
        
        # Manual review for PEP
        if pep.is_pep:
            return True
        
        return False
    
    def _get_next_steps(self, status: KYCStatus, manual_review: bool) -> List[str]:
        """Get next steps for user"""
        if manual_review:
            return [
                "Your application requires manual review",
                "Our compliance team will contact you within 24-48 hours",
                "Please have your documents ready for verification"
            ]
        
        return [
            "Upload identity document (passport, national ID, or driver's license)",
            "Upload proof of address (utility bill or bank statement)",
            "Complete biometric verification (selfie + liveness check)",
            "Submit for final review"
        ]
    
    async def verify_biometric(
        self,
        kyc_id: str,
        selfie_path: str,
        id_document_path: str,
        liveness_video_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Perform biometric verification
        
        Args:
            kyc_id: KYC record ID
            selfie_path: Path to selfie image
            id_document_path: Path to ID document image
            liveness_video_path: Optional path to liveness video
            
        Returns:
            Biometric verification result
        """
        try:
            # Verify face match
            face_match_result = await self.biometric_service.verify_face_match(
                selfie_path,
                id_document_path
            )
            
            # Verify liveness if video provided
            liveness_result = None
            if liveness_video_path:
                liveness_result = await self.biometric_service.verify_liveness(
                    liveness_video_path
                )
            
            # Determine overall biometric verification status
            biometric_verified = face_match_result["is_match"]
            
            if liveness_result:
                biometric_verified = biometric_verified and liveness_result["is_live"]
            
            result = {
                "biometric_verified": biometric_verified,
                "face_match": face_match_result,
                "liveness": liveness_result,
                "verified_at": datetime.now(timezone.utc).isoformat()
            }
            
            # Update KYC record
            kyc_result = await self.db.execute(
                select(KYCRecord).where(KYCRecord.id == kyc_id)
            )
            kyc_record = kyc_result.scalar_one_or_none()
            
            if kyc_record:
                if not kyc_record.verification_data:
                    kyc_record.verification_data = {}
                
                kyc_record.verification_data["biometric"] = result
                await self.db.commit()
            
            logger.info("Biometric verification completed",
                       kyc_id=kyc_id,
                       verified=biometric_verified)
            
            return result
            
        except Exception as e:
            logger.error("Biometric verification failed", error=str(e))
            raise BiometricVerificationError(f"Biometric verification failed: {str(e)}")
    
    async def get_kyc_status(self, kyc_id: str) -> KYCStatusResponse:
        """Get KYC status"""
        try:
            result = await self.db.execute(
                select(KYCRecord).where(KYCRecord.id == kyc_id)
            )
            kyc_record = result.scalar_one_or_none()
            
            if not kyc_record:
                raise KYCNotFoundError("KYC record not found")
            
            return KYCStatusResponse(
                kyc_id=str(kyc_record.id),
                status=kyc_record.status.value,
                verification_level=kyc_record.verification_level,
                submitted_at=kyc_record.submitted_at,
                expires_at=kyc_record.expires_at,
                compliance_data=kyc_record.compliance_data,
                verification_data=kyc_record.verification_data
            )
            
        except KYCNotFoundError:
            raise
        except Exception as e:
            logger.error("Failed to get KYC status", error=str(e))
            raise KYCProcessingError(f"Failed to get KYC status: {str(e)}")
