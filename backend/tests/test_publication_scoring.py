"""Focused tests for journal/conference verification scoring."""

from unittest.mock import MagicMock, patch

from app.database import _compute_module_points, _compute_total_points
from app.models import (
    BookChapter,
    BookChaptersData,
    ConferenceArticle,
    ConferenceArticlesData,
    EvaluationModules,
    IPRData,
    IPREntry,
    JournalIndexData,
    StudentFeedbackData,
)


DOI_PROOF = "https://doi.org/10.1000/test-article"


def _conf_entry(
    *,
    title="Conference Paper",
    proof=DOI_PROOF,
    verification=None,
):
    return ConferenceArticle(
        title=title,
        proof_file=proof,
        verification=verification,
    )


def _modules(*, conference=None, journal=None, extra=None):
    kwargs = {}
    if conference is not None:
        kwargs["conference_articles"] = ConferenceArticlesData(entries=conference)
    if journal is not None:
        kwargs["journal_index"] = journal
    if extra:
        kwargs.update(extra)
    return EvaluationModules(**kwargs)


def _points(modules: EvaluationModules) -> dict[str, int]:
    return _compute_module_points(modules)


def _scopus_only():
    return {
        "publication_found": True,
        "author_match": True,
        "scopus_status": "indexed",
        "web_of_science": {"status": "not_found", "records_found": 0},
    }


def _wos_only():
    return {
        "publication_found": True,
        "author_match": True,
        "scopus_status": "not_found",
        "web_of_science": {"status": "indexed", "records_found": 1},
    }


def _crossref_only():
    # Crossref confirmation is publication_found from the verifier.
    return {
        "publication_found": True,
        "author_match": True,
        "scopus_status": "not_found",
        "web_of_science": {"status": "not_found", "records_found": 0},
    }


def _scopus_and_wos():
    return {
        "publication_found": True,
        "author_match": True,
        "scopus_status": "indexed",
        "web_of_science": {"status": "indexed", "records_found": 1},
    }


def _no_index():
    return {
        "publication_found": False,
        "author_match": True,
        "scopus_status": "not_found",
        "web_of_science": {"status": "not_found", "records_found": 0},
    }


class TestConferenceScoring:
    def test_a_scopus_only_is_four(self):
        m = _modules(conference=[_conf_entry(verification=_scopus_only())])
        assert _points(m)["conference_articles"] == 4

    def test_b_wos_only_is_four(self):
        m = _modules(conference=[_conf_entry(verification=_wos_only())])
        assert _points(m)["conference_articles"] == 4

    def test_c_crossref_only_is_four(self):
        m = _modules(conference=[_conf_entry(verification=_crossref_only())])
        assert _points(m)["conference_articles"] == 4

    def test_d_scopus_plus_wos_is_four_not_eight(self):
        m = _modules(conference=[_conf_entry(verification=_scopus_and_wos())])
        assert _points(m)["conference_articles"] == 4

    def test_e_two_valid_articles_are_eight(self):
        m = _modules(
            conference=[
                _conf_entry(title="One", verification=_scopus_only()),
                _conf_entry(title="Two", verification=_wos_only()),
            ]
        )
        assert _points(m)["conference_articles"] == 8

    def test_f_four_valid_articles_are_sixteen(self):
        m = _modules(
            conference=[
                _conf_entry(title=f"P{i}", verification=_crossref_only())
                for i in range(4)
            ]
        )
        assert _points(m)["conference_articles"] == 16

    def test_g_author_match_false_is_zero(self):
        v = {**_scopus_only(), "author_match": False}
        m = _modules(conference=[_conf_entry(verification=v)])
        assert _points(m)["conference_articles"] == 0

    def test_h_publication_found_false_is_zero(self):
        v = {**_scopus_only(), "publication_found": False}
        m = _modules(conference=[_conf_entry(verification=v)])
        assert _points(m)["conference_articles"] == 0

    def test_i_no_index_verification_is_zero(self):
        m = _modules(conference=[_conf_entry(verification=_no_index())])
        assert _points(m)["conference_articles"] == 0

    def test_j_missing_proof_is_zero(self):
        m = _modules(
            conference=[
                _conf_entry(proof="", verification=_scopus_only()),
            ]
        )
        assert _points(m)["conference_articles"] == 0

    def test_k_missing_title_is_zero(self):
        m = _modules(
            conference=[
                _conf_entry(title="", verification=_scopus_only()),
            ]
        )
        assert _points(m)["conference_articles"] == 0

    def test_doi_proof_is_accepted_without_scopus_url_prefix(self):
        m = _modules(conference=[_conf_entry(verification=_scopus_only())])
        assert _points(m)["conference_articles"] == 4


