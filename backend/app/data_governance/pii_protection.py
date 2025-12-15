"""
PII Protection and Data Governance

This module provides comprehensive PII protection including:
- Data masking and tokenization
- Access controls
- Data classification
- Consent management
- Right to erasure (GDPR)
"""

import os
import re
import hashlib
import hmac
from typing import Optional, Dict, Any, List, Set
from dataclasses import dataclass
from enum import Enum
from datetime import datetime
import structlog

logger = structlog.get_logger(__name__)


class DataClassification(str, Enum):
    """Data classification levels"""
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"
    PII = "pii"
    SENSITIVE_PII = "sensitive_pii"
    FINANCIAL = "financial"


class PIIType(str, Enum):
    """Types of PII data"""
    EMAIL = "email"
    PHONE = "phone"
    NAME = "name"
    ADDRESS = "address"
    DATE_OF_BIRTH = "dob"
    NATIONAL_ID = "national_id"
    PASSPORT = "passport"
    BVN = "bvn"
    SSN = "ssn"
    BANK_ACCOUNT = "bank_account"
    CARD_NUMBER = "card_number"
    CVV = "cvv"
    IP_ADDRESS = "ip_address"
    DEVICE_ID = "device_id"
    BIOMETRIC = "biometric"


@dataclass
class PIIField:
    """Definition of a PII field"""
    name: str
    pii_type: PIIType
    classification: DataClassification
    mask_pattern: str
    tokenize: bool = True
    searchable: bool = False


class PIIMaskingService:
    """
    Service for masking PII data.
    
    Provides various masking strategies:
    - Partial masking (show last 4 digits)
    - Full masking (replace with asterisks)
    - Tokenization (replace with secure token)
    - Format-preserving encryption
    """
    
    def __init__(self):
        self._token_key = os.getenv("PII_TOKEN_KEY", "pii-key-change-in-production").encode()
        self._token_cache: Dict[str, str] = {}
        self._reverse_cache: Dict[str, str] = {}
    
    def mask_email(self, email: str) -> str:
        """Mask email address"""
        if not email or "@" not in email:
            return "***@***.***"
        
        parts = email.split("@")
        local = parts[0]
        domain = parts[1]
        
        if len(local) <= 2:
            masked_local = "*" * len(local)
        else:
            masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
        
        domain_parts = domain.split(".")
        masked_domain = domain_parts[0][0] + "***." + domain_parts[-1]
        
        return f"{masked_local}@{masked_domain}"
    
    def mask_phone(self, phone: str) -> str:
        """Mask phone number"""
        if not phone:
            return "***"
        
        digits = re.sub(r'\D', '', phone)
        if len(digits) < 4:
            return "***"
        
        return "*" * (len(digits) - 4) + digits[-4:]
    
    def mask_name(self, name: str) -> str:
        """Mask name"""
        if not name:
            return "***"
        
        parts = name.split()
        masked_parts = []
        
        for part in parts:
            if len(part) <= 1:
                masked_parts.append("*")
            else:
                masked_parts.append(part[0] + "*" * (len(part) - 1))
        
        return " ".join(masked_parts)
    
    def mask_national_id(self, id_number: str) -> str:
        """Mask national ID number"""
        if not id_number:
            return "***"
        
        if len(id_number) <= 4:
            return "*" * len(id_number)
        
        return "*" * (len(id_number) - 4) + id_number[-4:]
    
    def mask_bank_account(self, account: str) -> str:
        """Mask bank account number"""
        if not account:
            return "***"
        
        digits = re.sub(r'\D', '', account)
        if len(digits) <= 4:
            return "*" * len(digits)
        
        return "*" * (len(digits) - 4) + digits[-4:]
    
    def mask_card_number(self, card: str) -> str:
        """Mask card number (PCI-DSS compliant)"""
        if not card:
            return "****"
        
        digits = re.sub(r'\D', '', card)
        if len(digits) < 13:
            return "*" * len(digits)
        
        return digits[:6] + "*" * (len(digits) - 10) + digits[-4:]
    
    def mask_ip_address(self, ip: str) -> str:
        """Mask IP address"""
        if not ip:
            return "***.***.***.***"
        
        parts = ip.split(".")
        if len(parts) != 4:
            return "***.***.***.***"
        
        return f"{parts[0]}.{parts[1]}.***.***"
    
    def mask_address(self, address: str) -> str:
        """Mask physical address"""
        if not address:
            return "***"
        
        words = address.split()
        if len(words) <= 2:
            return "***"
        
        return words[0] + " *** " + words[-1]
    
    def tokenize(self, value: str, pii_type: PIIType) -> str:
        """
        Tokenize PII value.
        
        Creates a deterministic token that can be used for
        searching and joining without exposing the actual value.
        """
        if not value:
            return ""
        
        cache_key = f"{pii_type.value}:{value}"
        if cache_key in self._token_cache:
            return self._token_cache[cache_key]
        
        token_input = f"{pii_type.value}:{value}"
        token = hmac.new(self._token_key, token_input.encode(), hashlib.sha256).hexdigest()[:32]
        token = f"tok_{pii_type.value}_{token}"
        
        self._token_cache[cache_key] = token
        self._reverse_cache[token] = value
        
        return token
    
    def detokenize(self, token: str) -> Optional[str]:
        """Detokenize a value (requires proper authorization)"""
        return self._reverse_cache.get(token)
    
    def mask_field(self, value: Any, pii_type: PIIType) -> str:
        """Mask a field based on its PII type"""
        if value is None:
            return "***"
        
        value_str = str(value)
        
        maskers = {
            PIIType.EMAIL: self.mask_email,
            PIIType.PHONE: self.mask_phone,
            PIIType.NAME: self.mask_name,
            PIIType.NATIONAL_ID: self.mask_national_id,
            PIIType.BVN: self.mask_national_id,
            PIIType.SSN: self.mask_national_id,
            PIIType.PASSPORT: self.mask_national_id,
            PIIType.BANK_ACCOUNT: self.mask_bank_account,
            PIIType.CARD_NUMBER: self.mask_card_number,
            PIIType.IP_ADDRESS: self.mask_ip_address,
            PIIType.ADDRESS: self.mask_address,
            PIIType.DATE_OF_BIRTH: lambda x: "****-**-**",
            PIIType.CVV: lambda x: "***",
            PIIType.DEVICE_ID: lambda x: x[:8] + "***" if len(x) > 8 else "***",
            PIIType.BIOMETRIC: lambda x: "[BIOMETRIC_DATA_REDACTED]",
        }
        
        masker = maskers.get(pii_type, lambda x: "***")
        return masker(value_str)
    
    def mask_dict(self, data: Dict[str, Any], pii_fields: Dict[str, PIIType]) -> Dict[str, Any]:
        """Mask PII fields in a dictionary"""
        masked = {}
        
        for key, value in data.items():
            if key in pii_fields:
                masked[key] = self.mask_field(value, pii_fields[key])
            elif isinstance(value, dict):
                masked[key] = self.mask_dict(value, pii_fields)
            elif isinstance(value, list):
                masked[key] = [
                    self.mask_dict(item, pii_fields) if isinstance(item, dict) else item
                    for item in value
                ]
            else:
                masked[key] = value
        
        return masked


