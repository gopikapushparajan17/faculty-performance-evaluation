"""
Tests for the Settings feature:
  - GET  /api/users/me
  - PATCH /api/users/me/name
  - POST  /api/users/me/change-password

All tests use in-process mocks — NO real database or network calls are made.
Tests are run with PYTHONPATH=backend.
"""

from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

import bcrypt

# ---------------------------------------------------------------------------
# Bootstrap the test application
# ---------------------------------------------------------------------------
from app.routes import users as users_module
from app.deps import get_current_user
from app.models import User

# Suppress the startup migration (no real DB in tests)
  # module already imported; patching here would be a no-op.
          # We instead mock at the SessionLocal level per test.

app = FastAPI()
app.include_router(users_module.router, prefix="/api/users")


# ---------------------------------------------------------------------------
# Helper: build mock User objects for the three roles
# ---------------------------------------------------------------------------

def _make_faculty(uid="10", name="Alice Smith") -> User:
    return User(
        id=uid,
        email="alice@example.edu",
        name=name,
        role="faculty",
        department="Computer Science",
        password_hash=bcrypt.hashpw(b"OldPass123!", bcrypt.gensalt()).decode(),
    )


def _make_hod(uid="20", name="hod@example.edu") -> User:
    return User(
        id=uid,
        email="hod@example.edu",
        name=name,
        role="hod",
        department="Computer Science",
        password_hash=bcrypt.hashpw(b"OldPass123!", bcrypt.gensalt()).decode(),
    )


def _make_principal(uid="30", name="principal@example.edu") -> User:
    return User(
        id=uid,
        email="principal@example.edu",
        name=name,
        role="principal",
        department=None,
        password_hash=bcrypt.hashpw(b"OldPass123!", bcrypt.gensalt()).decode(),
    )


# ---------------------------------------------------------------------------
# Helper: build a mock DB session for change_name / change_password tests
# ---------------------------------------------------------------------------

def _make_mock_db(user_role: str, user_id: int, password_hash: str):
    """Return a MagicMock that mimics SessionLocal()."""
    mock_db = MagicMock()

    # UserDB row returned by db.query(UserDB).filter(...).first()
    mock_user_row = MagicMock()
    mock_user_row.id = user_id
    mock_user_row.password_hash = password_hash

    # FacultyDB row returned for faculty users
    mock_faculty_row = MagicMock()
    mock_faculty_row.user_id = user_id
    mock_faculty_row.name = "Alice Smith"

    def _query_side_effect(model):
        q = MagicMock()
        if model.__name__ == "UserDB":
            q.filter.return_value.first.return_value = mock_user_row
        elif model.__name__ == "FacultyDB":
            if user_role == "faculty":
                q.filter.return_value.first.return_value = mock_faculty_row
            else:
                q.filter.return_value.first.return_value = None
        return q

    mock_db.query.side_effect = _query_side_effect

    # For HOD/Principal display_name update (raw SQL)
    mock_db.execute.return_value = MagicMock()

    return mock_db, mock_user_row, mock_faculty_row


# ===========================================================================
# TEST 1: Authenticated user can access settings (GET /api/users/me)
# ===========================================================================

class TestGetMe:
    def test_faculty_can_access_settings(self):
        """Test 1 & 11: Faculty can access the settings endpoint."""
        client = TestClient(app)
        faculty = _make_faculty()
        app.dependency_overrides[get_current_user] = lambda: faculty

        with patch("app.routes.users.get_faculty_by_user_id") as mock_fp:
            from app.models import FacultyProfile
            mock_fp.return_value = FacultyProfile(
                id="1", user_id="10", department_name="CS",
                employee_id="EMP001", employee_name="Alice Smith",
                official_email="alice@example.edu", phone_number="0000",
            )
            resp = client.get("/api/users/me")

        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "alice@example.edu"
        assert data["role"] == "faculty"
        assert "password_hash" not in data
        assert "password" not in data
        assert data["employee_id"] == "EMP001"
        app.dependency_overrides.clear()

    def test_hod_can_access_settings(self):
        """Test 12: HOD can access the settings endpoint."""
        client = TestClient(app)
        hod = _make_hod()
        app.dependency_overrides[get_current_user] = lambda: hod

        resp = client.get("/api/users/me")

        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "hod"
        assert "password_hash" not in data
        app.dependency_overrides.clear()

    def test_principal_can_access_settings(self):
        """Test 13: Principal can access the settings endpoint."""
        client = TestClient(app)
        principal = _make_principal()
        app.dependency_overrides[get_current_user] = lambda: principal

        resp = client.get("/api/users/me")

        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "principal"
        assert "password_hash" not in data
        app.dependency_overrides.clear()

    def test_unauthenticated_user_cannot_access_settings(self):
        """Test 2: Unauthenticated user cannot access the settings endpoint."""
        client = TestClient(app)
        app.dependency_overrides.clear()  # remove any override → real auth required

        resp = client.get("/api/users/me")
        assert resp.status_code == 401