class TestJournalScoring:
    def _journal(self, verification, title="Nature Paper", link=DOI_PROOF):
        return JournalIndexData(
            title=title,
            value="",
            scopus_link=link,
            verification=verification,
        )

    def test_l_scopus_only_is_four(self):
        m = _modules(journal=self._journal(_scopus_only()))
        assert _points(m)["journal_index"] == 4

    def test_m_wos_only_is_four(self):
        m = _modules(journal=self._journal(_wos_only()))
        assert _points(m)["journal_index"] == 4

    def test_n_crossref_only_is_four(self):
        m = _modules(journal=self._journal(_crossref_only()))
        assert _points(m)["journal_index"] == 4

    def test_o_multiple_databases_is_four(self):
        m = _modules(journal=self._journal(_scopus_and_wos()))
        assert _points(m)["journal_index"] == 4

    def test_p_author_match_false_is_zero(self):
        v = {**_scopus_only(), "author_match": False}
        m = _modules(journal=self._journal(v))
        assert _points(m)["journal_index"] == 0

    def test_q_publication_found_false_is_zero(self):
        v = {**_scopus_only(), "publication_found": False}
        m = _modules(journal=self._journal(v))
        assert _points(m)["journal_index"] == 0

    def test_r_no_database_verification_is_zero(self):
        m = _modules(journal=self._journal(_no_index()))
        assert _points(m)["journal_index"] == 0

    def test_source_covered_still_scores_four(self):
        v = {
            "publication_found": True,
            "author_match": True,
            "scopus_status": "not_found",
            "scopus_source": {"status": "source_covered"},
            "web_of_science": {"status": "not_found"},
        }
        m = _modules(journal=self._journal(v))
        assert _points(m)["journal_index"] == 4

    def test_title_issn_wos_only_is_four_without_scopus_link(self):
        m = _modules(
            journal=JournalIndexData(
                title="ISSN Paper",
                issn="1234-5678",
                scopus_link="",
                verification=_wos_only(),
            )
        )
        assert _points(m)["journal_index"] == 4


def _chapter(title="Chapter One", proof=DOI_PROOF, verification=None):
    return BookChapter(title=title, proof_file=proof, verification=verification)


class TestBookChapterScoring:
    def test_scopus_url_without_verification_still_scores_six(self):
        m = _modules(
            extra={
                "book_chapters": BookChaptersData(
                    entries=[
                        _chapter(
                            proof="https://www.scopus.com/record/display.uri?eid=2-s2.0-1",
                            verification=None,
                        )
                    ]
                )
            }
        )
        assert _points(m)["book_chapters"] == 6

    def test_doi_scopus_only_is_six(self):
        m = _modules(
            extra={
                "book_chapters": BookChaptersData(
                    entries=[_chapter(verification=_scopus_only())]
                )
            }
        )
        assert _points(m)["book_chapters"] == 6

    def test_doi_wos_only_is_six(self):
        m = _modules(
            extra={
                "book_chapters": BookChaptersData(
                    entries=[_chapter(verification=_wos_only())]
                )
            }
        )
        assert _points(m)["book_chapters"] == 6

    def test_doi_scopus_and_wos_is_six_not_twelve(self):
        m = _modules(
            extra={
                "book_chapters": BookChaptersData(
                    entries=[_chapter(verification=_scopus_and_wos())]
                )
            }
        )
        assert _points(m)["book_chapters"] == 6

    def test_raw_doi_verified_scopus_is_six(self):
        m = _modules(
            extra={
                "book_chapters": BookChaptersData(
                    entries=[
                        _chapter(
                            proof="10.1000/test-article",
                            verification=_scopus_only(),
                        )
                    ]
                )
            }
        )
        assert _points(m)["book_chapters"] == 6

    def test_doi_unverified_is_zero(self):
        m = _modules(
            extra={
                "book_chapters": BookChaptersData(
                    entries=[_chapter(verification=_no_index())]
                )
            }
        )
        assert _points(m)["book_chapters"] == 0

    def test_doi_author_match_false_is_zero(self):
        v = {**_scopus_only(), "author_match": False}
        m = _modules(
            extra={
                "book_chapters": BookChaptersData(
                    entries=[_chapter(verification=v)]
                )
            }
        )
        assert _points(m)["book_chapters"] == 0


