"""
NeoBank Encryption Service
Provides envelope encryption with HashiCorp Vault integration for data at rest.
Uses AES-256-GCM for local encryption and Vault Transit for key management.
"""

import base64
import hashlib
import json
import os
import secrets
import threading
import time
from dataclasses import dataclass
from typing import Optional, Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.backends import default_backend

try:
    import hvac
    VAULT_AVAILABLE = True
except ImportError:
    VAULT_AVAILABLE = False


@dataclass
class EncryptedData:
    version: int
    key_id: str
    key_version: int
    nonce: str
    ciphertext: str
    algorithm: str
    encrypted_at: int
    tag: Optional[str] = None
    context: Optional[str] = None

    def to_json(self) -> str:
        return json.dumps({
            "v": self.version,
            "kid": self.key_id,
            "kv": self.key_version,
            "n": self.nonce,
            "ct": self.ciphertext,
            "alg": self.algorithm,
            "ts": self.encrypted_at,
            "tag": self.tag,
            "ctx": self.context,
        })

    @classmethod
    def from_json(cls, data: str) -> "EncryptedData":
        parsed = json.loads(data)
        return cls(
            version=parsed.get("v", 1),
            key_id=parsed.get("kid", ""),
            key_version=parsed.get("kv", 0),
            nonce=parsed.get("n", ""),
            ciphertext=parsed.get("ct", ""),
            algorithm=parsed.get("alg", ""),
            encrypted_at=parsed.get("ts", 0),
            tag=parsed.get("tag"),
            context=parsed.get("ctx"),
        )


@dataclass
class DataKey:
    plaintext: bytes
    ciphertext: str
    key_version: int


@dataclass
class EncryptionConfig:
    vault_addr: str = ""
    vault_role: str = ""
    vault_namespace: str = ""
    transit_mount_path: str = "transit"
    default_key_name: str = "neobank-pii"
    cache_enabled: bool = True
    cache_ttl: int = 300
    fallback_to_local: bool = False
    local_key_path: str = "/etc/neobank/encryption.key"

    @classmethod
    def from_env(cls) -> "EncryptionConfig":
        return cls(
            vault_addr=os.getenv("VAULT_ADDR", "https://vault.vault.svc.cluster.local:8200"),
            vault_role=os.getenv("VAULT_ROLE", "neobank-backend"),
            vault_namespace=os.getenv("VAULT_NAMESPACE", ""),
            transit_mount_path=os.getenv("VAULT_TRANSIT_PATH", "transit"),
            default_key_name=os.getenv("VAULT_DEFAULT_KEY", "neobank-pii"),
            cache_enabled=os.getenv("ENCRYPTION_CACHE_ENABLED", "true").lower() == "true",
            cache_ttl=int(os.getenv("ENCRYPTION_CACHE_TTL", "300")),
            fallback_to_local=os.getenv("ENCRYPTION_FALLBACK_LOCAL", "false").lower() == "true",
            local_key_path=os.getenv("LOCAL_ENCRYPTION_KEY_PATH", "/etc/neobank/encryption.key"),
        )


