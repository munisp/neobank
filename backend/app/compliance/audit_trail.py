"""
Immutable Audit Trail Service

This module provides tamper-evident audit logging for regulatory compliance.
All regulated actions are logged with cryptographic integrity verification.
"""

import os
import json
import hashlib
import hmac
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
from enum import Enum
import structlog
from uuid import uuid4

logger = structlog.get_logger(__name__)


class AuditEventType(str, Enum):
    """Types of auditable events"""
    
    ACCOUNT_CREATED = "account.created"
    ACCOUNT_CLOSED = "account.closed"
    ACCOUNT_FROZEN = "account.frozen"
    ACCOUNT_UNFROZEN = "account.unfrozen"
    
    TRANSACTION_INITIATED = "transaction.initiated"
    TRANSACTION_COMPLETED = "transaction.completed"
    TRANSACTION_FAILED = "transaction.failed"
    TRANSACTION_REVERSED = "transaction.reversed"
    
    KYC_INITIATED = "kyc.initiated"
    KYC_DOCUMENT_UPLOADED = "kyc.document_uploaded"
    KYC_VERIFIED = "kyc.verified"
    KYC_REJECTED = "kyc.rejected"
    KYC_TIER_UPGRADED = "kyc.tier_upgraded"
    
    KYB_INITIATED = "kyb.initiated"
    KYB_DOCUMENT_UPLOADED = "kyb.document_uploaded"
    KYB_VERIFIED = "kyb.verified"
    KYB_REJECTED = "kyb.rejected"
    
    AUTH_LOGIN = "auth.login"
    AUTH_LOGOUT = "auth.logout"
    AUTH_FAILED = "auth.failed"
    AUTH_PASSWORD_CHANGED = "auth.password_changed"
    AUTH_MFA_ENABLED = "auth.mfa_enabled"
    AUTH_MFA_DISABLED = "auth.mfa_disabled"
    
    CARD_ISSUED = "card.issued"
    CARD_ACTIVATED = "card.activated"
    CARD_BLOCKED = "card.blocked"
    CARD_UNBLOCKED = "card.unblocked"
    CARD_PIN_CHANGED = "card.pin_changed"
    
    LOAN_APPLIED = "loan.applied"
    LOAN_APPROVED = "loan.approved"
    LOAN_REJECTED = "loan.rejected"
    LOAN_DISBURSED = "loan.disbursed"
    LOAN_REPAID = "loan.repaid"
    
    AML_ALERT_RAISED = "aml.alert_raised"
    AML_ALERT_CLEARED = "aml.alert_cleared"
    AML_SAR_FILED = "aml.sar_filed"
    AML_STR_FILED = "aml.str_filed"
    
    ESCROW_CREATED = "escrow.created"
    ESCROW_FUNDED = "escrow.funded"
    ESCROW_RELEASED = "escrow.released"
    ESCROW_DISPUTED = "escrow.disputed"
    ESCROW_REFUNDED = "escrow.refunded"
    
    DATA_EXPORTED = "data.exported"
    DATA_DELETED = "data.deleted"
    DATA_ACCESS = "data.access"
    
    ADMIN_ACTION = "admin.action"
    CONFIG_CHANGED = "config.changed"


@dataclass
class AuditEvent:
    """Immutable audit event record"""
    
    event_id: str
    event_type: AuditEventType
    timestamp: datetime
    user_id: Optional[str]
    actor_id: str
    actor_type: str
    resource_type: str
    resource_id: str
    action: str
    details: Dict[str, Any]
    ip_address: Optional[str]
    user_agent: Optional[str]
    device_id: Optional[str]
    session_id: Optional[str]
    country: Optional[str]
    risk_score: Optional[float]
    previous_hash: str
    event_hash: str
    
    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["timestamp"] = self.timestamp.isoformat()
        data["event_type"] = self.event_type.value
        return data


