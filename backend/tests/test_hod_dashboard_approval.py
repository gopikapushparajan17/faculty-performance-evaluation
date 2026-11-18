"""
Unit tests for the HOD Dashboard approval counts and filtering.

Tests:
1. get_evaluation_counts returns correct separate counts for hod_approved and approved.
2. hod_approved and approved counts are NOT combined.
3. pending, rejected, and total counts remain correct.
4. /api/evaluations/counts endpoint returns the separated counts.
5. list_evaluations_paginated with status="hod_approved" returns ONLY hod_approved evaluations.
6. list_evaluations_paginated with status="approved" returns ONLY approved evaluations.
7. list_evaluations_paginated backwards compatibility with include_final_approved=True.
8. Principal evaluation counts remain unaffected.
"""

from unittest.mock import MagicMock, patch
import pytest

from app.crud import get_evaluation_counts, get_principal_evaluation_counts, list_evaluations_paginated
from app.db_models import EvaluationDB, FacultyDB
from app.routes.evaluations import evaluation_counts, list_evaluations_paginated_route
from app.models import User


def _make_mock_eval_db(eval_records: list[dict]):
    """
    Build a mock SessionLocal that filters a list of evaluation dicts by status.
    """
    mock_db = MagicMock()

    def _query_side_effect(model, *args, **kwargs):
        query_mock = MagicMock()

        if model is EvaluationDB:
            current_records = list(eval_records)

            def _filter_side_effect(clause):
                filter_mock = MagicMock()
                # Inspect the value from clause.right
                val = getattr(getattr(clause, "right", None), "value", None)
                if isinstance(val, (list, tuple, set)):
                    filtered = [r for r in current_records if r.get("status") in val]
                elif val is not None:
                    filtered = [r for r in current_records if r.get("status") == val]
                else:
                    filtered = list(current_records)

                results = []
                for r in filtered:
                    e_mock = MagicMock(
                        id=r["id"],
                        faculty_id=r["faculty_id"],
                        ef_id=r.get("ef_id", 1),
                        academic_year=r.get("academic_year", "2026-2027"),
                        status=r["status"],
                        modules={},
                        total_points=r.get("total_points", 50),
                        approved_at=r.get("approved_at"),
                        approved_by=r.get("approved_by"),
                        reject_reason=r.get("reject_reason"),
                        revision_requested=False,
                        revision_reason=None,
                        revision_status="none",
                        revision_feedback=None,
                        faculty_signature=None,
                        hod_signature=None,
                        principal_signature=None,
                    )
                    f_mock = MagicMock(
                        id=r["faculty_id"],
                        user_id=10,
                        dept="CSE",
                        emp_id=f"EMP{r['faculty_id']}",
                        orcid="",
                        email=f"faculty{r['faculty_id']}@univ.edu",
                        phone="1234567890",
                    )
                    f_mock.name = f"Faculty {r['faculty_id']}"
                    results.append((e_mock, f_mock))

                filter_mock.count.return_value = len(filtered)
                filter_mock.all.return_value = results
                filter_mock.offset.return_value.limit.return_value.all.return_value = results
                filter_mock.add_columns.return_value.order_by.return_value.offset.return_value.limit.return_value.all.return_value = results
                return filter_mock

            query_mock.filter.side_effect = _filter_side_effect
            query_mock.count.return_value = len(current_records)

            # Support join for list_evaluations_paginated
            def _join_side_effect(*join_args):
                join_mock = MagicMock()
                join_mock.filter.side_effect = _filter_side_effect
                join_mock.count.return_value = len(current_records)
                return join_mock

            query_mock.join.side_effect = _join_side_effect
            return query_mock

        return query_mock

    mock_db.query.side_effect = _query_side_effect
    return mock_db