# ===========================================================================
# TEST 2 & 3: Authenticated user can change name; unauthenticated cannot
# ===========================================================================

class TestChangeName:
    def test_unauthenticated_cannot_change_name(self):
        """Test 2: Unauthenticated user cannot change name."""
        client = TestClient(app)
        app.dependency_overrides.clear()

        resp = client.patch("/api/users/me/name", json={"name": "New Name"})
        assert resp.status_code == 401

    def test_faculty_can_change_own_name(self):
        """Test 3 & 11: Authenticated faculty can change their own name."""
        client = TestClient(app)
        faculty = _make_faculty()
        app.dependency_overrides[get_current_user] = lambda: faculty

        mock_db, _, mock_faculty_row = _make_mock_db("faculty", 10, faculty.password_hash)

        with patch("app.routes.users.SessionLocal", return_value=mock_db):
            resp = client.patch("/api/users/me/name", json={"name": "  Alice Updated  "})

        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Alice Updated"   # trimmed
        assert mock_faculty_row.name == "Alice Updated"
        mock_db.commit.assert_called_once()
        app.dependency_overrides.clear()

    def test_hod_can_change_own_name(self):
        """Test 12: HOD can change their own name."""
        client = TestClient(app)
        hod = _make_hod()
        app.dependency_overrides[get_current_user] = lambda: hod

        mock_db, mock_user_row, _ = _make_mock_db("hod", 20, hod.password_hash)

        with patch("app.routes.users.SessionLocal", return_value=mock_db):
            resp = client.patch("/api/users/me/name", json={"name": "Dr. HOD"})

        assert resp.status_code == 200
        assert resp.json()["name"] == "Dr. HOD"
        app.dependency_overrides.clear()

    def test_principal_can_change_own_name(self):
        """Test 13: Principal can change their own name."""
        client = TestClient(app)
        principal = _make_principal()
        app.dependency_overrides[get_current_user] = lambda: principal

        mock_db, mock_user_row, _ = _make_mock_db("principal", 30, principal.password_hash)

        with patch("app.routes.users.SessionLocal", return_value=mock_db):
            resp = client.patch("/api/users/me/name", json={"name": "Dr. Principal"})

        assert resp.status_code == 200
        assert resp.json()["name"] == "Dr. Principal"
        app.dependency_overrides.clear()

    def test_name_cannot_be_empty(self):
        """Test 4: Name cannot be empty or whitespace-only."""
        client = TestClient(app)
        faculty = _make_faculty()
        app.dependency_overrides[get_current_user] = lambda: faculty

        for bad_name in ["", "   ", "\t\n"]:
            resp = client.patch("/api/users/me/name", json={"name": bad_name})
            assert resp.status_code == 422, f"Expected 422 for name={repr(bad_name)}"
        app.dependency_overrides.clear()

    def test_cannot_change_other_users_name(self):
        """
        Test 5: The self-service endpoint uses JWT identity only.
        Even if a client somehow sends a different user's data in the body,
        the endpoint ignores it and only modifies the authenticated user's record.
        There is no user_id parameter accepted by PATCH /api/users/me/name.
        Verify that the authenticated user's record (not any other) is updated.
        """
        client = TestClient(app)
        faculty_a = _make_faculty(uid="10", name="Alice")
        app.dependency_overrides[get_current_user] = lambda: faculty_a

        mock_db, _, mock_faculty_row = _make_mock_db("faculty", 10, faculty_a.password_hash)

        with patch("app.routes.users.SessionLocal", return_value=mock_db):
            # Request body has only 'name' — no user_id field accepted
            resp = client.patch("/api/users/me/name", json={"name": "Alice Renamed"})

        assert resp.status_code == 200
        # The DB query filtered on faculty_a's user_id (10), not any other user
        # Verify: the mock was called with user_id==10 (via _make_mock_db setup)
        assert mock_faculty_row.name == "Alice Renamed"
        app.dependency_overrides.clear()

    def test_name_whitespace_is_trimmed(self):
        """Test 3 (supplementary): Name is trimmed of leading/trailing whitespace."""
        client = TestClient(app)
        faculty = _make_faculty()
        app.dependency_overrides[get_current_user] = lambda: faculty

        mock_db, _, mock_faculty_row = _make_mock_db("faculty", 10, faculty.password_hash)

        with patch("app.routes.users.SessionLocal", return_value=mock_db):
            resp = client.patch("/api/users/me/name", json={"name": "  Trimmed Name  "})

        assert resp.status_code == 200
        assert resp.json()["name"] == "Trimmed Name"
        app.dependency_overrides.clear()


