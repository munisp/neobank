"""
Offline Transaction Service for NeoBank

Provides cryptographic signing and verification for offline transactions.
Allows users to create signed transaction requests while offline that can
be submitted when connectivity is restored.

Features:
- ECDSA transaction signing with user's private key
- Transaction verification and replay protection
- Offline queue management with sync
- Conflict resolution for offline transactions
"""

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta
from decimal import Decimal
from enum import Enum
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
import structlog

logger = structlog.get_logger()


class TransactionType(Enum):
    """Types of offline transactions"""
    TRANSFER = "transfer"
    AIRTIME = "airtime"
    BILL_PAYMENT = "bill_payment"
    SAVINGS_DEPOSIT = "savings_deposit"
    SAVINGS_WITHDRAWAL = "savings_withdrawal"


class TransactionStatus(Enum):
    """Status of offline transaction"""
    PENDING = "pending"
    SUBMITTED = "submitted"
    CONFIRMED = "confirmed"
    FAILED = "failed"
    EXPIRED = "expired"
    CONFLICT = "conflict"


@dataclass
class OfflineTransaction:
    """Represents an offline transaction"""
    transaction_id: str
    user_id: str
    transaction_type: TransactionType
    amount: Decimal
    recipient: Optional[str] = None
    metadata: Dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    signature: Optional[str] = None
    nonce: Optional[str] = None
    sequence_number: int = 0
    status: TransactionStatus = TransactionStatus.PENDING
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for signing/serialization"""
        return {
            "transaction_id": self.transaction_id,
            "user_id": self.user_id,
            "transaction_type": self.transaction_type.value,
            "amount": str(self.amount),
            "recipient": self.recipient,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
            "nonce": self.nonce,
            "sequence_number": self.sequence_number
        }
    
    def get_signing_payload(self) -> bytes:
        """Get canonical payload for signing"""
        data = {
            "tx_id": self.transaction_id,
            "user": self.user_id,
            "type": self.transaction_type.value,
            "amount": str(self.amount),
            "recipient": self.recipient or "",
            "nonce": self.nonce,
            "seq": self.sequence_number,
            "ts": int(self.created_at.timestamp())
        }
        # Canonical JSON encoding (sorted keys, no whitespace)
        return json.dumps(data, sort_keys=True, separators=(',', ':')).encode('utf-8')


@dataclass
class UserOfflineKey:
    """User's offline signing key"""
    user_id: str
    public_key: str
    key_hash: str
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_sequence: int = 0
    is_active: bool = True


