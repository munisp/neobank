"""Notification router — fully persisted (PostgreSQL-backed).

Serves the PWA notification centre and push-subscription flow.
Mounted at both /notification (legacy) and /notifications (PWA contract).

Endpoints:
  GET    /                          list (paginated)
  GET    /unread-count
  POST   /                          create (internal/admin)
  POST   /{id}/read                 mark one read
  POST   /read-all                  mark all read
  DELETE /{id}                      delete one
  GET    /vapid-public-key          web-push public key
  POST   /subscribe                 register push subscription
  POST   /unsubscribe               remove push subscription
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.auth import get_current_user
from database.connection import get_db
from database.models import Notification, PushSubscription

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/notifications", tags=["Notifications"])
legacy_router = APIRouter(prefix="/notification", tags=["Notifications"])


class NotificationCreate(BaseModel):
    user_id: Optional[str] = None  # admin/system use; defaults to caller
    title: str
    body: Optional[str] = None
    type: str = "info"
    data: Optional[Dict[str, Any]] = None


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: Dict[str, str]           # {p256dh, auth}
    user_agent: Optional[str] = None


class UnsubscribeRequest(BaseModel):
    endpoint: str


def _serialize(n: Notification) -> Dict[str, Any]:
    return {
        "id": str(n.id),
        "title": n.title,
        "body": n.body,
        "type": n.type,
        "data": n.data or {},
        "is_read": n.is_read,
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


async def _list(user_id: uuid.UUID, db: AsyncSession, limit: int, offset: int, unread_only: bool):
    q = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        q = q.where(Notification.is_read.is_(False))
    q = q.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(q)).scalars().all()
    total_q = select(func.count(Notification.id)).where(Notification.user_id == user_id)
    total = (await db.execute(total_q)).scalar() or 0
    return {"notifications": [_serialize(n) for n in rows], "total": total}


@router.get("/")
async def list_notifications(
    limit: int = Query(50, le=200),
    offset: int = 0,
    unread_only: bool = False,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _list(uuid.UUID(current_user["user_id"]), db, limit, offset, unread_only)


@router.get("/unread-count")
async def unread_count(current_user: dict = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    count = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == uuid.UUID(current_user["user_id"]),
            Notification.is_read.is_(False),
        ))).scalar() or 0
    return {"unread_count": count}


@router.post("/")
async def create_notification(payload: NotificationCreate,
                              current_user: dict = Depends(get_current_user),
                              db: AsyncSession = Depends(get_db)):
    target = uuid.UUID(payload.user_id) if payload.user_id else uuid.UUID(current_user["user_id"])
    if payload.user_id and "admin" not in current_user.get("roles", []):
        raise HTTPException(status_code=403, detail="Only admins can notify other users")
    n = Notification(user_id=target, title=payload.title[:255], body=payload.body,
                     type=payload.type, data=payload.data)
    db.add(n)
    await db.commit()
    await db.refresh(n)
    return {"success": True, "notification": _serialize(n)}


@router.api_route("/{notification_id}/read", methods=["POST", "PUT"])
async def mark_read(notification_id: uuid.UUID,
                    current_user: dict = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        update(Notification)
        .where(Notification.id == notification_id,
               Notification.user_id == uuid.UUID(current_user["user_id"]))
        .values(is_read=True, read_at=datetime.now(timezone.utc))
        .returning(Notification.id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    await db.commit()
    return {"success": True}


@router.api_route("/read-all", methods=["POST", "PUT"])
async def mark_all_read(current_user: dict = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == uuid.UUID(current_user["user_id"]),
               Notification.is_read.is_(False))
        .values(is_read=True, read_at=datetime.now(timezone.utc)))
    await db.commit()
    return {"success": True}


@router.delete("/{notification_id}")
async def delete_notification(notification_id: uuid.UUID,
                              current_user: dict = Depends(get_current_user),
                              db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        delete(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == uuid.UUID(current_user["user_id"])))
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}


@router.get("/vapid-public-key")
async def vapid_public_key():
    key = os.environ.get("VAPID_PUBLIC_KEY", "")
    return {"public_key": key, "configured": bool(key)}


@router.post("/subscribe")
async def subscribe(payload: SubscribeRequest,
                    current_user: dict = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    ).scalar_one_or_none()
    if existing:
        existing.keys = payload.keys
        existing.user_id = uuid.UUID(current_user["user_id"])
    else:
        db.add(PushSubscription(
            user_id=uuid.UUID(current_user["user_id"]),
            endpoint=payload.endpoint, keys=payload.keys,
            user_agent=payload.user_agent))
    await db.commit()
    return {"success": True}


@router.post("/unsubscribe")
async def unsubscribe(payload: UnsubscribeRequest,
                      current_user: dict = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == payload.endpoint,
            PushSubscription.user_id == uuid.UUID(current_user["user_id"])))
    await db.commit()
    return {"success": True}


# --- legacy singular mount (kept for backward compatibility) -----------------
@legacy_router.post("/")
async def create_notification_legacy(data: Dict[str, Any]):
    return {"success": True, "message": "use /notifications/"}


@legacy_router.get("/{id}")
async def get_notification_legacy(id: str):
    return {"success": True, "id": id, "message": "use /notifications/"}
