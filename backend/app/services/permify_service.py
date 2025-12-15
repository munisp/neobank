"""
Permify Authorization Service
Fine-grained relationship-based access control (ReBAC) for NeoBank
"""

import aiohttp
import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class PermifyEntityType(str, Enum):
    USER = "user"
    ORGANIZATION = "organization"
    ACCOUNT = "account"
    TRANSACTION = "transaction"
    KYC_APPLICATION = "kyc_application"
    KYB_APPLICATION = "kyb_application"
    LOAN = "loan"
    INVESTMENT = "investment"
    INSURANCE_POLICY = "insurance_policy"
    ESCROW = "escrow"
    CARD = "card"
    REWARD = "reward"
    ESIM = "esim"
    BILL_PAYMENT = "bill_payment"
    BNPL_PURCHASE = "bnpl_purchase"
    ANALYTICS_REPORT = "analytics_report"
    SYSTEM = "system"


@dataclass
class PermifySubject:
    entity_type: str
    entity_id: str
    relation: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        result = {
            "type": self.entity_type,
            "id": self.entity_id
        }
        if self.relation:
            result["relation"] = self.relation
        return result


@dataclass
class PermifyEntity:
    entity_type: str
    entity_id: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.entity_type,
            "id": self.entity_id
        }


@dataclass
class PermifyTuple:
    entity: PermifyEntity
    relation: str
    subject: PermifySubject

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entity": self.entity.to_dict(),
            "relation": self.relation,
            "subject": self.subject.to_dict()
        }


