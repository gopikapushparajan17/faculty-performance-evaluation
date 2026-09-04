from __future__ import annotations

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.config import SECRET_KEY, ALGORITHM
from app.database import get_user_by_id
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def get_current_user(token: str = Depends(oauth2_scheme)):
    print("TOKEN:", token)

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        print("PAYLOAD:", payload)

        user_id = payload.get("sub")
        print("USER_ID:", user_id)

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing subject")

    except JWTError as e:
        print("JWT ERROR:", e)
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = get_user_by_id(str(user_id))
    print("USER:", user)

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


def require_role(*roles: str):
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Access denied")
        return user

    return _dep

