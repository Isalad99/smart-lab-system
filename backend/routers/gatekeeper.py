import hmac
import os
from datetime import datetime
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
import models
from database import get_db
from face_service import FACE_MODEL_NAME, get_deepface

router = APIRouter(tags=["Gatekeeper"])
MAX_FACE_IMAGE_BYTES = 5 * 1024 * 1024
DEFAULT_FACE_MATCH_MAX_COSINE_DISTANCE = 0.40
DEFAULT_LIVENESS_THRESHOLD = 0.72
GATEKEEPER_API_KEY = os.getenv("GATEKEEPER_API_KEY")


class ScanData(BaseModel):
    email: str = Field(..., description="email the AI identified at the door")
    lab_id: int
    score: float = Field(..., description="anti-spoofing confidence score")
    is_real: bool = Field(..., description="False if the model thinks it's a photo/spoof")


class ScanResponse(BaseModel):
    message: str
    user_name: str


class IdentifyResponse(BaseModel):
    message: str
    user_id: int
    user_name: str
    liveness_score: float
    face_distance: float
    face_distance_threshold: float


def _float_setting(name: str, fallback: float) -> float:
    try:
        return float(os.getenv(name, str(fallback)))
    except (TypeError, ValueError):
        return fallback


def _cosine_distance(left: np.ndarray, right: np.ndarray) -> float:
    left_norm = float(np.linalg.norm(left))
    right_norm = float(np.linalg.norm(right))
    if left_norm == 0 or right_norm == 0:
        raise ValueError("Face embedding has zero length.")
    return float(1.0 - np.dot(left, right) / (left_norm * right_norm))


@router.post("/gatekeeper/identify", response_model=IdentifyResponse, status_code=status.HTTP_200_OK)
async def identify_face(
    lab_code: str = Form(...),
    liveness_score: float = Form(...),
    face_image: UploadFile = File(...),
    gatekeeper_key: Optional[str] = Header(default=None, alias="X-Gatekeeper-Key"),
    db: Session = Depends(get_db),
):
    """Verify liveness output and identify the closest stored face embedding.

    This endpoint intentionally does not create a LabAccessLog. The Agent owns
    the machine session because it also owns device identity and heartbeats.
    """
    if GATEKEEPER_API_KEY and not hmac.compare_digest(gatekeeper_key or "", GATEKEEPER_API_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid gatekeeper key.")

    if not 0 <= liveness_score <= 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid liveness score.")

    liveness_threshold = _float_setting(
        "GATEKEEPER_LIVENESS_THRESHOLD",
        DEFAULT_LIVENESS_THRESHOLD,
    )
    if liveness_score < liveness_threshold:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Liveness check failed.")

    cleaned_lab_code = lab_code.strip()
    lab = db.query(models.Lab).filter(models.Lab.code == cleaned_lab_code).first()
    if not lab:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab not found.")
    if lab.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Lab is not available.")

    image_data = await face_image.read(MAX_FACE_IMAGE_BYTES + 1)
    if len(image_data) > MAX_FACE_IMAGE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Face image is too large.")

    image_buffer = np.frombuffer(image_data, dtype=np.uint8)
    image = cv2.imdecode(image_buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid face image.")

    try:
        embedding_objects = get_deepface().represent(
            img_path=image,
            model_name=FACE_MODEL_NAME,
            detector_backend="opencv",
            enforce_detection=True,
            align=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to detect a face.") from exc

    if len(embedding_objects) != 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exactly one face is required.")

    probe_embedding = np.asarray(embedding_objects[0]["embedding"], dtype=np.float32)
    best_user = None
    best_distance = None

    users = db.query(models.User).filter(models.User.face_embedding.is_not(None)).all()
    for user in users:
        try:
            stored_embedding = np.asarray(user.face_embedding, dtype=np.float32)
            if stored_embedding.ndim != 1 or stored_embedding.shape != probe_embedding.shape:
                continue
            distance = _cosine_distance(probe_embedding, stored_embedding)
        except (TypeError, ValueError):
            continue

        if best_distance is None or distance < best_distance:
            best_user = user
            best_distance = distance

    match_threshold = _float_setting(
        "FACE_MATCH_MAX_COSINE_DISTANCE",
        DEFAULT_FACE_MATCH_MAX_COSINE_DISTANCE,
    )
    if best_user is None or best_distance is None or best_distance > match_threshold:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Face identity could not be verified.")

    return IdentifyResponse(
        message="Face identity verified.",
        user_id=best_user.id,
        user_name=f"{best_user.first_name} {best_user.last_name}",
        liveness_score=liveness_score,
        face_distance=best_distance,
        face_distance_threshold=match_threshold,
    )


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