@dataclass
class PermissionCheckResult:
    allowed: bool
    metadata: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class PermifyService:
    """Service for interacting with Permify authorization server"""

    def __init__(
        self,
        base_url: str = "http://localhost:3476",
        tenant_id: str = "neobank",
        api_key: Optional[str] = None
    ):
        self.base_url = base_url
        self.tenant_id = tenant_id
        self.api_key = api_key
        self.session: Optional[aiohttp.ClientSession] = None

    async def initialize(self):
        """Initialize the Permify service"""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        
        self.session = aiohttp.ClientSession(headers=headers)
        logger.info(f"Permify Service initialized with base URL: {self.base_url}")

    async def close(self):
        """Close the Permify service session"""
        if self.session:
            await self.session.close()
            logger.info("Permify Service closed")

    async def check_permission(
        self,
        entity_type: str,
        entity_id: str,
        permission: str,
        subject_type: str,
        subject_id: str,
        context: Optional[Dict[str, Any]] = None
    ) -> PermissionCheckResult:
        """
        Check if a subject has permission on an entity
        
        Args:
            entity_type: Type of the entity (e.g., "account", "transaction")
            entity_id: ID of the entity
            permission: Permission to check (e.g., "view", "transfer")
            subject_type: Type of the subject (usually "user")
            subject_id: ID of the subject
            context: Optional context for attribute-based checks
            
        Returns:
            PermissionCheckResult with allowed status
        """
        try:
            url = f"{self.base_url}/v1/tenants/{self.tenant_id}/permissions/check"
            
            payload = {
                "metadata": {
                    "snap_token": "",
                    "schema_version": "",
                    "depth": 20
                },
                "entity": {
                    "type": entity_type,
                    "id": entity_id
                },
                "permission": permission,
                "subject": {
                    "type": subject_type,
                    "id": subject_id
                }
            }
            
            if context:
                payload["context"] = {"tuples": [], "attributes": context}

            async with self.session.post(url, json=payload) as response:
                if response.status == 200:
                    result = await response.json()
                    return PermissionCheckResult(
                        allowed=result.get("can", "CHECK_RESULT_ALLOWED") == "CHECK_RESULT_ALLOWED",
                        metadata=result.get("metadata")
                    )
                else:
                    error_text = await response.text()
                    logger.error(f"Permify check failed: {error_text}")
                    return PermissionCheckResult(allowed=False, error=error_text)

        except Exception as e:
            logger.error(f"Error checking Permify permission: {e}")
            return PermissionCheckResult(allowed=False, error=str(e))

    async def write_relationship(
        self,
        entity_type: str,
        entity_id: str,
        relation: str,
        subject_type: str,
        subject_id: str,
        subject_relation: Optional[str] = None
    ) -> bool:
        """
        Write a relationship tuple to Permify
        
        Args:
            entity_type: Type of the entity
            entity_id: ID of the entity
            relation: Relation name (e.g., "owner", "member")
            subject_type: Type of the subject
            subject_id: ID of the subject
            subject_relation: Optional relation on the subject
            
        Returns:
            True if successful, False otherwise
        """
        try:
            url = f"{self.base_url}/v1/tenants/{self.tenant_id}/data/write"
            
            subject = {"type": subject_type, "id": subject_id}
            if subject_relation:
                subject["relation"] = subject_relation
            
            payload = {
                "metadata": {
                    "schema_version": ""
                },
                "tuples": [{
                    "entity": {
                        "type": entity_type,
                        "id": entity_id
                    },
                    "relation": relation,
                    "subject": subject
                }]
            }

            async with self.session.post(url, json=payload) as response:
                if response.status == 200:
                    logger.info(f"Wrote relationship: {entity_type}:{entity_id}#{relation}@{subject_type}:{subject_id}")
                    return True
                else:
                    error_text = await response.text()
                    logger.error(f"Failed to write relationship: {error_text}")
                    return False

        except Exception as e:
            logger.error(f"Error writing Permify relationship: {e}")
            return False

    async def delete_relationship(
        self,
        entity_type: str,
        entity_id: str,
        relation: str,
        subject_type: str,
        subject_id: str
    ) -> bool:
        """Delete a relationship tuple from Permify"""
        try:
            url = f"{self.base_url}/v1/tenants/{self.tenant_id}/data/delete"
            
            payload = {
                "tuple_filter": {
                    "entity": {
                        "type": entity_type,
                        "ids": [entity_id]
                    },
                    "relation": relation,
                    "subject": {
                        "type": subject_type,
                        "ids": [subject_id]
                    }
                }
            }

            async with self.session.post(url, json=payload) as response:
                if response.status == 200:
                    logger.info(f"Deleted relationship: {entity_type}:{entity_id}#{relation}@{subject_type}:{subject_id}")
                    return True
                else:
                    error_text = await response.text()
                    logger.error(f"Failed to delete relationship: {error_text}")
                    return False

        except Exception as e:
            logger.error(f"Error deleting Permify relationship: {e}")
            return False

    async def write_attribute(
        self,
        entity_type: str,
        entity_id: str,
        attribute: str,
        value: Any
    ) -> bool:
        """Write an attribute to an entity"""
        try:
            url = f"{self.base_url}/v1/tenants/{self.tenant_id}/data/write"
            
            payload = {
                "metadata": {
                    "schema_version": ""
                },
                "attributes": [{
                    "entity": {
                        "type": entity_type,
                        "id": entity_id
                    },
                    "attribute": attribute,
                    "value": value
                }]
            }

            async with self.session.post(url, json=payload) as response:
                if response.status == 200:
                    logger.info(f"Wrote attribute: {entity_type}:{entity_id}${attribute}={value}")
                    return True
                else:
                    error_text = await response.text()
                    logger.error(f"Failed to write attribute: {error_text}")
                    return False

        except Exception as e:
            logger.error(f"Error writing Permify attribute: {e}")
            return False

    async def lookup_subjects(
        self,
        entity_type: str,
        entity_id: str,
        permission: str,
        subject_type: str
    ) -> List[str]:
        """
        Find all subjects that have a permission on an entity
        
        Returns:
            List of subject IDs
        """
        try:
            url = f"{self.base_url}/v1/tenants/{self.tenant_id}/permissions/lookup-subject"
            
            payload = {
                "metadata": {
                    "snap_token": "",
                    "schema_version": "",
                    "depth": 20
                },
                "entity": {
                    "type": entity_type,
                    "id": entity_id
                },
                "permission": permission,
                "subject_reference": {
                    "type": subject_type
                }
            }

            async with self.session.post(url, json=payload) as response:
                if response.status == 200:
                    result = await response.json()
                    return result.get("subject_ids", [])
                else:
                    return []

        except Exception as e:
            logger.error(f"Error looking up Permify subjects: {e}")
            return []

    async def lookup_entities(
        self,
        entity_type: str,
        permission: str,
        subject_type: str,
        subject_id: str
    ) -> List[str]:
        """
        Find all entities that a subject has permission on
        
        Returns:
            List of entity IDs
        """
        try:
            url = f"{self.base_url}/v1/tenants/{self.tenant_id}/permissions/lookup-entity"
            
            payload = {
                "metadata": {
                    "snap_token": "",
                    "schema_version": "",
                    "depth": 20
                },
                "entity_type": entity_type,
                "permission": permission,
                "subject": {
                    "type": subject_type,
                    "id": subject_id
                }
            }

            async with self.session.post(url, json=payload) as response:
                if response.status == 200:
                    result = await response.json()
                    return result.get("entity_ids", [])
                else:
                    return []

        except Exception as e:
            logger.error(f"Error looking up Permify entities: {e}")
            return []

    async def expand_permissions(
        self,
        entity_type: str,
        entity_id: str,
        permission: str
    ) -> Dict[str, Any]:
        """
        Expand a permission to see the full permission tree
        
        Returns:
            Permission tree structure
        """
        try:
            url = f"{self.base_url}/v1/tenants/{self.tenant_id}/permissions/expand"
            
            payload = {
                "metadata": {
                    "snap_token": "",
                    "schema_version": ""
                },
                "entity": {
                    "type": entity_type,
                    "id": entity_id
                },
                "permission": permission
            }

            async with self.session.post(url, json=payload) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    return {}

        except Exception as e:
            logger.error(f"Error expanding Permify permissions: {e}")
            return {}

    async def write_schema(self, schema: str) -> bool:
        """Write the authorization schema to Permify"""
        try:
            url = f"{self.base_url}/v1/tenants/{self.tenant_id}/schemas/write"
            
            payload = {
                "schema": schema
            }

            async with self.session.post(url, json=payload) as response:
                if response.status == 200:
                    logger.info("Schema written successfully")
                    return True
                else:
                    error_text = await response.text()
                    logger.error(f"Failed to write schema: {error_text}")
                    return False

        except Exception as e:
            logger.error(f"Error writing Permify schema: {e}")
            return False


# Global instance
permify_service: Optional[PermifyService] = None


def get_permify_service() -> PermifyService:
    """Get the global Permify service instance"""
    global permify_service
    if permify_service is None:
        import os
        permify_service = PermifyService(
            base_url=os.getenv("PERMIFY_URL", "http://localhost:3476"),
            tenant_id=os.getenv("PERMIFY_TENANT_ID", "neobank"),
            api_key=os.getenv("PERMIFY_API_KEY")
        )
    return permify_service


async def initialize_permify_service():
    """Initialize the global Permify service"""
    service = get_permify_service()
    await service.initialize()


async def close_permify_service():
    """Close the global Permify service"""
    global permify_service
    if permify_service:
        await permify_service.close()
        permify_service = None
