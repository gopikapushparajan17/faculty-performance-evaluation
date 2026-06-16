# API Reference

## Base URL

- Backend runs at `http://localhost:8000`
- API base is `/api`
- Frontend axios baseURL is `http://localhost:8000/api`

## Authentication

### Token

- Type: Bearer token (JWT)
- Header: `Authorization: Bearer <token>`

### `POST /api/auth/register`

Creates a new faculty user.

Request body:

```json
{
  "name": "Faculty Name",
  "email": "faculty@example.com",
  "password": "demo123",
  "department": "CSE"
}
```

Response:

```json
{
  "access_token": "jwt...",
  "token_type": "bearer",
  "user": { "id": "uuid", "email": "...", "name": "...", "role": "faculty", "department": "CSE" }
}
```

### `POST /api/auth/login`

Request body:

```json
{
  "username": "faculty@demo.com",
  "password": "demo123",
  "college_id": null
}
```

Response: same shape as register.

---

## Faculty profile

### `GET /api/faculty`

Returns a list of faculty profiles.

Auth: any logged-in user.

### `GET /api/faculty/{fid}`

Returns a single faculty profile.

Auth: any logged-in user.

### `POST /api/faculty`

Creates a faculty profile.

Auth: `faculty`

Request body:

```json
{
  "department_name": "Computer Science",
  "employee_id": "CSE123",
  "employee_name": "Faculty User",
  "orcid_id": "",
  "official_email": "faculty@college.edu",
  "phone_number": "9999999999"
}
```

### `PUT /api/faculty/{fid}`

Updates a faculty profile.

Auth: `faculty`

Body: same as create.

---

## Evaluations

### `GET /api/evaluations`

- If role is `faculty`: returns only evaluations where `ef_id == user.id`
- Otherwise: returns all evaluations

### `GET /api/evaluations/mine`

Returns evaluations for the current faculty user.

Auth: `faculty`

### `GET /api/evaluations/all`

Returns all evaluations.

Auth: `hod` or `principal`

### `GET /api/evaluations/pending`

Returns evaluations pending HOD approval (`status == faculty_approved`).

Auth: `hod`

### `GET /api/evaluations/approved`

Returns evaluations already approved by HOD (including those fully approved).

Auth: `hod`

### `GET /api/evaluations/hod-pending`

Returns evaluations pending principal approval (`status == hod_approved`).

Auth: `principal`

### `GET /api/evaluations/fully-approved`

Returns evaluations fully approved by principal (`status == principal_approved`).

Auth: `principal`

### `GET /api/evaluations/{eid}`

Returns one evaluation.

Auth rules:

- faculty can only access their own evaluations (`ev.ef_id == user.id`)
- hod/principal can access any

### `POST /api/evaluations`

Creates an evaluation in `draft` state.

Auth: `faculty`

Important behavior:

- backend will overwrite `ef_id` with the current user id
- backend will set `status = draft`
- backend will compute `total_points` based on modules

### `PUT /api/evaluations/{eid}`

Updates an evaluation (draft only).

Auth: `faculty` (owner only)

Rules enforced:

- only `draft` evaluations can be edited
- `principal_approved` evaluations can never be modified

### `POST /api/evaluations/{eid}/approve`

Multi-role approval endpoint. The same endpoint performs different actions depending on the caller role.

Request body:

```json
{
  "signature": "Full Name",
  "signature_image": "data:image/png;base64,..."
}
```

Role behavior:

- **faculty**
  - requires `status == draft`
  - requires PDF viewed (see `operations.md` for current behavior)
  - validates modules (Scopus/file proof rules)
  - sets status to `faculty_approved`
- **hod**
  - requires `status == faculty_approved`
  - requires PDF viewed
  - requires `signature_image` (drawn)
  - sets status to `hod_approved`
- **principal**
  - requires `status == hod_approved`
  - requires PDF viewed
  - requires `signature_image` (drawn)
  - sets status to `principal_approved`

Response:

```json
{ "status": "faculty_approved" }
```

### `POST /api/evaluations/{eid}/reject`

Rejects an evaluation.

Request body:

```json
{ "reason": "Missing proof for ..." }
```

Role rules:

- HOD can reject only `faculty_approved`
- principal can reject only `hod_approved`

Response:

```json
{ "status": "rejected" }
```

---

## Uploads

### `POST /api/upload`

Multipart form upload.

Form fields:

- `file`: the uploaded file
- `prefix`: optional logical folder path (e.g. `books`, `ipr`, `evaluation_id/books`)

Response:

```json
{ "url": "/uploads/proofs/<uuid>.pdf" }
```

If S3 is configured, `url` will be an S3 URL instead.

---

## PDFs

### `GET /api/pdf/{eid}`

Returns a generated PDF.

- response type: `application/pdf`
- content-disposition: `inline; filename="evaluation_{eid}.pdf"`