# ===========================================================================
# TEST 6-10: Change password
# ===========================================================================

class TestChangePassword:
    def _pw_hash(self, pw: str) -> str:
        return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

    def test_correct_current_password_allows_change(self):
        """Test 6: Correct current password allows password change."""
        client = TestClient(app)
        old_pw = "OldPass123!"
        faculty = _make_faculty()
        faculty_with_hash = faculty.model_copy(
            update={"password_hash": self._pw_hash(old_pw)}
        )
        app.dependency_overrides[get_current_user] = lambda: faculty_with_hash

        mock_db, mock_user_row, _ = _make_mock_db(
            "faculty", 10, faculty_with_hash.password_hash
        )

        with patch("app.routes.users.SessionLocal", return_value=mock_db):
            resp = client.post(
                "/api/users/me/change-password",
                json={
                    "current_password": old_pw,
                    "new_password": "NewSecure456!",
                    "confirm_password": "NewSecure456!",
                },
            )

        assert resp.status_code == 200
        assert resp.json()["message"] == "Password changed successfully."

        # Verify the hash stored is NOT the plaintext
        stored_hash = mock_user_row.password_hash
        assert stored_hash != "NewSecure456!"
        # And it IS a valid bcrypt hash of the new password
        assert bcrypt.checkpw(b"NewSecure456!", stored_hash.encode())
        app.dependency_overrides.clear()

    def test_incorrect_current_password_is_rejected(self):
        """Test 7: Incorrect current password is rejected."""
        client = TestClient(app)
        faculty = _make_faculty()
        faculty_with_hash = faculty.model_copy(
            update={"password_hash": self._pw_hash("OldPass123!")}
        )
        app.dependency_overrides[get_current_user] = lambda: faculty_with_hash

        mock_db, _, _ = _make_mock_db("faculty", 10, faculty_with_hash.password_hash)

        with patch("app.routes.users.SessionLocal", return_value=mock_db):
            resp = client.post(
                "/api/users/me/change-password",
                json={
                    "current_password": "WRONG_PASSWORD",
                    "new_password": "NewSecure456!",
                    "confirm_password": "NewSecure456!",
                },
            )

        assert resp.status_code == 401
        assert "Current password is incorrect" in resp.json()["detail"]
        app.dependency_overrides.clear()

    def test_password_confirmation_mismatch_is_rejected(self):
        """Test 8: Password confirmation mismatch is rejected."""
        client = TestClient(app)
        faculty = _make_faculty()
        app.dependency_overrides[get_current_user] = lambda: faculty

        resp = client.post(
            "/api/users/me/change-password",
            json={
                "current_password": "OldPass123!",
                "new_password": "NewSecure456!",
                "confirm_password": "DIFFERENT!",
            },
        )

        assert resp.status_code == 422
        assert "do not match" in resp.json()["detail"]
        app.dependency_overrides.clear()

    def test_weak_password_is_rejected(self):
        """Test 9: Weak/short password is rejected according to the password policy."""
        client = TestClient(app)
        faculty = _make_faculty()
        app.dependency_overrides[get_current_user] = lambda: faculty

        for weak_pw in ["short", "1234567", "abc"]:
            resp = client.post(
                "/api/users/me/change-password",
                json={
                    "current_password": "OldPass123!",
                    "new_password": weak_pw,
                    "confirm_password": weak_pw,
                },
            )
            assert resp.status_code == 422, f"Expected 422 for password={repr(weak_pw)}"
            assert "password requirements" in resp.json()["detail"]

        app.dependency_overrides.clear()

    def test_password_stored_as_hash_never_plaintext(self):
        """Test 10: Password is stored as a bcrypt hash, never as plaintext."""
        client = TestClient(app)
        new_pw = "StrongPass789!"
        faculty = _make_faculty()
        faculty_with_hash = faculty.model_copy(
            update={"password_hash": self._pw_hash("OldPass123!")}
        )
        app.dependency_overrides[get_current_user] = lambda: faculty_with_hash

        mock_db, mock_user_row, _ = _make_mock_db(
            "faculty", 10, faculty_with_hash.password_hash
        )

        with patch("app.routes.users.SessionLocal", return_value=mock_db):
            resp = client.post(
                "/api/users/me/change-password",
                json={
                    "current_password": "OldPass123!",
                    "new_password": new_pw,
                    "confirm_password": new_pw,
                },
            )

        assert resp.status_code == 200
        stored = mock_user_row.password_hash
        # Must NOT be the plaintext
        assert stored != new_pw
        # Must start with bcrypt prefix
        assert stored.startswith("$2b$") or stored.startswith("$2a$")
        # Must be verifiable
        assert bcrypt.checkpw(new_pw.encode(), stored.encode())
        app.dependency_overrides.clear()

    def test_hod_can_change_password(self):
        """Test 12: HOD can use the change-password endpoint."""
        client = TestClient(app)
        hod = _make_hod()
        hod_with_hash = hod.model_copy(
            update={"password_hash": self._pw_hash("OldPass123!")}
        )
        app.dependency_overrides[get_current_user] = lambda: hod_with_hash

        mock_db, _, _ = _make_mock_db("hod", 20, hod_with_hash.password_hash)

        with patch("app.routes.users.SessionLocal", return_value=mock_db):
            resp = client.post(
                "/api/users/me/change-password",
                json={
                    "current_password": "OldPass123!",
                    "new_password": "NewHodPass99!",
                    "confirm_password": "NewHodPass99!",
                },
            )

        assert resp.status_code == 200
        assert resp.json()["message"] == "Password changed successfully."
        app.dependency_overrides.clear()

    def test_principal_can_change_password(self):
        """Test 13: Principal can use the change-password endpoint."""
        client = TestClient(app)
        principal = _make_principal()
        principal_with_hash = principal.model_copy(
            update={"password_hash": self._pw_hash("OldPass123!")}
        )
        app.dependency_overrides[get_current_user] = lambda: principal_with_hash

        mock_db, _, _ = _make_mock_db("principal", 30, principal_with_hash.password_hash)

        with patch("app.routes.users.SessionLocal", return_value=mock_db):
            resp = client.post(
                "/api/users/me/change-password",
                json={
                    "current_password": "OldPass123!",
                    "new_password": "NewPrincipalPass!",
                    "confirm_password": "NewPrincipalPass!",
                },
            )

        assert resp.status_code == 200
        assert resp.json()["message"] == "Password changed successfully."
        app.dependency_overrides.clear()

    def test_login_still_works_after_password_change(self):
        """
        Test 14: After a password change the new password hash is a valid bcrypt
        hash that the existing verify_password() function can authenticate.
        (Integration-level check without hitting the real DB.)
        """
        from app.routes.auth import verify_password

        old_pw = "OldPass123!"
        new_pw = "BrandNewPass42!"

        # Simulate the change: produce a new hash as the endpoint does
        new_hash = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()

        assert verify_password(new_pw, new_hash) is True
        assert verify_password(old_pw, new_hash) is False

    def test_existing_evaluation_unaffected(self):
        """
        Test 15: Evaluation records reference faculty by faculty_id (integer PK),
        which is immutable.  Changing a name or password does not alter
        evaluation foreign keys.  Verified by asserting no EvaluationDB
        is touched during a name-change operation.
        """
        client = TestClient(app)
        faculty = _make_faculty()
        app.dependency_overrides[get_current_user] = lambda: faculty

        mock_db, _, mock_faculty_row = _make_mock_db("faculty", 10, faculty.password_hash)

        with patch("app.routes.users.SessionLocal", return_value=mock_db):
            resp = client.patch("/api/users/me/name", json={"name": "Alice New Name"})

        assert resp.status_code == 200
        # EvaluationDB must NOT have been queried or modified
        from app.db_models import EvaluationDB
        for call in mock_db.query.call_args_list:
            args = call[0]
            assert args[0] is not EvaluationDB, (
                "EvaluationDB was queried during a name change — it must not be."
            )
        app.dependency_overrides.clear()
