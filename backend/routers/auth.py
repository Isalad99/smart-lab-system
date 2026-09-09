import io
import os
import random
from functools import lru_cache
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from PIL import Image
import models, schemas
from database import get_db
from utils import send_otp_mail, create_access_token, pwd_context, UPLOAD_DIR

router = APIRouter(tags=["Authentication"])
MAX_FACE_IMAGE_BYTES = 5 * 1024 * 1024


@lru_cache(maxsize=1)
def _get_deepface():
    """Load the face model only for registration, not for every API startup."""
    os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "2")
    os.environ.setdefault("TF_NUM_INTEROP_THREADS", "1")
    os.environ.setdefault("OMP_NUM_THREADS", "2")
    from deepface import DeepFace

    return DeepFace


@router.post("/request-otp")
async def request_otp(request: schemas.OTPRequest, db: Session = Depends(get_db)):
    # bail early if email is already taken
    if db.query(models.User).filter(models.User.email == request.email).first():
        raise HTTPException(status_code=400, detail="This email is already registered.")

    # bumail.net = student, anything else = guest
    domain = request.email.split("@")[-1]
    account_type = "student" if domain == "bumail.net" else "general"

    otp_code = str(random.randint(100000, 999999))

    # clear any old OTP for this email before issuing a new one
    db.query(models.UserOTP).filter(models.UserOTP.email == request.email).delete()
    db.add(models.UserOTP(email=request.email, otp_code=otp_code))
    db.commit()

    try:
        await send_otp_mail(request.email, otp_code)
        return {"message": f"OTP sent to {request.email}", "account_type": account_type}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")


@router.post("/verify-otp")
def verify_otp(request: schemas.OTPVerify, db: Session = Depends(get_db)):
    db_otp = db.query(models.UserOTP).filter(
        models.UserOTP.email == request.email,
        models.UserOTP.otp_code == request.otp,
    ).first()
    if not db_otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")
    return {"message": "OTP Verified Successfully!"}


@router.post("/register")
async def register(
    email: str = Form(...),
    otp: str = Form(...),
    password: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    student_id: str = Form(None),
    faculty: str = Form(None),
    department: str = Form(None),
    phone: str = Form(None),
    face_image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # re-verify OTP at registration time so you can't skip step 2
    db_otp = db.query(models.UserOTP).filter(
        models.UserOTP.email == email,
        models.UserOTP.otp_code == otp,
    ).first()
    if not db_otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

    # resize and save the face image before running DeepFace
    try:
        image_data = await face_image.read(MAX_FACE_IMAGE_BYTES + 1)
        if len(image_data) > MAX_FACE_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Face image is too large.")
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        image.thumbnail((200, 200))
        safe_email = email.replace("@", "_").replace(".", "_")
        file_path = f"{UPLOAD_DIR}/{safe_email}.jpg"
        image.save(file_path, "JPEG", quality=85)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to process image file.")

    # enforce_detection=True raises an exception if no face is found
    try:
        embedding_objs = _get_deepface().represent(
            img_path=file_path,
            model_name="Facenet",
            enforce_detection=True,
        )
        face_embedding_vector = embedding_objs[0]["embedding"]
    except HTTPException:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except Exception:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=400, detail="No face detected in the image.")

    try:
        # bcrypt silently truncates at 72 bytes, so we do it explicitly
        hashed_password = pwd_context.hash(password)
        new_user = models.User(
            email=email,
            password=hashed_password,
            first_name=first_name,
            last_name=last_name,
            profile_pic=file_path,
            face_embedding=face_embedding_vector,
        )
        db.add(new_user)
        db.flush()  # get new_user.id before inserting child records

        domain = email.split("@")[-1]
        role_name = "student" if domain == "bumail.net" else "guest"
        role = db.query(models.Role).filter(models.Role.name == role_name).first()

        if domain == "bumail.net":
            db.add(models.Student(
                student_id=student_id,
                user_id=new_user.id,
                faculty=faculty,
                department=department,
                is_active=True,
            ))
        else:
            # guests start inactive — they need admin approval before they can log in
            db.add(models.UserPassport(phone=phone, user_id=new_user.id, is_active=False))

        if role:
            db.add(models.UserRole(user_id=new_user.id, role_id=role.id))

        db.delete(db_otp)  # OTP is single-use
        db.commit()
        return {"message": "Registration successful!"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()

    # bcrypt 72-byte limit — keep consistent with register
    safe_pwd = form_data.password.encode("utf-8")[:72].decode("utf-8", "ignore")
    if not user or not pwd_context.verify(form_data.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    user_role = db.query(models.Role.name).join(models.UserRole).filter(
        models.UserRole.user_id == user.id
    ).first()
    role_name = user_role[0] if user_role else "guest"

    # guests can't log in until admin approves them
    if role_name == "guest":
        passport = db.query(models.UserPassport).filter(models.UserPassport.user_id == user.id).first()
        if passport and not passport.is_active:
            raise HTTPException(status_code=403, detail="Your account is pending admin approval.")

    access_token = create_access_token(data={"sub": user.email, "role": role_name})
    return {"access_token": access_token, "token_type": "bearer"}