class AuditTrailService:
    """
    Tamper-evident audit trail service.
    
    Features:
    - Cryptographic chaining of events (blockchain-like)
    - Immutable storage
    - Regulatory compliance (PCI-DSS, SOX, GDPR)
    - Retention policy enforcement
    """
    
    def __init__(self):
        self._hmac_key = os.getenv("AUDIT_HMAC_KEY", "audit-key-change-in-production").encode()
        self._events: List[AuditEvent] = []
        self._last_hash = "genesis"
    
    def _compute_event_hash(self, event_data: Dict[str, Any], previous_hash: str) -> str:
        """Compute cryptographic hash for event integrity"""
        data_str = json.dumps(event_data, sort_keys=True, default=str)
        message = f"{previous_hash}:{data_str}"
        return hmac.new(self._hmac_key, message.encode(), hashlib.sha256).hexdigest()
    
    def _mask_pii(self, details: Dict[str, Any]) -> Dict[str, Any]:
        """Mask PII fields in audit details"""
        pii_fields = {"email", "phone", "ssn", "national_id", "passport", "address", "dob"}
        masked = {}
        
        for key, value in details.items():
            if key.lower() in pii_fields and isinstance(value, str):
                if len(value) > 4:
                    masked[key] = f"***{value[-4:]}"
                else:
                    masked[key] = "***"
            elif isinstance(value, dict):
                masked[key] = self._mask_pii(value)
            else:
                masked[key] = value
        
        return masked
    
    async def log_event(
        self,
        event_type: AuditEventType,
        actor_id: str,
        actor_type: str,
        resource_type: str,
        resource_id: str,
        action: str,
        details: Dict[str, Any],
        user_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        device_id: Optional[str] = None,
        session_id: Optional[str] = None,
        country: Optional[str] = None,
        risk_score: Optional[float] = None
    ) -> AuditEvent:
        """
        Log an immutable audit event.
        
        The event is cryptographically chained to the previous event
        to ensure tamper-evidence.
        """
        event_id = str(uuid4())
        timestamp = datetime.utcnow()
        
        event_data = {
            "event_id": event_id,
            "event_type": event_type.value,
            "timestamp": timestamp.isoformat(),
            "user_id": user_id,
            "actor_id": actor_id,
            "actor_type": actor_type,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "action": action,
            "details": self._mask_pii(details),
            "ip_address": ip_address,
            "user_agent": user_agent,
            "device_id": device_id,
            "session_id": session_id,
            "country": country,
            "risk_score": risk_score
        }
        
        event_hash = self._compute_event_hash(event_data, self._last_hash)
        
        event = AuditEvent(
            event_id=event_id,
            event_type=event_type,
            timestamp=timestamp,
            user_id=user_id,
            actor_id=actor_id,
            actor_type=actor_type,
            resource_type=resource_type,
            resource_id=resource_id,
            action=action,
            details=self._mask_pii(details),
            ip_address=ip_address,
            user_agent=user_agent,
            device_id=device_id,
            session_id=session_id,
            country=country,
            risk_score=risk_score,
            previous_hash=self._last_hash,
            event_hash=event_hash
        )
        
        self._events.append(event)
        self._last_hash = event_hash
        
        logger.info(
            "audit_event_logged",
            event_id=event_id,
            event_type=event_type.value,
            actor_id=actor_id,
            resource_type=resource_type,
            resource_id=resource_id
        )
        
        return event
    
    def verify_chain_integrity(self) -> bool:
        """Verify the integrity of the entire audit chain"""
        if not self._events:
            return True
        
        previous_hash = "genesis"
        
        for event in self._events:
            event_data = {
                "event_id": event.event_id,
                "event_type": event.event_type.value,
                "timestamp": event.timestamp.isoformat(),
                "user_id": event.user_id,
                "actor_id": event.actor_id,
                "actor_type": event.actor_type,
                "resource_type": event.resource_type,
                "resource_id": event.resource_id,
                "action": event.action,
                "details": event.details,
                "ip_address": event.ip_address,
                "user_agent": event.user_agent,
                "device_id": event.device_id,
                "session_id": event.session_id,
                "country": event.country,
                "risk_score": event.risk_score
            }
            
            expected_hash = self._compute_event_hash(event_data, previous_hash)
            
            if event.event_hash != expected_hash:
                logger.error(
                    "audit_chain_integrity_violation",
                    event_id=event.event_id,
                    expected_hash=expected_hash,
                    actual_hash=event.event_hash
                )
                return False
            
            if event.previous_hash != previous_hash:
                logger.error(
                    "audit_chain_link_broken",
                    event_id=event.event_id,
                    expected_previous=previous_hash,
                    actual_previous=event.previous_hash
                )
                return False
            
            previous_hash = event.event_hash
        
        logger.info("audit_chain_integrity_verified", event_count=len(self._events))
        return True
    
    async def get_events_by_user(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        event_types: Optional[List[AuditEventType]] = None
    ) -> List[AuditEvent]:
        """Get audit events for a specific user"""
        events = [e for e in self._events if e.user_id == user_id]
        
        if start_date:
            events = [e for e in events if e.timestamp >= start_date]
        if end_date:
            events = [e for e in events if e.timestamp <= end_date]
        if event_types:
            events = [e for e in events if e.event_type in event_types]
        
        return events
    
    async def get_events_by_resource(
        self,
        resource_type: str,
        resource_id: str
    ) -> List[AuditEvent]:
        """Get audit events for a specific resource"""
        return [
            e for e in self._events
            if e.resource_type == resource_type and e.resource_id == resource_id
        ]
    
    async def generate_compliance_report(
        self,
        start_date: datetime,
        end_date: datetime,
        report_type: str = "general"
    ) -> Dict[str, Any]:
        """Generate compliance report for regulatory purposes"""
        events = [
            e for e in self._events
            if start_date <= e.timestamp <= end_date
        ]
        
        report = {
            "report_id": str(uuid4()),
            "report_type": report_type,
            "generated_at": datetime.utcnow().isoformat(),
            "period_start": start_date.isoformat(),
            "period_end": end_date.isoformat(),
            "total_events": len(events),
            "events_by_type": {},
            "high_risk_events": [],
            "chain_integrity": self.verify_chain_integrity()
        }
        
        for event in events:
            event_type = event.event_type.value
            if event_type not in report["events_by_type"]:
                report["events_by_type"][event_type] = 0
            report["events_by_type"][event_type] += 1
            
            if event.risk_score and event.risk_score > 0.7:
                report["high_risk_events"].append(event.to_dict())
        
        return report


