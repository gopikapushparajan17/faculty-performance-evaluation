import io
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, UploadFile, HTTPException, Form

from app.config import S3_BUCKET
from app import s3

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".jpg", ".jpeg", ".png"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
MAX_SIZE_MB = 10
BLUR_VARIANCE_THRESHOLD = 30.0


def _is_blurry(content: bytes) -> bool:
    try:
        from PIL import Image, ImageFilter, ImageStat
        img = Image.open(io.BytesIO(content)).convert("L")
        if min(img.size) < 50:
            return True
        edges = img.filter(ImageFilter.FIND_EDGES)
        stat = ImageStat.Stat(edges)
        return stat.var[0] < BLUR_VARIANCE_THRESHOLD
    except Exception:
        return False


@router.post("")
async def upload_proof(
    file: UploadFile = File(...),
    prefix: str = Form(""),
):
    """Upload a proof file (PDF/DOCX/JPG/PNG). Returns { "url": "..." }."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Allowed types: PDF, DOCX, JPG, PNG. Got {ext or 'unknown'}")

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large (max {MAX_SIZE_MB}MB)")

    if ext in IMAGE_EXTENSIONS and _is_blurry(content):
        raise HTTPException(
            400,
            "The uploaded image appears to be blurry or low-quality. "
            "Please upload a clear, readable screenshot or photograph."
        )

    content_type = file.content_type or "application/octet-stream"
    safe_name = (file.filename or "file").replace(" ", "_")

    if S3_BUCKET:
        try:
            url = s3.upload_file(content, safe_name, content_type, prefix=prefix)
            return {"url": url}
        except Exception as e:
            raise HTTPException(502, f"S3 upload failed: {e}")

    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)
    sub = Path(prefix) if prefix else Path("proofs")
    (upload_dir / sub).mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    path = upload_dir / sub / name
    path.write_bytes(content)
    return {"url": f"/uploads/{sub}/{name}"}