class EncryptionService:
    def __init__(self, config: Optional[EncryptionConfig] = None):
        self.config = config or EncryptionConfig.from_env()
        self._vault_client: Optional["hvac.Client"] = None
        self._local_key: Optional[bytes] = None
        self._key_cache: dict = {}
        self._cache_lock = threading.Lock()
        self._initialized = False
        self._init_lock = threading.Lock()

    def initialize(self) -> bool:
        with self._init_lock:
            if self._initialized:
                return True

            if VAULT_AVAILABLE and self.config.vault_addr:
                try:
                    self._vault_client = hvac.Client(
                        url=self.config.vault_addr,
                        namespace=self.config.vault_namespace or None,
                    )

                    jwt_path = "/var/run/secrets/kubernetes.io/serviceaccount/token"
                    if os.path.exists(jwt_path):
                        with open(jwt_path, "r") as f:
                            jwt = f.read().strip()

                        self._vault_client.auth.kubernetes.login(
                            role=self.config.vault_role,
                            jwt=jwt,
                        )
                        self._initialized = True
                        return True
                except Exception as e:
                    print(f"Vault initialization failed: {e}")

            if self.config.fallback_to_local:
                self._initialize_local_key()
                self._initialized = True
                return True

            return False

    def _initialize_local_key(self):
        if os.path.exists(self.config.local_key_path):
            with open(self.config.local_key_path, "rb") as f:
                key_data = f.read()
                try:
                    self._local_key = base64.b64decode(key_data)
                except Exception:
                    self._local_key = key_data[:32].ljust(32, b'\0')
        else:
            self._local_key = secrets.token_bytes(32)

    def _derive_key(self, master_key: bytes, context: str) -> bytes:
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"neobank-encryption",
            info=context.encode(),
            backend=default_backend(),
        )
        return hkdf.derive(master_key)

    def encrypt(self, plaintext: bytes, key_name: Optional[str] = None) -> str:
        if not self._initialized:
            self.initialize()

        key_name = key_name or self.config.default_key_name

        if self._vault_client and self._vault_client.is_authenticated():
            return self._encrypt_with_vault(plaintext, key_name)

        if self._local_key:
            return self._encrypt_local(plaintext, key_name)

        raise RuntimeError("Encryption service not initialized")

    def _encrypt_with_vault(self, plaintext: bytes, key_name: str) -> str:
        encoded_plaintext = base64.b64encode(plaintext).decode()

        response = self._vault_client.secrets.transit.encrypt_data(
            name=key_name,
            plaintext=encoded_plaintext,
            mount_point=self.config.transit_mount_path,
        )

        ciphertext = response["data"]["ciphertext"]
        key_version = response["data"].get("key_version", 0)

        enc_data = EncryptedData(
            version=1,
            key_id=key_name,
            key_version=key_version,
            nonce="",
            ciphertext=ciphertext,
            algorithm="vault-transit-aes256-gcm96",
            encrypted_at=int(time.time()),
        )

        return base64.b64encode(enc_data.to_json().encode()).decode()

    def _encrypt_local(self, plaintext: bytes, key_name: str) -> str:
        derived_key = self._derive_key(self._local_key, key_name)
        aesgcm = AESGCM(derived_key)

        nonce = secrets.token_bytes(12)
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)

        enc_data = EncryptedData(
            version=1,
            key_id=key_name,
            key_version=1,
            nonce=base64.b64encode(nonce).decode(),
            ciphertext=base64.b64encode(ciphertext).decode(),
            algorithm="aes-256-gcm",
            encrypted_at=int(time.time()),
        )

        return base64.b64encode(enc_data.to_json().encode()).decode()

    def decrypt(self, encrypted_str: str) -> bytes:
        if not self._initialized:
            self.initialize()

        try:
            json_data = base64.b64decode(encrypted_str)
            enc_data = EncryptedData.from_json(json_data.decode())
        except Exception as e:
            raise ValueError(f"Invalid ciphertext format: {e}")

        if enc_data.algorithm == "vault-transit-aes256-gcm96":
            return self._decrypt_with_vault(enc_data)
        elif enc_data.algorithm == "aes-256-gcm":
            return self._decrypt_local(enc_data)
        else:
            raise ValueError(f"Unsupported algorithm: {enc_data.algorithm}")

    def _decrypt_with_vault(self, enc_data: EncryptedData) -> bytes:
        if not self._vault_client or not self._vault_client.is_authenticated():
            raise RuntimeError("Vault client not available")

        response = self._vault_client.secrets.transit.decrypt_data(
            name=enc_data.key_id,
            ciphertext=enc_data.ciphertext,
            mount_point=self.config.transit_mount_path,
        )

        plaintext_b64 = response["data"]["plaintext"]
        return base64.b64decode(plaintext_b64)

    def _decrypt_local(self, enc_data: EncryptedData) -> bytes:
        if not self._local_key:
            raise RuntimeError("Local key not available")

        derived_key = self._derive_key(self._local_key, enc_data.key_id)
        aesgcm = AESGCM(derived_key)

        nonce = base64.b64decode(enc_data.nonce)
        ciphertext = base64.b64decode(enc_data.ciphertext)

        return aesgcm.decrypt(nonce, ciphertext, None)

    def generate_data_key(self, key_name: Optional[str] = None) -> DataKey:
        if not self._initialized:
            self.initialize()

        key_name = key_name or self.config.default_key_name

        if self._vault_client and self._vault_client.is_authenticated():
            response = self._vault_client.secrets.transit.generate_data_key(
                name=key_name,
                key_type="plaintext",
                mount_point=self.config.transit_mount_path,
            )

            plaintext = base64.b64decode(response["data"]["plaintext"])
            ciphertext = response["data"]["ciphertext"]
            key_version = response["data"].get("key_version", 0)

            return DataKey(
                plaintext=plaintext,
                ciphertext=ciphertext,
                key_version=key_version,
            )

        plaintext = secrets.token_bytes(32)
        ciphertext = self._encrypt_local(plaintext, key_name)

        return DataKey(
            plaintext=plaintext,
            ciphertext=ciphertext,
            key_version=1,
        )

    def decrypt_data_key(self, encrypted_key: str, key_name: Optional[str] = None) -> bytes:
        if not self._initialized:
            self.initialize()

        key_name = key_name or self.config.default_key_name

        if self._vault_client and self._vault_client.is_authenticated():
            response = self._vault_client.secrets.transit.decrypt_data(
                name=key_name,
                ciphertext=encrypted_key,
                mount_point=self.config.transit_mount_path,
            )
            return base64.b64decode(response["data"]["plaintext"])

        return self.decrypt(encrypted_key)

    def rewrap(self, encrypted_str: str) -> str:
        if not self._initialized:
            self.initialize()

        try:
            json_data = base64.b64decode(encrypted_str)
            enc_data = EncryptedData.from_json(json_data.decode())
        except Exception as e:
            raise ValueError(f"Invalid ciphertext format: {e}")

        if not self._vault_client or not self._vault_client.is_authenticated():
            return encrypted_str

        response = self._vault_client.secrets.transit.rewrap_data(
            name=enc_data.key_id,
            ciphertext=enc_data.ciphertext,
            mount_point=self.config.transit_mount_path,
        )

        enc_data.ciphertext = response["data"]["ciphertext"]
        enc_data.key_version = response["data"].get("key_version", enc_data.key_version)
        enc_data.encrypted_at = int(time.time())

        return base64.b64encode(enc_data.to_json().encode()).decode()

    def hash_data(self, data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()

    def deterministic_hash(self, data: bytes, context: str) -> str:
        key = self._derive_key(b"neobank-search-token", context)
        h = hashlib.sha256()
        h.update(key)
        h.update(data)
        return h.hexdigest()

    def encrypt_string(self, plaintext: str, key_name: Optional[str] = None) -> str:
        return self.encrypt(plaintext.encode(), key_name)

    def decrypt_string(self, ciphertext: str) -> str:
        return self.decrypt(ciphertext).decode()

    def close(self):
        self._initialized = False
        self._vault_client = None
        self._key_cache = {}


_default_service: Optional[EncryptionService] = None
_default_service_lock = threading.Lock()


def get_default_service() -> EncryptionService:
    global _default_service
    with _default_service_lock:
        if _default_service is None:
            _default_service = EncryptionService()
            _default_service.initialize()
        return _default_service


def encrypt(plaintext: bytes, key_name: Optional[str] = None) -> str:
    return get_default_service().encrypt(plaintext, key_name)


def decrypt(ciphertext: str) -> bytes:
    return get_default_service().decrypt(ciphertext)


def encrypt_string(plaintext: str, key_name: Optional[str] = None) -> str:
    return get_default_service().encrypt_string(plaintext, key_name)


def decrypt_string(ciphertext: str) -> str:
    return get_default_service().decrypt_string(ciphertext)


def generate_data_key(key_name: Optional[str] = None) -> DataKey:
    return get_default_service().generate_data_key(key_name)


def hash_data(data: bytes) -> str:
    return get_default_service().hash_data(data)


def deterministic_hash(data: bytes, context: str) -> str:
    return get_default_service().deterministic_hash(data, context)
