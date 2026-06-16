from fastapi import APIRouter, HTTPException, Depends
from app.crud import create_faculty, get_faculty, list_faculty, update_faculty
from app.models import FacultyProfile
from pydantic import BaseModel
from app.deps import get_current_user, require_role
from app.models import User

router = APIRouter()


class FacultyCreate(BaseModel):
    department_name: str
    employee_id: str
    employee_name: str
    orcid_id: str = ""
    official_email: str
    phone_number: str


@router.get("")
def list_faculty_route(_: User = Depends(get_current_user)):
    return list_faculty()


@router.get("/{fid}")
def get_faculty_route(fid: str, _: User = Depends(get_current_user)):
    f = get_faculty(fid)
    if not f:
        raise HTTPException(404, "Faculty not found")
    return f


@router.post("", response_model=FacultyProfile)
def create_faculty_route(body: FacultyCreate, _: User = Depends(require_role("faculty"))):
    return create_faculty(body.model_dump())


@router.put("/{fid}")
def update_faculty_route(fid: str, body: FacultyCreate, _: User = Depends(require_role("faculty"))):
    f = update_faculty(fid, body.model_dump())
    if not f:
        raise HTTPException(404, "Faculty not found")
    return f
