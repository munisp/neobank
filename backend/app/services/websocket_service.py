"""
WebSocket Service - Real-time Notifications

Provides real-time push notifications for:
- Transaction updates (sent, received, pending)
- Account balance changes
- Fraud alerts
- KYC status updates
- Loan status changes
- Investment trade executions
- Bill payment confirmations
"""

import asyncio
import json
import logging
from typing import Dict, Set, Optional, Any
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect
from dataclasses import dataclass, field
from enum import Enum
import structlog

logger = structlog.get_logger(__name__)


class NotificationType(str, Enum):
    TRANSACTION_SENT = "transaction_sent"
    TRANSACTION_RECEIVED = "transaction_received"
    TRANSACTION_PENDING = "transaction_pending"
    TRANSACTION_FAILED = "transaction_failed"
    BALANCE_UPDATE = "balance_update"
    FRAUD_ALERT = "fraud_alert"
    KYC_STATUS = "kyc_status"
    LOAN_STATUS = "loan_status"
    LOAN_PAYMENT_DUE = "loan_payment_due"
    INVESTMENT_EXECUTED = "investment_executed"
    INVESTMENT_PRICE_ALERT = "investment_price_alert"
    BILL_PAYMENT_SUCCESS = "bill_payment_success"
    BILL_PAYMENT_FAILED = "bill_payment_failed"
    SAVINGS_GOAL_REACHED = "savings_goal_reached"
    REWARD_EARNED = "reward_earned"
    SECURITY_ALERT = "security_alert"
    SYSTEM_ANNOUNCEMENT = "system_announcement"


@dataclass
class Notification:
    type: NotificationType
    title: str
    message: str
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.utcnow)
    priority: str = "normal"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type.value,
            "title": self.title,
            "message": self.message,
            "data": self.data,
            "timestamp": self.timestamp.isoformat(),
            "priority": self.priority
        }


class ConnectionManager:
    """Manages WebSocket connections for all users"""
    
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.user_subscriptions: Dict[str, Set[NotificationType]] = {}
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket, user_id: str):
        """Accept and register a new WebSocket connection"""
        await websocket.accept()
        
        async with self._lock:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = set()
            self.active_connections[user_id].add(websocket)
            
            if user_id not in self.user_subscriptions:
                self.user_subscriptions[user_id] = set(NotificationType)
        
        logger.info("websocket_connected", user_id=user_id, total_connections=len(self.active_connections[user_id]))
    
    async def disconnect(self, websocket: WebSocket, user_id: str):
        """Remove a WebSocket connection"""
        async with self._lock:
            if user_id in self.active_connections:
                self.active_connections[user_id].discard(websocket)
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
                    if user_id in self.user_subscriptions:
                        del self.user_subscriptions[user_id]
        
        logger.info("websocket_disconnected", user_id=user_id)
    
    async def subscribe(self, user_id: str, notification_types: Set[NotificationType]):
        """Subscribe user to specific notification types"""
        async with self._lock:
            if user_id in self.user_subscriptions:
                self.user_subscriptions[user_id].update(notification_types)
    
    async def unsubscribe(self, user_id: str, notification_types: Set[NotificationType]):
        """Unsubscribe user from specific notification types"""
        async with self._lock:
            if user_id in self.user_subscriptions:
                self.user_subscriptions[user_id] -= notification_types
    
    async def send_to_user(self, user_id: str, notification: Notification) -> bool:
        """Send notification to a specific user"""
        if user_id not in self.active_connections:
            logger.debug("user_not_connected", user_id=user_id)
            return False
        
        if user_id in self.user_subscriptions:
            if notification.type not in self.user_subscriptions[user_id]:
                logger.debug("user_not_subscribed", user_id=user_id, notification_type=notification.type)
                return False
        
        message = json.dumps(notification.to_dict())
        disconnected = set()
        
        for websocket in self.active_connections[user_id]:
            try:
                await websocket.send_text(message)
            except Exception as e:
                logger.error("websocket_send_failed", user_id=user_id, error=str(e))
                disconnected.add(websocket)
        
        for ws in disconnected:
            await self.disconnect(ws, user_id)
        
        logger.info("notification_sent", user_id=user_id, type=notification.type.value)
        return True
    
    async def broadcast(self, notification: Notification, user_ids: Optional[Set[str]] = None):
        """Broadcast notification to multiple users or all connected users"""
        targets = user_ids if user_ids else set(self.active_connections.keys())
        
        tasks = [self.send_to_user(user_id, notification) for user_id in targets]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        logger.info("notification_broadcast", type=notification.type.value, recipients=len(targets))
    
    def get_connected_users(self) -> Set[str]:
        """Get set of all connected user IDs"""
        return set(self.active_connections.keys())
    
    def get_connection_count(self, user_id: Optional[str] = None) -> int:
        """Get total connection count or for specific user"""
        if user_id:
            return len(self.active_connections.get(user_id, set()))
        return sum(len(conns) for conns in self.active_connections.values())


manager = ConnectionManager()


