"""Regression for P-1: self-update via PUT /api/users/<id> must not allow a
non-admin to set their own handicap_index (bypassing the WHS engine) or squat
another family's membership_number. The admin path is unaffected."""

from app.database.database import db


def test_self_update_cannot_set_handicap_or_membership_number(client, auth):
    user, headers = auth(role="player", handicap=18.3)
    user.membership_number = "KCC-2001"
    db.session.commit()

    r = client.put(
        f"/api/users/{user.id}",
        json={"handicap_index": 0.0, "membership_number": "HACKED"},
        headers=headers,
    )

    assert r.status_code == 200, r.get_data(as_text=True)
    db.session.refresh(user)
    assert float(user.handicap_index) == 18.3
    assert user.membership_number == "KCC-2001"
    body = r.get_json()["data"]
    assert body["current_hcp_index"] == 18.3


def test_admin_update_of_another_user_still_sets_fields(client, auth, make_user):
    _, admin_headers = auth(role="admin")
    target = make_user(role="player", handicap=18.3)

    r = client.put(
        f"/api/users/{target.id}",
        json={"handicap_index": 0.0, "membership_number": "HACKED"},
        headers=admin_headers,
    )

    assert r.status_code == 200, r.get_data(as_text=True)
    db.session.refresh(target)
    assert float(target.handicap_index) == 0.0
    assert target.membership_number == "HACKED"