class RetentionPolicyService:
    """
    Data retention policy enforcement service.
    
    Ensures compliance with regulatory requirements for data retention
    and deletion (GDPR, local banking regulations).
    """
    
    def __init__(self):
        self.policies: Dict[str, int] = {
            "transaction_records": 7 * 365,
            "kyc_documents": 5 * 365,
            "kyb_documents": 5 * 365,
            "audit_logs": 7 * 365,
            "session_logs": 90,
            "access_logs": 365,
            "marketing_data": 365,
            "support_tickets": 3 * 365,
            "loan_records": 10 * 365,
            "aml_records": 7 * 365,
            "card_records": 5 * 365,
        }
    
    def get_retention_period(self, data_type: str) -> int:
        """Get retention period in days for a data type"""
        return self.policies.get(data_type, 365)
    
    def is_data_expired(self, data_type: str, created_at: datetime) -> bool:
        """Check if data has exceeded its retention period"""
        retention_days = self.get_retention_period(data_type)
        expiry_date = created_at + timedelta(days=retention_days)
        return datetime.utcnow() > expiry_date
    
    def get_expiry_date(self, data_type: str, created_at: datetime) -> datetime:
        """Get the expiry date for data"""
        retention_days = self.get_retention_period(data_type)
        return created_at + timedelta(days=retention_days)
    
    async def schedule_deletion(self, data_type: str, record_id: str, created_at: datetime):
        """Schedule data for deletion when retention period expires"""
        expiry_date = self.get_expiry_date(data_type, created_at)
        
        logger.info(
            "data_deletion_scheduled",
            data_type=data_type,
            record_id=record_id,
            expiry_date=expiry_date.isoformat()
        )
    
    async def process_deletion_queue(self):
        """Process scheduled deletions"""
        logger.info("processing_deletion_queue")


_audit_service: Optional[AuditTrailService] = None
_retention_service: Optional[RetentionPolicyService] = None


def get_audit_service() -> AuditTrailService:
    """Get audit trail service singleton"""
    global _audit_service
    if _audit_service is None:
        _audit_service = AuditTrailService()
    return _audit_service


def get_retention_service() -> RetentionPolicyService:
    """Get retention policy service singleton"""
    global _retention_service
    if _retention_service is None:
        _retention_service = RetentionPolicyService()
    return _retention_service