class NotificationService:
    """High-level notification service for sending typed notifications"""
    
    def __init__(self, connection_manager: ConnectionManager = None):
        self.manager = connection_manager or manager
    
    async def notify_transaction_sent(self, user_id: str, amount: float, currency: str, recipient: str, transaction_id: str):
        notification = Notification(
            type=NotificationType.TRANSACTION_SENT,
            title="Money Sent",
            message=f"You sent {currency} {amount:,.2f} to {recipient}",
            data={"transaction_id": transaction_id, "amount": amount, "currency": currency, "recipient": recipient},
            priority="high"
        )
        await self.manager.send_to_user(user_id, notification)
    
    async def notify_transaction_received(self, user_id: str, amount: float, currency: str, sender: str, transaction_id: str):
        notification = Notification(
            type=NotificationType.TRANSACTION_RECEIVED,
            title="Money Received",
            message=f"You received {currency} {amount:,.2f} from {sender}",
            data={"transaction_id": transaction_id, "amount": amount, "currency": currency, "sender": sender},
            priority="high"
        )
        await self.manager.send_to_user(user_id, notification)
    
    async def notify_balance_update(self, user_id: str, account_id: str, new_balance: float, currency: str):
        notification = Notification(
            type=NotificationType.BALANCE_UPDATE,
            title="Balance Updated",
            message=f"Your balance is now {currency} {new_balance:,.2f}",
            data={"account_id": account_id, "balance": new_balance, "currency": currency}
        )
        await self.manager.send_to_user(user_id, notification)
    
    async def notify_fraud_alert(self, user_id: str, transaction_id: str, fraud_type: str, risk_score: float):
        notification = Notification(
            type=NotificationType.FRAUD_ALERT,
            title="Security Alert",
            message=f"Suspicious activity detected on your account",
            data={"transaction_id": transaction_id, "fraud_type": fraud_type, "risk_score": risk_score},
            priority="critical"
        )
        await self.manager.send_to_user(user_id, notification)
    
    async def notify_kyc_status(self, user_id: str, status: str, tier: str, message: str = None):
        notification = Notification(
            type=NotificationType.KYC_STATUS,
            title="KYC Status Update",
            message=message or f"Your KYC verification is now {status}",
            data={"status": status, "tier": tier}
        )
        await self.manager.send_to_user(user_id, notification)
    
    async def notify_loan_status(self, user_id: str, loan_id: str, status: str, amount: float = None):
        messages = {
            "approved": "Your loan has been approved!",
            "disbursed": f"Your loan of {amount:,.2f} has been disbursed",
            "rejected": "Your loan application was not approved",
            "payment_received": "Your loan payment has been received"
        }
        notification = Notification(
            type=NotificationType.LOAN_STATUS,
            title="Loan Update",
            message=messages.get(status, f"Loan status: {status}"),
            data={"loan_id": loan_id, "status": status, "amount": amount},
            priority="high" if status in ["approved", "disbursed"] else "normal"
        )
        await self.manager.send_to_user(user_id, notification)
    
    async def notify_investment_executed(self, user_id: str, trade_id: str, symbol: str, trade_type: str, quantity: float, price: float):
        notification = Notification(
            type=NotificationType.INVESTMENT_EXECUTED,
            title=f"{trade_type.upper()} Order Executed",
            message=f"{trade_type.capitalize()} {quantity} {symbol} at {price:,.2f}",
            data={"trade_id": trade_id, "symbol": symbol, "type": trade_type, "quantity": quantity, "price": price},
            priority="high"
        )
        await self.manager.send_to_user(user_id, notification)
    
    async def notify_bill_payment(self, user_id: str, payment_id: str, provider: str, amount: float, status: str):
        notification = Notification(
            type=NotificationType.BILL_PAYMENT_SUCCESS if status == "success" else NotificationType.BILL_PAYMENT_FAILED,
            title="Bill Payment " + ("Successful" if status == "success" else "Failed"),
            message=f"Payment of {amount:,.2f} to {provider} {status}",
            data={"payment_id": payment_id, "provider": provider, "amount": amount, "status": status}
        )
        await self.manager.send_to_user(user_id, notification)
    
    async def notify_savings_goal_reached(self, user_id: str, vault_id: str, vault_name: str, target_amount: float):
        notification = Notification(
            type=NotificationType.SAVINGS_GOAL_REACHED,
            title="Savings Goal Reached!",
            message=f"Congratulations! You've reached your {vault_name} goal of {target_amount:,.2f}",
            data={"vault_id": vault_id, "vault_name": vault_name, "target_amount": target_amount},
            priority="high"
        )
        await self.manager.send_to_user(user_id, notification)
    
    async def notify_reward_earned(self, user_id: str, points: int, source: str, cashback: float = None):
        message = f"You earned {points} points"
        if cashback:
            message += f" and {cashback:,.2f} cashback"
        notification = Notification(
            type=NotificationType.REWARD_EARNED,
            title="Reward Earned",
            message=message,
            data={"points": points, "source": source, "cashback": cashback}
        )
        await self.manager.send_to_user(user_id, notification)
    
    async def notify_security_alert(self, user_id: str, alert_type: str, details: str, action_required: bool = False):
        notification = Notification(
            type=NotificationType.SECURITY_ALERT,
            title="Security Alert",
            message=details,
            data={"alert_type": alert_type, "action_required": action_required},
            priority="critical"
        )
        await self.manager.send_to_user(user_id, notification)


notification_service = NotificationService()


def get_notification_service() -> NotificationService:
    return notification_service


def get_connection_manager() -> ConnectionManager:
    return manager
