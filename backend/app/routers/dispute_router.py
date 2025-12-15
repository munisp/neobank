"""API Router for Dispute Service"""
from fastapi import APIRouter
from typing import Dict, Any

router = APIRouter(prefix="/dispute", tags=["dispute"])

@router.post("/")
async def create_dispute(data: Dict[str, Any]):
    return {"success": True, "message": "dispute operation completed"}

@router.get("/{id}")
async def get_dispute(id: str):
    return {"success": True, "id": id}
