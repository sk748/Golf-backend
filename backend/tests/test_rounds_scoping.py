"""Rounds + hole-scores ownership scoping (audit C-1, C-2/MA-1, H-1).

Headline rules: POST /rounds always stamps the owner from the JWT and computes
WHS fields server-side; hole-scores reads/writes require access to the
underlying round; parents see only their own children's rounds and history.
"""

from datetime import date

from app.database.database import db
from app.auth.models import User
from app.courses.models import Course, TeeSet
from app.rounds.models import Round, HoleScore


def _tee():
    course = Course.query.first()
    return TeeSet.query.filter_by(course_id=course.id, name="white", gender="men").first()


def _make_round(user, gross=90):
    tee = _tee()
    r = Round(
        user_id=user.id, course_id=tee.course_id, tee_set_id=tee.id,
        date_played=date(2026, 6, 1), round_type="casual", gross_score=gross,
        status="verified",
    )
    db.session.add(r)
    db.session.commit()
    return r


def _make_hole_score(rnd, hole=1, strokes=4):
    hs = HoleScore(round_id=rnd.id, hole_number=hole, strokes=strokes)
    db.session.add(hs)
    db.session.commit()
    return hs


# ── C-2/MA-1: POST /rounds forging ───────────────────────────────────────────

def test_player_cannot_forge_round_for_another_user(client, auth, make_user):
    _, player_h = auth("player")
    victim = make_user(role="player")
    r = client.post(
        "/api/rounds",
        json={"user_id": victim.id, "tee_set_id": _tee().id, "gross_score": 85},
        headers=player_h,
    )
    assert r.status_code == 403
    assert Round.query.count() == 0


def test_player_round_owner_and_whs_fields_are_server_set(client, auth):
    player, player_h = auth("player")
    r = client.post(
        "/api/rounds",
        json={
            "tee_set_id": _tee().id, "gross_score": 85,
            "status": "verified", "score_differential": -5.0,
            "handicap_before": 1.0, "handicap_after": 1.0,
            "verified_by": player.id, "verified_date": "2026-06-01",
        },
        headers=player_h,
    )
    assert r.status_code == 201
    body = r.get_json()["data"]
    assert body["user_id"] == player.id
    assert body["entered_by"] == player.id
    assert body["status"] == "pending"
    assert body["verified_by"] is None
    assert body["verified_date"] is None
    # engine-computed off white/men (CR 73.0, slope 137): (113/137)*(85-73) = 9.9
    assert body["score_differential"] == 9.9
    assert body["handicap_before"] is None
    assert body["handicap_after"] is None


def test_coach_can_enter_round_on_behalf(client, auth, make_user):
    _, coach_h = auth("coach")
    player = make_user(role="player")
    r = client.post(
        "/api/rounds",
        json={"user_id": player.id, "tee_set_id": _tee().id, "gross_score": 85},
        headers=coach_h,
    )
    assert r.status_code == 201
    body = r.get_json()["data"]
    assert body["user_id"] == player.id
    assert body["status"] == "verified"


# ── C-1: hole-scores access ──────────────────────────────────────────────────

def test_player_hole_scores_requires_round_id(client, auth):
    _, player_h = auth("player")
    r = client.get("/api/hole-scores", headers=player_h)
    assert r.status_code == 400


def test_player_cannot_read_others_hole_scores(client, auth, make_user):
    owner = make_user(role="player")
    rnd = _make_round(owner)
    _make_hole_score(rnd)
    _, player_h = auth("player")
    r = client.get(f"/api/hole-scores?round_id={rnd.id}", headers=player_h)
    assert r.status_code == 403


def test_player_cannot_write_hole_score_onto_others_round(client, auth, make_user):
    owner = make_user(role="player")
    rnd = _make_round(owner)
    _, player_h = auth("player")
    r = client.post(
        "/api/hole-scores",
        json={"round_id": rnd.id, "hole_number": 1, "strokes": 5},
        headers=player_h,
    )
    assert r.status_code == 403
    assert HoleScore.query.count() == 0


def test_player_cannot_update_others_hole_score(client, auth, make_user):
    owner = make_user(role="player")
    hs = _make_hole_score(_make_round(owner))
    _, player_h = auth("player")
    r = client.put(f"/api/hole-scores/{hs.id}", json={"strokes": 2}, headers=player_h)
    assert r.status_code == 403


def test_owner_reads_and_writes_own_hole_scores(client, auth):
    owner, owner_h = auth("player")
    rnd = _make_round(owner)
    r = client.post(
        "/api/hole-scores",
        json={"round_id": rnd.id, "hole_number": 1, "strokes": 5},
        headers=owner_h,
    )
    assert r.status_code == 201
    r = client.get(f"/api/hole-scores?round_id={rnd.id}", headers=owner_h)
    assert r.status_code == 200
    assert r.get_json()["count"] == 1


def test_parent_reads_own_childs_hole_scores(client, auth, make_junior):
    parent, parent_h = auth("parent")
    child = make_junior(level=5, parent=parent)
    rnd = _make_round(db.session.get(User, child.user_id))
    _make_hole_score(rnd)
    r = client.get(f"/api/hole-scores?round_id={rnd.id}", headers=parent_h)
    assert r.status_code == 200
    assert r.get_json()["count"] == 1


def test_assigned_coach_reads_juniors_hole_scores(client, auth, make_junior):
    coach, coach_h = auth("coach")
    junior = make_junior(level=5)
    junior.coach_id = coach.id
    db.session.commit()
    rnd = _make_round(db.session.get(User, junior.user_id))
    _make_hole_score(rnd)
    r = client.get(f"/api/hole-scores?round_id={rnd.id}", headers=coach_h)
    assert r.status_code == 200
    assert r.get_json()["count"] == 1


def test_unassigned_coach_cannot_read_juniors_hole_scores(client, auth, make_junior):
    _, coach_h = auth("coach")
    junior = make_junior(level=5)
    rnd = _make_round(db.session.get(User, junior.user_id))
    r = client.get(f"/api/hole-scores?round_id={rnd.id}", headers=coach_h)
    assert r.status_code == 403


# ── H-1: parent scoping on rounds + handicap history ─────────────────────────

def test_parent_rounds_scoped_to_own_children(client, auth, make_user, make_junior):
    parent, parent_h = auth("parent")
    child = make_junior(level=5, parent=parent)
    _make_round(db.session.get(User, child.user_id))
    _make_round(make_user(role="player"))
    r = client.get("/api/rounds", headers=parent_h)
    assert r.status_code == 200
    body = r.get_json()
    assert body["count"] == 1
    assert body["data"][0]["user_id"] == child.user_id


def test_parent_cannot_query_other_users_rounds(client, auth, make_user):
    _, parent_h = auth("parent")
    other = make_user(role="player")
    _make_round(other)
    r = client.get(f"/api/rounds?user_id={other.id}", headers=parent_h)
    assert r.status_code == 403


def test_parent_handicap_history_scoped_to_own_children(client, auth, make_user, make_junior):
    parent, parent_h = auth("parent")
    child = make_junior(level=5, parent=parent)
    other = make_user(role="player")
    r = client.get(f"/api/users/{child.user_id}/handicap-history", headers=parent_h)
    assert r.status_code == 200
    r = client.get(f"/api/users/{other.id}/handicap-history", headers=parent_h)
    assert r.status_code == 403


def test_committee_rounds_remain_unscoped(client, auth, make_user):
    _make_round(make_user(role="player"))
    _, committee_h = auth("committee")
    r = client.get("/api/rounds", headers=committee_h)
    assert r.status_code == 200
    assert r.get_json()["count"] == 1
