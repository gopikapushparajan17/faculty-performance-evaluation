from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.database import get_user_by_id
from app.deps import get_current_user
from app.models import User
from app.publication_verifier import verify_publication

router = APIRouter()


class PublicationVerifyRequest(BaseModel):
    publication_url: str

    @field_validator("publication_url")
    @classmethod
    def publication_url_not_empty(cls, value: str) -> str:
        if not value or not str(value).strip():
            raise ValueError("publication_url must not be empty")
        return str(value).strip()


@router.post("/verify")
def verify_publication_route(
    body: PublicationVerifyRequest,
    current_user: User = Depends(get_current_user),
):
    user = get_user_by_id(current_user.id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return verify_publication(body.publication_url,  faculty=user,)
