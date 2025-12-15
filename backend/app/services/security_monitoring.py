"""
Security monitoring service with Wazuh SIEM integration
"""
import json
import socket
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from enum import Enum
import structlog

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from config.settings import settings
from database.models import SecurityEvent, User, Transaction

logger = structlog.get_logger()


class SecurityEventType(str, Enum):
    """Security event types"""
    AUTHENTICATION_FAILURE = "authentication_failure"
    AUTHENTICATION_SUCCESS = "authentication_success"
    ACCOUNT_LOCKOUT = "account_lockout"
    SUSPICIOUS_TRANSACTION = "suspicious_transaction"
    FRAUD_DETECTED = "fraud_detected"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    SECURITY_VIOLATION = "security_violation"
    PRIVILEGE_ESCALATION = "privilege_escalation"
    DATA_BREACH_ATTEMPT = "data_breach_attempt"
    MALICIOUS_REQUEST = "malicious_request"
    UNUSUAL_ACCESS_PATTERN = "unusual_access_pattern"


class SecuritySeverity(str, Enum):
    """Security event severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class WazuhClient:
    """Client for Wazuh SIEM integration"""
    
    def __init__(self):
        import os
        self.wazuh_url = os.environ.get("WAZUH_API_URL", "https://localhost:55000")
        self.username = os.environ.get("WAZUH_USERNAME")
        self.password = os.environ.get("WAZUH_PASSWORD")
        if not self.username or not self.password:
            logger.warning("WAZUH credentials not set, security monitoring will be limited")
        self.agent_id = "001"  # NeoBank agent ID
        self.timeout = 10.0
        self.token = None
        self.token_expires = None
    
    async def authenticate(self) -> bool:
        """Authenticate with Wazuh API"""
        try:
            auth_data = {
                "username": self.username,
                "password": self.password
            }
            
            async with httpx.AsyncClient(verify=False, timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.wazuh_url}/security/user/authenticate",
                    json=auth_data
                )
                
                if response.status_code == 200:
                    result = response.json()
                    self.token = result["data"]["token"]
                    logger.info("Wazuh authentication successful")
                    return True
                else:
                    logger.warning("Wazuh authentication failed", status_code=response.status_code)
                    return False
                    
        except Exception as e:
            logger.error("Wazuh authentication error", error=str(e))
            return False
    
    async def send_event(self, event_data: Dict[str, Any]) -> bool:
        """Send security event to Wazuh"""
        try:
            if not self.token:
                if not await self.authenticate():
                    return False
            
            headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
            
            # Format event for Wazuh
            wazuh_event = {
                "agent_id": self.agent_id,
                "timestamp": event_data.get("timestamp", datetime.now(timezone.utc).isoformat()),
                "rule_id": self._get_rule_id(event_data["event_type"]),
                "level": self._get_wazuh_level(event_data["severity"]),
                "description": event_data["description"],
                "data": {
                    "neobank_event": event_data,
                    "source_ip": event_data.get("source_ip"),
                    "user_id": event_data.get("user_id"),
                    "event_type": event_data["event_type"],
                    "severity": event_data["severity"]
                }
            }
            
            async with httpx.AsyncClient(verify=False, timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.wazuh_url}/events",
                    json=wazuh_event,
                    headers=headers
                )
                
                if response.status_code in [200, 201]:
                    logger.debug("Event sent to Wazuh successfully", event_type=event_data["event_type"])
                    return True
                else:
                    logger.warning("Failed to send event to Wazuh", 
                                 status_code=response.status_code,
                                 event_type=event_data["event_type"])
                    return False
                    
        except Exception as e:
            logger.error("Wazuh event sending failed", error=str(e))
            return False
    
    async def get_alerts(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get recent security alerts from Wazuh"""
        try:
            if not self.token:
                if not await self.authenticate():
                    return []
            
            headers = {
                "Authorization": f"Bearer {self.token}"
            }
            
            params = {
                "limit": limit,
                "sort": "-timestamp",
                "q": f"agent.id={self.agent_id}"
            }
            
            async with httpx.AsyncClient(verify=False, timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.wazuh_url}/alerts",
                    params=params,
                    headers=headers
                )
                
                if response.status_code == 200:
                    result = response.json()
                    return result.get("data", {}).get("affected_items", [])
                else:
                    logger.warning("Failed to get alerts from Wazuh", status_code=response.status_code)
                    return []
                    
        except Exception as e:
            logger.error("Wazuh alerts retrieval failed", error=str(e))
            return []
    
    def _get_rule_id(self, event_type: str) -> int:
        """Get Wazuh rule ID for event type"""
        rule_mapping = {
            "authentication_failure": 5710,
            "authentication_success": 5715,
            "account_lockout": 5720,
            "suspicious_transaction": 100001,
            "fraud_detected": 100002,
            "rate_limit_exceeded": 100003,
            "security_violation": 100004,
            "privilege_escalation": 100005,
            "data_breach_attempt": 100006,
            "malicious_request": 100007,
            "unusual_access_pattern": 100008
        }
        return rule_mapping.get(event_type, 100000)
    
    def _get_wazuh_level(self, severity: str) -> int:
        """Convert severity to Wazuh level"""
        level_mapping = {
            "low": 3,
            "medium": 7,
            "high": 12,
            "critical": 15
        }
        return level_mapping.get(severity, 5)


