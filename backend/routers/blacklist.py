from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional
import models
from database import get_db
from policy import DEFAULT_MATCH_TYPE, SUPPORTED_MATCH_TYPES, serialize_rule

router = APIRouter(prefix="/admin/blacklist", tags=["Blacklist"])


class BlacklistCreate(BaseModel):
    app_name: str = Field(..., example="BitTorrent")
    description: Optional[str] = Field(None, example="ห้ามใช้โปรแกรมโหลดไฟล์ละเมิดลิขสิทธิ์")
    match_type: str = Field(DEFAULT_MATCH_TYPE, example="process_name_or_title")
    match_value: Optional[str] = Field(None, example="bittorrent")
    enabled: bool = True

class BlacklistUpdate(BaseModel):
    description: Optional[str] = None
    match_type: Optional[str] = None
    match_value: Optional[str] = None
    enabled: Optional[bool] = None


def _validate_match_type(value: str) -> str:
    normalized = (value or DEFAULT_MATCH_TYPE).strip().casefold()
    if normalized not in SUPPORTED_MATCH_TYPES:
        allowed = ", ".join(sorted(SUPPORTED_MATCH_TYPES))
        raise HTTPException(status_code=422, detail=f"Unsupported match_type. Use: {allowed}.")
    return normalized


def _resolve_match_value(app_name: str, match_value: Optional[str]) -> str:
    resolved = (match_value or app_name).strip()
    if not resolved:
        raise HTTPException(status_code=422, detail="match_value cannot be empty.")
    return resolved


@router.get("")
def get_all(db: Session = Depends(get_db)):
    apps = db.query(models.BlacklistedApp).order_by(models.BlacklistedApp.created_at.desc()).all()
    return {"data": [serialize_rule(app, include_created_at=True) for app in apps]}


@router.post("")
def create(payload: BlacklistCreate, db: Session = Depends(get_db)):
    app_name = payload.app_name.strip()
    if not app_name:
        raise HTTPException(status_code=422, detail="app_name cannot be empty.")

    exists = db.query(models.BlacklistedApp).filter(
        models.BlacklistedApp.app_name == app_name
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail=f'"{app_name}" is already blacklisted.')

    match_type = _validate_match_type(payload.match_type)
    match_value = _resolve_match_value(app_name, payload.match_value)
    db.add(
        models.BlacklistedApp(
            app_name=app_name,
            description=payload.description,
            match_type=match_type,
            match_value=match_value,
            enabled=payload.enabled,
        )
    )
    db.commit()
    return {"message": f'"{app_name}" added to blacklist.'}


@router.put("/{app_id}")
def update(app_id: int, payload: BlacklistUpdate, db: Session = Depends(get_db)):
    app = db.query(models.BlacklistedApp).filter(models.BlacklistedApp.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="App not found.")

    if payload.description is not None:
        app.description = payload.description
    if payload.match_type is not None:
        app.match_type = _validate_match_type(payload.match_type)
    if payload.match_value is not None:
        app.match_value = _resolve_match_value(app.app_name, payload.match_value)
    if payload.enabled is not None:
        app.enabled = payload.enabled
    db.commit()
    return {"message": "Blacklist rule updated."}


@router.delete("/{app_id}")
def delete(app_id: int, db: Session = Depends(get_db)):
    app = db.query(models.BlacklistedApp).filter(models.BlacklistedApp.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="App not found.")

    db.delete(app)
    db.commit()
    return {"message": f'"{app.app_name}" removed from blacklist.'}
