"""Evaluation sign-off sequence + one-per-junior-per-month rule.

Coach signs first; committee can only counter-sign AFTER coach_signed; a second
evaluation for the same junior+month is a 409.
"""


def _eval_body(junior, month="2026-05-01"):
    # L6-8 band → competition fields are the band-appropriate ones, but only the
    # common fields are required by the model (NOT NULL): current_level,
    # attendance_count, assessment, recommendation.
    return {
        "junior_id": junior.id,
        "report_month": month,
        "current_level": junior.current_level,
        "attendance_count": 6,
        "attendance_total": 8,
        "assessment": "meeting_expectation",
        "recommendation": "continue_level",
        "special_remarks": "Solid month.",
        "competitions_played": 2,
        "best_gross_score": 82,
    }


def _create_eval(client, coach_h, junior, month="2026-05-01"):
    r = client.post("/api/evaluations", json=_eval_body(junior, month), headers=coach_h)
    assert r.status_code == 201, r.get_data(as_text=True)
    return r.get_json()["data"]


def test_coach_creates_evaluation_unsigned(client, auth, make_junior):
    _, coach_h = auth("coach")
    junior = make_junior(level=7)
    ev = _create_eval(client, coach_h, junior)
    assert ev["coach_signed"] is False
    assert ev["committee_signed"] is False
    # coach_id is stamped from the token, not the body.
    assert ev["coach_id"] is not None


def test_committee_cannot_sign_before_coach(client, auth, make_junior):
    _, coach_h = auth("coach")
    _, committee_h = auth("committee")
    junior = make_junior(level=7)
    ev = _create_eval(client, coach_h, junior)

    r = client.post(f"/api/evaluations/{ev['id']}/committee-sign", headers=committee_h)
    # Coach hasn't signed yet → blocked (FORBIDDEN, 403).
    assert r.status_code == 403, r.get_data(as_text=True)


def test_signoff_sequence_coach_then_committee(client, auth, make_junior):
    _, coach_h = auth("coach")
    _, committee_h = auth("committee")
    junior = make_junior(level=7)
    ev = _create_eval(client, coach_h, junior)

    # Coach signs first.
    r1 = client.post(f"/api/evaluations/{ev['id']}/coach-sign", headers=coach_h)
    assert r1.status_code == 200, r1.get_data(as_text=True)
    assert r1.get_json()["data"]["coach_signed"] is True

    # Now committee can counter-sign.
    r2 = client.post(f"/api/evaluations/{ev['id']}/committee-sign", headers=committee_h)
    assert r2.status_code == 200, r2.get_data(as_text=True)
    body = r2.get_json()["data"]
    assert body["coach_signed"] is True
    assert body["committee_signed"] is True


def test_only_authoring_coach_can_sign(client, auth, make_user, make_junior):
    _, coach_h = auth("coach")
    _, other_coach_h = auth("coach")
    junior = make_junior(level=7)
    ev = _create_eval(client, coach_h, junior)

    # A different coach cannot sign someone else's evaluation.
    r = client.post(f"/api/evaluations/{ev['id']}/coach-sign", headers=other_coach_h)
    assert r.status_code == 403


def test_duplicate_evaluation_same_month_is_409(client, auth, make_junior):
    _, coach_h = auth("coach")
    junior = make_junior(level=7)
    _create_eval(client, coach_h, junior, month="2026-05-01")

    r = client.post(
        "/api/evaluations",
        json=_eval_body(junior, month="2026-05-01"),
        headers=coach_h,
    )
    assert r.status_code == 409, r.get_data(as_text=True)


def test_different_month_is_allowed(client, auth, make_junior):
    _, coach_h = auth("coach")
    junior = make_junior(level=7)
    _create_eval(client, coach_h, junior, month="2026-05-01")
    r = client.post(
        "/api/evaluations",
        json=_eval_body(junior, month="2026-06-01"),
        headers=coach_h,
    )
    assert r.status_code == 201, r.get_data(as_text=True)
