"""Compatibility shim for legacy `app.database` imports."""

from database.connection import (  # noqa: F401
    AsyncSessionLocal,
    close_database,
    engine,
    get_db,
    get_db_session,
    init_database,
)
