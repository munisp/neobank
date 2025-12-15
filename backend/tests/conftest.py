"""
Pytest configuration and fixtures for NeoBank testing
"""
import asyncio
import os
from typing import AsyncGenerator, Generator
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from database.models import Base
from database.connection import get_db
from config.settings import settings

# Test database URL (in-memory SQLite for speed)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Create test engine
test_engine = create_async_engine(
    TEST_DATABASE_URL,
    poolclass=StaticPool,
    connect_args={"check_same_thread": False},
    echo=False
)

# Create test session factory
TestSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False
)


@pytest_asyncio.fixture
async def test_db() -> AsyncGenerator[AsyncSession, None]:
    """Create test database session"""
    
    # Create tables
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Create session
    async with TestSessionLocal() as session:
        yield session
    
    # Clean up
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client(test_db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create test HTTP client"""
    
    # Override database dependency
    async def override_get_db():
        yield test_db
    
    app.dependency_overrides[get_db] = override_get_db
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac
    
    # Clean up
    app.dependency_overrides.clear()


@pytest.fixture
def sample_user_data():
    """Sample user data for testing"""
    return {
        "email": "test@example.com",
        "password": "TestPassword123!",
        "confirm_password": "TestPassword123!",
        "full_name": "Test User",
        "phone_number": "+2348012345678",
        "date_of_birth": "1990-01-01",
        "address": "123 Test Street, Lagos, Nigeria"
    }


@pytest.fixture
def sample_login_data():
    """Sample login data for testing"""
    return {
        "email": "test@example.com",
        "password": "TestPassword123!"
    }


@pytest.fixture
def sample_account_data():
    """Sample account data for testing"""
    return {
        "account_type": "savings",
        "account_name": "Test Savings Account",
        "currency": "NGN",
        "daily_limit": 1000000,
        "monthly_limit": 10000000
    }


@pytest.fixture
def sample_transaction_data():
    """Sample transaction data for testing"""
    return {
        "amount": 50000,
        "transaction_type": "transfer",
        "description": "Test transfer",
        "destination_account_number": "9991234567"
    }


@pytest.fixture
def sample_kyc_data():
    """Sample KYC data for testing"""
    return {
        "verification_level": "tier_2",
        "documents": {
            "national_id": "test_id.jpg",
            "proof_of_address": "test_address.pdf"
        }
    }


@pytest_asyncio.fixture
async def authenticated_user(client: AsyncClient, test_db: AsyncSession, sample_user_data):
    """Create and authenticate a test user"""
    
    # Register user
    register_response = await client.post("/api/auth/register", json=sample_user_data)
    assert register_response.status_code == 201
    
    # Login user
    login_data = {
        "email": sample_user_data["email"],
        "password": sample_user_data["password"]
    }
    login_response = await client.post("/api/auth/login", json=login_data)
    assert login_response.status_code == 200
    
    token_data = login_response.json()
    access_token = token_data["access_token"]
    user_data = token_data["user"]
    
    return {
        "access_token": access_token,
        "user": user_data,
        "headers": {"Authorization": f"Bearer {access_token}"}
    }


@pytest_asyncio.fixture
async def test_account(client: AsyncClient, authenticated_user, sample_account_data):
    """Create a test account"""
    
    response = await client.post(
        "/api/accounts",
        json=sample_account_data,
        headers=authenticated_user["headers"]
    )
    assert response.status_code == 201
    
    return response.json()


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_redis():
    """Mock Redis client for testing"""
    class MockRedis:
        def __init__(self):
            self.data = {}
        
        async def get(self, key):
            return self.data.get(key)
        
        async def set(self, key, value, ex=None):
            self.data[key] = value
        
        async def delete(self, key):
            self.data.pop(key, None)
        
        async def ping(self):
            return True
        
        async def zremrangebyscore(self, key, min_score, max_score):
            return 0
        
        async def zcard(self, key):
            return len(self.data.get(key, []))
        
        async def zadd(self, key, mapping):
            if key not in self.data:
                self.data[key] = []
            self.data[key].extend(mapping.keys())
        
        async def expire(self, key, seconds):
            pass
        
        async def zcount(self, key, min_score, max_score):
            return 0
        
        async def zrem(self, key, member):
            if key in self.data and member in self.data[key]:
                self.data[key].remove(member)
        
        def pipeline(self):
            return MockRedisPipeline(self)
    
    class MockRedisPipeline:
        def __init__(self, redis_client):
            self.redis = redis_client
            self.commands = []
        
        def zremrangebyscore(self, key, min_score, max_score):
            self.commands.append(("zremrangebyscore", key, min_score, max_score))
            return self
        
        def zcard(self, key):
            self.commands.append(("zcard", key))
            return self
        
        def zadd(self, key, mapping):
            self.commands.append(("zadd", key, mapping))
            return self
        
        def expire(self, key, seconds):
            self.commands.append(("expire", key, seconds))
            return self
        
        async def execute(self):
            results = []
            for cmd in self.commands:
                if cmd[0] == "zcard":
                    results.append(len(self.redis.data.get(cmd[1], [])))
                else:
                    results.append(0)
            return results
    
    return MockRedis()


@pytest.fixture
def mock_tigerbeetle():
    """Mock TigerBeetle client for testing"""
    class MockTigerBeetle:
        async def create_account(self, account_data):
            return {"id": "tb_" + account_data["id"]}
        
        async def get_account_balance(self, account_id):
            return {"balance": 100000, "available_balance": 100000}
        
        async def update_account_balance(self, account_id, amount, transaction_id):
            return {"success": True, "new_balance": 100000 + float(amount)}
    
    return MockTigerBeetle()


@pytest.fixture
def mock_ballerine():
    """Mock Ballerine client for testing"""
    class MockBallerine:
        async def initiate_kyc(self, customer_data):
            return {
                "kyc_id": "mock_kyc_123",
                "status": "initiated",
                "session_url": "https://mock.ballerine.com/kyc"
            }
        
        async def submit_documents(self, kyc_id, documents):
            return {
                "status": "documents_submitted",
                "verification_status": "pending"
            }
        
        async def get_kyc_status(self, kyc_id):
            return {
                "status": "completed",
                "verification_result": "approved",
                "confidence_score": 0.95
            }
    
    return MockBallerine()


@pytest.fixture
def mock_openappsec():
    """Mock OpenAppSec client for testing"""
    class MockOpenAppSec:
        async def validate_request(self, request_data):
            return {"valid": True, "reason": "validated"}
        
        async def report_threat(self, threat_data):
            return True
    
    return MockOpenAppSec()


@pytest.fixture
def mock_opencti():
    """Mock OpenCTI client for testing"""
    class MockOpenCTI:
        async def get_indicators(self, indicator_types=None, limit=100):
            return [
                {
                    "id": "mock-indicator-1",
                    "pattern": "192.168.1.100",
                    "types": ["ipv4-addr"],
                    "valid_from": "2024-01-01T00:00:00Z",
                    "valid_until": "2025-01-01T00:00:00Z",
                    "confidence": 85,
                    "labels": ["malicious"],
                    "marking": ["TLP:RED"]
                }
            ]
        
        async def check_indicator(self, indicator_value, indicator_type):
            if indicator_value == "192.168.1.100":
                return {
                    "found": True,
                    "id": "mock-indicator-1",
                    "pattern": indicator_value,
                    "types": [indicator_type],
                    "confidence": 85,
                    "labels": ["malicious"]
                }
            return {"found": False}
        
        async def submit_indicator(self, indicator_data):
            return True
    
    return MockOpenCTI()


# Test environment setup
@pytest.fixture(autouse=True)
def setup_test_environment(monkeypatch):
    """Set up test environment variables"""
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
    monkeypatch.setenv("JWT_SECRET_KEY", "test_secret_key_for_testing_only")
    monkeypatch.setenv("SECRET_KEY", "test_secret_key")


# Pytest configuration
def pytest_configure(config):
    """Configure pytest"""
    config.addinivalue_line(
        "markers", "unit: mark test as unit test"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
    config.addinivalue_line(
        "markers", "e2e: mark test as end-to-end test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )


# Custom test markers
pytestmark = pytest.mark.asyncio
