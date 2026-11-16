from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from jose import JWTError, jwt
from app.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from app.crud import (
    get_user_by_email,
    create_password_reset_token,
    verify_password_reset_token,
    verify_and_use_password_reset_token,
    send_password_reset_email,
)

router = APIRouter()


class LoginRequest(BaseModel):
    username: str  # email
    password: str
    college_id: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    department: str | None = None


def verify_password(plain: str, hashed: str) -> bool:
    import bcrypt
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


@router.post("/login")
def login(req: LoginRequest):
    user = get_user_by_email(req.username)

    if not user or not user.password_hash or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({
        "sub": str(user.id),
        "role": user.role
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,
            department=user.department
        ),
    }

@router.post("/token")
def token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user_by_email(form_data.username)

    if (
        not user
        or not user.password_hash
        or not verify_password(form_data.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    access_token = create_access_token({
        "sub": str(user.id),
        "role": user.role
    })

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    email = req.email.strip() if req.email else ""
    if email:
        user = get_user_by_email(email)
        if user:
            try:
                token = create_password_reset_token(int(user.id))
                send_password_reset_email(user.email, token)
            except Exception as e:
                print(f"[Forgot Password] Error: {e}")

    # Always return a generic response to prevent email enumeration
    return {
        "message": "If your institutional email is registered in the system, you will receive a password reset link shortly."
    }


@router.get("/verify-reset-token")
def verify_reset_token_route(token: str):
    valid, message, _ = verify_password_reset_token(token)
    if not valid:
        raise HTTPException(status_code=400, detail=message)
    return {"valid": True, "message": message}


@router.post("/reset-password")
def reset_password_route(req: ResetPasswordRequest):
    success, message = verify_and_use_password_reset_token(req.token, req.new_password)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"message": message}