class SyslogClient:
    """Syslog client for sending security events"""
    
    def __init__(self):
        self.syslog_host = "localhost"
        self.syslog_port = 514
        self.facility = 16  # Local use 0
        self.sock = None
    
    async def send_event(self, event_data: Dict[str, Any]) -> bool:
        """Send event via syslog"""
        try:
            if not self.sock:
                self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            
            # Calculate priority
            severity = self._get_syslog_severity(event_data["severity"])
            priority = self.facility * 8 + severity
            
            # Format syslog message
            timestamp = datetime.now().strftime("%b %d %H:%M:%S")
            hostname = socket.gethostname()
            tag = "neobank"
            
            message = json.dumps(event_data)
            syslog_msg = f"<{priority}>{timestamp} {hostname} {tag}: {message}"
            
            # Send message
            self.sock.sendto(syslog_msg.encode('utf-8'), (self.syslog_host, self.syslog_port))
            return True
            
        except Exception as e:
            logger.error("Syslog sending failed", error=str(e))
            return False
    
    def _get_syslog_severity(self, severity: str) -> int:
        """Convert severity to syslog severity"""
        severity_mapping = {
            "low": 6,      # Info
            "medium": 4,   # Warning
            "high": 3,     # Error
            "critical": 2  # Critical
        }
        return severity_mapping.get(severity, 6)


