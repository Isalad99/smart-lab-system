from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
import models
from database import get_db

router = APIRouter(tags=["Gatekeeper"])


class ScanData(BaseModel):
    email: str = Field(..., description="email the AI identified at the door")
    lab_id: int
    score: float = Field(..., description="anti-spoofing confidence score")
    is_real: bool = Field(..., description="False if the model thinks it's a photo/spoof")


class ScanResponse(BaseModel):
    message: str
    user_name: str


@router.post("/gatekeeper/scan", response_model=ScanResponse, status_code=status.HTTP_200_OK)
def record_scan(data: ScanData, db: Session = Depends(get_db)):
    if not data.is_real:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: Spoofing detected.")

    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access denied: User not found.")

    lab = db.query(models.Lab).filter(models.Lab.id == data.lab_id).first()
    if not lab:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access denied: Lab not found.")

    try:
        scan_time = datetime.now()
        db.add(models.LabAccessLog(
            lab_id=data.lab_id,
            user_id=user.id,
            entry_time=scan_time,
            exit_time=scan_time,
            access_type="entry",
            status="success",
            device_used="AI Gatekeeper Kiosk",
            session_status="completed",
            end_reason="gatekeeper_scan",
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"DB error: {str(e)}")

    return ScanResponse(message="Access Granted", user_name=f"{user.first_name} {user.last_name}")
