"""
Advanced Bill Payment and Utility Services Integration for NeoBank Platform
Supports electricity, water, cable TV, internet, airtime, and data purchases
"""

import logging
import asyncio
import json
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum
import aiohttp
from decimal import Decimal

from ..database.models import User, Account, Transaction
from ..database.connection import get_db_session
from ..config.settings import settings
from .notification_service import send_transaction_alert

logger = logging.getLogger(__name__)

class BillCategory(Enum):
    """Bill payment categories"""
    ELECTRICITY = "electricity"
    WATER = "water"
    CABLE_TV = "cable_tv"
    INTERNET = "internet"
    AIRTIME = "airtime"
    DATA = "data"
    INSURANCE = "insurance"
    EDUCATION = "education"
    GOVERNMENT = "government"
    BETTING = "betting"

class PaymentStatus(Enum):
    """Payment status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"

@dataclass
class BillProvider:
    """Bill payment provider information"""
    id: str
    name: str
    category: BillCategory
    logo_url: str
    is_active: bool
    min_amount: Decimal
    max_amount: Decimal
    fee_percentage: Decimal
    fee_cap: Decimal
    processing_time: str  # e.g., "instant", "5-10 minutes"
    description: str

@dataclass
class BillPaymentRequest:
    """Bill payment request structure"""
    user_id: str
    account_id: str
    provider_id: str
    customer_id: str  # Customer ID/meter number/phone number
    amount: Decimal
    reference: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

@dataclass
class BillPaymentResult:
    """Bill payment result"""
    transaction_id: str
    reference: str
    status: PaymentStatus
    amount: Decimal
    fee: Decimal
    provider_reference: Optional[str] = None
    token: Optional[str] = None  # For prepaid services
    units: Optional[str] = None  # For electricity/data
    expires_at: Optional[datetime] = None
    message: str = ""

class ElectricityProvider:
    """Electricity bill payment provider"""
    
    def __init__(self):
        self.api_key = settings.ELECTRICITY_API_KEY
        self.base_url = "https://api.buypower.ng/v2"
        self.providers = {
            "aedc": {"name": "Abuja Electricity Distribution Company", "code": "AEDC"},
            "ekedc": {"name": "Eko Electricity Distribution Company", "code": "EKEDC"},
            "ikedc": {"name": "Ikeja Electric", "code": "IKEDC"},
            "phed": {"name": "Port Harcourt Electricity Distribution", "code": "PHED"},
            "kedco": {"name": "Kano Electricity Distribution Company", "code": "KEDCO"},
            "jedc": {"name": "Jos Electricity Distribution Company", "code": "JEDC"},
            "eedc": {"name": "Enugu Electricity Distribution Company", "code": "EEDC"},
            "ibedc": {"name": "Ibadan Electricity Distribution Company", "code": "IBEDC"}
        }
    
    async def verify_customer(self, provider_code: str, meter_number: str) -> Dict[str, Any]:
        """Verify electricity customer details"""
        try:
            url = f"{self.base_url}/verify-meter"
            payload = {
                "disco": provider_code,
                "meter_number": meter_number,
                "meter_type": "prepaid"  # or postpaid
            }
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers) as response:
                    result = await response.json()
                    
                    if response.status == 200 and result.get("status") == "success":
                        return {
                            "valid": True,
                            "customer_name": result.get("data", {}).get("customer_name"),
                            "address": result.get("data", {}).get("address"),
                            "meter_type": result.get("data", {}).get("meter_type"),
                            "tariff": result.get("data", {}).get("tariff")
                        }
                    else:
                        return {
                            "valid": False,
                            "error": result.get("message", "Customer verification failed")
                        }
                        
        except Exception as e:
            logger.error(f"Electricity customer verification failed: {e}")
            return {"valid": False, "error": str(e)}
    
    async def purchase_electricity(self, provider_code: str, meter_number: str, 
                                 amount: Decimal, reference: str) -> Dict[str, Any]:
        """Purchase electricity units"""
        try:
            url = f"{self.base_url}/purchase"
            payload = {
                "disco": provider_code,
                "meter_number": meter_number,
                "amount": float(amount),
                "reference": reference,
                "meter_type": "prepaid"
            }
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers) as response:
                    result = await response.json()
                    
                    if response.status == 200 and result.get("status") == "success":
                        data = result.get("data", {})
                        return {
                            "success": True,
                            "token": data.get("token"),
                            "units": data.get("units"),
                            "provider_reference": data.get("reference"),
                            "customer_name": data.get("customer_name"),
                            "address": data.get("address")
                        }
                    else:
                        return {
                            "success": False,
                            "error": result.get("message", "Electricity purchase failed")
                        }
                        
        except Exception as e:
            logger.error(f"Electricity purchase failed: {e}")
            return {"success": False, "error": str(e)}

class AirtimeDataProvider:
    """Airtime and data purchase provider"""
    
    def __init__(self):
        self.api_key = settings.AIRTIME_API_KEY
        self.base_url = "https://api.vtpass.com/api"
        self.networks = {
            "mtn": {"name": "MTN Nigeria", "code": "mtn"},
            "glo": {"name": "Globacom", "code": "glo"},
            "airtel": {"name": "Airtel Nigeria", "code": "airtel"},
            "9mobile": {"name": "9mobile", "code": "etisalat"}
        }
        
        # Data plans for each network
        self.data_plans = {
            "mtn": [
                {"code": "mtn-1gb-30", "name": "1GB - 30 Days", "amount": 350, "validity": "30 days"},
                {"code": "mtn-2gb-30", "name": "2GB - 30 Days", "amount": 700, "validity": "30 days"},
                {"code": "mtn-5gb-30", "name": "5GB - 30 Days", "amount": 1500, "validity": "30 days"},
                {"code": "mtn-10gb-30", "name": "10GB - 30 Days", "amount": 3000, "validity": "30 days"}
            ],
            "glo": [
                {"code": "glo-1gb-30", "name": "1GB - 30 Days", "amount": 400, "validity": "30 days"},
                {"code": "glo-2gb-30", "name": "2GB - 30 Days", "amount": 800, "validity": "30 days"},
                {"code": "glo-5gb-30", "name": "5GB - 30 Days", "amount": 1600, "validity": "30 days"}
            ],
            "airtel": [
                {"code": "airtel-1gb-30", "name": "1GB - 30 Days", "amount": 350, "validity": "30 days"},
                {"code": "airtel-2gb-30", "name": "2GB - 30 Days", "amount": 700, "validity": "30 days"},
                {"code": "airtel-5gb-30", "name": "5GB - 30 Days", "amount": 1500, "validity": "30 days"}
            ],
            "9mobile": [
                {"code": "9mobile-1gb-30", "name": "1GB - 30 Days", "amount": 400, "validity": "30 days"},
                {"code": "9mobile-2gb-30", "name": "2GB - 30 Days", "amount": 800, "validity": "30 days"}
            ]
        }
    
    async def purchase_airtime(self, network: str, phone_number: str, 
                             amount: Decimal, reference: str) -> Dict[str, Any]:
        """Purchase airtime"""
        try:
            url = f"{self.base_url}/pay"
            payload = {
                "serviceID": f"{network}-airtime",
                "billersCode": phone_number,
                "variation_code": f"{network}-airtime",
                "amount": float(amount),
                "phone": phone_number,
                "request_id": reference
            }
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers) as response:
                    result = await response.json()
                    
                    if response.status == 200 and result.get("code") == "000":
                        return {
                            "success": True,
                            "provider_reference": result.get("requestId"),
                            "transaction_id": result.get("transactionId"),
                            "message": f"₦{amount} airtime sent to {phone_number}"
                        }
                    else:
                        return {
                            "success": False,
                            "error": result.get("response_description", "Airtime purchase failed")
                        }
                        
        except Exception as e:
            logger.error(f"Airtime purchase failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def purchase_data(self, network: str, phone_number: str, 
                          plan_code: str, reference: str) -> Dict[str, Any]:
        """Purchase data bundle"""
        try:
            # Find plan details
            plan = None
            for plan_item in self.data_plans.get(network, []):
                if plan_item["code"] == plan_code:
                    plan = plan_item
                    break
            
            if not plan:
                return {"success": False, "error": "Invalid data plan"}
            
            url = f"{self.base_url}/pay"
            payload = {
                "serviceID": f"{network}-data",
                "billersCode": phone_number,
                "variation_code": plan_code,
                "amount": plan["amount"],
                "phone": phone_number,
                "request_id": reference
            }
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers) as response:
                    result = await response.json()
                    
                    if response.status == 200 and result.get("code") == "000":
                        return {
                            "success": True,
                            "provider_reference": result.get("requestId"),
                            "transaction_id": result.get("transactionId"),
                            "plan_name": plan["name"],
                            "validity": plan["validity"],
                            "message": f"{plan['name']} data bundle sent to {phone_number}"
                        }
                    else:
                        return {
                            "success": False,
                            "error": result.get("response_description", "Data purchase failed")
                        }
                        
        except Exception as e:
            logger.error(f"Data purchase failed: {e}")
            return {"success": False, "error": str(e)}

class CableTVProvider:
    """Cable TV subscription provider"""
    
    def __init__(self):
        self.api_key = settings.CABLE_TV_API_KEY
        self.base_url = "https://api.vtpass.com/api"
        self.providers = {
            "dstv": {"name": "DStv", "code": "dstv"},
            "gotv": {"name": "GOtv", "code": "gotv"},
            "startimes": {"name": "StarTimes", "code": "startimes"},
            "showmax": {"name": "Showmax", "code": "showmax"}
        }
        
        # Subscription packages
        self.packages = {
            "dstv": [
                {"code": "dstv-padi", "name": "DStv Padi", "amount": 2500, "duration": "1 month"},
                {"code": "dstv-yanga", "name": "DStv Yanga", "amount": 3500, "duration": "1 month"},
                {"code": "dstv-confam", "name": "DStv Confam", "amount": 6200, "duration": "1 month"},
                {"code": "dstv-compact", "name": "DStv Compact", "amount": 10500, "duration": "1 month"},
                {"code": "dstv-compact-plus", "name": "DStv Compact Plus", "amount": 16600, "duration": "1 month"},
                {"code": "dstv-premium", "name": "DStv Premium", "amount": 24500, "duration": "1 month"}
            ],
            "gotv": [
                {"code": "gotv-smallie", "name": "GOtv Smallie", "amount": 1100, "duration": "1 month"},
                {"code": "gotv-jinja", "name": "GOtv Jinja", "amount": 2250, "duration": "1 month"},
                {"code": "gotv-jolli", "name": "GOtv Jolli", "amount": 3300, "duration": "1 month"},
                {"code": "gotv-max", "name": "GOtv Max", "amount": 4850, "duration": "1 month"}
            ]
        }
    
    async def verify_smartcard(self, provider: str, smartcard_number: str) -> Dict[str, Any]:
        """Verify cable TV smartcard"""
        try:
            url = f"{self.base_url}/merchant-verify"
            payload = {
                "serviceID": provider,
                "billersCode": smartcard_number
            }
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers) as response:
                    result = await response.json()
                    
                    if response.status == 200 and result.get("code") == "000":
                        content = result.get("content", {})
                        return {
                            "valid": True,
                            "customer_name": content.get("Customer_Name"),
                            "status": content.get("Status"),
                            "due_date": content.get("Due_Date"),
                            "customer_number": content.get("Customer_Number")
                        }
                    else:
                        return {
                            "valid": False,
                            "error": result.get("response_description", "Smartcard verification failed")
                        }
                        
        except Exception as e:
            logger.error(f"Smartcard verification failed: {e}")
            return {"valid": False, "error": str(e)}
    
    async def subscribe_cable_tv(self, provider: str, smartcard_number: str, 
                               package_code: str, reference: str) -> Dict[str, Any]:
        """Subscribe to cable TV package"""
        try:
            # Find package details
            package = None
            for pkg in self.packages.get(provider, []):
                if pkg["code"] == package_code:
                    package = pkg
                    break
            
            if not package:
                return {"success": False, "error": "Invalid package"}
            
            url = f"{self.base_url}/pay"
            payload = {
                "serviceID": provider,
                "billersCode": smartcard_number,
                "variation_code": package_code,
                "amount": package["amount"],
                "phone": "08012345678",  # Required field
                "request_id": reference
            }
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers) as response:
                    result = await response.json()
                    
                    if response.status == 200 and result.get("code") == "000":
                        return {
                            "success": True,
                            "provider_reference": result.get("requestId"),
                            "transaction_id": result.get("transactionId"),
                            "package_name": package["name"],
                            "duration": package["duration"],
                            "message": f"{package['name']} subscription activated for {smartcard_number}"
                        }
                    else:
                        return {
                            "success": False,
                            "error": result.get("response_description", "Cable TV subscription failed")
                        }
                        
        except Exception as e:
            logger.error(f"Cable TV subscription failed: {e}")
            return {"success": False, "error": str(e)}

class BillPaymentService:
    """Comprehensive bill payment service"""
    
    def __init__(self):
        self.electricity_provider = ElectricityProvider()
        self.airtime_data_provider = AirtimeDataProvider()
        self.cable_tv_provider = CableTVProvider()
        
        # Load bill providers
        self.providers = self._load_providers()
    
    def _load_providers(self) -> Dict[str, BillProvider]:
        """Load available bill payment providers"""
        providers = {}
        
        # Electricity providers
        for code, info in self.electricity_provider.providers.items():
            providers[f"electricity_{code}"] = BillProvider(
                id=f"electricity_{code}",
                name=info["name"],
                category=BillCategory.ELECTRICITY,
                logo_url=f"https://cdn.neobank.ng/logos/{code}.png",
                is_active=True,
                min_amount=Decimal("100"),
                max_amount=Decimal("50000"),
                fee_percentage=Decimal("0.5"),
                fee_cap=Decimal("100"),
                processing_time="instant",
                description=f"Pay your {info['name']} electricity bills"
            )
        
        # Airtime providers
        for code, info in self.airtime_data_provider.networks.items():
            providers[f"airtime_{code}"] = BillProvider(
                id=f"airtime_{code}",
                name=f"{info['name']} Airtime",
                category=BillCategory.AIRTIME,
                logo_url=f"https://cdn.neobank.ng/logos/{code}.png",
                is_active=True,
                min_amount=Decimal("50"),
                max_amount=Decimal("10000"),
                fee_percentage=Decimal("0"),
                fee_cap=Decimal("0"),
                processing_time="instant",
                description=f"Buy {info['name']} airtime"
            )
            
            providers[f"data_{code}"] = BillProvider(
                id=f"data_{code}",
                name=f"{info['name']} Data",
                category=BillCategory.DATA,
                logo_url=f"https://cdn.neobank.ng/logos/{code}.png",
                is_active=True,
                min_amount=Decimal("100"),
                max_amount=Decimal("20000"),
                fee_percentage=Decimal("0"),
                fee_cap=Decimal("0"),
                processing_time="instant",
                description=f"Buy {info['name']} data bundles"
            )
        
        # Cable TV providers
        for code, info in self.cable_tv_provider.providers.items():
            providers[f"cable_{code}"] = BillProvider(
                id=f"cable_{code}",
                name=info["name"],
                category=BillCategory.CABLE_TV,
                logo_url=f"https://cdn.neobank.ng/logos/{code}.png",
                is_active=True,
                min_amount=Decimal("1000"),
                max_amount=Decimal("50000"),
                fee_percentage=Decimal("1.0"),
                fee_cap=Decimal("200"),
                processing_time="instant",
                description=f"Subscribe to {info['name']} packages"
            )
        
        return providers
    
    async def get_providers(self, category: Optional[BillCategory] = None) -> List[BillProvider]:
        """Get available bill payment providers"""
        providers = list(self.providers.values())
        
        if category:
            providers = [p for p in providers if p.category == category]
        
        return sorted(providers, key=lambda x: x.name)
    
    async def get_provider(self, provider_id: str) -> Optional[BillProvider]:
        """Get specific provider details"""
        return self.providers.get(provider_id)
    
    async def verify_customer(self, provider_id: str, customer_id: str) -> Dict[str, Any]:
        """Verify customer details for bill payment"""
        try:
            provider = self.providers.get(provider_id)
            if not provider:
                return {"valid": False, "error": "Provider not found"}
            
            if provider.category == BillCategory.ELECTRICITY:
                # Extract provider code from provider_id
                provider_code = provider_id.replace("electricity_", "")
                return await self.electricity_provider.verify_customer(provider_code, customer_id)
            
            elif provider.category == BillCategory.CABLE_TV:
                # Extract provider code from provider_id
                provider_code = provider_id.replace("cable_", "")
                return await self.cable_tv_provider.verify_smartcard(provider_code, customer_id)
            
            elif provider.category in [BillCategory.AIRTIME, BillCategory.DATA]:
                # For airtime/data, just validate phone number format
                if self._is_valid_phone_number(customer_id):
                    return {
                        "valid": True,
                        "customer_name": "Mobile Number",
                        "network": self._detect_network(customer_id)
                    }
                else:
                    return {"valid": False, "error": "Invalid phone number"}
            
            else:
                return {"valid": False, "error": "Customer verification not supported for this provider"}
                
        except Exception as e:
            logger.error(f"Customer verification failed: {e}")
            return {"valid": False, "error": str(e)}
    
    async def get_packages(self, provider_id: str) -> List[Dict[str, Any]]:
        """Get available packages/plans for a provider"""
        try:
            provider = self.providers.get(provider_id)
            if not provider:
                return []
            
            if provider.category == BillCategory.DATA:
                network = provider_id.replace("data_", "")
                return self.airtime_data_provider.data_plans.get(network, [])
            
            elif provider.category == BillCategory.CABLE_TV:
                provider_code = provider_id.replace("cable_", "")
                return self.cable_tv_provider.packages.get(provider_code, [])
            
            else:
                return []
                
        except Exception as e:
            logger.error(f"Failed to get packages: {e}")
            return []
    
    async def calculate_fee(self, provider_id: str, amount: Decimal) -> Decimal:
        """Calculate fee for bill payment"""
        provider = self.providers.get(provider_id)
        if not provider:
            return Decimal("0")
        
        fee = amount * (provider.fee_percentage / 100)
        return min(fee, provider.fee_cap)
    
    async def process_bill_payment(self, request: BillPaymentRequest) -> BillPaymentResult:
        """Process bill payment"""
        try:
            # Validate provider
            provider = self.providers.get(request.provider_id)
            if not provider:
                raise ValueError("Provider not found")
            
            if not provider.is_active:
                raise ValueError("Provider is currently unavailable")
            
            # Validate amount
            if request.amount < provider.min_amount or request.amount > provider.max_amount:
                raise ValueError(f"Amount must be between ₦{provider.min_amount} and ₦{provider.max_amount}")
            
            # Calculate fee
            fee = await self.calculate_fee(request.provider_id, request.amount)
            total_amount = request.amount + fee
            
            # Check account balance
            account_balance = await self._get_account_balance(request.account_id)
            if account_balance < total_amount:
                raise ValueError("Insufficient account balance")
            
            # Generate transaction reference
            reference = request.reference or f"BILL_{datetime.now().strftime('%Y%m%d%H%M%S')}_{request.user_id}"
            
            # Process payment based on category
            if provider.category == BillCategory.ELECTRICITY:
                result = await self._process_electricity_payment(request, provider, reference)
            elif provider.category == BillCategory.AIRTIME:
                result = await self._process_airtime_payment(request, provider, reference)
            elif provider.category == BillCategory.DATA:
                result = await self._process_data_payment(request, provider, reference)
            elif provider.category == BillCategory.CABLE_TV:
                result = await self._process_cable_tv_payment(request, provider, reference)
            else:
                raise ValueError("Payment category not supported")
            
            # Create transaction record
            transaction_id = await self._create_transaction_record(
                request, provider, result, fee, reference
            )
            
            # Update account balance
            await self._update_account_balance(request.account_id, -total_amount)
            
            # Send notification
            await self._send_payment_notification(request.user_id, provider, result, request.amount)
            
            return BillPaymentResult(
                transaction_id=transaction_id,
                reference=reference,
                status=PaymentStatus.COMPLETED if result.get("success") else PaymentStatus.FAILED,
                amount=request.amount,
                fee=fee,
                provider_reference=result.get("provider_reference"),
                token=result.get("token"),
                units=result.get("units"),
                message=result.get("message", "Payment processed successfully")
            )
            
        except Exception as e:
            logger.error(f"Bill payment processing failed: {e}")
            
            # Create failed transaction record
            transaction_id = await self._create_failed_transaction_record(request, str(e))
            
            return BillPaymentResult(
                transaction_id=transaction_id,
                reference=request.reference or f"FAILED_{datetime.now().timestamp()}",
                status=PaymentStatus.FAILED,
                amount=request.amount,
                fee=Decimal("0"),
                message=str(e)
            )
    
    async def get_transaction_history(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get user's bill payment transaction history"""
        try:
            async with get_db_session() as session:
                # Query transaction history from database
                # This would be implemented with actual database queries
                return [
                    {
                        "id": "TXN001",
                        "provider_name": "AEDC Electricity",
                        "customer_id": "12345678901",
                        "amount": 5000.0,
                        "fee": 25.0,
                        "status": "completed",
                        "reference": "BILL_20250107_001",
                        "created_at": "2025-01-07T10:30:00Z",
                        "token": "1234-5678-9012-3456",
                        "units": "45.5 kWh"
                    }
                ]
                
        except Exception as e:
            logger.error(f"Failed to get transaction history: {e}")
            return []
    
    async def get_transaction_status(self, transaction_id: str) -> Dict[str, Any]:
        """Get transaction status"""
        try:
            async with get_db_session() as session:
                # Query transaction status from database
                # This would be implemented with actual database queries
                return {
                    "transaction_id": transaction_id,
                    "status": "completed",
                    "amount": 5000.0,
                    "fee": 25.0,
                    "provider_reference": "PROV_REF_123",
                    "created_at": "2025-01-07T10:30:00Z",
                    "completed_at": "2025-01-07T10:30:15Z"
                }
                
        except Exception as e:
            logger.error(f"Failed to get transaction status: {e}")
            return {}
    
    # Helper methods
    
    async def _process_electricity_payment(self, request: BillPaymentRequest, 
                                         provider: BillProvider, reference: str) -> Dict[str, Any]:
        """Process electricity bill payment"""
        provider_code = request.provider_id.replace("electricity_", "")
        return await self.electricity_provider.purchase_electricity(
            provider_code, request.customer_id, request.amount, reference
        )
    
    async def _process_airtime_payment(self, request: BillPaymentRequest, 
                                     provider: BillProvider, reference: str) -> Dict[str, Any]:
        """Process airtime purchase"""
        network = request.provider_id.replace("airtime_", "")
        return await self.airtime_data_provider.purchase_airtime(
            network, request.customer_id, request.amount, reference
        )
    
    async def _process_data_payment(self, request: BillPaymentRequest, 
                                  provider: BillProvider, reference: str) -> Dict[str, Any]:
        """Process data bundle purchase"""
        network = request.provider_id.replace("data_", "")
        plan_code = request.metadata.get("plan_code") if request.metadata else None
        
        if not plan_code:
            return {"success": False, "error": "Data plan not specified"}
        
        return await self.airtime_data_provider.purchase_data(
            network, request.customer_id, plan_code, reference
        )
    
    async def _process_cable_tv_payment(self, request: BillPaymentRequest, 
                                      provider: BillProvider, reference: str) -> Dict[str, Any]:
        """Process cable TV subscription"""
        provider_code = request.provider_id.replace("cable_", "")
        package_code = request.metadata.get("package_code") if request.metadata else None
        
        if not package_code:
            return {"success": False, "error": "Package not specified"}
        
        return await self.cable_tv_provider.subscribe_cable_tv(
            provider_code, request.customer_id, package_code, reference
        )
    
    def _is_valid_phone_number(self, phone_number: str) -> bool:
        """Validate Nigerian phone number format"""
        # Remove any non-digit characters
        digits = ''.join(filter(str.isdigit, phone_number))
        
        # Check if it's a valid Nigerian number
        if len(digits) == 11 and digits.startswith('0'):
            return True
        elif len(digits) == 13 and digits.startswith('234'):
            return True
        elif len(digits) == 10 and digits[0] in ['7', '8', '9']:
            return True
        
        return False
    
    def _detect_network(self, phone_number: str) -> str:
        """Detect network from phone number"""
        digits = ''.join(filter(str.isdigit, phone_number))
        
        # Extract the significant digits
        if len(digits) == 11 and digits.startswith('0'):
            prefix = digits[1:4]
        elif len(digits) == 13 and digits.startswith('234'):
            prefix = digits[3:6]
        elif len(digits) == 10:
            prefix = digits[0:3]
        else:
            return "unknown"
        
        # Network prefixes
        mtn_prefixes = ['803', '806', '813', '816', '810', '814', '903', '906', '913', '916']
        glo_prefixes = ['805', '807', '815', '811', '905', '915']
        airtel_prefixes = ['802', '808', '812', '701', '708', '902', '907', '901', '904', '912']
        nine_mobile_prefixes = ['809', '817', '818', '909', '908']
        
        if prefix in mtn_prefixes:
            return "mtn"
        elif prefix in glo_prefixes:
            return "glo"
        elif prefix in airtel_prefixes:
            return "airtel"
        elif prefix in nine_mobile_prefixes:
            return "9mobile"
        else:
            return "unknown"
    
    async def _get_account_balance(self, account_id: str) -> Decimal:
        """Get account balance"""
        try:
            async with get_db_session() as session:
                # Query account balance from database
                # This would be implemented with actual database queries
                return Decimal("75000.00")  # Mock balance
        except Exception as e:
            logger.error(f"Failed to get account balance: {e}")
            return Decimal("0")
    
    async def _update_account_balance(self, account_id: str, amount: Decimal):
        """Update account balance"""
        try:
            async with get_db_session() as session:
                # Update account balance in database
                # This would be implemented with actual database operations
                pass
        except Exception as e:
            logger.error(f"Failed to update account balance: {e}")
    
    async def _create_transaction_record(self, request: BillPaymentRequest, 
                                       provider: BillProvider, result: Dict[str, Any], 
                                       fee: Decimal, reference: str) -> str:
        """Create transaction record in database"""
        try:
            async with get_db_session() as session:
                # Create transaction record in database
                # This would be implemented with actual database operations
                transaction_id = f"TXN_{datetime.now().strftime('%Y%m%d%H%M%S')}_{request.user_id}"
                return transaction_id
        except Exception as e:
            logger.error(f"Failed to create transaction record: {e}")
            return f"TXN_ERROR_{datetime.now().timestamp()}"
    
    async def _create_failed_transaction_record(self, request: BillPaymentRequest, error: str) -> str:
        """Create failed transaction record"""
        try:
            async with get_db_session() as session:
                # Create failed transaction record in database
                # This would be implemented with actual database operations
                transaction_id = f"TXN_FAILED_{datetime.now().strftime('%Y%m%d%H%M%S')}_{request.user_id}"
                return transaction_id
        except Exception as e:
            logger.error(f"Failed to create failed transaction record: {e}")
            return f"TXN_FAILED_ERROR_{datetime.now().timestamp()}"
    
    async def _send_payment_notification(self, user_id: str, provider: BillProvider, 
                                       result: Dict[str, Any], amount: Decimal):
        """Send payment notification to user"""
        try:
            notification_data = {
                "user_name": "User",  # Would get from database
                "provider_name": provider.name,
                "amount": str(amount),
                "status": "successful" if result.get("success") else "failed",
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "token": result.get("token", ""),
                "units": result.get("units", "")
            }
            
            await send_transaction_alert(user_id, notification_data)
            
        except Exception as e:
            logger.error(f"Failed to send payment notification: {e}")

# Global instance
bill_payment_service = BillPaymentService()
