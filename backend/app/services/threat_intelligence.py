"""
Threat intelligence service with OpenCTI integration
"""
import json
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone, timedelta
import structlog

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from config.settings import settings
from database.models import ThreatIndicator, SecurityEvent

logger = structlog.get_logger()


class OpenCTIClient:
    """Client for OpenCTI threat intelligence platform"""
    
    def __init__(self):
        self.base_url = "http://localhost:8080"  # OpenCTI endpoint
        import os
        self.api_key = os.environ.get("OPENCTI_API_KEY")
        if not self.api_key:
            logger.warning("OPENCTI_API_KEY not set")
        self.timeout = 15.0
    
    async def get_indicators(self, indicator_types: List[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """Get threat indicators from OpenCTI"""
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            # Build GraphQL query
            query = """
            query GetIndicators($first: Int, $types: [String]) {
                indicators(first: $first, types: $types) {
                    edges {
                        node {
                            id
                            pattern
                            indicator_types
                            valid_from
                            valid_until
                            confidence
                            labels {
                                edges {
                                    node {
                                        value
                                    }
                                }
                            }
                            objectMarking {
                                edges {
                                    node {
                                        definition
                                    }
                                }
                            }
                        }
                    }
                }
            }
            """
            
            variables = {
                "first": limit,
                "types": indicator_types or ["ipv4-addr", "domain-name", "url", "file"]
            }
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/graphql",
                    json={"query": query, "variables": variables},
                    headers=headers
                )
                
                if response.status_code == 200:
                    result = response.json()
                    indicators = []
                    
                    for edge in result.get("data", {}).get("indicators", {}).get("edges", []):
                        node = edge["node"]
                        indicators.append({
                            "id": node["id"],
                            "pattern": node["pattern"],
                            "types": node["indicator_types"],
                            "valid_from": node["valid_from"],
                            "valid_until": node["valid_until"],
                            "confidence": node["confidence"],
                            "labels": [label["node"]["value"] for label in node.get("labels", {}).get("edges", [])],
                            "marking": [mark["node"]["definition"] for mark in node.get("objectMarking", {}).get("edges", [])]
                        })
                    
                    return indicators
                else:
                    logger.warning("OpenCTI indicators request failed", status_code=response.status_code)
                    return self._get_mock_indicators()
                    
        except Exception as e:
            logger.error("OpenCTI indicators request error", error=str(e))
            return self._get_mock_indicators()
    
    async def check_indicator(self, indicator_value: str, indicator_type: str) -> Optional[Dict[str, Any]]:
        """Check if an indicator exists in OpenCTI"""
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            # Build GraphQL query to search for specific indicator
            query = """
            query CheckIndicator($pattern: String, $type: String) {
                indicators(filters: [{key: "pattern", values: [$pattern]}, {key: "indicator_types", values: [$type]}]) {
                    edges {
                        node {
                            id
                            pattern
                            indicator_types
                            confidence
                            labels {
                                edges {
                                    node {
                                        value
                                    }
                                }
                            }
                        }
                    }
                }
            }
            """
            
            variables = {
                "pattern": indicator_value,
                "type": indicator_type
            }
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/graphql",
                    json={"query": query, "variables": variables},
                    headers=headers
                )
                
                if response.status_code == 200:
                    result = response.json()
                    edges = result.get("data", {}).get("indicators", {}).get("edges", [])
                    
                    if edges:
                        node = edges[0]["node"]
                        return {
                            "found": True,
                            "id": node["id"],
                            "pattern": node["pattern"],
                            "types": node["indicator_types"],
                            "confidence": node["confidence"],
                            "labels": [label["node"]["value"] for label in node.get("labels", {}).get("edges", [])]
                        }
                    else:
                        return {"found": False}
                else:
                    logger.warning("OpenCTI indicator check failed", status_code=response.status_code)
                    return {"found": False, "error": "service_unavailable"}
                    
        except Exception as e:
            logger.error("OpenCTI indicator check error", error=str(e))
            return {"found": False, "error": str(e)}
    
    async def submit_indicator(self, indicator_data: Dict[str, Any]) -> bool:
        """Submit new threat indicator to OpenCTI"""
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            # Build GraphQL mutation
            mutation = """
            mutation CreateIndicator($input: IndicatorAddInput!) {
                indicatorAdd(input: $input) {
                    id
                    pattern
                }
            }
            """
            
            variables = {
                "input": {
                    "pattern": indicator_data["pattern"],
                    "indicator_types": indicator_data["types"],
                    "confidence": indicator_data.get("confidence", 50),
                    "labels": indicator_data.get("labels", []),
                    "description": indicator_data.get("description", ""),
                    "valid_from": indicator_data.get("valid_from", datetime.now(timezone.utc).isoformat())
                }
            }
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/graphql",
                    json={"query": mutation, "variables": variables},
                    headers=headers
                )
                
                return response.status_code == 200
                
        except Exception as e:
            logger.error("OpenCTI indicator submission error", error=str(e))
            return False
    
    def _get_mock_indicators(self) -> List[Dict[str, Any]]:
        """Get mock threat indicators for demo purposes"""
        return [
            {
                "id": "mock-1",
                "pattern": "192.168.1.100",
                "types": ["ipv4-addr"],
                "valid_from": "2024-01-01T00:00:00Z",
                "valid_until": "2025-01-01T00:00:00Z",
                "confidence": 85,
                "labels": ["malicious", "botnet"],
                "marking": ["TLP:RED"]
            },
            {
                "id": "mock-2",
                "pattern": "evil.example.com",
                "types": ["domain-name"],
                "valid_from": "2024-01-01T00:00:00Z",
                "valid_until": "2025-01-01T00:00:00Z",
                "confidence": 90,
                "labels": ["phishing", "banking-trojan"],
                "marking": ["TLP:AMBER"]
            }
        ]


