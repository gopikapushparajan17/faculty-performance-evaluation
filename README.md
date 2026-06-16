# Faculty Performance Evaluation System

React + Vite frontend and FastAPI backend with a **blue theme** and role-based dashboards (HOD, Faculty, Principal).

## Stack

* **Frontend:** React, Vite, Tailwind CSS, React Hook Form, Zod, Axios, React Router, Context API
* **Backend:** FastAPI, SQLAlchemy, MySQL
* **Database:** MySQL
* **Design:** Primary `#1e3a8a`, Secondary `#2563eb`, Accent `#60a5fa`, Background `#f8fafc`

---

## Run Locally

### 1. Database Setup (MySQL)

Install MySQL and create the database:

```bash
mysql -u root -p < backend/schema.sql
```

This creates:

* `users`
* `faculty_details`
* `evaluations_new`

tables and inserts demo users.

### Verify

```sql
USE faculty_evaluation;

SHOW TABLES;

SELECT * FROM users;
```

---

### 2. Backend

```bash
cd backend

pip install -r requirements.txt

uvicorn main:app --reload --port 8000
```

Backend runs at:

```text
http://localhost:8000
```

---

### 3. Frontend

```bash
cd frontend

npm install

npm run dev
```

Frontend runs at:

```text
http://localhost:5173
```

The Vite development server proxies `/api` requests to:

```text
http://localhost:8000
```

---

## Demo Login

| Role      | Email                                           | Password |
| --------- | ----------------------------------------------- | -------- |
| HOD       | [hod@demo.com](mailto:hod@demo.com)             | demo123  |
| Faculty   | [faculty@demo.com](mailto:faculty@demo.com)     | demo123  |
| Principal | [principal@demo.com](mailto:principal@demo.com) | demo123  |

---

## Features

### Authentication

* JWT-based login
* Role-based access control
* HOD, Faculty and Principal dashboards

### Faculty Details

* Department
* Employee ID
* Employee Name
* ORCID ID
* Official Email
* Phone Number

### Evaluation System

* 12 collapsible evaluation modules
* Automatic point calculation
* Proof validation
* Draft / Pending / Approved / Rejected workflow

### Approval Workflow

```text
Draft
 ↓
Submitted
 ↓
Faculty Signed
 ↓
HOD Signed
 ↓
Approved
```

### Evaluation Metrics

* Student Feedback
* Journal Index
* Conference Articles
* Book Chapters
* Books
* IPR
* Funded Projects
* FDP Attended
* FDP Organized
* Talks Delivered
* Departmental Activities
* Institutional Activities

### Persistence

All user, faculty, and evaluation data is stored in MySQL and remains available after backend restarts.

---

## Proof Uploads (S3)

Proof files (PDF/JPG/PNG) are uploaded through:

```http
POST /api/upload
```

When S3 is configured, uploaded files are stored in S3 and the returned URL is saved in the evaluation.

If S3 is not configured, files are stored locally under:

```text
backend/uploads/
```

and served through:

```text
/uploads/...
```

---

## S3 Configuration (Optional)

Set these environment variables before starting the backend:

| Variable              | Description                             |
| --------------------- | --------------------------------------- |
| AWS_ACCESS_KEY_ID     | AWS access key                          |
| AWS_SECRET_ACCESS_KEY | AWS secret key                          |
| AWS_REGION            | Example: us-east-1                      |
| S3_BUCKET             | Bucket name                             |
| S3_PREFIX             | Key prefix (default: evaluation-proofs) |
| S3_ENDPOINT_URL       | Optional (MinIO / LocalStack)           |
| S3_USE_PATH_STYLE     | Set to 1 for MinIO/LocalStack           |

---

## Project Layout

```text
frontend/
└── React + Vite application

backend/
├── main.py
├── schema.sql
├── requirements.txt
└── app/
    ├── routes/
    ├── models.py
    ├── crud.py
    ├── db_models.py
    ├── mysql_db.py
    ├── deps.py
    ├── config.py
    └── s3.py
```
