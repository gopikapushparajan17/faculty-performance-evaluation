import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
import bcrypt

from app.db_models import UserDB, PasswordResetTokenDB
from app.crud import (
    create_password_reset_token,
    verify_password_reset_token,
    verify_and_use_password_reset_token,
    send_password_reset_email,
)
from app.routes.auth import (
    forgot_password,
    ForgotPasswordRequest,
    reset_password_route,
    ResetPasswordRequest,
    verify_reset_token_route,
)


def test_create_and_verify_valid_token():
    mock_db = MagicMock()
    user_id = 42

    token = create_password_reset_token(user_id, expires_minutes=15, db=mock_db)
    assert isinstance(token, str)
    assert len(token) > 20
    assert mock_db.add.called
    assert mock_db.commit.called

    # Mock DB query for verification
    mock_record = PasswordResetTokenDB(
        id=1,
        user_id=user_id,
        token=token,
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(minutes=15),
        used=False,
    )
    mock_db.query.return_value.filter.return_value.first.return_value = mock_record

    valid, msg, uid = verify_password_reset_token(token, db=mock_db)
    assert valid is True
    assert uid == user_id


def test_expired_token_rejected():
    mock_db = MagicMock()
    mock_record = PasswordResetTokenDB(
        id=2,
        user_id=42,
        token="expired_token_123",
        created_at=datetime.utcnow() - timedelta(hours=2),
        expires_at=datetime.utcnow() - timedelta(hours=1),
        used=False,
    )
    mock_db.query.return_value.filter.return_value.first.return_value = mock_record

    valid, msg, uid = verify_password_reset_token("expired_token_123", db=mock_db)
    assert valid is False
    assert "expired" in msg.lower()
    assert uid is None


def test_already_used_token_rejected():
    mock_db = MagicMock()
    mock_record = PasswordResetTokenDB(
        id=3,
        user_id=42,
        token="used_token_123",
        created_at=datetime.utcnow() - timedelta(minutes=10),
        expires_at=datetime.utcnow() + timedelta(minutes=50),
        used=True,
    )
    mock_db.query.return_value.filter.return_value.first.return_value = mock_record

    valid, msg, uid = verify_password_reset_token("used_token_123", db=mock_db)
    assert valid is False
    assert "already been used" in msg.lower()


def test_invalid_token_rejected():
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None

    valid, msg, uid = verify_password_reset_token("nonexistent_token", db=mock_db)
    assert valid is False
    assert "invalid" in msg.lower() or "unrecognized" in msg.lower()


def test_password_update_and_single_use_consumption():
    mock_db = MagicMock()
    mock_record = PasswordResetTokenDB(
        id=4,
        user_id=42,
        token="valid_token_xyz",
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(minutes=30),
        used=False,
    )
    mock_user = UserDB(
        id=42,
        username="prof@demo.com",
        password_hash="old_hash",
        role="faculty",
        college_name="Demo College",
    )

    def mock_query(model):
        q = MagicMock()
        if model == PasswordResetTokenDB:
            q.filter.return_value.first.return_value = mock_record
        elif model == UserDB:
            q.filter.return_value.first.return_value = mock_user
        return q

    mock_db.query.side_effect = mock_query

    success, msg = verify_and_use_password_reset_token("valid_token_xyz", "NewSecurePassword123!", db=mock_db)
    assert success is True
    assert mock_record.used is True
    assert mock_user.password_hash != "old_hash"
    assert bcrypt.checkpw("NewSecurePassword123!".encode("utf-8"), mock_user.password_hash.encode("utf-8"))
    assert mock_db.commit.called


def test_forgot_password_generic_response():
    # Email not found
    with patch("app.routes.auth.get_user_by_email", return_value=None):
        res = forgot_password(ForgotPasswordRequest(email="nonexistent@demo.com"))
        assert "password reset link shortly" in res["message"]

    # Email found
    mock_user = MagicMock()
    mock_user.id = 10
    mock_user.email = "faculty@demo.com"
    with patch("app.routes.auth.get_user_by_email", return_value=mock_user):
        with patch("app.routes.auth.create_password_reset_token", return_value="token123"):
            with patch("app.routes.auth.send_password_reset_email", return_value=True):
                res = forgot_password(ForgotPasswordRequest(email="faculty@demo.com"))
                assert "password reset link shortly" in res["message"]


def test_send_password_reset_email_without_smtp_config():
    # Safe fallback in dev/test when SMTP is not configured
    result = send_password_reset_email("test@example.com", "test_token_123")
    assert result is True
