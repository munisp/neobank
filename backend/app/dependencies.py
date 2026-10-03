"""Shared FastAPI dependency providers."""

from app.services.secure_qr_service import (
    MockAnalyticsStore,
    MockNonceStore,
    SecureQRService,
    generate_encryption_key,
    generate_rsa_keypair,
)

_qr_service = None


def get_qr_service() -> SecureQRService:
    """Return a process-wide SecureQRService instance."""
    global _qr_service
    if _qr_service is None:
        private_key_pem, _ = generate_rsa_keypair()
        _qr_service = SecureQRService(
            private_key_pem=private_key_pem,
            encryption_key=generate_encryption_key(),
            nonce_store=MockNonceStore(),
            analytics_store=MockAnalyticsStore(),
        )
    return _qr_service
