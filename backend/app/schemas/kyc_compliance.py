"""
KYC Compliance Schemas
Data models for AML, PEP, Sanctions, and Biometric verification
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class RiskLevel(str, Enum):
    """Risk assessment levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ComplianceStatus(str, Enum):
    """Compliance check status"""
    PASS = "pass"
    FAIL = "fail"
    REVIEW_REQUIRED = "review_required"
    PENDING = "pending"


class AMLScreeningResult(BaseModel):
    """AML screening result"""
    status: str = Field(..., description="Compliance status")
    risk_level: str = Field(..., description="Risk level assessment")
    match_count: int = Field(..., description="Number of matches found")
    matches: List[Dict[str, Any]] = Field(default_factory=list, description="Match details")
    screened_at: datetime = Field(..., description="Screening timestamp")
    provider: str = Field(..., description="Screening provider name")
    reference_id: Optional[str] = Field(None, description="Provider reference ID")
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "pass",
                "risk_level": "low",
                "match_count": 0,
                "matches": [],
                "screened_at": "2025-10-31T12:00:00Z",
                "provider": "ComplyAdvantage",
                "reference_id": "aml_12345"
            }
        }


class PEPScreeningResult(BaseModel):
    """PEP screening result"""
    status: str = Field(..., description="Compliance status")
    is_pep: bool = Field(..., description="Whether customer is a PEP")
    pep_level: str = Field(..., description="PEP level: none, low, medium, high")
    positions: List[Dict[str, Any]] = Field(default_factory=list, description="Political positions held")
    screened_at: datetime = Field(..., description="Screening timestamp")
    provider: str = Field(..., description="Screening provider name")
    reference_id: Optional[str] = Field(None, description="Provider reference ID")
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "pass",
                "is_pep": False,
                "pep_level": "none",
                "positions": [],
                "screened_at": "2025-10-31T12:00:00Z",
                "provider": "PEPData",
                "reference_id": "pep_12345"
            }
        }


class SanctionsScreeningResult(BaseModel):
    """Sanctions screening result"""
    status: str = Field(..., description="Compliance status")
    is_sanctioned: bool = Field(..., description="Whether customer is sanctioned")
    sanctioned_lists: List[str] = Field(default_factory=list, description="Sanctions lists matched")
    matches: List[Dict[str, Any]] = Field(default_factory=list, description="Match details")
    screened_at: datetime = Field(..., description="Screening timestamp")
    provider: str = Field(..., description="Screening provider name")
    reference_id: Optional[str] = Field(None, description="Provider reference ID")
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "pass",
                "is_sanctioned": False,
                "sanctioned_lists": [],
                "matches": [],
                "screened_at": "2025-10-31T12:00:00Z",
                "provider": "SanctionsExplorer",
                "reference_id": "sanc_12345"
            }
        }


class BiometricVerificationRequest(BaseModel):
    """Biometric verification request"""
    kyc_id: str = Field(..., description="KYC record ID")
    selfie_image: str = Field(..., description="Base64 encoded selfie image")
    id_document_image: str = Field(..., description="Base64 encoded ID document image")
    liveness_video: Optional[str] = Field(None, description="Base64 encoded liveness video")
    
    class Config:
        json_schema_extra = {
            "example": {
                "kyc_id": "kyc_12345",
                "selfie_image": "base64_encoded_image_data",
                "id_document_image": "base64_encoded_image_data",
                "liveness_video": "base64_encoded_video_data"
            }
        }


class BiometricVerificationResult(BaseModel):
    """Biometric verification result"""
    biometric_verified: bool = Field(..., description="Overall verification status")
    face_match: Dict[str, Any] = Field(..., description="Face match results")
    liveness: Optional[Dict[str, Any]] = Field(None, description="Liveness check results")
    verified_at: str = Field(..., description="Verification timestamp")
    
    class Config:
        json_schema_extra = {
            "example": {
                "biometric_verified": True,
                "face_match": {
                    "is_match": True,
                    "similarity_score": 0.92,
                    "confidence": 0.95
                },
                "liveness": {
                    "is_live": True,
                    "confidence": 0.98
                },
                "verified_at": "2025-10-31T12:00:00Z"
            }
        }