class ThreatIntelligenceService:
    """Threat intelligence service with comprehensive threat detection"""
    
    def __init__(self):
        self.opencti_client = OpenCTIClient()
        self.indicator_cache = {}
        self.cache_ttl = 3600  # 1 hour
        self.last_sync = None
    
    async def sync_indicators(self, db: AsyncSession) -> int:
        """Sync threat indicators from OpenCTI"""
        try:
            # Get indicators from OpenCTI
            indicators = await self.opencti_client.get_indicators(
                indicator_types=["ipv4-addr", "domain-name", "url", "file"],
                limit=1000
            )
            
            synced_count = 0
            
            for indicator_data in indicators:
                # Check if indicator already exists
                existing = await db.execute(
                    select(ThreatIndicator).where(
                        ThreatIndicator.external_id == indicator_data["id"]
                    )
                )
                
                if not existing.scalar_one_or_none():
                    # Create new indicator
                    indicator = ThreatIndicator(
                        external_id=indicator_data["id"],
                        indicator_type=indicator_data["types"][0] if indicator_data["types"] else "unknown",
                        indicator_value=indicator_data["pattern"],
                        confidence=indicator_data["confidence"],
                        labels=indicator_data["labels"],
                        valid_from=datetime.fromisoformat(indicator_data["valid_from"].replace("Z", "+00:00")) if indicator_data["valid_from"] else None,
                        valid_until=datetime.fromisoformat(indicator_data["valid_until"].replace("Z", "+00:00")) if indicator_data["valid_until"] else None,
                        source="opencti",
                        metadata={"marking": indicator_data.get("marking", [])}
                    )
                    
                    db.add(indicator)
                    synced_count += 1
            
            await db.commit()
            self.last_sync = datetime.now(timezone.utc)
            
            logger.info("Threat indicators synced", count=synced_count)
            return synced_count
            
        except Exception as e:
            logger.error("Threat indicator sync failed", error=str(e))
            return 0
    
    async def check_threat(self, db: AsyncSession, indicator_value: str, indicator_type: str) -> Dict[str, Any]:
        """Check if an indicator is a known threat"""
        
        # Check local database first
        local_result = await self._check_local_indicators(db, indicator_value, indicator_type)
        if local_result["is_threat"]:
            return local_result
        
        # Check OpenCTI
        opencti_result = await self.opencti_client.check_indicator(indicator_value, indicator_type)
        
        if opencti_result.get("found"):
            # Store in local database for future reference
            await self._store_indicator(db, {
                "external_id": opencti_result["id"],
                "indicator_type": indicator_type,
                "indicator_value": indicator_value,
                "confidence": opencti_result["confidence"],
                "labels": opencti_result["labels"],
                "source": "opencti"
            })
            
            return {
                "is_threat": True,
                "source": "opencti",
                "confidence": opencti_result["confidence"],
                "labels": opencti_result["labels"],
                "details": opencti_result
            }
        
        return {
            "is_threat": False,
            "source": "none",
            "confidence": 0,
            "labels": [],
            "details": {}
        }
    
    async def analyze_ip_reputation(self, db: AsyncSession, ip_address: str) -> Dict[str, Any]:
        """Analyze IP address reputation"""
        
        # Check against threat indicators
        threat_result = await self.check_threat(db, ip_address, "ipv4-addr")
        
        # Additional reputation checks
        reputation_score = 100  # Start with neutral score
        risk_factors = []
        
        if threat_result["is_threat"]:
            reputation_score -= 50
            risk_factors.append("Known malicious IP")
        
        # Check for recent security events from this IP
        recent_events = await db.execute(
            select(SecurityEvent).where(
                and_(
                    SecurityEvent.source_ip == ip_address,
                    SecurityEvent.created_at >= datetime.now(timezone.utc) - timedelta(hours=24)
                )
            ).limit(10)
        )
        
        events = recent_events.scalars().all()
        
        if len(events) > 5:
            reputation_score -= 20
            risk_factors.append("High activity volume")
        
        # Check for authentication failures
        auth_failures = [e for e in events if e.event_type == "authentication_failure"]
        if len(auth_failures) > 3:
            reputation_score -= 30
            risk_factors.append("Multiple authentication failures")
        
        # Determine risk level
        if reputation_score <= 30:
            risk_level = "high"
        elif reputation_score <= 60:
            risk_level = "medium"
        elif reputation_score <= 80:
            risk_level = "low"
        else:
            risk_level = "minimal"
        
        return {
            "ip_address": ip_address,
            "reputation_score": max(0, reputation_score),
            "risk_level": risk_level,
            "risk_factors": risk_factors,
            "threat_intelligence": threat_result,
            "recent_events_count": len(events),
            "analysis_timestamp": datetime.now(timezone.utc).isoformat()
        }
    
    async def submit_threat_indicator(self, db: AsyncSession, indicator_data: Dict[str, Any]) -> bool:
        """Submit new threat indicator"""
        try:
            # Store locally
            indicator = ThreatIndicator(
                indicator_type=indicator_data["type"],
                indicator_value=indicator_data["value"],
                confidence=indicator_data.get("confidence", 75),
                labels=indicator_data.get("labels", []),
                source="neobank",
                description=indicator_data.get("description", ""),
                metadata=indicator_data.get("metadata", {})
            )
            
            db.add(indicator)
            await db.commit()
            
            # Submit to OpenCTI
            opencti_data = {
                "pattern": indicator_data["value"],
                "types": [indicator_data["type"]],
                "confidence": indicator_data.get("confidence", 75),
                "labels": indicator_data.get("labels", []),
                "description": indicator_data.get("description", "Submitted by NeoBank"),
                "valid_from": datetime.now(timezone.utc).isoformat()
            }
            
            opencti_success = await self.opencti_client.submit_indicator(opencti_data)
            
            logger.info("Threat indicator submitted",
                       indicator_type=indicator_data["type"],
                       indicator_value=indicator_data["value"],
                       opencti_success=opencti_success)
            
            return True
            
        except Exception as e:
            logger.error("Threat indicator submission failed", error=str(e))
            return False
    
    async def get_threat_summary(self, db: AsyncSession) -> Dict[str, Any]:
        """Get threat intelligence summary"""
        
        # Count indicators by type
        indicator_counts = await db.execute(
            select(ThreatIndicator.indicator_type, func.count(ThreatIndicator.id))
            .group_by(ThreatIndicator.indicator_type)
        )
        
        type_counts = dict(indicator_counts.all())
        
        # Count recent threats (last 7 days)
        recent_threats = await db.execute(
            select(func.count(ThreatIndicator.id))
            .where(ThreatIndicator.created_at >= datetime.now(timezone.utc) - timedelta(days=7))
        )
        
        recent_count = recent_threats.scalar() or 0
        
        # Get high confidence indicators
        high_confidence = await db.execute(
            select(func.count(ThreatIndicator.id))
            .where(ThreatIndicator.confidence >= 80)
        )
        
        high_conf_count = high_confidence.scalar() or 0
        
        return {
            "total_indicators": sum(type_counts.values()),
            "indicators_by_type": type_counts,
            "recent_threats": recent_count,
            "high_confidence_threats": high_conf_count,
            "last_sync": self.last_sync.isoformat() if self.last_sync else None,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
    
    async def _check_local_indicators(self, db: AsyncSession, indicator_value: str, indicator_type: str) -> Dict[str, Any]:
        """Check local threat indicator database"""
        
        result = await db.execute(
            select(ThreatIndicator).where(
                and_(
                    ThreatIndicator.indicator_value == indicator_value,
                    ThreatIndicator.indicator_type == indicator_type,
                    ThreatIndicator.is_active == True
                )
            )
        )
        
        indicator = result.scalar_one_or_none()
        
        if indicator:
            return {
                "is_threat": True,
                "source": "local",
                "confidence": indicator.confidence,
                "labels": indicator.labels or [],
                "details": {
                    "id": str(indicator.id),
                    "created_at": indicator.created_at.isoformat(),
                    "description": indicator.description
                }
            }
        
        return {
            "is_threat": False,
            "source": "none",
            "confidence": 0,
            "labels": [],
            "details": {}
        }
    
    async def _store_indicator(self, db: AsyncSession, indicator_data: Dict[str, Any]):
        """Store threat indicator in local database"""
        try:
            indicator = ThreatIndicator(
                external_id=indicator_data.get("external_id"),
                indicator_type=indicator_data["indicator_type"],
                indicator_value=indicator_data["indicator_value"],
                confidence=indicator_data["confidence"],
                labels=indicator_data["labels"],
                source=indicator_data["source"],
                metadata=indicator_data.get("metadata", {})
            )
            
            db.add(indicator)
            await db.commit()
            
        except Exception as e:
            logger.error("Failed to store threat indicator", error=str(e))


# Global threat intelligence service
threat_intelligence = ThreatIntelligenceService()
