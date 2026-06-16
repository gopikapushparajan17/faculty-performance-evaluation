# Frontend documentation (React + Vite)

## Location and entrypoints

- **Frontend root**: `frontend/`
- **Dev server**: Vite (default port 5173)
- **Main routes**: `frontend/src/App.tsx`

Run:

```bash
cd frontend
npm install
npm run dev
```

## Routing

Routes are defined in `frontend/src/App.tsx`:

- `/login`
- `/signup`
- Protected layout:
  - `/dashboard`
  - `/faculty/new` (faculty only)
  - `/faculty/:id/edit` (faculty only)
  - `/evaluation/new/:facultyId` (faculty only)
  - `/evaluation/:evaluationId/edit` (faculty only)
  - `/evaluation/:evaluationId/view` (all logged-in roles)

## Auth model

Implemented in `frontend/src/context/AuthContext.tsx`:

- stores token in `localStorage` under `faculty_eval_token`
- stores user JSON in `localStorage` under `faculty_eval_user`
- sets axios default header `Authorization: Bearer <token>`

## Backend API integration

Implemented in `frontend/src/lib/api.ts`:

- axios instance:
  - `baseURL: http://localhost:8000/api`
  - request interceptor loads token from localStorage
- PDF helper:
  - `downloadPdf(evaluationId, userId?)` calls `GET /pdf/{id}` as blob and opens a new tab
  - tracks PDF viewed via localStorage keys:
    - `pdf_viewed_<evaluationId>`
    - `pdf_viewed_<evaluationId>_<userId>`

## Major screens

- `pages/Login.tsx`: login form, calls `/api/auth/login`
- `pages/Signup.tsx`: registration, calls `/api/auth/register`
- `pages/Dashboard.tsx`: role-based dashboards
  - faculty: list “mine”, create faculty, generate PDF, approve
  - hod: pending + approved lists, generate PDF, approve/reject (drawn signature required)
  - principal: pending + fully approved lists, generate PDF, approve/reject (drawn signature required)
- `pages/FacultyDetails.tsx`: create/update faculty profile (`/api/faculty`)
- `pages/EvaluationForm.tsx`: evaluation module form
  - computes points client-side (`lib/pointRules`)
  - uses `ProofUpload` components to upload file proofs or record Scopus links
- `pages/EvaluationView.tsx`: read-only view + actions
  - generates PDF
  - approve/reject modals

## Signature capture

`components/SignatureCanvas.tsx`:

- simple HTML canvas drawing
- emits `data:image/png;base64,...` to parent
- used in approval flows for HOD and principal

