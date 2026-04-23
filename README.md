# Faculty Performance Evaluation System

A full-stack web application for managing faculty performance evaluations with a multi-stage approval workflow (Faculty → HOD → Principal).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Cloning the Repository](#2-cloning-the-repository)
3. [Backend Setup](#3-backend-setup)
4. [Frontend Setup](#4-frontend-setup)
5. [Running the Application](#5-running-the-application)
6. [Demo Accounts](#6-demo-accounts)
7. [Features Overview](#7-features-overview)
8. [Project Structure](#8-project-structure)
9. [Environment Variables](#9-environment-variables)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

Install the following on the target machine before proceeding.

| Tool | Minimum Version | Download |
|------|----------------|---------|
| Python | 3.11+ | https://www.python.org/downloads/ |
| Node.js | 18+ | https://nodejs.org/ |
| npm | 9+ (bundled with Node.js) | — |
| Git | Any recent version | https://git-scm.com/ |

> **Windows users:** When installing Python, check **"Add Python to PATH"** during setup. When installing Node.js, accept the default options.

Verify your installations:

```bash
python --version
node --version
npm --version
git --version
```

---

## 2. Cloning the Repository

```bash
git clone https://github.com/gopikapushparajan17/faculty-performance-evaluation.git
cd faculty-performance-evaluation
```

---

## 3. Backend Setup

### 3.1 — Create a virtual environment (recommended)

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it:
# On Windows:
venv\Scripts\activate

# On macOS/Linux:
source venv/bin/activate
```

### 3.2 — Install Python dependencies

```bash
pip install -r requirements.txt
```

This installs:
- `fastapi` — API framework
- `uvicorn` — ASGI server
- `python-jose[cryptography]` — JWT authentication
- `bcrypt` / `passlib` — password hashing
- `fpdf2>=2.7.0` — PDF generation
- `pillow>=10.0.0` — image blur detection
- `playwright>=1.40.0` — headless browser for Scopus verification
- `boto3` — optional S3 file storage
- `python-multipart` — file upload support

### 3.3 — Install Playwright browser

Playwright requires a one-time browser download. Run this **after** `pip install`:

```bash
python -m playwright install chromium
```

> This downloads a headless Chromium binary (~150 MB). It is only needed for Scopus link verification in PDFs. The app still works without it — verification will show "Not accessible" in PDFs.

### 3.4 — Configure the backend (optional)

Copy the example environment file and edit it if needed:

```bash
# Windows
copy .env.example .env

# macOS/Linux
cp .env.example .env
```

The defaults work out of the box. See [Section 9](#9-environment-variables) for all options.

---

## 4. Frontend Setup

Open a **new terminal** (keep the backend terminal separate).

```bash
cd frontend
npm install
```

This installs React, Vite, Axios, React Router, React Hook Form, Zod, and all other frontend dependencies from `package.json`.

---

## 5. Running the Application

You need **two terminal windows** running simultaneously.

### Terminal 1 — Backend

```bash
cd backend

# Activate virtual environment if you created one:
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate

python -m uvicorn main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

> **Important:** Use `python -m uvicorn`, not just `uvicorn`, to avoid PATH issues.

### Terminal 2 — Frontend

```bash
cd frontend
npm run dev
```

You should see:
```
  VITE v7.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

### Open in browser

Navigate to **http://localhost:5173**

The frontend automatically proxies all `/api` requests to `http://localhost:8000`.

---

## 6. Demo Accounts

Three pre-seeded accounts are available immediately after starting the backend:

| Role | Email | Password |
|------|-------|----------|
| Faculty | faculty@demo.com | demo123 |
| HOD (Head of Department) | hod@demo.com | demo123 |
| Principal | principal@demo.com | demo123 |

Faculty members can also **self-register** at `/signup` — no admin needed.

---

## 7. Features Overview

### Roles & Workflow

```
Faculty fills evaluation → Faculty approves (submits) → HOD reviews → Principal gives final approval
```

Each stage requires the approving party to:
1. **Generate and view the PDF** (unlocks the Approve button)
2. **HOD and Principal must draw a handwritten signature** before approving

### Modules (12 total)

| # | Module | Max Points |
|---|--------|-----------|
| 1 | Student Feedback | 15 |
| 2 | Journal Index (Scopus) | — |
| 3 | Conference Articles | 16 |
| 4 | Book Chapters | 24 |
| 5 | Authored/Edited Books | 60 |
| 6 | IPR (Patents, Copyright, Trademark) | — |
| 7 | Funded Projects | — |
| 8 | FDP/Workshops Attended | 20 |
| 9 | Talks Delivered | 10 |
| 10 | Departmental Activities | 9 |
| 11 | Institutional Activities | 15 |
| 12 | FDP/Workshops Organized | 20 |

### Proof Upload & Verification

- **Scopus links** — Playwright headless browser visits each link, takes a screenshot, checks for author-profile indicators (h-index, citations, documents, etc.), and verifies the faculty name appears on the page. Results are embedded in the PDF.
- **File uploads (PDF/JPG/PNG)** — Uploaded to local `uploads/` folder (or S3 if configured). Images are checked for blur (rejected if variance < 30).
- **Blur detection** — Low-quality/blurry proof images are rejected at upload time with a descriptive error.

### PDF Report

- **Page 1:** Faculty info, points summary table, proof/verification summary table, signatures with drawn signature images
- **Pages 2+:** Each module's detailed entries with Scopus screenshots and verification badges (✓ Verified / ✗ Mismatch / ⚠ Not accessible)

### Security

- JWT-based authentication (tokens expire after 7 days)
- Role-based access control on all API endpoints
- Fully approved evaluations are locked — no further edits possible
- Backend enforces PDF viewing and drawn signatures; frontend cannot bypass these checks

---

## 8. Project Structure

```
faculty-performance-evaluation/
├── backend/
│   ├── main.py                  # FastAPI app entry point, CORS, router registration
│   ├── requirements.txt         # Python dependencies
│   ├── .env                     # Environment variables (not committed)
│   └── app/
│       ├── models.py            # Pydantic data models
│       ├── database.py          # In-memory store + seeding + business logic
│       ├── deps.py              # Auth dependencies (get_current_user, require_role)
│       └── routes/
│           ├── auth.py          # POST /login, POST /register
│           ├── evaluations.py   # CRUD + approve/reject workflow
│           ├── faculty.py       # Faculty profile management
│           ├── upload.py        # File upload with blur detection
│           └── pdf.py           # PDF generation + Scopus verification
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts           # Proxy /api → localhost:8000
    └── src/
        ├── App.tsx              # Routes
        ├── index.css            # Design system (blue theme)
        ├── context/
        │   └── AuthContext.tsx  # JWT auth context
        ├── lib/
        │   └── api.ts           # Axios instance, PDF download helper
        ├── types/
        │   └── evaluation.ts    # TypeScript interfaces
        ├── components/
        │   └── SignatureCanvas.tsx  # Drawn signature component
        └── pages/
            ├── Login.tsx
            ├── Signup.tsx
            ├── Dashboard.tsx    # Role-based dashboards
            ├── EvaluationForm.tsx
            ├── EvaluationView.tsx
            └── FacultyForm.tsx
```

---

## 9. Environment Variables

Create a `.env` file inside the `backend/` directory. All variables are optional — the app runs with in-memory storage by default.

```env
# JWT secret — change this in production!
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# File uploads (local by default)
# Set S3_BUCKET to enable S3 storage
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
S3_BUCKET=
S3_PREFIX=evaluation-proofs
S3_ENDPOINT_URL=
S3_USE_PATH_STYLE=
```

> **Note:** This application uses **in-memory storage** by default. All data is lost when the backend restarts. For persistent storage, a database integration (PostgreSQL) would need to be added.

---

## 10. Troubleshooting

### `uvicorn: command not found`
Use `python -m uvicorn main:app --reload --port 8000` instead of `uvicorn ...`.

### `ModuleNotFoundError: No module named 'app'`
Make sure you run the backend from inside the `backend/` directory, not from the root.

### `playwright._impl._errors.Error: Executable doesn't exist`
Run `python -m playwright install chromium` from inside the `backend/` directory with the virtual environment activated.

### Port already in use
```bash
# Windows — find and kill the process on port 8000:
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# macOS/Linux:
lsof -ti:8000 | xargs kill -9
```

### CORS error in browser
Ensure the backend is running on port 8000 and the frontend on port 5173 (or 5174). Both ports are whitelisted in `backend/main.py`.

### Frontend blank page / `npm run dev` error
```bash
cd frontend
rm -rf node_modules
npm install
npm run dev
```

### Scopus verification always shows "Not accessible"
This is expected if Playwright/Chromium was not installed, or if Scopus is blocking headless browsers. The rest of the app functions normally; only the Scopus verification badges in PDFs are affected.

### `bcrypt` import error on Windows
```bash
pip uninstall bcrypt passlib
pip install bcrypt==4.0.1 passlib[bcrypt]
```

---

## Quick Start Checklist

- [ ] Python 3.11+ installed
- [ ] Node.js 18+ installed
- [ ] `git clone` the repository
- [ ] `cd backend && pip install -r requirements.txt`
- [ ] `python -m playwright install chromium`
- [ ] `cd frontend && npm install`
- [ ] Terminal 1: `cd backend && python -m uvicorn main:app --reload --port 8000`
- [ ] Terminal 2: `cd frontend && npm run dev`
- [ ] Open http://localhost:5173
- [ ] Login with `faculty@demo.com` / `demo123`
