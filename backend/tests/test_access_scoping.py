"""Cross-family access scoping for junior-badges and junior progress.

Headline rule: a parent reads only their OWN child; a player is forced to self
(their own junior_id) regardless of the query param; admin/committee read any
junior; a coach reads only the juniors on their own roster.
"""

from datetime import date

from app.database.database import db
from app.auth.models import User
from app.juniors.models import Badge, JuniorBadge


def _player_headers(junior):
    user = db.session.get(User, junior.user_id)
    return {"Authorization": "Bearer " + user.generate_auth_token()}


def _award(junior, awarder, name="Putting Star"):
    badge = Badge(name=name)
    db.session.add(badge)
    db.session.commit()
    db.session.add(JuniorBadge(
        junior_id=junior.id, badge_id=badge.id,
        awarded_date=date(2026, 5, 1), awarded_by=awarder.id,
    ))
    db.session.commit()
    return badge


# ── junior-badges scoping ────────────────────────────────────────────────────

def test_parent_reads_own_childs_badges(client, auth, make_user, make_junior):
    parent, parent_h = auth("parent")
    admin = make_user(role="admin")
    child = make_junior(level=3, parent=parent)
    _award(child, admin)

    r = client.get(f"/api/junior-badges?junior_id={child.id}", headers=parent_h)
    assert r.status_code == 200
    body = r.get_json()
    assert body["count"] == 1


def test_parent_cannot_read_other_childs_badges(client, auth, make_user, make_junior):
    parent, parent_h = auth("parent")
    other_parent = make_user(role="parent")
    admin = make_user(role="admin")
    other_child = make_junior(level=3, parent=other_parent)
    _award(other_child, admin)

    r = client.get(f"/api/junior-badges?junior_id={other_child.id}", headers=parent_h)
    assert r.status_code == 403


def test_parent_badges_requires_numeric_junior_id(client, auth):
    _, parent_h = auth("parent")
    r = client.get("/api/junior-badges", headers=parent_h)
    assert r.status_code == 400


def test_player_badges_forced_to_self(client, auth, make_user, make_junior):
    admin = make_user(role="admin")
    me = make_junior(level=3)
    other = make_junior(level=3)
    _award(me, admin, name="My Badge")
    _award(other, admin, name="Their Badge")
    _award(other, admin, name="Their Other Badge")

    # Player passes SOMEONE ELSE'S junior_id but only ever sees their own.
    r = client.get(
        f"/api/junior-badges?junior_id={other.id}",
        headers=_player_headers(me),
    )
    assert r.status_code == 200
    body = r.get_json()
    assert body["count"] == 1  # only my single badge, not the other's two


def test_staff_read_any_junior_badges(client, auth, make_user, make_junior):
    admin = make_user(role="admin")
    coach, coach_h = auth("coach")
    junior = make_junior(level=3, coach=coach)
    _award(junior, admin)
    _, admin_h = auth("admin")
    _, committee_h = auth("committee")
    # Admin/committee read any junior; a coach reads their own roster.
    for role, h in (("admin", admin_h), ("coach", coach_h), ("committee", committee_h)):
        r = client.get(f"/api/junior-badges?junior_id={junior.id}", headers=h)
        assert r.status_code == 200, role
        assert r.get_json()["count"] == 1


def test_coach_cannot_read_unassigned_junior_badges(client, auth, make_user, make_junior):
    admin = make_user(role="admin")
    junior = make_junior(level=3)
    _award(junior, admin)
    _, coach_h = auth("coach")
    r = client.get(f"/api/junior-badges?junior_id={junior.id}", headers=coach_h)
    assert r.status_code == 403


# ── junior progress scoping ──────────────────────────────────────────────────

def test_parent_reads_own_child_progress(client, auth, make_junior):
    parent, parent_h = auth("parent")
    child = make_junior(level=7, parent=parent)
    r = client.get(f"/api/juniors/{child.id}/progress", headers=parent_h)
    assert r.status_code == 200
    assert r.get_json()["data"]["junior_id"] == child.id


def test_parent_cannot_read_other_child_progress(client, auth, make_user, make_junior):
    parent, parent_h = auth("parent")
    other_parent = make_user(role="parent")
    other_child = make_junior(level=7, parent=other_parent)
    r = client.get(f"/api/juniors/{other_child.id}/progress", headers=parent_h)
    assert r.status_code == 403


def test_staff_read_any_junior_progress(client, auth, make_junior):
    coach, coach_h = auth("coach")
    junior = make_junior(level=7, coach=coach)
    _, admin_h = auth("admin")
    _, committee_h = auth("committee")
    for role, h in (("admin", admin_h), ("coach", coach_h), ("committee", committee_h)):
        r = client.get(f"/api/juniors/{junior.id}/progress", headers=h)
        assert r.status_code == 200, role


