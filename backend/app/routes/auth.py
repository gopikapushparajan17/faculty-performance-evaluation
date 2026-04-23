from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from jose import JWTError, jwt
from app.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from app.database import get_user_by_email, create_user, users_db

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


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    department: str | None = None


@router.post("/register", status_code=201)
def register(req: RegisterRequest):
    import bcrypt as _bcrypt
    if not req.name.strip():
        raise HTTPException(400, "Name is required")
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    hashed = _bcrypt.hashpw(req.password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")
    user = create_user(req.email.lower().strip(), req.name.strip(), hashed, "faculty", req.department)
    if user is None:
        raise HTTPException(409, "An account with this email already exists")
    token = create_access_token({"sub": user.id, "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse(id=user.id, email=user.email, name=user.name, role=user.role, department=user.department),
    }


@router.post("/login")
def login(req: LoginRequest):
    user = get_user_by_email(req.username)
    if not user or not user.password_hash or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token({"sub": user.id, "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse(id=user.id, email=user.email, name=user.name, role=user.role, department=user.department),
    }
