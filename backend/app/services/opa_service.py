"""
Open Policy Agent (OPA) Integration Service
Provides centralized policy enforcement for the NeoBank platform
"""

import aiohttp
import logging
from typing import Dict, Any, Optional

from config.settings import settings

logger = logging.getLogger(__name__)

class OPAService:
    """Service for interacting with Open Policy Agent"""

    def __init__(self):
        self.opa_url = settings.OPA_URL or "http://localhost:8181"
        self.session = None

    async def initialize(self):
        """Initialize the OPA service"""
        self.session = aiohttp.ClientSession()
        logger.info("OPA Service initialized")

    async def close(self):
        """Close the OPA service session"""
        if self.session:
            await self.session.close()

    async def evaluate_policy(self, policy_path: str, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Evaluate a policy in OPA"""
        try:
            url = f"{self.opa_url}/v1/data/{policy_path}"
            payload = {"input": input_data}

            async with self.session.post(url, json=payload) as response:
                response.raise_for_status()
                result = await response.json()
                return result.get('result', {})

        except Exception as e:
            logger.error(f"Error evaluating OPA policy: {e}")
            # Fallback to a default deny policy in case of error
            return {"allow": False, "reason": "OPA policy evaluation failed"}

# Global instance
opa_service = OPAService()

async def initialize_opa_service():
    """Initialize the OPA service"""
    await opa_service.initialize()

async def close_opa_service():
    """Close the OPA service"""
    await opa_service.close()

