"""
NeoBank Encryption Module
Provides envelope encryption with HashiCorp Vault integration for data at rest.
"""

from .service import (
    EncryptionService,
    EncryptedData,
    DataKey,
    get_default_service,
    encrypt,
    decrypt,
    encrypt_string,
    decrypt_string,
    generate_data_key,
    hash_data,
    deterministic_hash,
)

from .field_encryption import (
    EncryptedField,
    encrypt_pii,
    decrypt_pii,
    encrypt_kyc_data,
    decrypt_kyc_data,
)

__all__ = [
    "EncryptionService",
    "EncryptedData",
    "DataKey",
    "get_default_service",
    "encrypt",
    "decrypt",
    "encrypt_string",
    "decrypt_string",
    "generate_data_key",
    "hash_data",
    "deterministic_hash",
    "EncryptedField",
    "encrypt_pii",
    "decrypt_pii",
    "encrypt_kyc_data",
    "decrypt_kyc_data",
]
