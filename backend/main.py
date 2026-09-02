from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pathlib import Path
from fastapi.staticfiles import StaticFiles
from app.routes import auth, faculty, evaluations, upload, publications

app = FastAPI(title="Faculty Performance Evaluation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(faculty.router, prefix="/api/faculty", tags=["faculty"])
app.include_router(evaluations.router, prefix="/api/evaluations", tags=["evaluations"])
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(publications.router, prefix="/api/publications", tags=["publications"])

# Serve local uploads when S3 not configured
if Path("uploads").exists():
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/api/health")
def health():
    return {"status": "ok"}
