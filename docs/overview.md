# Faculty Performance Evaluation System — Overview

## What this application is

This is a full‑stack web application to **create, score, review, and approve** faculty performance evaluations using a simple multi-stage workflow:

**Faculty → HOD → Principal**

The system supports:

- creating a faculty profile
- entering evaluation module data (12 modules)
- uploading proof files (or providing Scopus links for certain modules)
- generating a PDF report
- role-based approvals with optional drawn signature images

> Note: the current backend uses **in-memory storage** (data resets on backend restart).

---

## Roles

- **faculty**
  - creates and edits evaluations (draft only)
  - generates a PDF report
  - submits approval to HOD
- **hod**
  - reviews evaluations approved by faculty
  - can approve (forward to principal) or reject with reason
  - requires a **drawn signature image** when approving
- **principal**
  - reviews evaluations approved by HOD
  - can approve (final approval) or reject with reason
  - requires a **drawn signature image** when approving

---

## Evaluation lifecycle (backend statuses)

The backend uses `Evaluation.status` with these values:

- `draft`: faculty is editing
- `faculty_approved`: submitted by faculty and waiting for HOD
- `hod_approved`: approved by HOD and waiting for principal
- `principal_approved`: final approval completed
- `rejected`: rejected by HOD or principal

---

## Modules (data collected)

Evaluation content is stored in `Evaluation.modules` and contains 12 sections:

1. Student Feedback
2. Journal Index
3. Conference Articles
4. Book Chapters
5. Authored/Edited Books
6. IPR
7. Funded Projects
8. FDP/Workshops Attended
9. Talks Delivered
10. Departmental Activities
11. Institutional Activities
12. FDP/Workshops/Conferences Organized

For many modules, entries require a **proof**:

- some modules require a **Scopus link** (`https://www.scopus.com/...`)
- others require a **file upload** (PDF/DOCX/JPG/PNG)

---

## Terminology used in code

- **Evaluation**: one faculty evaluation record for an academic year.
- **Faculty profile**: employee details used for the evaluation header.
- **Proof URL**: a stored URL for an uploaded file (local `/uploads/...` or S3 URL) OR a Scopus link.
- **Approvals**: stored per role inside `Evaluation.approvals`.

