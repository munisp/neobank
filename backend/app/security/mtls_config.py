"""
mTLS Configuration for Service-to-Service Authentication

This module provides mutual TLS configuration for secure communication
between microservices in the NeoBank platform.
"""

import os
import ssl
from typing import Optional
from dataclasses import dataclass
from pathlib import Path
import structlog

logger = structlog.get_logger(__name__)


@dataclass
class MTLSConfig:
    """Configuration for mutual TLS authentication"""
    
    ca_cert_path: str
    server_cert_path: str
    server_key_path: str
    client_cert_path: Optional[str] = None
    client_key_path: Optional[str] = None
    verify_client: bool = True
    min_tls_version: str = "TLSv1.3"
    
    @classmethod
    def from_env(cls) -> "MTLSConfig":
        """Load mTLS configuration from environment variables"""
        return cls(
            ca_cert_path=os.getenv("MTLS_CA_CERT", "/etc/ssl/certs/neobank-ca.crt"),
            server_cert_path=os.getenv("MTLS_SERVER_CERT", "/etc/ssl/certs/server.crt"),
            server_key_path=os.getenv("MTLS_SERVER_KEY", "/etc/ssl/private/server.key"),
            client_cert_path=os.getenv("MTLS_CLIENT_CERT"),
            client_key_path=os.getenv("MTLS_CLIENT_KEY"),
            verify_client=os.getenv("MTLS_VERIFY_CLIENT", "true").lower() == "true",
            min_tls_version=os.getenv("MTLS_MIN_VERSION", "TLSv1.3")
        )
    
    def create_server_ssl_context(self) -> ssl.SSLContext:
        """Create SSL context for server-side mTLS"""
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        
        if self.min_tls_version == "TLSv1.3":
            context.minimum_version = ssl.TLSVersion.TLSv1_3
        else:
            context.minimum_version = ssl.TLSVersion.TLSv1_2
        
        context.load_cert_chain(
            certfile=self.server_cert_path,
            keyfile=self.server_key_path
        )
        
        context.load_verify_locations(cafile=self.ca_cert_path)
        
        if self.verify_client:
            context.verify_mode = ssl.CERT_REQUIRED
        else:
            context.verify_mode = ssl.CERT_OPTIONAL
        
        context.set_ciphers(
            "ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20"
        )
        
        logger.info("mtls_server_context_created", verify_client=self.verify_client)
        return context
    
    def create_client_ssl_context(self) -> ssl.SSLContext:
        """Create SSL context for client-side mTLS"""
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        
        if self.min_tls_version == "TLSv1.3":
            context.minimum_version = ssl.TLSVersion.TLSv1_3
        else:
            context.minimum_version = ssl.TLSVersion.TLSv1_2
        
        if self.client_cert_path and self.client_key_path:
            context.load_cert_chain(
                certfile=self.client_cert_path,
                keyfile=self.client_key_path
            )
        
        context.load_verify_locations(cafile=self.ca_cert_path)
        context.verify_mode = ssl.CERT_REQUIRED
        context.check_hostname = True
        
        logger.info("mtls_client_context_created")
        return context


class ServiceAuthenticator:
    """Service-to-service authentication using JWT and mTLS"""
    
    def __init__(self, service_name: str, secret_key: str):
        self.service_name = service_name
        self.secret_key = secret_key
        self._allowed_services = set()
    
    def register_allowed_service(self, service_name: str):
        """Register a service that is allowed to communicate"""
        self._allowed_services.add(service_name)
    
    def generate_service_token(self, target_service: str, ttl_seconds: int = 300) -> str:
        """Generate a JWT token for service-to-service communication"""
        import jwt
        from datetime import datetime, timedelta
        
        payload = {
            "iss": self.service_name,
            "sub": target_service,
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(seconds=ttl_seconds),
            "type": "service_auth"
        }
        
        return jwt.encode(payload, self.secret_key, algorithm="HS256")
    
    def verify_service_token(self, token: str) -> dict:
        """Verify a service-to-service JWT token"""
        import jwt
        
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=["HS256"])
            
            if payload.get("type") != "service_auth":
                raise ValueError("Invalid token type")
            
            issuer = payload.get("iss")
            if issuer not in self._allowed_services:
                raise ValueError(f"Service {issuer} not authorized")
            
            return payload
        except jwt.ExpiredSignatureError:
            raise ValueError("Token expired")
        except jwt.InvalidTokenError as e:
            raise ValueError(f"Invalid token: {e}")


def get_mtls_config() -> MTLSConfig:
    """Get mTLS configuration singleton"""
    return MTLSConfig.from_env()