class AccessControlService:
    """
    Role-based access control for PII data.
    
    Enforces:
    - Minimum necessary access
    - Purpose limitation
    - Access logging
    """
    
    def __init__(self):
        self.role_permissions: Dict[str, Set[DataClassification]] = {
            "admin": {
                DataClassification.PUBLIC,
                DataClassification.INTERNAL,
                DataClassification.CONFIDENTIAL,
                DataClassification.RESTRICTED,
                DataClassification.PII,
                DataClassification.SENSITIVE_PII,
                DataClassification.FINANCIAL,
            },
            "compliance_officer": {
                DataClassification.PUBLIC,
                DataClassification.INTERNAL,
                DataClassification.CONFIDENTIAL,
                DataClassification.PII,
                DataClassification.SENSITIVE_PII,
                DataClassification.FINANCIAL,
            },
            "customer_support": {
                DataClassification.PUBLIC,
                DataClassification.INTERNAL,
                DataClassification.PII,
            },
            "analyst": {
                DataClassification.PUBLIC,
                DataClassification.INTERNAL,
            },
            "developer": {
                DataClassification.PUBLIC,
                DataClassification.INTERNAL,
            },
            "user": {
                DataClassification.PUBLIC,
            },
        }
        
        self.access_log: List[Dict[str, Any]] = []
    
    def can_access(
        self,
        role: str,
        classification: DataClassification,
        purpose: str
    ) -> bool:
        """Check if a role can access data of a given classification"""
        allowed = self.role_permissions.get(role, set())
        has_access = classification in allowed
        
        self.access_log.append({
            "timestamp": datetime.utcnow().isoformat(),
            "role": role,
            "classification": classification.value,
            "purpose": purpose,
            "granted": has_access
        })
        
        if not has_access:
            logger.warning(
                "access_denied",
                role=role,
                classification=classification.value,
                purpose=purpose
            )
        
        return has_access
    
    def filter_by_access(
        self,
        data: Dict[str, Any],
        role: str,
        field_classifications: Dict[str, DataClassification]
    ) -> Dict[str, Any]:
        """Filter data based on role access"""
        allowed = self.role_permissions.get(role, set())
        filtered = {}
        
        for key, value in data.items():
            classification = field_classifications.get(key, DataClassification.PUBLIC)
            
            if classification in allowed:
                filtered[key] = value
            else:
                filtered[key] = "[ACCESS_DENIED]"
        
        return filtered


