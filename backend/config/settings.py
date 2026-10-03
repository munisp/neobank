"""
Production-grade configuration management for NeoBank
"""
import os
import secrets
from typing import Optional, List
from pydantic_settings import BaseSettings
from pydantic import validator, PostgresDsn
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings with environment variable support"""
    
    # Application
    APP_NAME: str = "NeoBank API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"
    
    # Security
    SECRET_KEY: str = secrets.token_urlsafe(32)
    JWT_SECRET_KEY: str = secrets.token_urlsafe(32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]
    ALLOWED_METHODS: List[str] = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    ALLOWED_HEADERS: List[str] = ["*"]
    
    # Database
    DATABASE_URL: Optional[PostgresDsn] = None
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USER: str = "neobank"
    DB_PASSWORD: str = "secure_password_123"
    DB_NAME: str = "neobank_production"
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 30
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: Optional[str] = None
    
    # External Services
    TIGERBEETLE_URL: str = "http://localhost:8001"
    KYC_SERVICE_URL: str = "http://localhost:8085"
    KYB_SERVICE_URL: str = "http://localhost:8080"
    FRAUD_DETECTION_URL: str = "http://localhost:8093"
    
    # File Storage
    UPLOAD_DIR: str = "/tmp/neobank/uploads"
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    ALLOWED_FILE_TYPES: List[str] = ["pdf", "jpg", "jpeg", "png"]
    
    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW: int = 60  # seconds
    
    # Monitoring
    PROMETHEUS_PORT: int = 8090
    LOG_LEVEL: str = "INFO"
    
    # Email (for notifications)
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_TLS: bool = True
    
    # Fraud Detection
    FRAUD_DETECTION_THRESHOLD: float = 0.7
    FRAUD_DETECTION_ENABLED: bool = True
    
    # KYC/KYB
    KYC_REQUIRED_DOCUMENTS: List[str] = ["national_id", "proof_of_address"]
    KYB_REQUIRED_DOCUMENTS: List[str] = ["cac_certificate", "tax_certificate"]
    
    @validator("DATABASE_URL", pre=True)
    def assemble_db_connection(cls, v: Optional[str], values: dict) -> str:
        if isinstance(v, str):
            return v
        return PostgresDsn.build(
            scheme="postgresql+asyncpg",
            user=values.get("DB_USER"),
            password=values.get("DB_PASSWORD"),
            host=values.get("DB_HOST"),
            port=str(values.get("DB_PORT")),
            path=f"/{values.get('DB_NAME') or ''}",
        )
    
    @validator("ALLOWED_ORIGINS", pre=True)
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v
    
    class Config:
        env_file = ".env"
        case_sensitive = True


    # --- Integration endpoints (audit wave: added missing attrs) ---
    OPA_URL: str = "http://localhost:8181"
    PERMIFY_URL: str = "localhost:3478"
    JAEGER_AGENT_HOST: str = "localhost"
    JAEGER_AGENT_PORT: int = 6831
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://localhost:4317"

    # Notifications
    SMS_API_KEY: str = ""
    SMS_SENDER_ID: str = "NeoBank"
    WHATSAPP_API_KEY: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    FCM_SERVER_KEY: str = ""
    APNS_KEY_ID: str = ""
    APNS_TEAM_ID: str = ""
    FROM_EMAIL: str = "no-reply@neobank.ng"
    FROM_NAME: str = "NeoBank"
    SMTP_SERVER: str = "localhost"
    SMTP_USERNAME: str = ""

    # Bill payment providers
    AIRTIME_API_KEY: str = ""
    CABLE_TV_API_KEY: str = ""
    ELECTRICITY_API_KEY: str = ""

    # KYC vendors
    BALLERINE_API_KEY: str = ""
    BALLERINE_API_URL: str = "https://api.ballerine.io"
    GOT_OCR_API_URL: str = ""
    OLMOCR_API_URL: str = ""

    # --- Identity verification (self-hosted OpenKYC replacement) ---
    IDV_API_KEYS: str = ""  # comma-separated API keys for the /idv endpoints
    IDV_SESSION_SITE_URL: str = "http://localhost:3000/idv"
    IDV_OCR_LANG: str = "en"
    IDV_VLM_API_URL: str = ""  # OpenAI-compatible endpoint, e.g. http://localhost:8000
    IDV_VLM_API_KEY: str = ""
    IDV_VLM_MODEL: str = "Qwen/Qwen2-VL-7B-Instruct"
    IDV_VLM_TIMEOUT: float = 30.0
    IDV_FACE_API_URL: str = ""  # optional FaceOnLive-compatible biometrics service
    IDV_FACE_API_KEY: str = ""
    IDV_FACE_TIMEOUT: float = 15.0
    IDV_FACE_MATCH_THRESHOLD: float = 0.6
    IDV_WEBHOOK_URL: str = ""
    IDV_WEBHOOK_SECRET: str = ""
    IDV_WEBHOOK_ENABLED: bool = False


class DevelopmentSettings(Settings):
    """Development environment settings"""
    DEBUG: bool = True
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "DEBUG"
    
    # Use SQLite for development
    DATABASE_URL: str = "sqlite+aiosqlite:///./neobank_dev.db"
    
    # Relaxed security for development
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours


class TestingSettings(Settings):
    """Testing environment settings"""
    ENVIRONMENT: str = "testing"
    DATABASE_URL: str = "sqlite+aiosqlite:///./neobank_test.db"
    
    # Disable external services for testing
    FRAUD_DETECTION_ENABLED: bool = False


class ProductionSettings(Settings):
    """Production environment settings"""
    ENVIRONMENT: str = "production"
    
    # Strict security for production
    @validator("SECRET_KEY", "JWT_SECRET_KEY")
    def validate_secrets(cls, v):
        if v == "changeme" or len(v) < 32:
            raise ValueError("Production secrets must be secure and at least 32 characters")
        return v


@lru_cache()
def get_settings() -> Settings:
    """Get application settings based on environment"""
    environment = os.getenv("ENVIRONMENT", "production").lower()
    
    if environment == "development":
        return DevelopmentSettings()
    elif environment == "testing":
        return TestingSettings()
    else:
        return ProductionSettings()


# Global settings instance
settings = get_settings()