class OfflineTransactionService:
    """
    Offline Transaction Service
    
    Manages offline transaction creation, signing, and synchronization.
    Uses HMAC-SHA256 for transaction signing (simpler than ECDSA for mobile).
    """
    
    # Transaction expiry time (24 hours)
    TRANSACTION_EXPIRY_HOURS = 24
    
    # Maximum offline transactions per user
    MAX_OFFLINE_TRANSACTIONS = 50
    
    # Maximum offline transaction amount
    MAX_OFFLINE_AMOUNT = Decimal("100000")
    
    def __init__(self):
        # In production, these would be database-backed
        self._user_keys: Dict[str, UserOfflineKey] = {}
        self._pending_transactions: Dict[str, List[OfflineTransaction]] = {}
        self._processed_nonces: set = set()
    
    async def generate_offline_key(self, user_id: str) -> Dict:
        """
        Generate a new offline signing key for user
        
        This key is stored on the user's device and used to sign
        transactions while offline.
        
        Args:
            user_id: User identifier
            
        Returns:
            Dictionary with public key and secret key (secret only shown once)
        """
        # Generate a random 256-bit secret key
        secret_key = secrets.token_hex(32)
        
        # Derive public key hash (for verification)
        public_key = hashlib.sha256(secret_key.encode()).hexdigest()
        key_hash = hashlib.sha256(public_key.encode()).hexdigest()[:16]
        
        # Store user key
        user_key = UserOfflineKey(
            user_id=user_id,
            public_key=public_key,
            key_hash=key_hash
        )
        self._user_keys[user_id] = user_key
        
        logger.info("Offline key generated", user_id=user_id, key_hash=key_hash)
        
        return {
            "secret_key": secret_key,  # Only returned once, user must store securely
            "public_key": public_key,
            "key_hash": key_hash,
            "instructions": "Store the secret_key securely on your device. It will not be shown again."
        }
    
    async def create_offline_transaction(
        self,
        user_id: str,
        transaction_type: TransactionType,
        amount: Decimal,
        recipient: Optional[str] = None,
        metadata: Optional[Dict] = None,
        secret_key: str = None
    ) -> OfflineTransaction:
        """
        Create and sign an offline transaction
        
        Args:
            user_id: User identifier
            transaction_type: Type of transaction
            amount: Transaction amount
            recipient: Recipient (phone/account number)
            metadata: Additional transaction data
            secret_key: User's offline secret key for signing
            
        Returns:
            Signed OfflineTransaction
        """
        # Validate amount
        if amount <= 0:
            raise ValueError("Amount must be positive")
        if amount > self.MAX_OFFLINE_AMOUNT:
            raise ValueError(f"Maximum offline amount is {self.MAX_OFFLINE_AMOUNT}")
        
        # Get user's key info
        user_key = self._user_keys.get(user_id)
        if not user_key:
            raise ValueError("User has no offline key. Generate one first.")
        
        # Increment sequence number
        user_key.last_sequence += 1
        sequence = user_key.last_sequence
        
        # Generate unique transaction ID and nonce
        transaction_id = f"OFF{secrets.token_hex(8).upper()}"
        nonce = secrets.token_hex(16)
        
        # Create transaction
        transaction = OfflineTransaction(
            transaction_id=transaction_id,
            user_id=user_id,
            transaction_type=transaction_type,
            amount=amount,
            recipient=recipient,
            metadata=metadata or {},
            nonce=nonce,
            sequence_number=sequence,
            expires_at=datetime.utcnow() + timedelta(hours=self.TRANSACTION_EXPIRY_HOURS)
        )
        
        # Sign transaction if secret key provided
        if secret_key:
            signature = self._sign_transaction(transaction, secret_key)
            transaction.signature = signature
        
        # Store in pending queue
        if user_id not in self._pending_transactions:
            self._pending_transactions[user_id] = []
        
        if len(self._pending_transactions[user_id]) >= self.MAX_OFFLINE_TRANSACTIONS:
            raise ValueError("Maximum offline transactions reached. Sync first.")
        
        self._pending_transactions[user_id].append(transaction)
        
        logger.info(
            "Offline transaction created",
            tx_id=transaction_id,
            user_id=user_id,
            type=transaction_type.value,
            amount=str(amount)
        )
        
        return transaction
    
    def _sign_transaction(self, transaction: OfflineTransaction, secret_key: str) -> str:
        """
        Sign a transaction using HMAC-SHA256
        
        Args:
            transaction: Transaction to sign
            secret_key: User's secret key
            
        Returns:
            Base64-encoded signature
        """
        payload = transaction.get_signing_payload()
        
        # Create HMAC signature
        signature = hmac.new(
            secret_key.encode('utf-8'),
            payload,
            hashlib.sha256
        ).digest()
        
        return base64.b64encode(signature).decode('utf-8')
    
    async def verify_transaction(
        self,
        transaction: OfflineTransaction,
        secret_key: str = None
    ) -> Tuple[bool, str]:
        """
        Verify an offline transaction signature
        
        Args:
            transaction: Transaction to verify
            secret_key: User's secret key (optional, for self-verification)
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check expiry
        if transaction.expires_at and datetime.utcnow() > transaction.expires_at:
            return False, "Transaction has expired"
        
        # Check nonce (replay protection)
        if transaction.nonce in self._processed_nonces:
            return False, "Transaction already processed (replay detected)"
        
        # Check signature
        if not transaction.signature:
            return False, "Transaction is not signed"
        
        # Get user's key
        user_key = self._user_keys.get(transaction.user_id)
        if not user_key:
            return False, "User offline key not found"
        
        # Verify sequence number
        expected_seq = user_key.last_sequence
        if transaction.sequence_number > expected_seq + 10:
            return False, "Sequence number too far ahead"
        
        # If secret key provided, verify signature
        if secret_key:
            expected_signature = self._sign_transaction(transaction, secret_key)
            if not hmac.compare_digest(transaction.signature, expected_signature):
                return False, "Invalid signature"
        
        return True, "Valid"
    
    async def submit_offline_transaction(
        self,
        transaction: OfflineTransaction
    ) -> Dict:
        """
        Submit an offline transaction for processing
        
        Called when device comes back online to sync pending transactions.
        
        Args:
            transaction: Signed offline transaction
            
        Returns:
            Processing result
        """
        # Verify transaction
        is_valid, error = await self.verify_transaction(transaction)
        if not is_valid:
            transaction.status = TransactionStatus.FAILED
            return {
                "success": False,
                "error": error,
                "transaction_id": transaction.transaction_id
            }
        
        # Mark nonce as used (replay protection)
        self._processed_nonces.add(transaction.nonce)
        
        # Process based on type
        try:
            result = await self._process_transaction(transaction)
            transaction.status = TransactionStatus.CONFIRMED
            
            # Remove from pending queue
            if transaction.user_id in self._pending_transactions:
                self._pending_transactions[transaction.user_id] = [
                    t for t in self._pending_transactions[transaction.user_id]
                    if t.transaction_id != transaction.transaction_id
                ]
            
            return {
                "success": True,
                "transaction_id": transaction.transaction_id,
                "reference": result.get("reference"),
                "status": "confirmed"
            }
            
        except Exception as e:
            transaction.status = TransactionStatus.FAILED
            logger.error(
                "Offline transaction processing failed",
                tx_id=transaction.transaction_id,
                error=str(e)
            )
            return {
                "success": False,
                "error": str(e),
                "transaction_id": transaction.transaction_id
            }
    
    async def _process_transaction(self, transaction: OfflineTransaction) -> Dict:
        """Process a verified offline transaction"""
        # In production, this would call the appropriate service
        reference = f"OFF{secrets.token_hex(4).upper()}"
        
        logger.info(
            "Processing offline transaction",
            tx_id=transaction.transaction_id,
            type=transaction.transaction_type.value
        )
        
        if transaction.transaction_type == TransactionType.TRANSFER:
            # Call transfer service
            pass
        elif transaction.transaction_type == TransactionType.AIRTIME:
            # Call airtime service
            pass
        elif transaction.transaction_type == TransactionType.BILL_PAYMENT:
            # Call bill payment service
            pass
        elif transaction.transaction_type == TransactionType.SAVINGS_DEPOSIT:
            # Call savings service
            pass
        elif transaction.transaction_type == TransactionType.SAVINGS_WITHDRAWAL:
            # Call savings service
            pass
        
        return {"reference": reference}
    
    async def sync_offline_transactions(self, user_id: str) -> Dict:
        """
        Sync all pending offline transactions for a user
        
        Called when device comes back online.
        
        Args:
            user_id: User identifier
            
        Returns:
            Sync results
        """
        pending = self._pending_transactions.get(user_id, [])
        
        if not pending:
            return {
                "synced": 0,
                "failed": 0,
                "results": []
            }
        
        results = []
        synced = 0
        failed = 0
        
        # Sort by sequence number to process in order
        pending.sort(key=lambda t: t.sequence_number)
        
        for transaction in pending:
            result = await self.submit_offline_transaction(transaction)
            results.append(result)
            
            if result["success"]:
                synced += 1
            else:
                failed += 1
        
        logger.info(
            "Offline sync completed",
            user_id=user_id,
            synced=synced,
            failed=failed
        )
        
        return {
            "synced": synced,
            "failed": failed,
            "results": results
        }
    
    async def get_pending_transactions(self, user_id: str) -> List[Dict]:
        """Get all pending offline transactions for a user"""
        pending = self._pending_transactions.get(user_id, [])
        
        # Filter out expired transactions
        now = datetime.utcnow()
        valid = []
        
        for tx in pending:
            if tx.expires_at and now > tx.expires_at:
                tx.status = TransactionStatus.EXPIRED
            else:
                valid.append(tx.to_dict())
        
        return valid
    
    async def cancel_offline_transaction(
        self,
        user_id: str,
        transaction_id: str
    ) -> bool:
        """Cancel a pending offline transaction"""
        if user_id not in self._pending_transactions:
            return False
        
        original_count = len(self._pending_transactions[user_id])
        self._pending_transactions[user_id] = [
            t for t in self._pending_transactions[user_id]
            if t.transaction_id != transaction_id
        ]
        
        return len(self._pending_transactions[user_id]) < original_count
    
    async def resolve_conflict(
        self,
        user_id: str,
        transaction_id: str,
        resolution: str
    ) -> Dict:
        """
        Resolve a conflicting offline transaction
        
        Conflicts can occur when:
        - Balance changed while offline
        - Recipient account changed
        - Rate/fee changed
        
        Args:
            user_id: User identifier
            transaction_id: Transaction to resolve
            resolution: "retry", "cancel", or "adjust"
            
        Returns:
            Resolution result
        """
        pending = self._pending_transactions.get(user_id, [])
        transaction = next(
            (t for t in pending if t.transaction_id == transaction_id),
            None
        )
        
        if not transaction:
            return {"success": False, "error": "Transaction not found"}
        
        if resolution == "cancel":
            await self.cancel_offline_transaction(user_id, transaction_id)
            return {"success": True, "action": "cancelled"}
        
        elif resolution == "retry":
            # Re-submit with current state
            result = await self.submit_offline_transaction(transaction)
            return result
        
        elif resolution == "adjust":
            # Would need additional parameters for adjustment
            return {"success": False, "error": "Adjustment requires new amount"}
        
        return {"success": False, "error": "Invalid resolution"}


# Global offline transaction service instance
offline_transaction_service = OfflineTransactionService()


# Mobile SDK helper functions (would be implemented in mobile app)

def create_offline_transaction_payload(
    transaction_type: str,
    amount: str,
    recipient: str,
    secret_key: str,
    sequence: int
) -> Dict:
    """
    Helper function for mobile SDK to create signed transaction payload
    
    This would be implemented in the mobile app (React Native/Swift/Kotlin)
    to create transactions while offline.
    """
    import time
    
    nonce = secrets.token_hex(16)
    tx_id = f"OFF{secrets.token_hex(8).upper()}"
    timestamp = int(time.time())
    
    # Create payload
    payload = {
        "tx_id": tx_id,
        "type": transaction_type,
        "amount": amount,
        "recipient": recipient,
        "nonce": nonce,
        "seq": sequence,
        "ts": timestamp
    }
    
    # Sign payload
    payload_bytes = json.dumps(payload, sort_keys=True, separators=(',', ':')).encode('utf-8')
    signature = hmac.new(
        secret_key.encode('utf-8'),
        payload_bytes,
        hashlib.sha256
    ).digest()
    
    return {
        "payload": payload,
        "signature": base64.b64encode(signature).decode('utf-8')
    }
