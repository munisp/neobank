"""
Secure QR Code Generation Service - Python

Features:
- QR code generation with encryption
- Digital signature signing
- Multiple QR code types (payment, transfer, merchant, p2p)
- AES-256-GCM encryption
- RSA-PSS digital signatures
- Replay attack prevention
- Expiration management
"""

import json
import base64
import time
import uuid
from typing import Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from enum import Enum

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend
import qrcode
from qrcode.image.pure import PyPNGImage
from io import BytesIO


class QRCodeType(str, Enum):
    """QR Code types"""
    PAYMENT = "payment"
    TRANSFER = "transfer"
    MERCHANT = "merchant"
    P2P = "p2p"


class SecureQRService:
    """Service for generating and verifying secure QR codes"""

    def __init__(
        self,
        private_key_pem: str,
        encryption_key: bytes,
        nonce_store,
        analytics_store
    ):
        """
        Initialize SecureQRService

        Args:
            private_key_pem: RSA private key in PEM format
            encryption_key: 32-byte key for AES-256-GCM
            nonce_store: Store for tracking used nonces
            analytics_store: Store for analytics tracking
        """
        self.private_key = serialization.load_pem_private_key(
            private_key_pem.encode(),
            password=None,
            backend=default_backend()
        )
        self.public_key = self.private_key.public_key()
        self.encryption_key = encryption_key
        self.nonce_store = nonce_store
        self.analytics_store = analytics_store
        self.aesgcm = AESGCM(encryption_key)

    def generate_payment_qr(
        self,
        amount: float,
        currency: str,
        recipient: str,
        description: Optional[str] = None,
        expiry_minutes: int = 5,
        encrypt: bool = True,
        size: int = 10
    ) -> Tuple[bytes, str]:
        """
        Generate a secure payment QR code

        Args:
            amount: Payment amount
            currency: Currency code (e.g., "USD")
            recipient: Recipient identifier
            description: Optional payment description
            expiry_minutes: QR code expiry time in minutes
            encrypt: Whether to encrypt the payload
            size: QR code size (1-40, default 10)

        Returns:
            Tuple of (QR code image bytes, JSON data string)
        """
        # Validate payload
        if amount <= 0:
            raise ValueError("Amount must be greater than 0")
        if not currency:
            raise ValueError("Currency is required")
        if not recipient:
            raise ValueError("Recipient is required")

        # Create payload
        payload = {
            "amount": amount,
            "currency": currency,
            "recipient": recipient,
        }
        if description:
            payload["description"] = description

        # Generate QR code
        return self._create_secure_qr(
            qr_type=QRCodeType.PAYMENT,
            payload=payload,
            expiry_minutes=expiry_minutes,
            encrypt=encrypt,
            size=size
        )

    def generate_transfer_qr(
        self,
        account_number: str,
        amount: float,
        currency: str,
        reference: Optional[str] = None,
        expiry_minutes: int = 5,
        encrypt: bool = True,
        size: int = 10
    ) -> Tuple[bytes, str]:
        """Generate a secure transfer QR code"""
        if amount <= 0:
            raise ValueError("Amount must be greater than 0")
        if not currency:
            raise ValueError("Currency is required")
        if not account_number:
            raise ValueError("Account number is required")

        payload = {
            "accountNumber": account_number,
            "amount": amount,
            "currency": currency,
        }
        if reference:
            payload["reference"] = reference

        return self._create_secure_qr(
            qr_type=QRCodeType.TRANSFER,
            payload=payload,
            expiry_minutes=expiry_minutes,
            encrypt=encrypt,
            size=size
        )

    def generate_merchant_qr(
        self,
        merchant_id: str,
        amount: float,
        currency: str,
        order_id: Optional[str] = None,
        description: Optional[str] = None,
        expiry_minutes: int = 5,
        encrypt: bool = True,
        size: int = 10
    ) -> Tuple[bytes, str]:
        """Generate a secure merchant QR code"""
        if amount <= 0:
            raise ValueError("Amount must be greater than 0")
        if not currency:
            raise ValueError("Currency is required")
        if not merchant_id:
            raise ValueError("Merchant ID is required")

        payload = {
            "merchantId": merchant_id,
            "amount": amount,
            "currency": currency,
        }
        if order_id:
            payload["orderId"] = order_id
        if description:
            payload["description"] = description

        return self._create_secure_qr(
            qr_type=QRCodeType.MERCHANT,
            payload=payload,
            expiry_minutes=expiry_minutes,
            encrypt=encrypt,
            size=size
        )

    def generate_p2p_qr(
        self,
        user_id: str,
        amount: float,
        currency: str,
        message: Optional[str] = None,
        expiry_minutes: int = 5,
        encrypt: bool = True,
        size: int = 10
    ) -> Tuple[bytes, str]:
        """Generate a secure P2P QR code"""
        if amount <= 0:
            raise ValueError("Amount must be greater than 0")
        if not currency:
            raise ValueError("Currency is required")
        if not user_id:
            raise ValueError("User ID is required")

        payload = {
            "userId": user_id,
            "amount": amount,
            "currency": currency,
        }
        if message:
            payload["message"] = message

        return self._create_secure_qr(
            qr_type=QRCodeType.P2P,
            payload=payload,
            expiry_minutes=expiry_minutes,
            encrypt=encrypt,
            size=size
        )

    def _create_secure_qr(
        self,
        qr_type: QRCodeType,
        payload: Dict[str, Any],
        expiry_minutes: int,
        encrypt: bool,
        size: int
    ) -> Tuple[bytes, str]:
        """
        Create a secure QR code with encryption and signing

        Args:
            qr_type: Type of QR code
            payload: QR code payload data
            expiry_minutes: Expiry time in minutes
            encrypt: Whether to encrypt the payload
            size: QR code size

        Returns:
            Tuple of (QR code image bytes, JSON data string)
        """
        # Generate nonce
        nonce = str(uuid.uuid4())

        # Set timestamps
        now = datetime.utcnow()
        timestamp = int(now.timestamp() * 1000)
        expires_at = int((now + timedelta(minutes=expiry_minutes)).timestamp() * 1000)

        # Encrypt payload if required
        if encrypt:
            encrypted_payload = self._encrypt_payload(payload, nonce)
            final_payload = encrypted_payload
        else:
            final_payload = payload

        # Create QR data structure
        qr_data = {
            "type": qr_type.value,
            "version": "2.0",
            "payload": final_payload,
            "timestamp": timestamp,
            "expiresAt": expires_at,
            "nonce": nonce,
            "encrypted": encrypt,
        }

        # Sign the data
        signature = self._sign_qr_data(qr_data, payload)
        qr_data["signature"] = signature

        # Generate QR code image
        qr_image = self._generate_qr_image(qr_data, size)

        # Track analytics
        try:
            self.analytics_store.track_qr_generation(qr_type.value, encrypt)
        except Exception as e:
            # Don't fail QR generation if analytics fails
            print(f"Analytics tracking failed: {e}")

        # Return QR image and JSON data
        json_data = json.dumps(qr_data, separators=(',', ':'))
        return qr_image, json_data

    def _encrypt_payload(self, payload: Dict[str, Any], nonce: str) -> str:
        """
        Encrypt payload using AES-256-GCM

        Args:
            payload: Payload to encrypt
            nonce: Nonce for additional authenticated data

        Returns:
            Base64-encoded encrypted payload
        """
        # Convert payload to JSON
        payload_json = json.dumps(payload, separators=(',', ':')).encode('utf-8')

        # Generate random nonce for GCM (96 bits / 12 bytes)
        gcm_nonce = AESGCM.generate_nonce(12)

        # Encrypt with nonce as additional authenticated data
        ciphertext = self.aesgcm.encrypt(
            gcm_nonce,
            payload_json,
            nonce.encode('utf-8')
        )

        # Combine nonce + ciphertext
        encrypted_data = gcm_nonce + ciphertext

        # Return base64-encoded
        return base64.b64encode(encrypted_data).decode('utf-8')

    def _decrypt_payload(self, encrypted_payload: str, nonce: str) -> Dict[str, Any]:
        """
        Decrypt payload using AES-256-GCM

        Args:
            encrypted_payload: Base64-encoded encrypted payload
            nonce: Nonce for additional authenticated data

        Returns:
            Decrypted payload dictionary
        """
        # Decode base64
        encrypted_data = base64.b64decode(encrypted_payload)

        # Extract nonce and ciphertext
        gcm_nonce = encrypted_data[:12]
        ciphertext = encrypted_data[12:]

        # Decrypt
        plaintext = self.aesgcm.decrypt(
            gcm_nonce,
            ciphertext,
            nonce.encode('utf-8')
        )

        # Parse JSON
        return json.loads(plaintext.decode('utf-8'))

    def _sign_qr_data(self, qr_data: Dict[str, Any], original_payload: Dict[str, Any]) -> str:
        """
        Sign QR data using RSA-PSS

        Args:
            qr_data: QR data structure (without signature)
            original_payload: Original unencrypted payload

        Returns:
            Base64-encoded signature
        """
        # Create data to sign (without signature field)
        data_to_sign = {
            "type": qr_data["type"],
            "version": qr_data["version"],
            "payload": original_payload,
            "timestamp": qr_data["timestamp"],
            "expiresAt": qr_data["expiresAt"],
            "nonce": qr_data["nonce"],
        }

        # Convert to JSON bytes
        data_bytes = json.dumps(data_to_sign, separators=(',', ':')).encode('utf-8')

        # Sign using RSA-PSS
        signature = self.private_key.sign(
            data_bytes,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH
            ),
            hashes.SHA256()
        )

        # Return base64-encoded signature
        return base64.b64encode(signature).decode('utf-8')

    def _verify_signature(
        self,
        qr_data: Dict[str, Any],
        signature: str,
        original_payload: Dict[str, Any]
    ) -> bool:
        """
        Verify QR data signature

        Args:
            qr_data: QR data structure
            signature: Base64-encoded signature
            original_payload: Original unencrypted payload

        Returns:
            True if signature is valid, False otherwise
        """
        try:
            # Reconstruct data that was signed
            data_to_verify = {
                "type": qr_data["type"],
                "version": qr_data["version"],
                "payload": original_payload,
                "timestamp": qr_data["timestamp"],
                "expiresAt": qr_data["expiresAt"],
                "nonce": qr_data["nonce"],
            }

            data_bytes = json.dumps(data_to_verify, separators=(',', ':')).encode('utf-8')
            signature_bytes = base64.b64decode(signature)

            # Verify signature
            self.public_key.verify(
                signature_bytes,
                data_bytes,
                padding.PSS(
                    mgf=padding.MGF1(hashes.SHA256()),
                    salt_length=padding.PSS.MAX_LENGTH
                ),
                hashes.SHA256()
            )

            return True
        except Exception as e:
            print(f"Signature verification failed: {e}")
            return False

    def _generate_qr_image(self, qr_data: Dict[str, Any], size: int) -> bytes:
        """
        Generate QR code image

        Args:
            qr_data: QR data structure
            size: QR code size (1-40)

        Returns:
            PNG image bytes
        """
        # Convert to JSON string
        json_data = json.dumps(qr_data, separators=(',', ':'))

        # Create QR code
        qr = qrcode.QRCode(
            version=size,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr.add_data(json_data)
        qr.make(fit=True)

        # Generate image
        img = qr.make_image(fill_color="black", back_color="white")

        # Convert to bytes
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        return buffer.getvalue()

    def verify_qr_code(self, qr_json: str) -> Dict[str, Any]:
        """
        Verify a scanned QR code

        Args:
            qr_json: JSON string from scanned QR code

        Returns:
            Verified QR data with decrypted payload

        Raises:
            ValueError: If QR code is invalid, expired, or already used
        """
        # Parse JSON
        try:
            qr_data = json.loads(qr_json)
        except json.JSONDecodeError:
            raise ValueError("Invalid QR code format")

        # Validate structure
        required_fields = ["type", "version", "payload", "signature", "timestamp", "expiresAt", "nonce", "encrypted"]
        for field in required_fields:
            if field not in qr_data:
                raise ValueError(f"Missing required field: {field}")

        # Check expiration
        now = int(datetime.utcnow().timestamp() * 1000)
        if now > qr_data["expiresAt"]:
            expired_minutes = (now - qr_data["expiresAt"]) // 60000
            raise ValueError(f"QR code expired {expired_minutes} minutes ago")

        # Check nonce (replay attack prevention)
        if self.nonce_store.is_nonce_used(qr_data["nonce"]):
            raise ValueError("QR code has already been used")

        # Decrypt payload if encrypted
        if qr_data["encrypted"]:
            try:
                decrypted_payload = self._decrypt_payload(qr_data["payload"], qr_data["nonce"])
            except Exception as e:
                raise ValueError(f"Failed to decrypt payload: {e}")
        else:
            decrypted_payload = qr_data["payload"]

        # Verify signature
        if not self._verify_signature(qr_data, qr_data["signature"], decrypted_payload):
            raise ValueError("Invalid QR code signature")

        # Mark nonce as used
        expires_at = datetime.fromtimestamp(qr_data["expiresAt"] / 1000)
        self.nonce_store.mark_nonce_used(qr_data["nonce"], expires_at)

        # Return verified data with decrypted payload
        return {
            **qr_data,
            "payload": decrypted_payload
        }

    def get_public_key_pem(self) -> str:
        """
        Get public key in PEM format

        Returns:
            Public key PEM string
        """
        pem = self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        return pem.decode('utf-8')


# Example usage and helper functions

def generate_rsa_keypair() -> Tuple[str, str]:
    """
    Generate RSA key pair for QR code signing

    Returns:
        Tuple of (private_key_pem, public_key_pem)
    """
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode('utf-8')

    public_key = private_key.public_key()
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode('utf-8')

    return private_pem, public_pem


def generate_encryption_key() -> bytes:
    """
    Generate 256-bit encryption key for AES-256-GCM

    Returns:
        32-byte encryption key
    """
    return AESGCM.generate_key(bit_length=256)


# Mock stores for testing

class MockNonceStore:
    """Mock nonce store for testing"""

    def __init__(self):
        self.used_nonces = set()

    def is_nonce_used(self, nonce: str) -> bool:
        return nonce in self.used_nonces

    def mark_nonce_used(self, nonce: str, expires_at: datetime):
        self.used_nonces.add(nonce)


class MockAnalyticsStore:
    """Mock analytics store for testing"""

    def __init__(self):
        self.events = []

    def track_qr_generation(self, qr_type: str, encrypted: bool):
        self.events.append({
            "type": qr_type,
            "encrypted": encrypted,
            "timestamp": datetime.utcnow()
        })

