"""Cross-family access scoping for junior-badges and junior progress.

Headline rule: a parent reads only their OWN child; a player is forced to self
(their own junior_id) regardless of the query param; staff (admin/coach/
committee) read any junior.
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
    junior = make_junior(level=3)
    _award(junior, admin)
    for role in ("admin", "coach", "committee"):
        _, h = auth(role)
        r = client.get(f"/api/junior-badges?junior_id={junior.id}", headers=h)
        assert r.status_code == 200, role
        assert r.get_json()["count"] == 1


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
    junior = make_junior(level=7)
    for role in ("admin", "coach", "committee"):
        _, h = auth(role)
        r = client.get(f"/api/juniors/{junior.id}/progress", headers=h)
        assert r.status_code == 200, role
