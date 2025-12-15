"""
CAC (Corporate Affairs Commission) Verification Service
Provides automated business registration verification for Nigerian businesses
"""

import asyncio
import aiohttp
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from decimal import Decimal
import structlog
from enum import Enum

logger = structlog.get_logger()

class BusinessStatus(Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    STRUCK_OFF = "struck_off"
    IN_LIQUIDATION = "in_liquidation"
    DISSOLVED = "dissolved"
    SUSPENDED = "suspended"

class CompanyType(Enum):
    PRIVATE_LIMITED = "private_limited"  # RC
    PUBLIC_LIMITED = "public_limited"  # PLC
    BUSINESS_NAME = "business_name"  # BN
    INCORPORATED_TRUSTEES = "incorporated_trustees"  # IT

class CACVerificationService:
    """
    CAC Verification Service for automated business registration verification
    Integrates with Corporate Affairs Commission API
    """
    
    def __init__(self, api_key: str = None, api_url: str = None):
        """Initialize CAC verification service"""
        self.api_key = api_key or "CAC_API_KEY_PLACEHOLDER"
        self.api_url = api_url or "https://api.cac.gov.ng/v1"
        self.timeout = 30
        
        # Cache for verified businesses (1 hour TTL)
        self.cache = {}
        self.cache_ttl = 3600
        
        logger.info("CAC Verification Service initialized")
    
    async def verify_rc_number(
        self,
        rc_number: str,
        company_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Verify business registration (RC) number with CAC
        
        Args:
            rc_number: Registration number (e.g., RC123456, BN123456)
            company_name: Optional company name for cross-verification
            
        Returns:
            Verification result with business details
        """
        
        # Check cache
        cache_key = f"rc_{rc_number}"
        if cache_key in self.cache:
            cached_data, timestamp = self.cache[cache_key]
            if datetime.now().timestamp() - timestamp < self.cache_ttl:
                logger.info("CAC verification from cache", rc_number=rc_number)
                return cached_data
        
        try:
            # Determine company type from RC number
            company_type = self._determine_company_type(rc_number)
            
            # Call CAC API
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
            
            payload = {
                'registration_number': rc_number,
                'company_type': company_type.value
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f'{self.api_url}/verify/registration',
                    json=payload,
                    headers=headers,
                    timeout=self.timeout
                ) as response:
                    
                    if response.status == 200:
                        data = await response.json()
                        
                        # Parse CAC response
                        result = self._parse_cac_response(data, rc_number, company_name)
                        
                        # Cache result
                        self.cache[cache_key] = (result, datetime.now().timestamp())
                        
                        logger.info(
                            "CAC verification successful",
                            rc_number=rc_number,
                            status=result['status'],
                            verified=result['verified']
                        )
                        
                        return result
                    
                    elif response.status == 404:
                        # Business not found
                        result = {
                            'verified': False,
                            'rc_number': rc_number,
                            'status': 'not_found',
                            'error': 'Business registration not found in CAC database',
                            'timestamp': datetime.now().isoformat()
                        }
                        
                        logger.warning("CAC verification failed - not found", rc_number=rc_number)
                        return result
                    
                    else:
                        # API error
                        error_data = await response.text()
                        logger.error(
                            "CAC API error",
                            rc_number=rc_number,
                            status=response.status,
                            error=error_data
                        )
                        
                        raise Exception(f"CAC API error: {response.status} - {error_data}")
        
        except Exception as e:
            logger.error("CAC verification exception", rc_number=rc_number, error=str(e))
            
            # Return error result
            return {
                'verified': False,
                'rc_number': rc_number,
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    async def verify_tin(
        self,
        tin: str,
        company_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Verify Tax Identification Number (TIN) with FIRS
        
        Args:
            tin: Tax Identification Number
            company_name: Optional company name for cross-verification
            
        Returns:
            TIN verification result
        """
        
        try:
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
            
            payload = {
                'tin': tin,
                'company_name': company_name
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f'{self.api_url}/verify/tin',
                    json=payload,
                    headers=headers,
                    timeout=self.timeout
                ) as response:
                    
                    if response.status == 200:
                        data = await response.json()
                        
                        result = {
                            'verified': data.get('verified', False),
                            'tin': tin,
                            'company_name': data.get('company_name'),
                            'tax_office': data.get('tax_office'),
                            'registration_date': data.get('registration_date'),
                            'status': data.get('status', 'active'),
                            'compliance_status': data.get('compliance_status', 'unknown'),
                            'last_filing_date': data.get('last_filing_date'),
                            'timestamp': datetime.now().isoformat()
                        }
                        
                        logger.info("TIN verification successful", tin=tin, verified=result['verified'])
                        return result
                    
                    else:
                        logger.warning("TIN verification failed", tin=tin, status=response.status)
                        return {
                            'verified': False,
                            'tin': tin,
                            'status': 'error',
                            'error': f'TIN verification failed: {response.status}',
                            'timestamp': datetime.now().isoformat()
                        }
        
        except Exception as e:
            logger.error("TIN verification exception", tin=tin, error=str(e))
            return {
                'verified': False,
                'tin': tin,
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    async def get_company_details(
        self,
        rc_number: str
    ) -> Dict[str, Any]:
        """
        Get comprehensive company details from CAC
        
        Args:
            rc_number: Registration number
            
        Returns:
            Complete company information
        """
        
        try:
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f'{self.api_url}/company/{rc_number}',
                    headers=headers,
                    timeout=self.timeout
                ) as response:
                    
                    if response.status == 200:
                        data = await response.json()
                        
                        return {
                            'rc_number': rc_number,
                            'company_name': data.get('company_name'),
                            'company_type': data.get('company_type'),
                            'status': data.get('status'),
                            'registration_date': data.get('registration_date'),
                            'address': data.get('address'),
                            'email': data.get('email'),
                            'phone': data.get('phone'),
                            'share_capital': data.get('share_capital'),
                            'directors': data.get('directors', []),
                            'shareholders': data.get('shareholders', []),
                            'secretary': data.get('secretary'),
                            'objects': data.get('objects', []),
                            'branches': data.get('branches', []),
                            'timestamp': datetime.now().isoformat()
                        }
                    
                    else:
                        logger.warning("Company details fetch failed", rc_number=rc_number)
                        return {
                            'rc_number': rc_number,
                            'error': f'Failed to fetch company details: {response.status}',
                            'timestamp': datetime.now().isoformat()
                        }
        
        except Exception as e:
            logger.error("Company details exception", rc_number=rc_number, error=str(e))
            return {
                'rc_number': rc_number,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    async def verify_directors(
        self,
        rc_number: str,
        directors: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Verify directors against CAC records
        
        Args:
            rc_number: Registration number
            directors: List of director information to verify
            
        Returns:
            Director verification results
        """
        
        try:
            # Get company details from CAC
            company_details = await self.get_company_details(rc_number)
            
            if 'error' in company_details:
                return {
                    'verified': False,
                    'error': company_details['error'],
                    'timestamp': datetime.now().isoformat()
                }
            
            cac_directors = company_details.get('directors', [])
            
            # Verify each director
            verification_results = []
            
            for director in directors:
                director_name = director.get('full_name', '').lower().strip()
                
                # Check if director exists in CAC records
                matched = False
                for cac_director in cac_directors:
                    cac_name = cac_director.get('name', '').lower().strip()
                    
                    # Fuzzy match (simple contains check)
                    if director_name in cac_name or cac_name in director_name:
                        matched = True
                        verification_results.append({
                            'provided_name': director.get('full_name'),
                            'cac_name': cac_director.get('name'),
                            'verified': True,
                            'position': cac_director.get('position'),
                            'appointment_date': cac_director.get('appointment_date'),
                            'address': cac_director.get('address')
                        })
                        break
                
                if not matched:
                    verification_results.append({
                        'provided_name': director.get('full_name'),
                        'verified': False,
                        'error': 'Director not found in CAC records'
                    })
            
            # Calculate overall verification
            total_directors = len(directors)
            verified_directors = sum(1 for r in verification_results if r.get('verified', False))
            verification_rate = (verified_directors / total_directors * 100) if total_directors > 0 else 0
            
            return {
                'verified': verification_rate >= 80,  # At least 80% match required
                'verification_rate': verification_rate,
                'total_directors': total_directors,
                'verified_directors': verified_directors,
                'results': verification_results,
                'timestamp': datetime.now().isoformat()
            }
        
        except Exception as e:
            logger.error("Director verification exception", rc_number=rc_number, error=str(e))
            return {
                'verified': False,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    async def check_compliance_status(
        self,
        rc_number: str
    ) -> Dict[str, Any]:
        """
        Check business compliance status with CAC
        
        Args:
            rc_number: Registration number
            
        Returns:
            Compliance status information
        """
        
        try:
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f'{self.api_url}/compliance/{rc_number}',
                    headers=headers,
                    timeout=self.timeout
                ) as response:
                    
                    if response.status == 200:
                        data = await response.json()
                        
                        return {
                            'compliant': data.get('compliant', False),
                            'rc_number': rc_number,
                            'annual_returns_filed': data.get('annual_returns_filed', False),
                            'last_annual_return_date': data.get('last_annual_return_date'),
                            'outstanding_fees': data.get('outstanding_fees', 0),
                            'penalties': data.get('penalties', []),
                            'warnings': data.get('warnings', []),
                            'next_filing_due': data.get('next_filing_due'),
                            'compliance_score': data.get('compliance_score', 0),
                            'timestamp': datetime.now().isoformat()
                        }
                    
                    else:
                        logger.warning("Compliance check failed", rc_number=rc_number)
                        return {
                            'compliant': False,
                            'rc_number': rc_number,
                            'error': f'Compliance check failed: {response.status}',
                            'timestamp': datetime.now().isoformat()
                        }
        
        except Exception as e:
            logger.error("Compliance check exception", rc_number=rc_number, error=str(e))
            return {
                'compliant': False,
                'rc_number': rc_number,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    def _determine_company_type(self, rc_number: str) -> CompanyType:
        """Determine company type from RC number prefix"""
        rc_upper = rc_number.upper().strip()
        
        if rc_upper.startswith('RC'):
            return CompanyType.PRIVATE_LIMITED
        elif rc_upper.startswith('BN'):
            return CompanyType.BUSINESS_NAME
        elif rc_upper.startswith('IT'):
            return CompanyType.INCORPORATED_TRUSTEES
        elif 'PLC' in rc_upper:
            return CompanyType.PUBLIC_LIMITED
        else:
            return CompanyType.PRIVATE_LIMITED  # Default
    
    def _parse_cac_response(
        self,
        data: Dict[str, Any],
        rc_number: str,
        company_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Parse and structure CAC API response"""
        
        cac_company_name = data.get('company_name', '')
        cac_status = data.get('status', 'unknown')
        
        # Verify company name if provided
        name_match = True
        if company_name:
            name_match = self._fuzzy_match_company_name(company_name, cac_company_name)
        
        # Determine if business is verified
        verified = (
            data.get('verified', False) and
            cac_status.lower() in ['active', 'in_good_standing'] and
            name_match
        )
        
        return {
            'verified': verified,
            'rc_number': rc_number,
            'company_name': cac_company_name,
            'status': cac_status,
            'company_type': data.get('company_type'),
            'registration_date': data.get('registration_date'),
            'address': data.get('address'),
            'share_capital': data.get('share_capital'),
            'directors_count': len(data.get('directors', [])),
            'name_match': name_match,
            'name_match_score': self._calculate_name_similarity(company_name, cac_company_name) if company_name else 100,
            'warnings': self._generate_warnings(data, name_match),
            'timestamp': datetime.now().isoformat()
        }
    
    def _fuzzy_match_company_name(self, provided_name: str, cac_name: str) -> bool:
        """Fuzzy match company names (80% similarity threshold)"""
        if not provided_name or not cac_name:
            return False
        
        similarity = self._calculate_name_similarity(provided_name, cac_name)
        return similarity >= 80
    
    def _calculate_name_similarity(self, name1: str, name2: str) -> float:
        """Calculate similarity between two company names (0-100)"""
        if not name1 or not name2:
            return 0.0
        
        # Normalize names
        n1 = name1.lower().strip()
        n2 = name2.lower().strip()
        
        # Remove common suffixes
        suffixes = ['limited', 'ltd', 'plc', 'inc', 'llc', 'llp']
        for suffix in suffixes:
            n1 = n1.replace(suffix, '').strip()
            n2 = n2.replace(suffix, '').strip()
        
        # Simple character-based similarity (Jaccard)
        set1 = set(n1.split())
        set2 = set(n2.split())
        
        if not set1 or not set2:
            return 0.0
        
        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))
        
        similarity = (intersection / union) * 100 if union > 0 else 0.0
        
        return round(similarity, 2)
    
    def _generate_warnings(self, data: Dict[str, Any], name_match: bool) -> List[str]:
        """Generate warnings based on CAC data"""
        warnings = []
        
        status = data.get('status', '').lower()
        
        if status == 'inactive':
            warnings.append("Business is marked as INACTIVE in CAC records")
        elif status == 'struck_off':
            warnings.append("Business has been STRUCK OFF the register")
        elif status == 'in_liquidation':
            warnings.append("Business is IN LIQUIDATION")
        elif status == 'dissolved':
            warnings.append("Business has been DISSOLVED")
        elif status == 'suspended':
            warnings.append("Business registration is SUSPENDED")
        
        if not name_match:
            warnings.append("Company name does not match CAC records")
        
        if not data.get('directors'):
            warnings.append("No directors found in CAC records")
        
        return warnings


# Singleton instance
_cac_service_instance = None

def get_cac_service(api_key: str = None, api_url: str = None) -> CACVerificationService:
    """Get CAC verification service instance"""
    global _cac_service_instance
    
    if _cac_service_instance is None:
        _cac_service_instance = CACVerificationService(api_key, api_url)
    
    return _cac_service_instance
