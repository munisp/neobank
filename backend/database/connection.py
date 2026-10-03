"""
Database connection and session management
"""
import logging
from typing import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import declarative_base

from config.settings import settings

logger = logging.getLogger(__name__)

# Create async engine with proper connection pooling
if settings.ENVIRONMENT == "testing":
    # Use NullPool for testing to avoid connection issues
    engine = create_async_engine(
        str(settings.DATABASE_URL),
        poolclass=NullPool,
        echo=settings.DEBUG,
    )
else:
    # Use connection pooling for production
    engine = create_async_engine(
        str(settings.DATABASE_URL),
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_pre_ping=True,
        pool_recycle=1800,  # Recycle connections after 30 min
        pool_timeout=10,    # Fail fast instead of queueing forever
        echo=settings.DEBUG,
        connect_args={
            # asyncpg server-side settings: keep JIT off for OLTP point queries
            # (JIT compilation adds 50-200ms on short queries)
            "server_settings": {
                "jit": "off",
                "statement_timeout": "15000",
                "idle_in_transaction_session_timeout": "30000",
                "application_name": "neobank-api",
            },
            # Cache prepared statements per connection (big win for hot paths)
            "prepared_statement_cache_size": 256,
            "command_timeout": 15,
        },
    )

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=True,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency to get database session
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Context manager for database sessions
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()


async def init_database():
    """
    Initialize database tables
    """
    from database.models import Base
    
    try:
        async with engine.begin() as conn:
            # Create all tables
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Failed to create database tables: {e}")
        raise


async def close_database():
    """
    Close database connections
    """
    try:
        await engine.dispose()
        logger.info("Database connections closed")
    except Exception as e:
        logger.error(f"Error closing database connections: {e}")


class DatabaseHealthCheck:
    """Database health check utility"""
    
    @staticmethod
    async def check_connection() -> bool:
        """Check if database connection is healthy"""
        from sqlalchemy import text
        try:
            async with get_db_session() as session:
                result = await session.execute(text("SELECT 1"))
                return result.scalar() == 1
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False

    @staticmethod
    async def get_connection_info() -> dict:
        """Get database connection information (defensive per-metric:
        pool APIs differ between QueuePool and NullPool)."""
        try:
            pool = engine.pool
            info = {}
            for name, fn in (
                ("pool_size", "size"),
                ("checked_in", "checkedin"),
                ("checked_out", "checkedout"),
                ("overflow", "overflow"),
            ):
                try:
                    info[name] = getattr(pool, fn)()
                except Exception:  # noqa: BLE001
                    info[name] = None
            return info
        except Exception as e:
            logger.error(f"Failed to get connection info: {e}")
            return {}


# Export commonly used items
__all__ = [
    "engine",
    "AsyncSessionLocal", 
    "get_db",
    "get_db_session",
    "init_database",
    "close_database",
    "DatabaseHealthCheck"
]
