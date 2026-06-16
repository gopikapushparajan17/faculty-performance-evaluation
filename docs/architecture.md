# Architecture

## High-level components

### Frontend

- **Tech**: React + TypeScript + Vite
- **Location**: `frontend/`
- **Responsibilities**:
  - authentication UI + token storage
  - evaluation form UI (modules, points calculation)
  - dashboards per role (faculty, HOD, principal)
  - PDF generation (opens in new tab)
  - approval/rejection modals with drawn signature capture

### Backend

- **Tech**: FastAPI
- **Location**: `backend/`
- **Entry point**: `backend/main.py`
- **Responsibilities**:
  - JWT auth (`/api/auth/*`)
  - faculty profile CRUD (`/api/faculty/*`)
  - evaluation CRUD + approve/reject workflow (`/api/evaluations/*`)
  - proof upload (local or S3) + blur detection (`/api/upload`)
  - PDF generation (`/api/pdf/{eid}`)

---

## Request flow (typical)

1. **Login/Register**
   - frontend stores JWT in `localStorage` and sends `Authorization: Bearer <token>`
2. **Create faculty profile**
   - faculty uses UI to create/edit a profile via `/api/faculty`
3. **Create evaluation (draft)**
   - faculty creates evaluation via `/api/evaluations`
   - points are computed in frontend while editing; backend recomputes totals server-side when saving
4. **Upload proofs**
   - frontend uses `/api/upload` to upload files
   - backend validates file type/size and rejects blurry images
5. **Generate PDF**
   - frontend calls `/api/pdf/{eid}` and opens blob in a new browser tab
6. **Approve / reject**
   - `/api/evaluations/{eid}/approve` for multi-role approvals
   - `/api/evaluations/{eid}/reject` for rejection (HOD/principal)

---

## Storage model (current)

The backend currently stores everything in Python dictionaries (in-memory) defined in `backend/app/database.py`:

- users keyed by email + users keyed by id
- faculty profiles keyed by id
- evaluations keyed by id

**Implication**: restarting the backend clears all data.

---

## Trust boundaries

- **Auth**: backend enforces role checks via `require_role()` and token decoding in `backend/app/deps.py`.
- **Approvals**: backend enforces state transitions (e.g. HOD can only approve `faculty_approved`).
- **Proof validation**:
  - frontend validates some formats and shows UX hints
  - backend enforces upload constraints and approval preconditions

