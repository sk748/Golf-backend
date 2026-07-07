"""Announcements: publish + fan-out, drafts, role-scoped feed, public endpoint.

- Internal announcement (everyone/roles) → published + fans out 'announcement'
  notifications to targeted users, EXCLUDING the author.
- Committee external → draft (no fan-out).
- GET /api/announcements is role-scoped.
- GET /api/public/announcements (no auth) returns only published external.
"""

from app.notifications.models import Notification


def test_admin_internal_everyone_fans_out_excluding_author(client, auth, make_user):
    admin, admin_h = auth("admin")
    # A few other users to receive the broadcast.
    u1 = make_user(role="coach")
    u2 = make_user(role="player")
    u3 = make_user(role="parent")

    r = client.post("/api/announcements", json={
        "title": "Range closed Friday", "body": "Maintenance.", "audience": "everyone",
    }, headers=admin_h)
    assert r.status_code == 201, r.get_data(as_text=True)
    a = r.get_json()["data"]
    assert a["status"] == "published"

    notes = Notification.query.filter_by(type="announcement").all()
    recipient_ids = {n.user_id for n in notes}
    # All other users get it; the author does NOT.
    assert {u1.id, u2.id, u3.id} <= recipient_ids
    assert admin.id not in recipient_ids
    for n in notes:
        assert n.payload["announcement_id"] == a["id"]


def test_admin_internal_roles_targets_only_named_roles(client, auth, make_user):
    admin, admin_h = auth("admin")
    coach = make_user(role="coach")
    player = make_user(role="player")

    r = client.post("/api/announcements", json={
        "title": "Coaches meeting", "body": "Thursday 4pm.",
        "audience": "roles", "roles": "coach",
    }, headers=admin_h)
    assert r.status_code == 201, r.get_data(as_text=True)

    notes = Notification.query.filter_by(type="announcement").all()
    recipient_ids = {n.user_id for n in notes}
    assert coach.id in recipient_ids
    assert player.id not in recipient_ids
    assert admin.id not in recipient_ids


def test_committee_external_goes_to_draft_no_fanout(client, auth, make_user):
    _, committee_h = auth("committee")
    make_user(role="player")  # would-be recipient

    r = client.post("/api/announcements", json={
        "title": "Open Day", "body": "Public welcome.",
        "audience": "everyone", "is_external": True,
    }, headers=committee_h)
    assert r.status_code == 201, r.get_data(as_text=True)
    assert r.get_json()["data"]["status"] == "draft"
    # External + draft → no bell fan-out.
    assert Notification.query.filter_by(type="announcement").count() == 0


def test_admin_external_publishes_directly(client, auth):
    _, admin_h = auth("admin")
    r = client.post("/api/announcements", json={
        "title": "Junior Open", "body": "Sign up now.",
        "audience": "everyone", "is_external": True,
    }, headers=admin_h)
    assert r.status_code == 201, r.get_data(as_text=True)
    assert r.get_json()["data"]["status"] == "published"
    # External never fans out to the bell even when published.
    assert Notification.query.filter_by(type="announcement").count() == 0


def test_feed_is_role_scoped(client, auth, make_user):
    _, admin_h = auth("admin")
    # Internal targeted only at coaches.
    client.post("/api/announcements", json={
        "title": "Coach-only", "body": "x", "audience": "roles", "roles": "coach",
    }, headers=admin_h)
    # Internal to everyone.
    client.post("/api/announcements", json={
        "title": "Everyone", "body": "y", "audience": "everyone",
    }, headers=admin_h)

    _, player_h = auth("player")
    titles = {a["title"] for a in client.get("/api/announcements", headers=player_h).get_json()["data"]}
    # A player sees the 'everyone' one but NOT the coach-only one.
    assert "Everyone" in titles
    assert "Coach-only" not in titles

    # Admin sees everything (including the coach-only one).
    admin_titles = {a["title"] for a in client.get("/api/announcements", headers=admin_h).get_json()["data"]}
    assert {"Everyone", "Coach-only"} <= admin_titles


def test_public_endpoint_returns_only_published_external(client, auth):
    _, admin_h = auth("admin")
    # Published external (should appear).
    client.post("/api/announcements", json={
        "title": "Public Open Day", "body": "Welcome!",
        "audience": "everyone", "is_external": True,
    }, headers=admin_h)
    # Internal (should NOT appear publicly).
    client.post("/api/announcements", json={
        "title": "Internal memo", "body": "staff only", "audience": "everyone",
    }, headers=admin_h)
    # Committee external draft (not published → should NOT appear).
    _, committee_h = auth("committee")
    client.post("/api/announcements", json={
        "title": "Draft external", "body": "later",
        "audience": "everyone", "is_external": True,
    }, headers=committee_h)

    r = client.get("/api/public/announcements")  # NO auth header
    assert r.status_code == 200
    titles = {a["title"] for a in r.get_json()["data"]}
    assert titles == {"Public Open Day"}
