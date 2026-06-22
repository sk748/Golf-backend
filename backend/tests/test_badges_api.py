"""Badge catalog CRUD (admin-only) + awarding/revoking (staff) + award notifies.

Catalog (Badge) rows are NOT seeded in tests, so the catalog endpoints create
them. Awarding writes a JuniorBadge and pings the junior's user (+ parent).
"""

from app.database.database import db
from app.auth.models import User
from app.juniors.models import Badge, JuniorBadge
from app.notifications.models import Notification


# ── Catalog CRUD: admin-only ─────────────────────────────────────────────────

def test_admin_can_create_badge(client, auth):
    _, admin_h = auth("admin")
    r = client.post("/api/badges", json={"name": "Eagle Eye", "description": "Sharp"}, headers=admin_h)
    assert r.status_code == 201, r.get_data(as_text=True)
    assert r.get_json()["data"]["name"] == "Eagle Eye"


def test_non_admin_cannot_create_badge(client, auth):
    for role in ("committee", "coach", "player", "parent"):
        _, h = auth(role)
        r = client.post("/api/badges", json={"name": "Nope"}, headers=h)
        assert r.status_code == 403, role


# ── Awarding: admin, coach, committee can; player/parent cannot ──────────────

def _make_badge():
    b = Badge(name="Putting Pro")
    db.session.add(b)
    db.session.commit()
    return b


def test_staff_can_award_badge(client, auth, make_junior):
    badge = _make_badge()
    for role in ("admin", "coach", "committee"):
        junior = make_junior(level=3)
        _, h = auth(role)
        r = client.post(
            "/api/junior-badges",
            json={"junior_id": junior.id, "badge_id": badge.id},
            headers=h,
        )
        assert r.status_code == 201, f"{role}: {r.get_data(as_text=True)}"


def test_player_and_parent_cannot_award_badge(client, auth, make_junior):
    badge = _make_badge()
    junior = make_junior(level=3)
    for role in ("player", "parent"):
        _, h = auth(role)
        r = client.post(
            "/api/junior-badges",
            json={"junior_id": junior.id, "badge_id": badge.id},
            headers=h,
        )
        assert r.status_code == 403, role


def test_award_creates_notifications_for_junior_and_parent(client, auth, make_user, make_junior):
    badge = _make_badge()
    parent = make_user(role="parent")
    junior = make_junior(level=3, parent=parent)
    _, admin_h = auth("admin")

    r = client.post(
        "/api/junior-badges",
        json={"junior_id": junior.id, "badge_id": badge.id},
        headers=admin_h,
    )
    assert r.status_code == 201, r.get_data(as_text=True)

    # The player's own user gets an 'achievement' notification.
    player_notes = Notification.query.filter_by(user_id=junior.user_id, type="achievement").all()
    assert len(player_notes) == 1
    assert player_notes[0].payload["badge_id"] == badge.id

    # The parent gets one too, tagged with child_name.
    parent_notes = Notification.query.filter_by(user_id=parent.id, type="achievement").all()
    assert len(parent_notes) == 1
    assert "child_name" in parent_notes[0].payload


def test_award_without_parent_notifies_only_junior(client, auth, make_junior):
    badge = _make_badge()
    junior = make_junior(level=3)  # no parent
    _, admin_h = auth("admin")
    client.post(
        "/api/junior-badges",
        json={"junior_id": junior.id, "badge_id": badge.id},
        headers=admin_h,
    )
    notes = Notification.query.filter_by(type="achievement").all()
    assert len(notes) == 1
    assert notes[0].user_id == junior.user_id


def test_duplicate_award_is_409(client, auth, make_junior):
    badge = _make_badge()
    junior = make_junior(level=3)
    _, admin_h = auth("admin")
    body = {"junior_id": junior.id, "badge_id": badge.id}
    assert client.post("/api/junior-badges", json=body, headers=admin_h).status_code == 201
    assert client.post("/api/junior-badges", json=body, headers=admin_h).status_code == 409


# ── Revoke: staff roles ──────────────────────────────────────────────────────

def test_staff_can_revoke_badge(client, auth, make_user, make_junior):
    badge = _make_badge()
    junior = make_junior(level=3)
    awarder = make_user(role="admin")
    from datetime import date
    db.session.add(JuniorBadge(
        junior_id=junior.id, badge_id=badge.id,
        awarded_date=date(2026, 5, 1), awarded_by=awarder.id,
    ))
    db.session.commit()

    _, coach_h = auth("coach")
    r = client.delete(f"/api/junior-badges/{junior.id}/{badge.id}", headers=coach_h)
    assert r.status_code == 204
    assert db.session.get(JuniorBadge, (junior.id, badge.id)) is None


def test_player_cannot_revoke_badge(client, auth, make_user, make_junior):
    badge = _make_badge()
    junior = make_junior(level=3)
    awarder = make_user(role="admin")
    from datetime import date
    db.session.add(JuniorBadge(
        junior_id=junior.id, badge_id=badge.id,
        awarded_date=date(2026, 5, 1), awarded_by=awarder.id,
    ))
    db.session.commit()

    user = db.session.get(User, junior.user_id)
    h = {"Authorization": "Bearer " + user.generate_auth_token()}
    r = client.delete(f"/api/junior-badges/{junior.id}/{badge.id}", headers=h)
    assert r.status_code == 403