def test_coach_cannot_read_unassigned_junior_progress(client, auth, make_junior):
    junior = make_junior(level=7)
    _, coach_h = auth("coach")
    r = client.get(f"/api/juniors/{junior.id}/progress", headers=coach_h)
    assert r.status_code == 403


# ── tournament + handicap-journey coach scoping (NEW-3) ──────────────────────

def test_coach_cannot_read_unassigned_junior_tournament_entry(
        client, auth, make_junior, make_tournament, make_entry):
    entry = make_entry(make_tournament(), make_junior(level=7))
    _, coach_h = auth("coach")
    r = client.get(f"/api/tournament-entries/{entry.id}", headers=coach_h)
    assert r.status_code == 403


def test_coach_entry_list_filtered_to_own_roster(
        client, auth, make_junior, make_tournament, make_entry):
    coach, coach_h = auth("coach")
    t = make_tournament()
    mine = make_entry(t, make_junior(level=7, coach=coach))
    make_entry(t, make_junior(level=7))
    r = client.get(f"/api/tournament-entries?tournament_id={t.id}", headers=coach_h)
    assert r.status_code == 200
    body = r.get_json()
    assert body["count"] == 1
    assert body["data"][0]["id"] == mine.id


def test_coach_cannot_read_unassigned_junior_competitions(client, auth, make_junior):
    junior = make_junior(level=7)
    _, coach_h = auth("coach")
    r = client.get(f"/api/juniors/{junior.id}/competitions", headers=coach_h)
    assert r.status_code == 403


def test_coach_reads_own_junior_tournament_data(
        client, auth, make_junior, make_tournament, make_entry):
    coach, coach_h = auth("coach")
    junior = make_junior(level=7, coach=coach)
    entry = make_entry(make_tournament(), junior)
    r = client.get(f"/api/tournament-entries/{entry.id}", headers=coach_h)
    assert r.status_code == 200
    r = client.get(f"/api/juniors/{junior.id}/competitions", headers=coach_h)
    assert r.status_code == 200


def test_coach_cannot_read_unassigned_junior_handicap_journey(client, auth, make_junior):
    junior = make_junior(level=5)
    _, coach_h = auth("coach")
    r = client.get(f"/api/juniors/{junior.id}/handicap-journey", headers=coach_h)
    assert r.status_code == 403


def test_coach_reads_own_junior_handicap_journey(client, auth, make_junior):
    coach, coach_h = auth("coach")
    junior = make_junior(level=5, coach=coach)
    r = client.get(f"/api/juniors/{junior.id}/handicap-journey", headers=coach_h)
    assert r.status_code == 200


def test_admin_committee_read_any_junior_handicap_journey(client, auth, make_junior):
    junior = make_junior(level=5)
    for role in ("admin", "committee"):
        _, h = auth(role)
        r = client.get(f"/api/juniors/{junior.id}/handicap-journey", headers=h)
        assert r.status_code == 200, role


# ── handicap WRITE coach scoping (unassigned junior is admin-only) ───────────

def test_coach_cannot_put_unassigned_junior_handicap_journey(client, auth, make_junior):
    junior = make_junior(level=5)
    _, coach_h = auth("coach")
    r = client.put(f"/api/juniors/{junior.id}/handicap-journey",
                   json={"coach_notes": "plan"}, headers=coach_h)
    assert r.status_code == 403


def test_coach_puts_own_junior_handicap_journey(client, auth, make_junior):
    coach, coach_h = auth("coach")
    junior = make_junior(level=5, coach=coach)
    r = client.put(f"/api/juniors/{junior.id}/handicap-journey",
                   json={"coach_notes": "plan"}, headers=coach_h)
    assert r.status_code == 200


def test_admin_puts_unassigned_junior_handicap_journey(client, auth, make_junior):
    junior = make_junior(level=5)
    _, admin_h = auth("admin")
    r = client.put(f"/api/juniors/{junior.id}/handicap-journey",
                   json={"coach_notes": "plan"}, headers=admin_h)
    assert r.status_code == 200


def test_coach_cannot_set_unassigned_junior_handicap(client, auth, make_junior):
    junior = make_junior(level=5)
    _, coach_h = auth("coach")
    r = client.put(f"/api/users/{junior.user_id}/handicap",
                   json={"handicap_index": 20.0}, headers=coach_h)
    assert r.status_code == 403


def test_coach_sets_own_junior_handicap(client, auth, make_junior):
    coach, coach_h = auth("coach")
    junior = make_junior(level=5, coach=coach)
    r = client.put(f"/api/users/{junior.user_id}/handicap",
                   json={"handicap_index": 20.0}, headers=coach_h)
    assert r.status_code == 200


def test_admin_sets_unassigned_junior_handicap(client, auth, make_junior):
    junior = make_junior(level=5)
    _, admin_h = auth("admin")
    r = client.put(f"/api/users/{junior.user_id}/handicap",
                   json={"handicap_index": 20.0}, headers=admin_h)
    assert r.status_code == 200