class SecurityMonitoringService:
    """Comprehensive security monitoring service"""
    
    def __init__(self):
        self.wazuh_client = WazuhClient()
        self.syslog_client = SyslogClient()
        self.event_queue = asyncio.Queue()
        self.processing_task = None
    
    async def start_monitoring(self):
        """Start security monitoring service"""
        if not self.processing_task:
            self.processing_task = asyncio.create_task(self._process_events())
            logger.info("Security monitoring service started")
    
    async def stop_monitoring(self):
        """Stop security monitoring service"""
        if self.processing_task:
            self.processing_task.cancel()
            try:
                await self.processing_task
            except asyncio.CancelledError:
                pass
            self.processing_task = None
            logger.info("Security monitoring service stopped")
    
    async def log_security_event(self, db: AsyncSession, event_type: SecurityEventType, 
                                severity: SecuritySeverity, description: str, 
                                user_id: Optional[str] = None, source_ip: Optional[str] = None,
                                additional_data: Optional[Dict[str, Any]] = None):
        """Log a security event"""
        
        event_data = {
            "event_type": event_type.value,
            "severity": severity.value,
            "description": description,
            "user_id": user_id,
            "source_ip": source_ip,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "additional_data": additional_data or {}
        }
        
        # Store in database
        security_event = SecurityEvent(
            event_type=event_type.value,
            severity=severity.value,
            description=description,
            user_id=user_id,
            source_ip=source_ip,
            event_data=event_data["additional_data"]
        )
        
        db.add(security_event)
        await db.commit()
        
        # Queue for external processing
        await self.event_queue.put(event_data)
        
        logger.info("Security event logged",
                   event_type=event_type.value,
                   severity=severity.value,
                   user_id=user_id,
                   source_ip=source_ip)
    
    async def _process_events(self):
        """Process security events from queue"""
        while True:
            try:
                # Get event from queue with timeout
                event_data = await asyncio.wait_for(self.event_queue.get(), timeout=1.0)
                
                # Send to Wazuh
                await self.wazuh_client.send_event(event_data)
                
                # Send to syslog
                await self.syslog_client.send_event(event_data)
                
                # Mark task as done
                self.event_queue.task_done()
                
            except asyncio.TimeoutError:
                # No events to process, continue
                continue
            except Exception as e:
                logger.error("Event processing failed", error=str(e))
    
    async def get_security_dashboard(self, db: AsyncSession) -> Dict[str, Any]:
        """Get security dashboard data"""
        
        # Get event counts by type (last 24 hours)
        from datetime import timedelta
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        
        event_counts = await db.execute(
            select(SecurityEvent.event_type, func.count(SecurityEvent.id))
            .where(SecurityEvent.created_at >= since)
            .group_by(SecurityEvent.event_type)
        )
        
        event_stats = dict(event_counts.all())
        
        # Get severity distribution
        severity_counts = await db.execute(
            select(SecurityEvent.severity, func.count(SecurityEvent.id))
            .where(SecurityEvent.created_at >= since)
            .group_by(SecurityEvent.severity)
        )
        
        severity_stats = dict(severity_counts.all())
        
        # Get top source IPs
        top_ips = await db.execute(
            select(SecurityEvent.source_ip, func.count(SecurityEvent.id))
            .where(SecurityEvent.created_at >= since)
            .where(SecurityEvent.source_ip.isnot(None))
            .group_by(SecurityEvent.source_ip)
            .order_by(func.count(SecurityEvent.id).desc())
            .limit(10)
        )
        
        top_ips_stats = dict(top_ips.all())
        
        # Get recent critical events
        critical_events = await db.execute(
            select(SecurityEvent)
            .where(SecurityEvent.severity == "critical")
            .where(SecurityEvent.created_at >= since)
            .order_by(SecurityEvent.created_at.desc())
            .limit(10)
        )
        
        critical_events_list = [
            {
                "id": str(event.id),
                "event_type": event.event_type,
                "description": event.description,
                "user_id": event.user_id,
                "source_ip": event.source_ip,
                "created_at": event.created_at.isoformat()
            }
            for event in critical_events.scalars().all()
        ]
        
        return {
            "period": "24_hours",
            "event_counts": event_stats,
            "severity_distribution": severity_stats,
            "top_source_ips": top_ips_stats,
            "critical_events": critical_events_list,
            "total_events": sum(event_stats.values()),
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
    
    async def check_anomalies(self, db: AsyncSession) -> List[Dict[str, Any]]:
        """Check for security anomalies"""
        anomalies = []
        
        # Check for unusual authentication patterns
        auth_anomaly = await self._check_authentication_anomalies(db)
        if auth_anomaly:
            anomalies.append(auth_anomaly)
        
        # Check for transaction anomalies
        transaction_anomaly = await self._check_transaction_anomalies(db)
        if transaction_anomaly:
            anomalies.append(transaction_anomaly)
        
        # Check for access pattern anomalies
        access_anomaly = await self._check_access_anomalies(db)
        if access_anomaly:
            anomalies.append(access_anomaly)
        
        return anomalies
    
    async def _check_authentication_anomalies(self, db: AsyncSession) -> Optional[Dict[str, Any]]:
        """Check for authentication anomalies"""
        from datetime import timedelta
        
        # Check for high failure rates
        since = datetime.now(timezone.utc) - timedelta(hours=1)
        
        failure_count = await db.execute(
            select(func.count(SecurityEvent.id))
            .where(SecurityEvent.event_type == "authentication_failure")
            .where(SecurityEvent.created_at >= since)
        )
        
        failures = failure_count.scalar() or 0
        
        if failures > 100:  # More than 100 failures per hour
            return {
                "type": "authentication_anomaly",
                "severity": "high",
                "description": f"High authentication failure rate: {failures} failures in the last hour",
                "count": failures,
                "threshold": 100
            }
        
        return None
    
    async def _check_transaction_anomalies(self, db: AsyncSession) -> Optional[Dict[str, Any]]:
        """Check for transaction anomalies"""
        # This would typically analyze transaction patterns
        # For now, return None (no anomalies detected)
        return None
    
    async def _check_access_anomalies(self, db: AsyncSession) -> Optional[Dict[str, Any]]:
        """Check for access pattern anomalies"""
        # This would typically analyze access patterns
        # For now, return None (no anomalies detected)
        return None


# Global security monitoring service
security_monitoring = SecurityMonitoringService()