class ComplianceCheckRequest(BaseModel):
    """Request for compliance checks"""
    full_name: str = Field(..., description="Customer's full name")
    date_of_birth: Optional[str] = Field(None, description="Date of birth (YYYY-MM-DD)")
    country: str = Field(..., description="Country code (ISO 3166-1 alpha-2)")
    additional_info: Optional[Dict[str, Any]] = Field(None, description="Additional customer information")
    
    class Config:
        json_schema_extra = {
            "example": {
                "full_name": "John Doe",
                "date_of_birth": "1990-01-01",
                "country": "US",
                "additional_info": {
                    "address": "123 Main St, New York, NY 10001"
                }
            }
        }


class ComplianceCheckResponse(BaseModel):
    """Response from compliance checks"""
    aml_screening: AMLScreeningResult = Field(..., description="AML screening result")
    pep_screening: PEPScreeningResult = Field(..., description="PEP screening result")
    sanctions_screening: SanctionsScreeningResult = Field(..., description="Sanctions screening result")
    overall_status: str = Field(..., description="Overall compliance status")
    manual_review_required: bool = Field(..., description="Whether manual review is required")
    risk_score: float = Field(..., description="Overall risk score (0-1)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "aml_screening": {
                    "status": "pass",
                    "risk_level": "low",
                    "match_count": 0
                },
                "pep_screening": {
                    "status": "pass",
                    "is_pep": False,
                    "pep_level": "none"
                },
                "sanctions_screening": {
                    "status": "pass",
                    "is_sanctioned": False,
                    "sanctioned_lists": []
                },
                "overall_status": "pass",
                "manual_review_required": False,
                "risk_score": 0.15
            }
        }


class KYCEnhancedResponse(BaseModel):
    """Enhanced KYC response with compliance data"""
    kyc_id: str = Field(..., description="KYC record ID")
    status: str = Field(..., description="KYC status")
    verification_level: str = Field(..., description="Verification level")
    compliance_checks: Optional[ComplianceCheckResponse] = Field(None, description="Compliance check results")
    biometric_verification: Optional[BiometricVerificationResult] = Field(None, description="Biometric verification results")
    manual_review_required: bool = Field(..., description="Whether manual review is required")
    next_steps: List[str] = Field(..., description="Next steps for user")
    submitted_at: datetime = Field(..., description="Submission timestamp")
    expires_at: datetime = Field(..., description="Expiration timestamp")
    
    class Config:
        json_schema_extra = {
            "example": {
                "kyc_id": "kyc_12345",
                "status": "in_progress",
                "verification_level": "enhanced",
                "compliance_checks": {
                    "overall_status": "pass",
                    "manual_review_required": False,
                    "risk_score": 0.15
                },
                "biometric_verification": {
                    "biometric_verified": True,
                    "face_match": {"is_match": True, "similarity_score": 0.92}
                },
                "manual_review_required": False,
                "next_steps": [
                    "Upload identity document",
                    "Complete biometric verification"
                ],
                "submitted_at": "2025-10-31T12:00:00Z",
                "expires_at": "2025-11-07T12:00:00Z"
            }
        }


class KYCComplianceMetrics(BaseModel):
    """KYC compliance metrics for monitoring"""
    total_kyc_checks: int = Field(..., description="Total KYC checks performed")
    aml_pass_rate: float = Field(..., description="AML pass rate (0-1)")
    pep_detection_rate: float = Field(..., description="PEP detection rate (0-1)")
    sanctions_hit_rate: float = Field(..., description="Sanctions hit rate (0-1)")
    biometric_pass_rate: float = Field(..., description="Biometric verification pass rate (0-1)")
    manual_review_rate: float = Field(..., description="Manual review rate (0-1)")
    average_processing_time: float = Field(..., description="Average processing time in seconds")
    compliance_score: float = Field(..., description="Overall compliance score (0-100)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "total_kyc_checks": 1000,
                "aml_pass_rate": 0.95,
                "pep_detection_rate": 0.02,
                "sanctions_hit_rate": 0.001,
                "biometric_pass_rate": 0.92,
                "manual_review_rate": 0.08,
                "average_processing_time": 45.5,
                "compliance_score": 95.0
            }
        }
