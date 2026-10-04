"""Tenant Brand Pack persistence (closes the localStorage-only gap).

Admins publish a tenant's brand pack server-side; any client can fetch it
on boot to apply the tenant theme before first paint.
"""

import re
import uuid
from typing import Any, Dict, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth import get_current_user
from database.connection import get_db
from database.models import TenantTheme

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Tenant Themes"])

ADMIN_ROLES = {"admin", "manager"}
HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class ThemeUpsert(BaseModel):
    tenant_key: str
    seed_color: str
    radius: str = "default"
    motion_bias: str = "standard"
    voice: str = "neutral"


def _serialize(t: TenantTheme) -> Dict[str, Any]:
    return {
        "tenant_key": t.tenant_key, "seed_color": t.seed_color,
        "radius": t.radius, "motion_bias": t.motion_bias, "voice": t.voice,
        "is_active": t.is_active,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


@router.get("/themes/{tenant_key}")
async def get_theme(tenant_key: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    t = (await db.execute(select(TenantTheme).where(
        TenantTheme.tenant_key == tenant_key,
        TenantTheme.is_active.is_(True)))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Theme not found")
    return {"theme": _serialize(t)}


@router.put("/admin/themes/{tenant_key}")
async def publish_theme(tenant_key: str, body: ThemeUpsert,
                        user: Dict[str, Any] = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    if not ADMIN_ROLES.intersection(user.get("roles") or []):
        raise HTTPException(status_code=403, detail="Admin or manager role required")
    if not HEX_RE.match(body.seed_color):
        raise HTTPException(status_code=422, detail="seed_color must be #RRGGBB")
    t = (await db.execute(select(TenantTheme).where(
        TenantTheme.tenant_key == tenant_key))).scalar_one_or_none()
    if t is None:
        t = TenantTheme(id=uuid.uuid4(), tenant_key=tenant_key,
                        seed_color=body.seed_color, radius=body.radius,
                        motion_bias=body.motion_bias, voice=body.voice)
        db.add(t)
    else:
        t.seed_color = body.seed_color
        t.radius = body.radius
        t.motion_bias = body.motion_bias
        t.voice = body.voice
        t.is_active = True
    await db.commit()
    logger.info("theme.published", tenant=tenant_key, by=user.get("email"))
    return {"theme": _serialize(t)}


@router.get("/admin/themes")
async def list_themes(user: Dict[str, Any] = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    if not ADMIN_ROLES.intersection(user.get("roles") or []):
        raise HTTPException(status_code=403, detail="Admin or manager role required")
    themes = (await db.execute(select(TenantTheme))).scalars().all()
    return {"themes": [_serialize(t) for t in themes]}
