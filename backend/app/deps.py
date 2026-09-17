from __future__ import annotations

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.config import SECRET_KEY, ALGORITHM
from app.crud import get_user_by_id
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")

        if not user_id:
            print("Authentication failed: token missing subject")
            raise HTTPException(status_code=401, detail="Invalid token: missing subject")

    except JWTError:
        print("Authentication failed: invalid or expired token")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = get_user_by_id(str(user_id))

    if not user:
        print(f"User lookup failed for user_id={user_id}")
        raise HTTPException(status_code=401, detail="User not found")

    print(f"Authentication successful for user_id={user.id}, role={user.role}")
    return user


def require_role(*roles: str):
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Access denied")
        return user

    return _dep

