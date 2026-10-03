"""
Comprehensive Notification and Communication Service for NeoBank Platform
Handles SMS, Email, Push Notifications, and In-App Messaging
"""

import logging
import asyncio
import json
from typing import Dict, Any, List, Optional, Union
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum
import aiohttp
import smtplib
from email.mime.text import MimeText
from email.mime.multipart import MimeMultipart
from email.mime.base import MimeBase
from email import encoders
import jinja2

from database.models import User, Notification
from database.connection import get_db_session
from config.settings import settings

logger = logging.getLogger(__name__)

class NotificationType(Enum):
    """Notification types"""
    TRANSACTION_ALERT = "transaction_alert"
    SECURITY_ALERT = "security_alert"
    KYC_UPDATE = "kyc_update"
    ACCOUNT_UPDATE = "account_update"
    PROMOTIONAL = "promotional"
    SYSTEM_MAINTENANCE = "system_maintenance"
    FRAUD_ALERT = "fraud_alert"
    PAYMENT_REMINDER = "payment_reminder"
    WELCOME = "welcome"
    PASSWORD_RESET = "password_reset"

class NotificationChannel(Enum):
    """Notification delivery channels"""
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"
    IN_APP = "in_app"
    WHATSAPP = "whatsapp"

class NotificationPriority(Enum):
    """Notification priority levels"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"

@dataclass
class NotificationTemplate:
    """Notification template structure"""
    id: str
    name: str
    type: NotificationType
    channels: List[NotificationChannel]
    priority: NotificationPriority
    subject_template: str
    body_template: str
    variables: List[str]
    is_active: bool = True

@dataclass
class NotificationRequest:
    """Notification request structure"""
    user_id: str
    template_id: str
    channels: List[NotificationChannel]
    variables: Dict[str, Any]
    priority: NotificationPriority = NotificationPriority.NORMAL
    scheduled_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

@dataclass
class NotificationResult:
    """Notification delivery result"""
    notification_id: str
    user_id: str
    channel: NotificationChannel
    status: str  # sent, failed, pending, delivered, read
    sent_at: Optional[datetime]
    delivered_at: Optional[datetime]
    error_message: Optional[str] = None

class SMSProvider:
    """SMS service provider interface"""
    
    def __init__(self, provider: str = "termii"):
        self.provider = provider
        self.api_key = settings.SMS_API_KEY
        self.sender_id = settings.SMS_SENDER_ID or "NeoBank"
        self.base_url = self._get_provider_url()
    
    def _get_provider_url(self) -> str:
        """Get provider API URL"""
        providers = {
            "termii": "https://api.ng.termii.com/api/sms/send",
            "twilio": "https://api.twilio.com/2010-04-01/Accounts",
            "nexmo": "https://rest.nexmo.com/sms/json"
        }
        return providers.get(self.provider, providers["termii"])
    
    async def send_sms(self, phone_number: str, message: str) -> Dict[str, Any]:
        """Send SMS message"""
        try:
            if self.provider == "termii":
                return await self._send_termii_sms(phone_number, message)
            elif self.provider == "twilio":
                return await self._send_twilio_sms(phone_number, message)
            else:
                return await self._send_termii_sms(phone_number, message)  # Default
                
        except Exception as e:
            logger.error(f"SMS sending failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def _send_termii_sms(self, phone_number: str, message: str) -> Dict[str, Any]:
        """Send SMS via Termii (Nigerian SMS provider)"""
        payload = {
            "to": phone_number,
            "from": self.sender_id,
            "sms": message,
            "type": "plain",
            "api_key": self.api_key,
            "channel": "generic"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(self.base_url, json=payload) as response:
                result = await response.json()
                
                if response.status == 200 and result.get("message") == "Successfully Sent":
                    return {
                        "success": True,
                        "message_id": result.get("message_id"),
                        "cost": result.get("cost")
                    }
                else:
                    return {
                        "success": False,
                        "error": result.get("message", "SMS sending failed")
                    }
    
    async def _send_twilio_sms(self, phone_number: str, message: str) -> Dict[str, Any]:
        """Send SMS via Twilio"""
        # Twilio implementation would go here
        # For now, return mock success
        return {
            "success": True,
            "message_id": f"twilio_{datetime.now().timestamp()}",
            "cost": 0.05
        }

class EmailProvider:
    """Email service provider"""
    
    def __init__(self):
        self.smtp_server = settings.SMTP_SERVER or "smtp.gmail.com"
        self.smtp_port = settings.SMTP_PORT or 587
        self.smtp_username = settings.SMTP_USERNAME
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.FROM_EMAIL or "noreply@neobank.ng"
        self.from_name = settings.FROM_NAME or "NeoBank"
        
        # Initialize Jinja2 template environment
        self.template_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader("templates/email"),
            autoescape=jinja2.select_autoescape(['html', 'xml'])
        )
    
    async def send_email(self, to_email: str, subject: str, body: str, 
                        is_html: bool = True, attachments: List[str] = None) -> Dict[str, Any]:
        """Send email message"""
        try:
            msg = MimeMultipart('alternative')
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject
            
            # Add body
            if is_html:
                msg.attach(MimeText(body, 'html'))
            else:
                msg.attach(MimeText(body, 'plain'))
            
            # Add attachments
            if attachments:
                for file_path in attachments:
                    try:
                        with open(file_path, "rb") as attachment:
                            part = MimeBase('application', 'octet-stream')
                            part.set_payload(attachment.read())
                            encoders.encode_base64(part)
                            part.add_header(
                                'Content-Disposition',
                                f'attachment; filename= {file_path.split("/")[-1]}'
                            )
                            msg.attach(part)
                    except Exception as e:
                        logger.warning(f"Failed to attach file {file_path}: {e}")
            
            # Send email
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_username, self.smtp_password)
                server.send_message(msg)
            
            return {
                "success": True,
                "message_id": f"email_{datetime.now().timestamp()}"
            }
            
        except Exception as e:
            logger.error(f"Email sending failed: {e}")
            return {"success": False, "error": str(e)}
    
    def render_template(self, template_name: str, variables: Dict[str, Any]) -> str:
        """Render email template with variables"""
        try:
            template = self.template_env.get_template(f"{template_name}.html")
            return template.render(**variables)
        except Exception as e:
            logger.error(f"Template rendering failed: {e}")
            return f"<p>Error rendering template: {e}</p>"

class PushNotificationProvider:
    """Push notification service provider"""
    
    def __init__(self):
        self.fcm_server_key = settings.FCM_SERVER_KEY
        self.apns_key_id = settings.APNS_KEY_ID
        self.apns_team_id = settings.APNS_TEAM_ID
        self.fcm_url = "https://fcm.googleapis.com/fcm/send"
    
    async def send_push_notification(self, device_tokens: List[str], title: str, 
                                   body: str, data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Send push notification to devices"""
        try:
            # Send to Android devices (FCM)
            android_tokens = [token for token in device_tokens if token.startswith("fcm_")]
            android_result = await self._send_fcm_notification(android_tokens, title, body, data)
            
            # Send to iOS devices (APNS)
            ios_tokens = [token for token in device_tokens if token.startswith("apns_")]
            ios_result = await self._send_apns_notification(ios_tokens, title, body, data)
            
            return {
                "success": True,
                "android_result": android_result,
                "ios_result": ios_result,
                "total_sent": len(device_tokens)
            }
            
        except Exception as e:
            logger.error(f"Push notification sending failed: {e}")
            return {"success": False, "error": str(e)}
    
    async def _send_fcm_notification(self, tokens: List[str], title: str, 
                                   body: str, data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Send FCM notification to Android devices"""
        if not tokens:
            return {"success": True, "sent": 0}
        
        payload = {
            "registration_ids": tokens,
            "notification": {
                "title": title,
                "body": body,
                "icon": "ic_notification",
                "sound": "default"
            },
            "data": data or {}
        }
        
        headers = {
            "Authorization": f"key={self.fcm_server_key}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(self.fcm_url, json=payload, headers=headers) as response:
                result = await response.json()
                
                return {
                    "success": result.get("success", 0) > 0,
                    "sent": result.get("success", 0),
                    "failed": result.get("failure", 0)
                }
    
    async def _send_apns_notification(self, tokens: List[str], title: str, 
                                    body: str, data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Send APNS notification to iOS devices"""
        if not tokens:
            return {"success": True, "sent": 0}
        
        # APNS implementation would require proper certificates and JWT tokens
        # For now, return mock success
        return {
            "success": True,
            "sent": len(tokens),
            "failed": 0
        }

class WhatsAppProvider:
    """WhatsApp Business API provider"""
    
    def __init__(self):
        self.api_token = settings.WHATSAPP_API_TOKEN
        self.phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
        self.base_url = f"https://graph.facebook.com/v18.0/{self.phone_number_id}/messages"
    
    async def send_whatsapp_message(self, phone_number: str, message: str, 
                                  template_name: str = None) -> Dict[str, Any]:
        """Send WhatsApp message"""
        try:
            headers = {
                "Authorization": f"Bearer {self.api_token}",
                "Content-Type": "application/json"
            }
            
            if template_name:
                # Send template message
                payload = {
                    "messaging_product": "whatsapp",
                    "to": phone_number,
                    "type": "template",
                    "template": {
                        "name": template_name,
                        "language": {"code": "en"}
                    }
                }
            else:
                # Send text message
                payload = {
                    "messaging_product": "whatsapp",
                    "to": phone_number,
                    "type": "text",
                    "text": {"body": message}
                }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(self.base_url, json=payload, headers=headers) as response:
                    result = await response.json()
                    
                    if response.status == 200:
                        return {
                            "success": True,
                            "message_id": result.get("messages", [{}])[0].get("id")
                        }
                    else:
                        return {
                            "success": False,
                            "error": result.get("error", {}).get("message", "WhatsApp sending failed")
                        }
                        
        except Exception as e:
            logger.error(f"WhatsApp sending failed: {e}")
            return {"success": False, "error": str(e)}

class NotificationService:
    """Comprehensive notification service"""
    
    def __init__(self):
        self.sms_provider = SMSProvider()
        self.email_provider = EmailProvider()
        self.push_provider = PushNotificationProvider()
        self.whatsapp_provider = WhatsAppProvider()
        
        # Load notification templates
        self.templates = self._load_templates()
        
        # Notification queue for batch processing
        self.notification_queue: List[NotificationRequest] = []
        self.batch_size = 100
        self.batch_interval = 60  # seconds
    
    def _load_templates(self) -> Dict[str, NotificationTemplate]:
        """Load notification templates"""
        templates = {
            "transaction_alert": NotificationTemplate(
                id="transaction_alert",
                name="Transaction Alert",
                type=NotificationType.TRANSACTION_ALERT,
                channels=[NotificationChannel.SMS, NotificationChannel.PUSH, NotificationChannel.IN_APP],
                priority=NotificationPriority.HIGH,
                subject_template="Transaction Alert - ₦{{amount}}",
                body_template="Dear {{user_name}}, ₦{{amount}} has been {{transaction_type}} your account {{account_number}}. Balance: ₦{{balance}}. Time: {{timestamp}}. If this wasn't you, contact us immediately.",
                variables=["user_name", "amount", "transaction_type", "account_number", "balance", "timestamp"]
            ),
            "security_alert": NotificationTemplate(
                id="security_alert",
                name="Security Alert",
                type=NotificationType.SECURITY_ALERT,
                channels=[NotificationChannel.EMAIL, NotificationChannel.SMS, NotificationChannel.PUSH],
                priority=NotificationPriority.URGENT,
                subject_template="Security Alert - {{alert_type}}",
                body_template="Security Alert: {{alert_description}}. If this wasn't you, please contact us immediately at support@neobank.ng or call +234-800-NEOBANK.",
                variables=["alert_type", "alert_description", "timestamp", "ip_address"]
            ),
            "kyc_update": NotificationTemplate(
                id="kyc_update",
                name="KYC Verification Update",
                type=NotificationType.KYC_UPDATE,
                channels=[NotificationChannel.EMAIL, NotificationChannel.IN_APP],
                priority=NotificationPriority.NORMAL,
                subject_template="KYC Verification {{status}}",
                body_template="Dear {{user_name}}, your KYC verification has been {{status}}. {{additional_info}}",
                variables=["user_name", "status", "additional_info", "next_steps"]
            ),
            "welcome": NotificationTemplate(
                id="welcome",
                name="Welcome Message",
                type=NotificationType.WELCOME,
                channels=[NotificationChannel.EMAIL, NotificationChannel.SMS],
                priority=NotificationPriority.NORMAL,
                subject_template="Welcome to NeoBank, {{user_name}}!",
                body_template="Welcome to NeoBank! Your account {{account_number}} is ready. Complete your KYC verification to unlock all features.",
                variables=["user_name", "account_number"]
            ),
            "fraud_alert": NotificationTemplate(
                id="fraud_alert",
                name="Fraud Alert",
                type=NotificationType.FRAUD_ALERT,
                channels=[NotificationChannel.SMS, NotificationChannel.PUSH, NotificationChannel.EMAIL],
                priority=NotificationPriority.URGENT,
                subject_template="Fraud Alert - Suspicious Activity",
                body_template="FRAUD ALERT: Suspicious transaction of ₦{{amount}} detected on your account. Transaction blocked. Contact us if legitimate.",
                variables=["amount", "transaction_details", "timestamp"]
            ),
            "password_reset": NotificationTemplate(
                id="password_reset",
                name="Password Reset",
                type=NotificationType.PASSWORD_RESET,
                channels=[NotificationChannel.EMAIL, NotificationChannel.SMS],
                priority=NotificationPriority.HIGH,
                subject_template="Password Reset Request",
                body_template="Your password reset code is: {{reset_code}}. This code expires in 10 minutes. If you didn't request this, please contact us.",
                variables=["reset_code", "expiry_time"]
            )
        }
        
        return templates
    
    async def send_notification(self, request: NotificationRequest) -> List[NotificationResult]:
        """Send notification through specified channels"""
        try:
            template = self.templates.get(request.template_id)
            if not template:
                raise ValueError(f"Template {request.template_id} not found")
            
            # Get user information
            user = await self._get_user(request.user_id)
            if not user:
                raise ValueError(f"User {request.user_id} not found")
            
            # Render message content
            subject = self._render_template(template.subject_template, request.variables)
            body = self._render_template(template.body_template, request.variables)
            
            results = []
            
            # Send through each requested channel
            for channel in request.channels:
                if channel in template.channels:
                    result = await self._send_through_channel(
                        channel, user, subject, body, request
                    )
                    results.append(result)
                else:
                    logger.warning(f"Channel {channel} not supported for template {request.template_id}")
            
            # Store notification in database
            await self._store_notification(request, results)
            
            return results
            
        except Exception as e:
            logger.error(f"Notification sending failed: {e}")
            raise
    
    async def send_bulk_notifications(self, requests: List[NotificationRequest]) -> List[List[NotificationResult]]:
        """Send multiple notifications in batch"""
        try:
            # Process in batches to avoid overwhelming external services
            results = []
            
            for i in range(0, len(requests), self.batch_size):
                batch = requests[i:i + self.batch_size]
                batch_results = await asyncio.gather(
                    *[self.send_notification(req) for req in batch],
                    return_exceptions=True
                )
                results.extend(batch_results)
                
                # Add delay between batches
                if i + self.batch_size < len(requests):
                    await asyncio.sleep(1)
            
            return results
            
        except Exception as e:
            logger.error(f"Bulk notification sending failed: {e}")
            raise
    
    async def schedule_notification(self, request: NotificationRequest) -> str:
        """Schedule notification for future delivery"""
        try:
            # Add to queue with scheduled time
            self.notification_queue.append(request)
            
            # Store in database for persistence
            notification_id = f"scheduled_{datetime.now().timestamp()}"
            await self._store_scheduled_notification(notification_id, request)
            
            return notification_id
            
        except Exception as e:
            logger.error(f"Notification scheduling failed: {e}")
            raise
    
    async def process_scheduled_notifications(self):
        """Process scheduled notifications (called by background task)"""
        try:
            now = datetime.now()
            due_notifications = []
            
            # Find notifications due for sending
            for notification in self.notification_queue[:]:
                if notification.scheduled_at and notification.scheduled_at <= now:
                    due_notifications.append(notification)
                    self.notification_queue.remove(notification)
            
            # Send due notifications
            if due_notifications:
                await self.send_bulk_notifications(due_notifications)
                logger.info(f"Processed {len(due_notifications)} scheduled notifications")
            
        except Exception as e:
            logger.error(f"Scheduled notification processing failed: {e}")
    
    async def get_notification_status(self, notification_id: str) -> Dict[str, Any]:
        """Get notification delivery status"""
        try:
            async with get_db_session() as session:
                # Query notification status from database
                # This would be implemented with actual database queries
                return {
                    "notification_id": notification_id,
                    "status": "delivered",
                    "sent_at": datetime.now().isoformat(),
                    "channels": ["sms", "push"]
                }
                
        except Exception as e:
            logger.error(f"Failed to get notification status: {e}")
            raise
    
    async def get_user_notifications(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get user's notification history"""
        try:
            async with get_db_session() as session:
                # Query user notifications from database
                # This would be implemented with actual database queries
                return [
                    {
                        "id": "notif_001",
                        "type": "transaction_alert",
                        "title": "Transaction Alert",
                        "message": "₦25,000 debited from your account",
                        "read": False,
                        "created_at": "2025-01-07T10:30:00Z"
                    }
                ]
                
        except Exception as e:
            logger.error(f"Failed to get user notifications: {e}")
            raise
    
    async def mark_notification_read(self, notification_id: str, user_id: str) -> bool:
        """Mark notification as read"""
        try:
            async with get_db_session() as session:
                # Update notification read status in database
                # This would be implemented with actual database queries
                return True
                
        except Exception as e:
            logger.error(f"Failed to mark notification as read: {e}")
            return False
    
    # Helper methods
    
    async def _send_through_channel(self, channel: NotificationChannel, user: Dict[str, Any], 
                                  subject: str, body: str, request: NotificationRequest) -> NotificationResult:
        """Send notification through specific channel"""
        notification_id = f"{channel.value}_{datetime.now().timestamp()}"
        
        try:
            if channel == NotificationChannel.SMS:
                result = await self.sms_provider.send_sms(user["phone_number"], body)
            elif channel == NotificationChannel.EMAIL:
                result = await self.email_provider.send_email(user["email"], subject, body)
            elif channel == NotificationChannel.PUSH:
                device_tokens = await self._get_user_device_tokens(user["id"])
                result = await self.push_provider.send_push_notification(
                    device_tokens, subject, body, request.variables
                )
            elif channel == NotificationChannel.WHATSAPP:
                result = await self.whatsapp_provider.send_whatsapp_message(
                    user["phone_number"], body
                )
            elif channel == NotificationChannel.IN_APP:
                result = await self._store_in_app_notification(user["id"], subject, body)
            else:
                result = {"success": False, "error": f"Unsupported channel: {channel}"}
            
            status = "sent" if result.get("success") else "failed"
            error_message = result.get("error") if not result.get("success") else None
            
            return NotificationResult(
                notification_id=notification_id,
                user_id=request.user_id,
                channel=channel,
                status=status,
                sent_at=datetime.now() if result.get("success") else None,
                delivered_at=None,  # Would be updated by delivery callbacks
                error_message=error_message
            )
            
        except Exception as e:
            logger.error(f"Channel {channel} sending failed: {e}")
            return NotificationResult(
                notification_id=notification_id,
                user_id=request.user_id,
                channel=channel,
                status="failed",
                sent_at=None,
                delivered_at=None,
                error_message=str(e)
            )
    
    def _render_template(self, template: str, variables: Dict[str, Any]) -> str:
        """Render template with variables"""
        try:
            # Simple template rendering (could use Jinja2 for more complex templates)
            rendered = template
            for key, value in variables.items():
                rendered = rendered.replace(f"{{{{{key}}}}}", str(value))
            return rendered
        except Exception as e:
            logger.error(f"Template rendering failed: {e}")
            return template
    
    async def _get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user information"""
        try:
            async with get_db_session() as session:
                # Query user from database
                # This would be implemented with actual database queries
                return {
                    "id": user_id,
                    "email": "user@example.com",
                    "phone_number": "+2348012345678",
                    "full_name": "John Doe"
                }
        except Exception as e:
            logger.error(f"Failed to get user {user_id}: {e}")
            return None
    
    async def _get_user_device_tokens(self, user_id: str) -> List[str]:
        """Get user's device tokens for push notifications"""
        try:
            async with get_db_session() as session:
                # Query device tokens from database
                # This would be implemented with actual database queries
                return ["fcm_token_123", "apns_token_456"]
        except Exception as e:
            logger.error(f"Failed to get device tokens for user {user_id}: {e}")
            return []
    
    async def _store_notification(self, request: NotificationRequest, results: List[NotificationResult]):
        """Store notification and results in database"""
        try:
            async with get_db_session() as session:
                # Store notification record in database
                # This would be implemented with actual database operations
                pass
        except Exception as e:
            logger.error(f"Failed to store notification: {e}")
    
    async def _store_scheduled_notification(self, notification_id: str, request: NotificationRequest):
        """Store scheduled notification in database"""
        try:
            async with get_db_session() as session:
                # Store scheduled notification in database
                # This would be implemented with actual database operations
                pass
        except Exception as e:
            logger.error(f"Failed to store scheduled notification: {e}")
    
    async def _store_in_app_notification(self, user_id: str, title: str, body: str) -> Dict[str, Any]:
        """Store in-app notification"""
        try:
            async with get_db_session() as session:
                # Store in-app notification in database
                # This would be implemented with actual database operations
                return {"success": True, "notification_id": f"in_app_{datetime.now().timestamp()}"}
        except Exception as e:
            logger.error(f"Failed to store in-app notification: {e}")
            return {"success": False, "error": str(e)}

# Global instance
notification_service = NotificationService()

# Convenience functions for common notifications

async def send_transaction_alert(user_id: str, transaction_data: Dict[str, Any]):
    """Send transaction alert notification"""
    request = NotificationRequest(
        user_id=user_id,
        template_id="transaction_alert",
        channels=[NotificationChannel.SMS, NotificationChannel.PUSH],
        variables=transaction_data,
        priority=NotificationPriority.HIGH
    )
    return await notification_service.send_notification(request)

async def send_security_alert(user_id: str, alert_data: Dict[str, Any]):
    """Send security alert notification"""
    request = NotificationRequest(
        user_id=user_id,
        template_id="security_alert",
        channels=[NotificationChannel.EMAIL, NotificationChannel.SMS, NotificationChannel.PUSH],
        variables=alert_data,
        priority=NotificationPriority.URGENT
    )
    return await notification_service.send_notification(request)

async def send_kyc_update(user_id: str, kyc_data: Dict[str, Any]):
    """Send KYC update notification"""
    request = NotificationRequest(
        user_id=user_id,
        template_id="kyc_update",
        channels=[NotificationChannel.EMAIL, NotificationChannel.IN_APP],
        variables=kyc_data,
        priority=NotificationPriority.NORMAL
    )
    return await notification_service.send_notification(request)

async def send_welcome_message(user_id: str, user_data: Dict[str, Any]):
    """Send welcome message to new user"""
    request = NotificationRequest(
        user_id=user_id,
        template_id="welcome",
        channels=[NotificationChannel.EMAIL, NotificationChannel.SMS],
        variables=user_data,
        priority=NotificationPriority.NORMAL
    )
    return await notification_service.send_notification(request)

async def send_fraud_alert(user_id: str, fraud_data: Dict[str, Any]):
    """Send fraud alert notification"""
    request = NotificationRequest(
        user_id=user_id,
        template_id="fraud_alert",
        channels=[NotificationChannel.SMS, NotificationChannel.PUSH, NotificationChannel.EMAIL],
        variables=fraud_data,
        priority=NotificationPriority.URGENT
    )
    return await notification_service.send_notification(request)