class TestRegressionAndPersistence:
    def test_s_other_module_scores_unchanged(self):
        extra = {
            "student_feedback": StudentFeedbackData(percentage="90"),
            "book_chapters": BookChaptersData(
                entries=[
                    BookChapter(
                        title="Chapter One",
                        proof_file="https://www.scopus.com/record/display.uri?eid=2-s2.0-1",
                    )
                ]
            ),
            "ipr": IPRData(
                entries=[
                    IPREntry(
                        type="patent",
                        description="A patent",
                        proof_file="/uploads/patent.pdf",
                    )
                ]
            ),
        }
        m = _modules(extra=extra)
        points = _points(m)
        assert points["student_feedback"] == 15
        assert points["book_chapters"] == 6
        assert points["ipr"] == 30
        assert points["conference_articles"] == 0
        assert points["journal_index"] == 0

    def test_t_total_points_equals_sum_of_module_points(self):
        m = _modules(
            conference=[_conf_entry(verification=_scopus_only())],
            journal=JournalIndexData(
                title="Journal Paper",
                scopus_link=DOI_PROOF,
                verification=_wos_only(),
            ),
            extra={
                "student_feedback": StudentFeedbackData(percentage="90"),
            },
        )
        total = _compute_total_points(m)
        points = {
            "student_feedback": m.student_feedback.points,
            "journal_index": m.journal_index.points,
            "conference_articles": m.conference_articles.points,
            "book_chapters": m.book_chapters.points,
            "books": m.books.points,
            "ipr": m.ipr.points,
            "funded_projects": m.funded_projects.points,
            "fdp_attended": m.fdp_attended.points,
            "talks_delivered": m.talks_delivered.points,
            "departmental_activities": m.departmental_activities.points,
            "institutional_activities": m.institutional_activities.points,
            "fdp_organized": m.fdp_organized.points,
        }
        assert total == sum(points.values())
        assert m.conference_articles.points == 4
        assert m.journal_index.points == 4
        assert m.student_feedback.points == 15

    def _payload(self):
        return {
            "faculty_id": "1",
            "ef_id": "1",
            "academic_year": "2026",
            "status": "draft",
            "modules": {
                "conference_articles": {
                    "entries": [
                        {
                            "title": "Conference Paper",
                            "proof_file": DOI_PROOF,
                            "verification": _scopus_only(),
                        }
                    ],
                    "points": 0,
                },
                "journal_index": {
                    "title": "Journal Paper",
                    "value": "",
                    "scopus_link": DOI_PROOF,
                    "verification": _wos_only(),
                    "points": 0,
                },
            },
        }

    def test_u_create_evaluation_stores_synced_module_and_total_points(self):
        created = []

        db = MagicMock()
        db.add.side_effect = lambda row: created.append(row)

        def refresh(row):
            row.id = 9

        db.refresh.side_effect = refresh

        with patch("app.crud.SessionLocal", return_value=db):
            from app.crud import create_evaluation

            result = create_evaluation(self._payload())

        row = created[0]
        assert row.modules["conference_articles"]["points"] == 4
        assert row.modules["journal_index"]["points"] == 4
        assert row.total_points == 8
        assert result.total_points == 8
        assert result.modules.conference_articles.points == 4
        assert result.modules.journal_index.points == 4

    def test_v_update_evaluation_stores_synced_module_and_total_points(self):
        row = MagicMock()
        row.id = 9
        row.modules = None
        row.total_points = 0

        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = row

        returned = MagicMock()
        returned.total_points = 8

        with (
            patch("app.crud.SessionLocal", return_value=db),
            patch("app.crud.get_evaluation", return_value=returned),
        ):
            from app.crud import update_evaluation

            result = update_evaluation("9", self._payload())

        assert row.total_points == 8
        assert row.modules["conference_articles"]["points"] == 4
        assert row.modules["journal_index"]["points"] == 4
        assert result.total_points == 8

    def test_create_evaluation_persists_verified_book_chapter_doi_points(self):
        created = []

        db = MagicMock()
        db.add.side_effect = lambda row: created.append(row)

        def refresh(row):
            row.id = 11

        db.refresh.side_effect = refresh

        payload = {
            "faculty_id": "1",
            "ef_id": "1",
            "academic_year": "2026",
            "status": "draft",
            "modules": {
                "book_chapters": {
                    "entries": [
                        {
                            "title": "Chapter One",
                            "proof_file": DOI_PROOF,
                            "verification": _scopus_only(),
                        }
                    ],
                    "points": 0,
                }
            },
        }

        with patch("app.crud.SessionLocal", return_value=db):
            from app.crud import create_evaluation

            result = create_evaluation(payload)

        row = created[0]
        assert row.modules["book_chapters"]["points"] == 6
        assert row.total_points == 6
        assert result.modules.book_chapters.points == 6
        assert result.total_points == 6


class TestBookChapterSubmitValidation:
    def _modules(self, proof, verification=None):
        return EvaluationModules(
            book_chapters=BookChaptersData(
                entries=[_chapter(proof=proof, verification=verification)]
            )
        )

    def test_verified_doi_is_accepted(self):
        from app.routes.evaluations import _validate_modules_for_submit

        _validate_modules_for_submit(self._modules(DOI_PROOF, _scopus_only()))

    def test_raw_doi_with_verified_scopus_is_accepted(self):
        from app.routes.evaluations import _validate_modules_for_submit

        _validate_modules_for_submit(
            self._modules("10.1000/test-article", _scopus_only())
        )

    def test_unverified_doi_is_rejected(self):
        from fastapi import HTTPException
        from app.routes.evaluations import _validate_modules_for_submit

        try:
            _validate_modules_for_submit(self._modules(DOI_PROOF, _no_index()))
        except HTTPException as exc:
            assert exc.status_code == 400
            assert "verified" in str(exc.detail).lower()
        else:
            raise AssertionError("expected HTTPException")

    def test_scopus_url_without_verification_is_still_accepted(self):
        from app.routes.evaluations import _validate_modules_for_submit

        _validate_modules_for_submit(
            self._modules(
                "https://www.scopus.com/record/display.uri?eid=2-s2.0-1",
                None,
            )
        )
