"""Notifications bell feed + mark-read.

GET /api/notifications → {items, unread_notifications, unread_messages,
recent_messages}. PUT /api/notifications/read marks {ids} (or all when empty).
Rows are seeded directly via the notify service, mirroring how other domains
write them.
"""

from app.database.database import db
from app.auth.models import User
from app.notifications.service import notify


def _seed_notes(user_id, n=3):
    for i in range(n):
        notify(user_id, "announcement", {"i": i})
    db.session.commit()


def test_feed_shape_and_counters(client, auth):
    user, headers = auth("admin")
    _seed_notes(user.id, 3)

    r = client.get("/api/notifications", headers=headers)
    assert r.status_code == 200
    data = r.get_json()["data"]
    # All four keys must be present.
    assert set(data.keys()) >= {
        "items", "unread_notifications", "unread_messages", "recent_messages"
    }
    assert len(data["items"]) == 3
    assert data["unread_notifications"] == 3
    assert isinstance(data["unread_messages"], int)
    assert isinstance(data["recent_messages"], list)


def test_feed_only_returns_own_notifications(client, auth, make_user):
    user, headers = auth("admin")
    other = make_user(role="coach")
    _seed_notes(user.id, 2)
    _seed_notes(other.id, 5)

    data = client.get("/api/notifications", headers=headers).get_json()["data"]
    assert data["unread_notifications"] == 2
    assert len(data["items"]) == 2


def test_mark_specific_ids_read(client, auth):
    user, headers = auth("admin")
    _seed_notes(user.id, 3)
    ids = [n["id"] for n in client.get("/api/notifications", headers=headers).get_json()["data"]["items"]]

    r = client.put("/api/notifications/read", json={"ids": ids[:1]}, headers=headers)
    assert r.status_code == 200
    assert r.get_json()["data"]["updated"] == 1

    data = client.get("/api/notifications", headers=headers).get_json()["data"]
    assert data["unread_notifications"] == 2


def test_mark_all_read_with_empty_body(client, auth):
    user, headers = auth("admin")
    _seed_notes(user.id, 4)

    r = client.put("/api/notifications/read", json={}, headers=headers)
    assert r.status_code == 200
    assert r.get_json()["data"]["updated"] == 4
    assert client.get("/api/notifications", headers=headers).get_json()["data"]["unread_notifications"] == 0


def test_mark_read_bad_ids_type_is_400(client, auth):
    _, headers = auth("admin")
    r = client.put("/api/notifications/read", json={"ids": "not-a-list"}, headers=headers)
    assert r.status_code == 400


def test_notifications_require_auth(client):
    assert client.get("/api/notifications").status_code == 401
    assert client.put("/api/notifications/read", json={}).status_code == 401
