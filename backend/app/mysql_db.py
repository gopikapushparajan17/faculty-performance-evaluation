import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Load .env from the backend directory (where local dev config lives).
# When variables are already set in the environment (Docker / CI / production),
# load_dotenv() is a no-op — pre-existing values always take precedence.
load_dotenv()

DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD")
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_NAME = os.environ.get("DB_NAME", "faculty_evaluation")

if not DB_PASSWORD:
    raise RuntimeError(
        "DB_PASSWORD environment variable is not set. "
        "Create a backend/.env file with DB_PASSWORD=<your password>."
    )

DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"

engine = create_engine(
    DATABASE_URL,
    echo=False
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()