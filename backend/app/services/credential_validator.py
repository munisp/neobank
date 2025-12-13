"""
API Credential Validation Service

Validates that required API credentials are configured before allowing
operations that depend on external services.
"""

import os
from typing import Dict, List, Optional, Set
from dataclasses import dataclass
from enum import Enum
import structlog

logger = structlog.get_logger()


class CredentialStatus(Enum):
    """Status of credential validation"""
    VALID = "valid"
    MISSING = "missing"
    INVALID_FORMAT = "invalid_format"
    EXPIRED = "expired"


@dataclass
class CredentialRequirement:
    """Defines a required credential"""
    name: str
    env_var: str
    description: str
    required_in_production: bool = True
    min_length: int = 10
    pattern: Optional[str] = None  # Regex pattern for validation


class CredentialValidationError(Exception):
    """Raised when required credentials are missing or invalid"""
    
    def __init__(self, missing_credentials: List[str], message: str = None):
        self.missing_credentials = missing_credentials
        self.message = message or f"Missing required credentials: {', '.join(missing_credentials)}"
        super().__init__(self.message)


class CredentialValidator:
    """
    Validates API credentials for external service integrations
    
    Ensures all required credentials are configured before allowing
    operations that depend on external APIs.
    """
    
    # Define all required credentials for the platform
    CREDENTIALS = {
        # Bill Payment Services
        "electricity": CredentialRequirement(
            name="Electricity API Key",
            env_var="ELECTRICITY_API_KEY",
            description="BuyPower API key for electricity purchases",
            min_length=20
        ),
        "airtime": CredentialRequirement(
            name="Airtime API Key",
            env_var="AIRTIME_API_KEY",
            description="VTPass API key for airtime/data purchases",
            min_length=20
        ),
        "cable_tv": CredentialRequirement(
            name="Cable TV API Key",
            env_var="CABLE_TV_API_KEY",
            description="VTPass API key for cable TV subscriptions",
            min_length=20
        ),
        
        # Payment Rails
        "paystack": CredentialRequirement(
            name="Paystack Secret Key",
            env_var="PAYSTACK_SECRET_KEY",
            description="Paystack API secret key for payments",
            min_length=30
        ),
        "flutterwave": CredentialRequirement(
            name="Flutterwave Secret Key",
            env_var="FLUTTERWAVE_SECRET_KEY",
            description="Flutterwave API secret key for payments",
            min_length=30
        ),
        
        # KYC/Compliance
        "comply_advantage": CredentialRequirement(
            name="ComplyAdvantage API Key",
            env_var="COMPLY_ADVANTAGE_API_KEY",
            description="ComplyAdvantage API key for AML screening",
            min_length=20
        ),
        "smile_id": CredentialRequirement(
            name="Smile ID API Key",
            env_var="SMILE_ID_API_KEY",
            description="Smile ID API key for identity verification",
            min_length=20
        ),
        
        # Banking Infrastructure
        "tigerbeetle": CredentialRequirement(
            name="TigerBeetle URL",
            env_var="TIGERBEETLE_URL",
            description="TigerBeetle ledger service URL",
            min_length=10,
            required_in_production=True
        ),
        
        # Database
        "database_password": CredentialRequirement(
            name="Database Password",
            env_var="DB_PASSWORD",
            description="PostgreSQL database password",
            min_length=8,
            required_in_production=True
        ),
        
        # Security
        "jwt_secret": CredentialRequirement(
            name="JWT Secret",
            env_var="JWT_SECRET",
            description="Secret key for JWT token signing",
            min_length=32,
            required_in_production=True
        ),
        "encryption_key": CredentialRequirement(
            name="Encryption Key",
            env_var="ENCRYPTION_KEY",
            description="AES encryption key for sensitive data",
            min_length=32,
            required_in_production=True
        ),
        
        # Stock Trading
        "alpha_vantage": CredentialRequirement(
            name="Alpha Vantage API Key",
            env_var="ALPHA_VANTAGE_API_KEY",
            description="Alpha Vantage API key for stock data",
            min_length=10,
            required_in_production=False
        ),
        
        # Notifications
        "sendgrid": CredentialRequirement(
            name="SendGrid API Key",
            env_var="SENDGRID_API_KEY",
            description="SendGrid API key for email notifications",
            min_length=20,
            required_in_production=False
        ),
        "twilio_auth_token": CredentialRequirement(
            name="Twilio Auth Token",
            env_var="TWILIO_AUTH_TOKEN",
            description="Twilio auth token for SMS notifications",
            min_length=20,
            required_in_production=False
        ),
    }
    
    def __init__(self, environment: str = None):
        self.environment = environment or os.getenv("ENVIRONMENT", "development")
        self.is_production = self.environment == "production"
        self._validated_credentials: Set[str] = set()
        self._validation_errors: Dict[str, str] = {}
    
    def validate_credential(self, credential_key: str) -> CredentialStatus:
        """
        Validate a single credential
        
        Args:
            credential_key: Key of the credential to validate
            
        Returns:
            CredentialStatus indicating validation result
        """
        if credential_key not in self.CREDENTIALS:
            logger.warning(f"Unknown credential key: {credential_key}")
            return CredentialStatus.MISSING
        
        requirement = self.CREDENTIALS[credential_key]
        value = os.getenv(requirement.env_var)
        
        if not value:
            if self.is_production and requirement.required_in_production:
                self._validation_errors[credential_key] = "Missing required credential"
                return CredentialStatus.MISSING
            return CredentialStatus.MISSING
        
        if len(value) < requirement.min_length:
            self._validation_errors[credential_key] = f"Credential too short (min {requirement.min_length} chars)"
            return CredentialStatus.INVALID_FORMAT
        
        # Check for placeholder values
        placeholder_patterns = ["your_", "xxx", "placeholder", "changeme", "secret"]
        if any(pattern in value.lower() for pattern in placeholder_patterns):
            self._validation_errors[credential_key] = "Credential appears to be a placeholder"
            return CredentialStatus.INVALID_FORMAT
        
        self._validated_credentials.add(credential_key)
        return CredentialStatus.VALID
    
    def validate_service_credentials(self, service: str) -> Dict[str, CredentialStatus]:
        """
        Validate all credentials required for a specific service
        
        Args:
            service: Service name (e.g., "bill_payment", "kyc", "payments")
            
        Returns:
            Dictionary of credential keys to their validation status
        """
        service_credentials = {
            "bill_payment": ["electricity", "airtime", "cable_tv"],
            "kyc": ["comply_advantage", "smile_id"],
            "payments": ["paystack", "flutterwave"],
            "banking": ["tigerbeetle", "database_password"],
            "security": ["jwt_secret", "encryption_key"],
            "notifications": ["sendgrid", "twilio_auth_token"],
            "trading": ["alpha_vantage"],
        }
        
        credentials_to_check = service_credentials.get(service, [])
        results = {}
        
        for cred_key in credentials_to_check:
            results[cred_key] = self.validate_credential(cred_key)
        
        return results
    
    def validate_all(self) -> Dict[str, CredentialStatus]:
        """
        Validate all credentials
        
        Returns:
            Dictionary of all credential keys to their validation status
        """
        results = {}
        for cred_key in self.CREDENTIALS:
            results[cred_key] = self.validate_credential(cred_key)
        return results
    
    def require_credentials(self, *credential_keys: str) -> None:
        """
        Require specific credentials to be valid, raising an error if not
        
        Args:
            credential_keys: Keys of credentials that must be valid
            
        Raises:
            CredentialValidationError: If any required credentials are missing/invalid
        """
        missing = []
        
        for key in credential_keys:
            status = self.validate_credential(key)
            if status != CredentialStatus.VALID:
                if self.is_production or self.CREDENTIALS.get(key, CredentialRequirement(
                    name="", env_var="", description=""
                )).required_in_production:
                    missing.append(key)
        
        if missing:
            logger.error(
                "Missing required credentials",
                missing=missing,
                environment=self.environment
            )
            raise CredentialValidationError(missing)
    
    def get_validation_report(self) -> Dict:
        """
        Generate a validation report for all credentials
        
        Returns:
            Dictionary containing validation results and recommendations
        """
        results = self.validate_all()
        
        valid_count = sum(1 for s in results.values() if s == CredentialStatus.VALID)
        missing_count = sum(1 for s in results.values() if s == CredentialStatus.MISSING)
        invalid_count = sum(1 for s in results.values() if s == CredentialStatus.INVALID_FORMAT)
        
        production_ready = all(
            results.get(key) == CredentialStatus.VALID
            for key, req in self.CREDENTIALS.items()
            if req.required_in_production
        )
        
        return {
            "environment": self.environment,
            "production_ready": production_ready,
            "summary": {
                "total": len(results),
                "valid": valid_count,
                "missing": missing_count,
                "invalid": invalid_count
            },
            "credentials": {
                key: {
                    "status": status.value,
                    "name": self.CREDENTIALS[key].name,
                    "required_in_production": self.CREDENTIALS[key].required_in_production,
                    "error": self._validation_errors.get(key)
                }
                for key, status in results.items()
            },
            "recommendations": self._get_recommendations(results)
        }
    
    def _get_recommendations(self, results: Dict[str, CredentialStatus]) -> List[str]:
        """Generate recommendations based on validation results"""
        recommendations = []
        
        missing_production = [
            key for key, status in results.items()
            if status == CredentialStatus.MISSING
            and self.CREDENTIALS[key].required_in_production
        ]
        
        if missing_production:
            recommendations.append(
                f"Configure the following credentials before deploying to production: "
                f"{', '.join(missing_production)}"
            )
        
        invalid = [
            key for key, status in results.items()
            if status == CredentialStatus.INVALID_FORMAT
        ]
        
        if invalid:
            recommendations.append(
                f"Fix invalid credential format for: {', '.join(invalid)}"
            )
        
        if not self.is_production:
            recommendations.append(
                "Set ENVIRONMENT=production when deploying to production"
            )
        
        return recommendations


# Global validator instance
credential_validator = CredentialValidator()


def require_credentials(*credential_keys: str):
    """
    Decorator to require specific credentials for a function
    
    Usage:
        @require_credentials("paystack", "flutterwave")
        async def process_payment(...):
            ...
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            credential_validator.require_credentials(*credential_keys)
            return await func(*args, **kwargs)
        return wrapper
    return decorator
