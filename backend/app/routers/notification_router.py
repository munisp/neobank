"""API Router for Notification Service"""
from fastapi import APIRouter
from typing import Dict, Any

router = APIRouter(prefix="/notification", tags=["notification"])

@router.post("/")
async def create_notification(data: Dict[str, Any]):
    return {"success": True, "message": "notification operation completed"}

@router.get("/{id}")
async def get_notification(id: str):
    return {"success": True, "id": id}
