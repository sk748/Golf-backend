"""Player self-service: /juniors/me and anonymized /juniors/me/feedback."""

from datetime import date

from app.database.database import db
from app.auth.models import User
from app.evaluations.models import Evaluation


def _player_headers(junior):
    user = db.session.get(User, junior.user_id)
    return {"Authorization": "Bearer " + user.generate_auth_token()}


def test_juniors_me_returns_own_profile(client, make_junior):
    j = make_junior(level=7, handicap=18)
    r = client.get("/api/juniors/me", headers=_player_headers(j))
    assert r.status_code == 200
    assert r.get_json()["data"]["id"] == j.id


def test_me_feedback_none_until_coach_signed(client, make_junior, make_user):
    j = make_junior(level=7, handicap=18)
    coach = make_user(role="coach")
    headers = _player_headers(j)

    # No evaluation yet -> null.
    assert client.get("/api/juniors/me/feedback", headers=headers).get_json()["data"] is None

    # Unsigned evaluation -> still null (drafts aren't shown to students).
    db.session.add(Evaluation(
        junior_id=j.id, coach_id=coach.id, report_month=date(2026, 5, 1),
        current_level=7, attendance_count=5, assessment="meeting_expectation",
        recommendation="continue_level", special_remarks="draft", coach_signed=False,
    ))
    db.session.commit()
    assert client.get("/api/juniors/me/feedback", headers=headers).get_json()["data"] is None


def test_me_feedback_is_anonymized(client, make_junior, make_user):
    j = make_junior(level=7, handicap=18)
    coach = make_user(role="coach")
    db.session.add(Evaluation(
        junior_id=j.id, coach_id=coach.id, report_month=date(2026, 5, 1),
        current_level=7, attendance_count=7, attendance_total=8,
        assessment="meeting_expectation", recommendation="continue_level",
        special_remarks="Work on tempo.", coach_signed=True,
        coach_signed_date=date(2026, 5, 20),
    ))
    db.session.commit()

    data = client.get("/api/juniors/me/feedback", headers=_player_headers(j)).get_json()["data"]
    assert data is not None
    assert data["assessment"] == "meeting_expectation"
    assert data["special_remarks"] == "Work on tempo."
    # Coach identity must never leak to the student.
    for hidden in ("coach_id", "coach_signed_by", "committee_signed_by"):
        assert hidden not in data
