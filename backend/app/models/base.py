"""
Base model re-exports.

Canonical declarative Base lives in `database.models`; this module is a
compatibility shim so historical `app.models.*` imports keep working and all
models share one metadata registry (required for Alembic and relationships).
"""

from database.models import Base


class BaseModel(Base):
    """Abstract base with timestamps (compat for legacy app.models usage)."""
    __abstract__ = True

    from sqlalchemy import Column, DateTime as _DateTime
    from sqlalchemy.sql import func as _func

    created_at = Column(_DateTime(timezone=True), server_default=_func.now(), nullable=False)
    updated_at = Column(_DateTime(timezone=True), server_default=_func.now(),
                        onupdate=_func.now(), nullable=False)
