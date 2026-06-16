# Backend documentation (FastAPI)

## Location and entrypoint

- **Backend root**: `backend/`
- **Entry point**: `backend/main.py`
- **App title**: `Faculty Performance Evaluation API`
- **Base API prefix**: `/api`

## How to run (development)

From the repository root:

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Health check:

- `GET /api/health` → `{ "status": "ok" }`

## CORS

Configured in `backend/main.py` for:

- `http://localhost:5173`
- `http://localhost:5174`

## Code structure

### `backend/main.py`

- configures CORS
- mounts routes under:
  - `/api/auth`
  - `/api/faculty`
  - `/api/evaluations`
  - `/api/upload`
  - `/api/pdf`
- serves local uploads via `/uploads/*` when the `uploads/` folder exists

### `backend/app/config.py`

Reads environment variables with defaults:

- `SECRET_KEY` (default: `dev-secret-change-in-production`)
- `ALGORITHM` (HS256)
- `ACCESS_TOKEN_EXPIRE_MINUTES` (default: 1440 minutes = 24 hours)

S3 upload configuration:

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- `S3_BUCKET`, `S3_PREFIX`
- `S3_ENDPOINT_URL`, `S3_USE_PATH_STYLE`

### `backend/app/deps.py` (auth dependencies)

- `get_current_user()`:
  - decodes JWT
  - loads user from in-memory store
  - raises 401 if invalid/expired/missing user
- `require_role(*roles)`:
  - enforces role-based access

### `backend/app/models.py` (Pydantic models)

Key models:

- `User`: `{ id, email, name, role, department?, password_hash? }`
- `FacultyProfile`: employee and department details
- `Evaluation`:
  - `status`: `draft | faculty_approved | hod_approved | principal_approved | rejected`
  - `modules`: `EvaluationModules` (12 module sections)
  - `total_points`: integer
  - signatures and approvals:
    - `approvals`: dict containing role entries `{ name, signed_at, image? }`
    - `faculty_signature`, `hod_signature`, `principal_signature`
  - `pdf_viewed_by`: dict intended to track per-role PDF viewing (see known issues in `operations.md`)

### `backend/app/database.py` (in-memory persistence + scoring)

Contains:

- in-memory dictionaries: `users_db`, `users_by_id`, `faculty_db`, `evaluations_db`
- demo seeding (`_seed()`):
  - `hod@demo.com`, `faculty@demo.com`, `principal@demo.com`
  - password: `demo123`
- CRUD helpers for users/faculty/evaluations
- `_compute_total_points(modules)`:
  - recomputes total points server-side
  - uses a combination of:
    - counts of valid entries
    - caps (e.g. max 4 conference articles)
    - amount thresholds (funded projects)
    - proof type checks (Scopus vs file proof)

### `backend/app/routes/*` (API routes)

See `api.md` for the full endpoint list and payloads.

## File uploads

The upload route (`backend/app/routes/upload.py`) accepts:

- file types: `.pdf`, `.docx`, `.jpg`, `.jpeg`, `.png`
- max size: 10MB
- image blur detection (variance threshold = 30.0)

Storage targets:

- local: `backend/uploads/<prefix>/...` → returned URL `/uploads/<prefix>/<file>`
- S3: returned URL depends on configuration

## PDF generation

- route: `GET /api/pdf/{eid}`
- generates a PDF using `fpdf2`
- runs PDF build in a thread executor (`ThreadPoolExecutor(max_workers=2)`)

Current PDF content includes:

- faculty information section
- a points summary table (currently includes a subset of modules)
- total points