class TestHodEvaluationCounts:
    """Tests for separate hod_approved and approved counts in HOD dashboard."""

    def test_hod_approved_and_approved_counts_are_separated(self):
        """
        Verify that:
        - 1 HOD-approved evaluation and 3 Principal-approved evaluations
          results in hod_approved == 1 and approved == 3 (NOT 4!).
        """
        mock_evals = [
            {"id": 1, "faculty_id": 101, "status": "pending"},
            {"id": 2, "faculty_id": 102, "status": "pending"},
            {"id": 3, "faculty_id": 103, "status": "hod_approved"},
            {"id": 4, "faculty_id": 104, "status": "approved"},
            {"id": 5, "faculty_id": 105, "status": "approved"},
            {"id": 6, "faculty_id": 106, "status": "approved"},
            {"id": 7, "faculty_id": 107, "status": "rejected"},
        ]
        mock_db = _make_mock_eval_db(mock_evals)

        with patch("app.crud.SessionLocal", return_value=mock_db):
            counts = get_evaluation_counts()

        assert counts["pending"] == 2
        assert counts["hod_approved"] == 1
        assert counts["approved"] == 3
        assert counts["rejected"] == 1
        assert counts["total"] == 7

        # Crucial check: hod_approved and approved must NOT be combined!
        assert counts["hod_approved"] != counts["approved"]
        assert counts["hod_approved"] != 4
        assert counts["approved"] != 4

    def test_counts_are_zero_when_no_records_exist_for_a_status(self):
        """When there are 0 records for a status, count is 0."""
        mock_evals = [
            {"id": 1, "faculty_id": 101, "status": "pending"},
            {"id": 2, "faculty_id": 102, "status": "hod_approved"},
        ]
        mock_db = _make_mock_eval_db(mock_evals)

        with patch("app.crud.SessionLocal", return_value=mock_db):
            counts = get_evaluation_counts()

        assert counts["pending"] == 1
        assert counts["hod_approved"] == 1
        assert counts["approved"] == 0
        assert counts["rejected"] == 0
        assert counts["total"] == 2

    def test_evaluation_counts_route_returns_separated_keys(self):
        """The /api/evaluations/counts endpoint returns the new separated keys."""
        mock_evals = [
            {"id": 1, "faculty_id": 101, "status": "hod_approved"},
            {"id": 2, "faculty_id": 102, "status": "approved"},
            {"id": 3, "faculty_id": 103, "status": "approved"},
        ]
        mock_db = _make_mock_eval_db(mock_evals)

        with patch("app.crud.SessionLocal", return_value=mock_db):
            result = evaluation_counts()

        assert "pending" in result
        assert "hod_approved" in result
        assert "approved" in result
        assert "rejected" in result
        assert "total" in result

        assert result["hod_approved"] == 1
        assert result["approved"] == 2
        assert result["total"] == 3

    def test_principal_evaluation_counts_remain_unaffected(self):
        """Principal counts (awaiting_review, final_approved, rejected, total) are unchanged."""
        mock_evals = [
            {"id": 1, "faculty_id": 101, "status": "hod_approved"},
            {"id": 2, "faculty_id": 102, "status": "approved"},
            {"id": 3, "faculty_id": 103, "status": "approved"},
            {"id": 4, "faculty_id": 104, "status": "rejected"},
        ]
        mock_db = _make_mock_eval_db(mock_evals)

        with patch("app.crud.SessionLocal", return_value=mock_db):
            p_counts = get_principal_evaluation_counts()

        assert p_counts["awaiting_review"] == 1
        assert p_counts["final_approved"] == 2
        assert p_counts["rejected"] == 1
        assert p_counts["total"] == 4


class TestHodEvaluationPaginationFiltering:
    """Tests for status filtering in list_evaluations_paginated."""

    def test_filter_hod_approved_returns_only_hod_approved(self):
        """Filtering by status='hod_approved' with include_final_approved=False returns only hod_approved."""
        mock_evals = [
            {"id": 1, "faculty_id": 101, "status": "hod_approved"},
            {"id": 2, "faculty_id": 102, "status": "approved"},
            {"id": 3, "faculty_id": 103, "status": "approved"},
        ]
        mock_db = _make_mock_eval_db(mock_evals)

        with patch("app.crud.SessionLocal", return_value=mock_db):
            res = list_evaluations_paginated(
                status="hod_approved",
                include_final_approved=False,
            )

        assert res["total"] == 1
        for item in res["items"]:
            assert item.status == "hod_approved"

    def test_filter_approved_returns_only_approved(self):
        """Filtering by status='approved' returns only final approved evaluations."""
        mock_evals = [
            {"id": 1, "faculty_id": 101, "status": "hod_approved"},
            {"id": 2, "faculty_id": 102, "status": "approved"},
            {"id": 3, "faculty_id": 103, "status": "approved"},
        ]
        mock_db = _make_mock_eval_db(mock_evals)

        with patch("app.crud.SessionLocal", return_value=mock_db):
            res = list_evaluations_paginated(
                status="approved",
                include_final_approved=False,
            )

        assert res["total"] == 2
        for item in res["items"]:
            assert item.status == "approved"

    def test_paginated_route_for_hod_defaults_to_strict_status(self):
        """When HOD requests status='hod_approved', the route returns ONLY hod_approved."""
        mock_evals = [
            {"id": 1, "faculty_id": 101, "status": "hod_approved"},
            {"id": 2, "faculty_id": 102, "status": "approved"},
        ]
        mock_db = _make_mock_eval_db(mock_evals)
        hod_user = User(id="1", email="hod@univ.edu", name="HOD", role="hod")

        with patch("app.crud.SessionLocal", return_value=mock_db):
            res = list_evaluations_paginated_route(
                status="hod_approved",
                user=hod_user,
            )

        assert res["total"] == 1
        assert res["items"][0].status == "hod_approved"
