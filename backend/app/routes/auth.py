from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from jose import JWTError, jwt
from app.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from app.database import get_user_by_email, get_user_by_name

router = APIRouter()


class LoginRequest(BaseModel):
    username: str  # email
    password: str
    college_id: str | None = None


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
    if not user:
        user = get_user_by_name(req.username)
    if not user or not user.password_hash or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(
    {
        "sub": str(user.id),
        "role": user.role
    }
)
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
    if not user:
        user = get_user_by_name(form_data.username) 
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