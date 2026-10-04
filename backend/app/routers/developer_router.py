"""Developer platform — third-party apps for the segment app store.

Flow:
1. Developer registers (POST /developers/register) — any authenticated user.
2. Creates an app (POST /developers/apps) — starts as `draft`.
3. Submits for vetting (POST .../submit) — status `submitted`.
4. Admin reviews (POST /admin/developer-apps/{id}/review) — approve/reject.
5. On approval an API key is issued (sha256-hashed at rest, shown once)
   with the requested scopes, and the app can be published into segment
   storefronts (POST .../publish) — creating SegmentApp tiles that point at
   the developer's surface.
6. Webhooks (POST .../webhooks) — HMAC-SHA256 signed event deliveries.

Third-party API access: requests carry `X-NB-Api-Key`; `verify_api_key`
dependency authenticates the app and enforces scopes.
"""

import hashlib
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.platform_integration import get_platform_integration
from app.middleware.auth import get_current_user
from database.connection import get_db
from database.models import (
    Developer, DeveloperApp, DeveloperWebhook, Segment, SegmentApp,
)

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Developer Platform"])

ADMIN_ROLES = {"admin", "manager"}

AVAILABLE_SCOPES = [
    "accounts:read",
    "transactions:read",
    "payments:initiate",
    "segments:read",
    "webhooks:manage",
]


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------

class DeveloperRegister(BaseModel):
    company_name: str
    website: Optional[str] = None


class AppCreate(BaseModel):
    name: str
    tagline: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    callback_url: Optional[str] = None
    scopes: List[str] = []
    target_segments: List[str] = []


class AppPatch(BaseModel):
    name: Optional[str] = None
    tagline: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    callback_url: Optional[str] = None
    scopes: Optional[List[str]] = None
    target_segments: Optional[List[str]] = None


class ReviewDecision(BaseModel):
    approve: bool
    notes: Optional[str] = None


