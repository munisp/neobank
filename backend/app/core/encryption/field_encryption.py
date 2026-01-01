"""
NeoBank Field-Level Encryption
Provides encryption for PII and sensitive data fields with search token support.
"""

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Type, TypeVar

from .service import (
    EncryptionService,
    get_default_service,
    encrypt_string,
    decrypt_string,
    deterministic_hash,
)


T = TypeVar("T")


@dataclass
class EncryptedField:
    encrypted_value: str
    search_token: Optional[str] = None
    field_type: str = "string"
    key_name: str = "neobank-pii"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ev": self.encrypted_value,
            "st": self.search_token,
            "ft": self.field_type,
            "kn": self.key_name,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "EncryptedField":
        return cls(
            encrypted_value=data.get("ev", ""),
            search_token=data.get("st"),
            field_type=data.get("ft", "string"),
            key_name=data.get("kn", "neobank-pii"),
        )

    def decrypt(self, service: Optional[EncryptionService] = None) -> str:
        svc = service or get_default_service()
        return svc.decrypt_string(self.encrypted_value)


class PIIFieldEncryptor:
    PII_KEY = "neobank-pii"
    KYC_KEY = "neobank-kyc"
    CREDENTIALS_KEY = "neobank-credentials"
    TRANSACTIONS_KEY = "neobank-transactions"

    PII_FIELDS = {
        "email",
        "phone",
        "phone_number",
        "mobile",
        "address",
        "street_address",
        "city",
        "postal_code",
        "zip_code",
        "ssn",
        "social_security_number",
        "national_id",
        "passport_number",
        "drivers_license",
        "date_of_birth",
        "dob",
        "full_name",
        "first_name",
        "last_name",
        "middle_name",
        "mother_maiden_name",
        "tax_id",
        "tin",
        "bank_account",
        "account_number",
        "routing_number",
        "iban",
        "swift_code",
        "bvn",
        "nin",
    }

    KYC_FIELDS = {
        "id_document_number",
        "id_document_image",
        "selfie_image",
        "proof_of_address",
        "utility_bill",
        "bank_statement",
        "employment_letter",
        "incorporation_certificate",
        "shareholder_register",
        "director_list",
        "beneficial_owner",
        "source_of_funds",
        "source_of_wealth",
    }

    SEARCHABLE_FIELDS = {
        "email",
        "phone",
        "phone_number",
        "national_id",
        "passport_number",
        "bvn",
        "nin",
        "account_number",
    }

    def __init__(self, service: Optional[EncryptionService] = None):
        self.service = service or get_default_service()

    def encrypt_field(
        self,
        value: str,
        field_name: str,
        generate_search_token: bool = True,
    ) -> EncryptedField:
        key_name = self._get_key_for_field(field_name)

        encrypted_value = self.service.encrypt_string(value, key_name)

        search_token = None
        if generate_search_token and field_name.lower() in self.SEARCHABLE_FIELDS:
            search_token = self.service.deterministic_hash(
                value.lower().encode(),
                f"search:{field_name}",
            )

        return EncryptedField(
            encrypted_value=encrypted_value,
            search_token=search_token,
            field_type="string",
            key_name=key_name,
        )

    def decrypt_field(self, encrypted_field: EncryptedField) -> str:
        return self.service.decrypt_string(encrypted_field.encrypted_value)

    def _get_key_for_field(self, field_name: str) -> str:
        field_lower = field_name.lower()
        if field_lower in self.KYC_FIELDS:
            return self.KYC_KEY
        elif field_lower in self.PII_FIELDS:
            return self.PII_KEY
        else:
            return self.PII_KEY

    def encrypt_dict(
        self,
        data: Dict[str, Any],
        fields_to_encrypt: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        result = data.copy()

        if fields_to_encrypt is None:
            fields_to_encrypt = [
                k for k in data.keys()
                if k.lower() in self.PII_FIELDS or k.lower() in self.KYC_FIELDS
            ]

        for field in fields_to_encrypt:
            if field in result and result[field] is not None:
                value = result[field]
                if isinstance(value, str):
                    encrypted = self.encrypt_field(value, field)
                    result[field] = encrypted.to_dict()
                elif isinstance(value, dict):
                    result[field] = self.encrypt_dict(value)

        return result

    def decrypt_dict(
        self,
        data: Dict[str, Any],
        fields_to_decrypt: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        result = data.copy()

        if fields_to_decrypt is None:
            fields_to_decrypt = [
                k for k in data.keys()
                if isinstance(data[k], dict) and "ev" in data[k]
            ]

        for field in fields_to_decrypt:
            if field in result and isinstance(result[field], dict):
                if "ev" in result[field]:
                    encrypted_field = EncryptedField.from_dict(result[field])
                    result[field] = self.decrypt_field(encrypted_field)

        return result

    def generate_search_token(self, value: str, field_name: str) -> str:
        return self.service.deterministic_hash(
            value.lower().encode(),
            f"search:{field_name}",
        )


_default_encryptor: Optional[PIIFieldEncryptor] = None


def _get_encryptor() -> PIIFieldEncryptor:
    global _default_encryptor
    if _default_encryptor is None:
        _default_encryptor = PIIFieldEncryptor()
    return _default_encryptor


def encrypt_pii(value: str, field_name: str = "pii") -> EncryptedField:
    return _get_encryptor().encrypt_field(value, field_name)


def decrypt_pii(encrypted_field: EncryptedField) -> str:
    return _get_encryptor().decrypt_field(encrypted_field)


def encrypt_kyc_data(data: Dict[str, Any]) -> Dict[str, Any]:
    encryptor = _get_encryptor()
    kyc_fields = list(PIIFieldEncryptor.KYC_FIELDS)
    return encryptor.encrypt_dict(data, kyc_fields)


def decrypt_kyc_data(data: Dict[str, Any]) -> Dict[str, Any]:
    return _get_encryptor().decrypt_dict(data)


class EncryptedModel:
    _encrypted_fields: List[str] = []
    _encryptor: Optional[PIIFieldEncryptor] = None

    @classmethod
    def get_encryptor(cls) -> PIIFieldEncryptor:
        if cls._encryptor is None:
            cls._encryptor = PIIFieldEncryptor()
        return cls._encryptor

    def encrypt_fields(self) -> None:
        encryptor = self.get_encryptor()
        for field_name in self._encrypted_fields:
            value = getattr(self, field_name, None)
            if value is not None and isinstance(value, str):
                encrypted = encryptor.encrypt_field(value, field_name)
                setattr(self, f"_{field_name}_encrypted", encrypted.to_dict())
                setattr(self, f"_{field_name}_search_token", encrypted.search_token)

    def decrypt_fields(self) -> None:
        encryptor = self.get_encryptor()
        for field_name in self._encrypted_fields:
            encrypted_data = getattr(self, f"_{field_name}_encrypted", None)
            if encrypted_data is not None:
                encrypted_field = EncryptedField.from_dict(encrypted_data)
                decrypted = encryptor.decrypt_field(encrypted_field)
                setattr(self, field_name, decrypted)


def mask_pii(value: str, visible_chars: int = 4) -> str:
    if not value:
        return value

    if len(value) <= visible_chars:
        return "*" * len(value)

    if "@" in value:
        local, domain = value.rsplit("@", 1)
        if len(local) <= 2:
            masked_local = "*" * len(local)
        else:
            masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
        return f"{masked_local}@{domain}"

    return value[:visible_chars] + "*" * (len(value) - visible_chars)


def tokenize_for_search(value: str, field_name: str) -> str:
    return _get_encryptor().generate_search_token(value, field_name)
