# Faculty Performance Evaluation System

React + Vite frontend and FastAPI backend with a **blue theme** and role-based dashboards (HOD, Faculty, Principal).

## Stack

- **Frontend:** React, Vite, Tailwind CSS, React Hook Form, Zod, Axios, React Router, Context API
- **Backend:** FastAPI (API only)
- **Design:** Primary `#1e3a8a`, Secondary `#2563eb`, Accent `#60a5fa`, Background `#f8fafc`

## Run locally

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The dev server proxies `/api` to `http://localhost:8000`.

### Demo login

| Role     | Email             | Password |
|----------|-------------------|----------|
| HOD      | hod@demo.com      | demo123  |
| Faculty  | faculty@demo.com  | demo123  |
| Principal| principal@demo.com| demo123  |

## Features

- **Login:** College dropdown, email, password; JWT stored in localStorage.
- **Dashboard:** Role-based (HOD: department evaluations + faculty list; Faculty: own evaluation; Principal: all evaluations).
- **Faculty Details:** Department, Employee ID/Name, ORCID, Email, Phone (HOD only).
- **Evaluation Form:** 12 collapsible modules with auto point calculation and proof upload (PDF/JPG/PNG).
- **Point rules:** Student Feedback (%), Conference (4×4), Book Chapters (4×6), Books (authored/edited), IPR, Funded projects, FDP attended/organized, Talks, Dept/Inst activities — all as per spec.
- **Signatures:** Draft → Submitted → Faculty Signed → HOD Signed → Approved.

## Proof uploads (S3)

Proof files (PDF/JPG/PNG) are uploaded via `POST /api/upload`. With S3 configured, files are stored in S3 and the returned URL is saved in the evaluation.

### S3 configuration (optional)

Set these environment variables before starting the backend:

| Variable | Description |
|----------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `AWS_REGION` | e.g. `us-east-1` |
| `S3_BUCKET` | Bucket name |
| `S3_PREFIX` | Key prefix (default: `evaluation-proofs`) |
| `S3_ENDPOINT_URL` | Optional (e.g. for MinIO / LocalStack) |
| `S3_USE_PATH_STYLE` | Set to `1` for MinIO/LocalStack |

If `S3_BUCKET` is not set, files are stored under the backend `uploads/` directory and served at `/uploads/...`.

## Project layout

- `frontend/` — React app
- `backend/` — FastAPI app (`main.py`, `app/s3.py`, `app/routes/`, `app/models.py`, `app/database.py`)