class WebhookCreate(BaseModel):
    event: str
    url: str


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _serialize_app(a: DeveloperApp) -> Dict[str, Any]:
    return {
        "id": str(a.id), "name": a.name, "tagline": a.tagline,
        "description": a.description, "icon": a.icon,
        "callback_url": a.callback_url, "scopes": a.scopes or [],
        "target_segments": a.target_segments or [],
        "status": a.status, "review_notes": a.review_notes,
        "api_key_prefix": a.api_key_prefix,
        "published_segment_app_id": str(a.published_segment_app_id) if a.published_segment_app_id else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


async def _get_developer(db: AsyncSession, user: Dict[str, Any]) -> Developer:
    uid = uuid.UUID(str(user["user_id"]))
    dev = (await db.execute(
        select(Developer).where(Developer.user_id == uid))).scalar_one_or_none()
    if not dev:
        raise HTTPException(status_code=404, detail="Register as a developer first")
    return dev


def _require_admin(user: Dict[str, Any]) -> None:
    if not ADMIN_ROLES.intersection(user.get("roles") or []):
        raise HTTPException(status_code=403, detail="Admin or manager role required")


# --------------------------------------------------------------------------
# Developer registration + app CRUD
# --------------------------------------------------------------------------

@router.post("/developers/register", status_code=201)
async def register_developer(body: DeveloperRegister,
                             user: Dict[str, Any] = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    uid = uuid.UUID(str(user["user_id"]))
    existing = (await db.execute(
        select(Developer).where(Developer.user_id == uid))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Already registered as a developer")
    dev = Developer(id=uuid.uuid4(), user_id=uid, company_name=body.company_name,
                    website=body.website, status="verified")
    db.add(dev)
    await db.commit()
    logger.info("developer.registered", user=str(uid), company=body.company_name)
    return {"developer_id": str(dev.id), "status": dev.status}


@router.get("/developers/me")
async def developer_profile(user: Dict[str, Any] = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    dev = await _get_developer(db, user)
    apps = (await db.execute(
        select(DeveloperApp).where(DeveloperApp.developer_id == dev.id)
        .order_by(DeveloperApp.created_at.desc()))).scalars().all()
    return {
        "developer_id": str(dev.id), "company_name": dev.company_name,
        "status": dev.status, "apps": [_serialize_app(a) for a in apps],
        "available_scopes": AVAILABLE_SCOPES,
    }


@router.post("/developers/apps", status_code=201)
async def create_app(body: AppCreate,
                     user: Dict[str, Any] = Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    dev = await _get_developer(db, user)
    bad = [s for s in body.scopes if s not in AVAILABLE_SCOPES]
    if bad:
        raise HTTPException(status_code=422, detail=f"Unknown scopes: {bad}")
    app = DeveloperApp(id=uuid.uuid4(), developer_id=dev.id, **body.model_dump())
    db.add(app)
    await db.commit()
    return {"app": _serialize_app(app)}


@router.patch("/developers/apps/{app_id}")
async def update_app(app_id: str, body: AppPatch,
                     user: Dict[str, Any] = Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    dev = await _get_developer(db, user)
    app = (await db.execute(select(DeveloperApp).where(
        DeveloperApp.id == uuid.UUID(app_id),
        DeveloperApp.developer_id == dev.id))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    if app.status in ("submitted", "approved"):
        raise HTTPException(status_code=409,
                            detail="App is under review or approved — edits locked")
    data = body.model_dump(exclude_unset=True)
    if "scopes" in data:
        bad = [s for s in (data["scopes"] or []) if s not in AVAILABLE_SCOPES]
        if bad:
            raise HTTPException(status_code=422, detail=f"Unknown scopes: {bad}")
    for k, v in data.items():
        setattr(app, k, v)
    await db.commit()
    return {"app": _serialize_app(app)}


@router.post("/developers/apps/{app_id}/submit")
async def submit_for_review(app_id: str,
                            user: Dict[str, Any] = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    dev = await _get_developer(db, user)
    app = (await db.execute(select(DeveloperApp).where(
        DeveloperApp.id == uuid.UUID(app_id),
        DeveloperApp.developer_id == dev.id))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    if app.status != "draft":
        raise HTTPException(status_code=409, detail=f"App is already {app.status}")
    if not app.scopes:
        raise HTTPException(status_code=422, detail="Request at least one scope")
    app.status = "submitted"
    await db.commit()
    logger.info("developer.app_submitted", app=str(app.id), name=app.name)
    from app.infrastructure.middleware_adapters import get_temporal
    wf = await get_temporal().start_vetting_sla(str(app.id))
    return {"app": _serialize_app(app), "workflow": wf}


# --------------------------------------------------------------------------
# Admin vetting
# --------------------------------------------------------------------------

@router.get("/admin/developer-apps")
async def admin_list_apps(status: Optional[str] = None,
                          user: Dict[str, Any] = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    _require_admin(user)
    q = select(DeveloperApp).order_by(DeveloperApp.created_at.desc())
    if status:
        q = q.where(DeveloperApp.status == status)
    apps = (await db.execute(q)).scalars().all()
    return {"apps": [_serialize_app(a) for a in apps]}


@router.post("/admin/developer-apps/{app_id}/review")
async def admin_review_app(app_id: str, body: ReviewDecision,
                           user: Dict[str, Any] = Depends(get_current_user),
                           db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Approve (issues an API key, shown once) or reject with notes."""
    _require_admin(user)
    try:  # Permify fine-grained authorization (roles are the coarse floor)
        from app.services.permify_service import get_permify_service
        permify = get_permify_service()
        if permify is not None:
            result = await permify.check_permission(
                entity_type="developer_app", entity_id=str(app_id),
                permission="review", subject_type="user",
                subject_id=str(user["user_id"]))
            allowed = getattr(result, "allowed", True)
            if hasattr(allowed, "value"):
                allowed = allowed.value == "allowed"
            if allowed is False:
                raise HTTPException(status_code=403,
                                    detail="Permify: no review permission on this app")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — Permify down must not block admins
        logger.warning("permify.check_failed", error=str(exc))
    app = (await db.execute(
        select(DeveloperApp).where(DeveloperApp.id == uuid.UUID(app_id)))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    if app.status not in ("submitted", "suspended", "approved"):
        raise HTTPException(status_code=409, detail=f"Cannot review an app in '{app.status}'")

    out: Dict[str, Any] = {}
    if body.approve:
        raw_key = f"nbk_live_{secrets.token_urlsafe(24)}"
        app.api_key_hash = _hash_key(raw_key)
        app.api_key_prefix = raw_key[:16]
        app.status = "approved"
        out["api_key"] = raw_key  # shown exactly once
    else:
        app.status = "rejected"
    app.review_notes = body.notes
    await db.commit()
    logger.info("developer.app_reviewed", app=str(app.id), approved=body.approve,
                by=user.get("email"))
    out["app"] = _serialize_app(app)
    return out


@router.post("/admin/developer-apps/{app_id}/publish")
async def admin_publish_app(app_id: str,
                            user: Dict[str, Any] = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Publish an approved app into its target segment storefronts by
    creating SegmentApp tiles that deep-link to the developer surface."""
    _require_admin(user)
    try:  # Permify fine-grained authorization (roles are the coarse floor)
        from app.services.permify_service import get_permify_service
        permify = get_permify_service()
        if permify is not None:
            result = await permify.check_permission(
                entity_type="developer_app", entity_id=str(app_id),
                permission="review", subject_type="user",
                subject_id=str(user["user_id"]))
            allowed = getattr(result, "allowed", True)
            if hasattr(allowed, "value"):
                allowed = allowed.value == "allowed"
            if allowed is False:
                raise HTTPException(status_code=403,
                                    detail="Permify: no review permission on this app")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — Permify down must not block admins
        logger.warning("permify.check_failed", error=str(exc))
    app = (await db.execute(
        select(DeveloperApp).where(DeveloperApp.id == uuid.UUID(app_id)))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    if app.status != "approved":
        raise HTTPException(status_code=409, detail="Only approved apps can be published")

    created: List[str] = []
    for seg_key in (app.target_segments or []):
        seg = (await db.execute(
            select(Segment).where(Segment.key == seg_key))).scalar_one_or_none()
        if not seg:
            continue
        tile_key = f"ext-{app.id.hex[:8]}"
        existing = (await db.execute(select(SegmentApp).where(
            SegmentApp.segment_id == seg.id, SegmentApp.key == tile_key))).scalar_one_or_none()
        if existing:
            continue
        tile = SegmentApp(
            id=uuid.uuid4(), segment_id=seg.id, key=tile_key,
            name=app.name, tagline=app.tagline,
            route=f"/external-apps/{app.id}", icon=app.icon or "Puzzle",
            is_enabled=True, sort_order=100,
        )
        db.add(tile)
        created.append(seg_key)
        if app.published_segment_app_id is None:
            await db.flush()
            app.published_segment_app_id = tile.id
    await db.commit()
    logger.info("developer.app_published", app=str(app.id), segments=created)
    integ = get_platform_integration()
    await integ.emit("DeveloperAppPublished", aggregate_id=str(app.id),
                     aggregate_type="developer_app",
                     payload={"name": app.name, "segments": created},
                     user_id=str(user["user_id"]))
    return {"published_to": created, "app": _serialize_app(app)}


# --------------------------------------------------------------------------
# Webhooks (HMAC-SHA256 signed)
# --------------------------------------------------------------------------

@router.post("/developers/apps/{app_id}/webhooks", status_code=201)
async def create_webhook(app_id: str, body: WebhookCreate,
                         user: Dict[str, Any] = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    dev = await _get_developer(db, user)
    app = (await db.execute(select(DeveloperApp).where(
        DeveloperApp.id == uuid.UUID(app_id),
        DeveloperApp.developer_id == dev.id))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="App not found")
    secret = secrets.token_hex(32)
    wh = DeveloperWebhook(id=uuid.uuid4(), app_id=app.id, event=body.event,
                          url=body.url, secret=secret)
    db.add(wh)
    await db.commit()
    # Secret is shown once; deliveries sign with X-NB-Signature: sha256=HMAC(secret, body)
    return {"webhook_id": str(wh.id), "event": wh.event, "url": wh.url, "secret": secret}


# --------------------------------------------------------------------------
# Third-party API auth (for developer-built apps calling our API)
# --------------------------------------------------------------------------

async def verify_api_key(request: Request,
                         db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Dependency for endpoints exposed to third-party apps.

    Header: `X-NB-Api-Key: nbk_live_...`
    Returns {"app_id": ..., "scopes": [...]}. Enforces approval status.
    """
    raw = request.headers.get("X-NB-Api-Key")
    if not raw:
        raise HTTPException(status_code=401, detail="Missing X-NB-Api-Key header")
    app = (await db.execute(select(DeveloperApp).where(
        DeveloperApp.api_key_hash == _hash_key(raw)))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if app.status != "approved":
        raise HTTPException(status_code=403, detail=f"App is {app.status}")
    return {"app_id": str(app.id), "app_name": app.name, "scopes": app.scopes or []}


def require_scope(scope: str):
    """Scope-enforcing wrapper around verify_api_key."""
    async def _dep(ctx: Dict[str, Any] = Depends(verify_api_key)) -> Dict[str, Any]:
        if scope not in ctx["scopes"]:
            raise HTTPException(status_code=403, detail=f"Scope '{scope}' required")
        return ctx
    return _dep


# Demo partner endpoint — proves the auth path end-to-end.
@router.get("/partner/ping")
async def partner_ping(ctx: Dict[str, Any] = Depends(require_scope("accounts:read"))) -> Dict[str, Any]:
    return {"ok": True, "app": ctx["app_name"], "time": datetime.now(timezone.utc).isoformat()}
