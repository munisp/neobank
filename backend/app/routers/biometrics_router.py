"""API Router for Biometrics Service"""
from fastapi import APIRouter
from typing import Dict, Any

router = APIRouter(prefix="/biometrics", tags=["biometrics"])

@router.post("/")
async def create_biometrics(data: Dict[str, Any]):
    return {"success": True, "message": "biometrics operation completed"}

@router.get("/{id}")
async def get_biometrics(id: str):
    return {"success": True, "id": id}