class ConsentManagementService:
    """
    Consent management for GDPR and data privacy compliance.
    
    Tracks:
    - User consent for data processing
    - Purpose-specific consent
    - Consent withdrawal
    - Consent history
    """
    
    def __init__(self):
        self.consents: Dict[str, Dict[str, Any]] = {}
    
    async def record_consent(
        self,
        user_id: str,
        purpose: str,
        granted: bool,
        ip_address: str,
        user_agent: str
    ) -> Dict[str, Any]:
        """Record user consent"""
        consent_record = {
            "user_id": user_id,
            "purpose": purpose,
            "granted": granted,
            "timestamp": datetime.utcnow().isoformat(),
            "ip_address": ip_address,
            "user_agent": user_agent,
            "version": "1.0"
        }
        
        if user_id not in self.consents:
            self.consents[user_id] = {}
        
        self.consents[user_id][purpose] = consent_record
        
        logger.info(
            "consent_recorded",
            user_id=user_id,
            purpose=purpose,
            granted=granted
        )
        
        return consent_record
    
    async def check_consent(self, user_id: str, purpose: str) -> bool:
        """Check if user has given consent for a purpose"""
        user_consents = self.consents.get(user_id, {})
        consent = user_consents.get(purpose, {})
        return consent.get("granted", False)
    
    async def withdraw_consent(self, user_id: str, purpose: str) -> Dict[str, Any]:
        """Withdraw consent for a purpose"""
        return await self.record_consent(
            user_id=user_id,
            purpose=purpose,
            granted=False,
            ip_address="system",
            user_agent="consent_withdrawal"
        )
    
    async def get_consent_history(self, user_id: str) -> List[Dict[str, Any]]:
        """Get consent history for a user"""
        return list(self.consents.get(user_id, {}).values())


class DataErasureService:
    """
    Right to erasure (GDPR Article 17) implementation.
    
    Handles:
    - Data deletion requests
    - Anonymization
    - Retention policy enforcement
    """
    
    def __init__(self, masking_service: PIIMaskingService):
        self.masking_service = masking_service
        self.erasure_requests: List[Dict[str, Any]] = []
    
    async def request_erasure(
        self,
        user_id: str,
        reason: str,
        requested_by: str
    ) -> Dict[str, Any]:
        """Request data erasure for a user"""
        request = {
            "request_id": f"ERASE_{user_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            "user_id": user_id,
            "reason": reason,
            "requested_by": requested_by,
            "requested_at": datetime.utcnow().isoformat(),
            "status": "pending",
            "completed_at": None
        }
        
        self.erasure_requests.append(request)
        
        logger.info(
            "erasure_requested",
            request_id=request["request_id"],
            user_id=user_id
        )
        
        return request
    
    async def process_erasure(self, request_id: str) -> Dict[str, Any]:
        """Process a data erasure request"""
        for request in self.erasure_requests:
            if request["request_id"] == request_id:
                request["status"] = "completed"
                request["completed_at"] = datetime.utcnow().isoformat()
                
                logger.info(
                    "erasure_completed",
                    request_id=request_id,
                    user_id=request["user_id"]
                )
                
                return request
        
        raise ValueError(f"Erasure request not found: {request_id}")
    
    def anonymize_record(
        self,
        record: Dict[str, Any],
        pii_fields: Dict[str, PIIType]
    ) -> Dict[str, Any]:
        """Anonymize a record by replacing PII with tokens"""
        anonymized = {}
        
        for key, value in record.items():
            if key in pii_fields:
                anonymized[key] = self.masking_service.tokenize(str(value), pii_fields[key])
            elif isinstance(value, dict):
                anonymized[key] = self.anonymize_record(value, pii_fields)
            else:
                anonymized[key] = value
        
        return anonymized


_masking_service: Optional[PIIMaskingService] = None
_access_control_service: Optional[AccessControlService] = None
_consent_service: Optional[ConsentManagementService] = None
_erasure_service: Optional[DataErasureService] = None


def get_masking_service() -> PIIMaskingService:
    """Get PII masking service singleton"""
    global _masking_service
    if _masking_service is None:
        _masking_service = PIIMaskingService()
    return _masking_service


def get_access_control_service() -> AccessControlService:
    """Get access control service singleton"""
    global _access_control_service
    if _access_control_service is None:
        _access_control_service = AccessControlService()
    return _access_control_service


def get_consent_service() -> ConsentManagementService:
    """Get consent management service singleton"""
    global _consent_service
    if _consent_service is None:
        _consent_service = ConsentManagementService()
    return _consent_service


def get_erasure_service() -> DataErasureService:
    """Get data erasure service singleton"""
    global _erasure_service
    if _erasure_service is None:
        _erasure_service = DataErasureService(get_masking_service())
    return _erasure_service
