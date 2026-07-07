"""Player catalog-achievement sync: silent baseline, then congratulate on new.

First sync = baseline (records, NO notifications). A later sync adding a new key
records it AND raises an 'achievement' notification for the player + parent.
GET returns the recorded {key, unlocked_at} list. Non-players get 403.
"""

from app.database.database import db
from app.auth.models import User
from app.juniors.models import AchievementUnlock
from app.notifications.models import Notification


def _player_headers(junior):
    user = db.session.get(User, junior.user_id)
    return {"Authorization": "Bearer " + user.generate_auth_token()}


def _sync(client, headers, keys):
    return client.post(
        "/api/juniors/me/achievements/sync",
        json={"achievements": [{"key": k, "title": k.title()} for k in keys]},
        headers=headers,
    )


def test_first_sync_is_silent_baseline(client, make_junior):
    junior = make_junior(level=3)
    headers = _player_headers(junior)
    r = _sync(client, headers, ["sc-1", "sc-2"])
    assert r.status_code == 200, r.get_data(as_text=True)
    data = r.get_json()["data"]
    # Baseline records but reports nothing as "newly_unlocked" (no confetti).
    assert data["newly_unlocked"] == []
    assert {u["key"] for u in data["unlocked"]} == {"sc-1", "sc-2"}
    # No notifications on the baseline.
    assert Notification.query.filter_by(type="achievement").count() == 0
    # But the rows ARE recorded.
    assert AchievementUnlock.query.filter_by(junior_id=junior.id).count() == 2


def test_second_sync_new_key_notifies_player_and_parent(client, make_user, make_junior):
    parent = make_user(role="parent")
    junior = make_junior(level=3, parent=parent)
    headers = _player_headers(junior)

    _sync(client, headers, ["sc-1"])  # baseline
    r = _sync(client, headers, ["sc-1", "sc-2"])  # adds sc-2
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["newly_unlocked"] == ["sc-2"]
    assert {u["key"] for u in data["unlocked"]} == {"sc-1", "sc-2"}

    player_notes = Notification.query.filter_by(user_id=junior.user_id, type="achievement").all()
    assert len(player_notes) == 1
    assert player_notes[0].payload["achievement_key"] == "sc-2"

    parent_notes = Notification.query.filter_by(user_id=parent.id, type="achievement").all()
    assert len(parent_notes) == 1
    assert "child_name" in parent_notes[0].payload


def test_second_sync_no_parent_notifies_only_player(client, make_junior):
    junior = make_junior(level=3)  # no parent
    headers = _player_headers(junior)
    _sync(client, headers, ["sc-1"])
    _sync(client, headers, ["sc-1", "sc-2"])
    notes = Notification.query.filter_by(type="achievement").all()
    assert len(notes) == 1
    assert notes[0].user_id == junior.user_id


def test_get_achievements_returns_unlocked_list(client, make_junior):
    junior = make_junior(level=3)
    headers = _player_headers(junior)
    _sync(client, headers, ["sc-1", "sc-2"])

    r = client.get("/api/juniors/me/achievements", headers=headers)
    assert r.status_code == 200
    unlocked = r.get_json()["data"]["unlocked"]
    keys = {u["key"] for u in unlocked}
    assert keys == {"sc-1", "sc-2"}
    assert all("unlocked_at" in u for u in unlocked)


def test_non_player_cannot_sync_or_read(client, auth):
    for role in ("admin", "coach", "committee", "parent"):
        _, h = auth(role)
        assert client.post(
            "/api/juniors/me/achievements/sync",
            json={"achievements": []}, headers=h,
        ).status_code == 403, role
        assert client.get("/api/juniors/me/achievements", headers=h).status_code == 403, role
