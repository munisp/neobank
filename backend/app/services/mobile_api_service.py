"""
Mobile API Service for NeoBank Platform
Provides mobile-specific endpoints and optimizations for React Native and native mobile apps
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import asyncio
import json
from dataclasses import dataclass, asdict

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.models import User, Account, Transaction
from ..database.connection import get_db_session
from ..services.auth_service import get_current_user
from ..services.fraud_service import fraud_service
from ..services.enhanced_kyc_service import enhanced_kyc_service
from ..config.settings import settings

logger = logging.getLogger(__name__)

# Mobile-specific Pydantic models
class MobileLoginRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")
    device_id: str = Field(..., description="Unique device identifier")
    device_type: str = Field(..., description="Device type (ios/android)")
    push_token: Optional[str] = Field(None, description="Push notification token")

class MobileLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    user_id: str
    user_name: str
    kyc_status: str
    account_number: str
    balance: float
    device_registered: bool

class MobileDashboardData(BaseModel):
    user_name: str
    account_number: str
    balance: float
    recent_transactions: List[Dict[str, Any]]
    quick_actions: List[Dict[str, str]]
    notifications: List[Dict[str, Any]]
    kyc_status: str
    card_status: str

class MobileTransactionRequest(BaseModel):
    recipient_account: str = Field(..., description="Recipient account number")
    amount: float = Field(..., gt=0, description="Transaction amount")
    description: Optional[str] = Field(None, description="Transaction description")
    transaction_pin: str = Field(..., description="4-digit transaction PIN")
    device_id: str = Field(..., description="Device identifier for security")

class MobileKYCUpload(BaseModel):
    document_type: str = Field(..., description="Type of document")
    document_base64: str = Field(..., description="Base64 encoded document image")
    document_name: str = Field(..., description="Document filename")

class MobilePushNotification(BaseModel):
    user_id: str
    title: str
    body: str
    data: Optional[Dict[str, Any]] = None
    priority: str = "high"

@dataclass
class MobileDeviceInfo:
    device_id: str
    device_type: str  # ios/android
    app_version: str
    os_version: str
    push_token: Optional[str]
    last_active: datetime
    location: Optional[Dict[str, float]]  # lat, lng
    biometric_enabled: bool
    pin_enabled: bool

class MobileAPIService:
    """Service for mobile-specific API operations"""
    
    def __init__(self):
        self.router = APIRouter()
        self.setup_routes()
        self.active_devices: Dict[str, MobileDeviceInfo] = {}
        self.push_notifications: List[MobilePushNotification] = []
    
    def setup_routes(self):
        """Setup mobile-specific API routes"""
        
        @self.router.post("/login", response_model=MobileLoginResponse)
        async def mobile_login(
            request: MobileLoginRequest,
            db: AsyncSession = Depends(get_db_session)
        ):
            """Mobile-optimized login with device registration"""
            try:
                # Authenticate user (simplified - would use actual auth service)
                user = await self._authenticate_user(request.email, request.password, db)
                if not user:
                    raise HTTPException(status_code=401, detail="Invalid credentials")
                
                # Register device
                device_info = MobileDeviceInfo(
                    device_id=request.device_id,
                    device_type=request.device_type,
                    app_version="1.0.0",  # Would get from request headers
                    os_version="unknown",  # Would get from request headers
                    push_token=request.push_token,
                    last_active=datetime.now(),
                    location=None,
                    biometric_enabled=False,  # Would be set by user
                    pin_enabled=True
                )
                
                self.active_devices[request.device_id] = device_info
                
                # Get user account
                account = await self._get_user_account(user.id, db)
                
                # Generate tokens (simplified)
                access_token = f"mobile_token_{user.id}_{datetime.now().timestamp()}"
                refresh_token = f"refresh_token_{user.id}_{datetime.now().timestamp()}"
                
                return MobileLoginResponse(
                    access_token=access_token,
                    refresh_token=refresh_token,
                    user_id=str(user.id),
                    user_name=user.full_name,
                    kyc_status="verified",  # Would get actual KYC status
                    account_number=account.account_number if account else "",
                    balance=account.balance if account else 0.0,
                    device_registered=True
                )
                
            except Exception as e:
                logger.error(f"Mobile login error: {e}")
                raise HTTPException(status_code=500, detail="Login failed")
        
        @self.router.get("/dashboard", response_model=MobileDashboardData)
        async def mobile_dashboard(
            current_user: User = Depends(get_current_user),
            db: AsyncSession = Depends(get_db_session)
        ):
            """Mobile-optimized dashboard data"""
            try:
                # Get user account
                account = await self._get_user_account(current_user.id, db)
                
                # Get recent transactions
                recent_transactions = await self._get_recent_transactions(current_user.id, db, limit=5)
                
                # Get notifications
                notifications = await self._get_user_notifications(current_user.id)
                
                # Quick actions for mobile
                quick_actions = [
                    {"id": "transfer", "title": "Transfer Money", "icon": "send"},
                    {"id": "pay_bills", "title": "Pay Bills", "icon": "receipt"},
                    {"id": "airtime", "title": "Buy Airtime", "icon": "phone"},
                    {"id": "qr_pay", "title": "QR Pay", "icon": "qr-code"}
                ]
                
                return MobileDashboardData(
                    user_name=current_user.full_name,
                    account_number=account.account_number if account else "",
                    balance=account.balance if account else 0.0,
                    recent_transactions=recent_transactions,
                    quick_actions=quick_actions,
                    notifications=notifications,
                    kyc_status="verified",  # Would get actual status
                    card_status="active"
                )
                
            except Exception as e:
                logger.error(f"Mobile dashboard error: {e}")
                raise HTTPException(status_code=500, detail="Dashboard data unavailable")
        
        @self.router.post("/transfer")
        async def mobile_transfer(
            request: MobileTransactionRequest,
            current_user: User = Depends(get_current_user),
            db: AsyncSession = Depends(get_db_session),
            background_tasks: BackgroundTasks = BackgroundTasks()
        ):
            """Mobile-optimized money transfer"""
            try:
                # Verify transaction PIN (simplified)
                if not await self._verify_transaction_pin(current_user.id, request.transaction_pin):
                    raise HTTPException(status_code=401, detail="Invalid transaction PIN")
                
                # Verify device
                if request.device_id not in self.active_devices:
                    raise HTTPException(status_code=401, detail="Device not registered")
                
                # Get user account
                sender_account = await self._get_user_account(current_user.id, db)
                if not sender_account or sender_account.balance < request.amount:
                    raise HTTPException(status_code=400, detail="Insufficient funds")
                
                # Fraud check
                fraud_result = await fraud_service.analyze_transaction({
                    'user_id': current_user.id,
                    'amount': request.amount,
                    'recipient_account': request.recipient_account,
                    'device_id': request.device_id,
                    'timestamp': datetime.now().isoformat()
                })
                
                if fraud_result.risk_score > 0.8:
                    raise HTTPException(status_code=403, detail="Transaction blocked for security reasons")
                
                # Process transfer (simplified)
                transaction_id = await self._process_transfer(
                    sender_account.account_number,
                    request.recipient_account,
                    request.amount,
                    request.description or "Mobile transfer",
                    db
                )
                
                # Send push notification
                background_tasks.add_task(
                    self._send_push_notification,
                    current_user.id,
                    "Transfer Successful",
                    f"₦{request.amount:,.2f} sent to {request.recipient_account}",
                    {"transaction_id": transaction_id}
                )
                
                return {
                    "success": True,
                    "transaction_id": transaction_id,
                    "message": "Transfer completed successfully",
                    "new_balance": sender_account.balance - request.amount
                }
                
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Mobile transfer error: {e}")
                raise HTTPException(status_code=500, detail="Transfer failed")
        
        @self.router.post("/kyc/upload")
        async def mobile_kyc_upload(
            request: MobileKYCUpload,
            current_user: User = Depends(get_current_user),
            background_tasks: BackgroundTasks = BackgroundTasks()
        ):
            """Mobile KYC document upload"""
            try:
                # Decode base64 document
                import base64
                document_data = base64.b64decode(request.document_base64)
                
                # Save document temporarily
                temp_path = f"/tmp/{current_user.id}_{request.document_name}"
                with open(temp_path, 'wb') as f:
                    f.write(document_data)
                
                # Process with KYC service
                background_tasks.add_task(
                    self._process_kyc_document,
                    current_user.id,
                    temp_path,
                    request.document_type
                )
                
                return {
                    "success": True,
                    "message": "Document uploaded successfully. Processing will complete shortly.",
                    "document_id": f"doc_{current_user.id}_{datetime.now().timestamp()}"
                }
                
            except Exception as e:
                logger.error(f"Mobile KYC upload error: {e}")
                raise HTTPException(status_code=500, detail="Document upload failed")
        
        @self.router.get("/notifications")
        async def mobile_notifications(
            current_user: User = Depends(get_current_user)
        ):
            """Get mobile notifications"""
            try:
                notifications = await self._get_user_notifications(current_user.id)
                return {"notifications": notifications}
                
            except Exception as e:
                logger.error(f"Mobile notifications error: {e}")
                raise HTTPException(status_code=500, detail="Failed to get notifications")
        
        @self.router.post("/device/register")
        async def register_device(
            device_info: Dict[str, Any],
            current_user: User = Depends(get_current_user)
        ):
            """Register mobile device for push notifications"""
            try:
                device = MobileDeviceInfo(
                    device_id=device_info["device_id"],
                    device_type=device_info["device_type"],
                    app_version=device_info.get("app_version", "1.0.0"),
                    os_version=device_info.get("os_version", "unknown"),
                    push_token=device_info.get("push_token"),
                    last_active=datetime.now(),
                    location=device_info.get("location"),
                    biometric_enabled=device_info.get("biometric_enabled", False),
                    pin_enabled=device_info.get("pin_enabled", True)
                )
                
                self.active_devices[device_info["device_id"]] = device
                
                return {"success": True, "message": "Device registered successfully"}
                
            except Exception as e:
                logger.error(f"Device registration error: {e}")
                raise HTTPException(status_code=500, detail="Device registration failed")
        
        @self.router.get("/quick-actions")
        async def mobile_quick_actions(
            current_user: User = Depends(get_current_user)
        ):
            """Get mobile quick actions"""
            actions = [
                {
                    "id": "transfer",
                    "title": "Transfer Money",
                    "icon": "send",
                    "description": "Send money to any bank account",
                    "enabled": True
                },
                {
                    "id": "pay_bills",
                    "title": "Pay Bills",
                    "icon": "receipt",
                    "description": "Pay utility bills and subscriptions",
                    "enabled": True
                },
                {
                    "id": "buy_airtime",
                    "title": "Buy Airtime",
                    "icon": "phone",
                    "description": "Top up your phone or others",
                    "enabled": True
                },
                {
                    "id": "qr_pay",
                    "title": "QR Pay",
                    "icon": "qr-code",
                    "description": "Scan QR code to pay merchants",
                    "enabled": True
                },
                {
                    "id": "request_money",
                    "title": "Request Money",
                    "icon": "download",
                    "description": "Request money from contacts",
                    "enabled": True
                },
                {
                    "id": "savings",
                    "title": "Savings",
                    "icon": "piggy-bank",
                    "description": "Manage your savings goals",
                    "enabled": True
                }
            ]
            
            return {"quick_actions": actions}
    
    async def _authenticate_user(self, email: str, password: str, db: AsyncSession) -> Optional[User]:
        """Authenticate user credentials"""
        # Simplified authentication - would use actual auth service
        # This is a mock implementation
        user = User(
            id=1,
            email=email,
            full_name="Demo User",
            phone_number="+2348012345678",
            is_active=True
        )
        return user
    
    async def _get_user_account(self, user_id: int, db: AsyncSession) -> Optional[Account]:
        """Get user's primary account"""
        # Mock account data
        account = Account(
            id=1,
            user_id=user_id,
            account_number="9998526911",
            balance=75000.0,
            account_type="savings",
            is_active=True
        )
        return account
    
    async def _get_recent_transactions(self, user_id: int, db: AsyncSession, limit: int = 5) -> List[Dict[str, Any]]:
        """Get user's recent transactions"""
        # Mock transaction data
        transactions = [
            {
                "id": "txn_001",
                "type": "debit",
                "amount": 25000.0,
                "description": "Transfer to John Doe",
                "date": "2025-01-07T10:30:00Z",
                "status": "completed",
                "recipient": "John Doe"
            },
            {
                "id": "txn_002",
                "type": "credit",
                "amount": 50000.0,
                "description": "Salary payment",
                "date": "2025-01-05T09:00:00Z",
                "status": "completed",
                "sender": "ABC Company Ltd"
            },
            {
                "id": "txn_003",
                "type": "debit",
                "amount": 5000.0,
                "description": "Airtime purchase",
                "date": "2025-01-04T15:45:00Z",
                "status": "completed",
                "recipient": "MTN Nigeria"
            }
        ]
        return transactions[:limit]
    
    async def _get_user_notifications(self, user_id: int) -> List[Dict[str, Any]]:
        """Get user notifications"""
        notifications = [
            {
                "id": "notif_001",
                "title": "Transaction Alert",
                "message": "₦25,000 debited from your account",
                "type": "transaction",
                "read": False,
                "timestamp": "2025-01-07T10:30:00Z"
            },
            {
                "id": "notif_002",
                "title": "KYC Update",
                "message": "Your KYC verification is complete",
                "type": "kyc",
                "read": True,
                "timestamp": "2025-01-06T14:20:00Z"
            }
        ]
        return notifications
    
    async def _verify_transaction_pin(self, user_id: int, pin: str) -> bool:
        """Verify user's transaction PIN"""
        # Mock PIN verification - would check against hashed PIN in database
        return pin == "1234"  # Demo PIN
    
    async def _process_transfer(self, sender_account: str, recipient_account: str, 
                              amount: float, description: str, db: AsyncSession) -> str:
        """Process money transfer"""
        # Mock transfer processing
        transaction_id = f"TXN{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # In production, this would:
        # 1. Debit sender account
        # 2. Credit recipient account
        # 3. Create transaction records
        # 4. Update balances
        
        logger.info(f"Transfer processed: {transaction_id}")
        return transaction_id
    
    async def _send_push_notification(self, user_id: int, title: str, body: str, data: Optional[Dict[str, Any]] = None):
        """Send push notification to user's devices"""
        try:
            # Find user's devices
            user_devices = [device for device in self.active_devices.values() 
                          if device.push_token]  # Would filter by user_id in production
            
            notification = MobilePushNotification(
                user_id=str(user_id),
                title=title,
                body=body,
                data=data or {}
            )
            
            # Store notification (would send to actual push service in production)
            self.push_notifications.append(notification)
            
            logger.info(f"Push notification sent to user {user_id}: {title}")
            
        except Exception as e:
            logger.error(f"Failed to send push notification: {e}")
    
    async def _process_kyc_document(self, user_id: int, document_path: str, document_type: str):
        """Process KYC document in background"""
        try:
            # Process with enhanced KYC service
            documents = [{
                'file_path': document_path,
                'document_type': document_type,
                'document_id': f"mobile_doc_{user_id}_{datetime.now().timestamp()}"
            }]
            
            # This would call the actual KYC service
            # kyc_result = await enhanced_kyc_service.process_kyc_documents(str(user_id), documents)
            
            # Send notification about processing result
            await self._send_push_notification(
                user_id,
                "KYC Document Processed",
                f"Your {document_type} has been processed successfully",
                {"document_type": document_type, "status": "processed"}
            )
            
        except Exception as e:
            logger.error(f"KYC document processing error: {e}")
            await self._send_push_notification(
                user_id,
                "KYC Processing Failed",
                f"There was an issue processing your {document_type}",
                {"document_type": document_type, "status": "failed"}
            )

# Global instance
mobile_api_service = MobileAPIService()

def get_mobile_router() -> APIRouter:
    """Get the mobile API router"""
    return mobile_api_service.router
