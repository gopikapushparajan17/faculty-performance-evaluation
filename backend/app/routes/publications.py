from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.crud import get_user_by_id
from app.deps import get_current_user
from app.models import User
from app.publication_verifier import verify_publication

router = APIRouter()



class PublicationVerifyRequest(BaseModel):
    publication_url: str | None = None
    title: str | None = None
    issn: str | None = None
    eissn: str | None = None

    @field_validator("publication_url", "title", "issn", "eissn")
    @classmethod
    def strip_optional_values(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None




@router.post("/verify")
def verify_publication_route(
    body: PublicationVerifyRequest,
    current_user: User = Depends(get_current_user),
):
    user = get_user_by_id(current_user.id)

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if body.publication_url:
        return verify_publication(
            body.publication_url,
            faculty=user,
        )

    if body.title and (body.issn or body.eissn):
        return verify_publication(
            None,
            faculty=user,
            title=body.title,
            issn=body.issn,
            eissn=body.eissn,
        )

    raise HTTPException(
        status_code=422,
        detail=(
            "Provide a publication URL/DOI, or a paper title "
            "together with a journal ISSN or e-ISSN."
        ),
    )
