"""Auth endpoints: register/login/me top-level (un-enveloped) shapes + 401s.

The auth routes are the documented envelope EXCEPTION: register/login return
{token, user} at the top level and /auth/me returns the BARE user object. Errors
on these routes are a plain string {"error": "..."}, not the {code, message}
object the rest of the API uses.
"""

from app.auth.models import User, UserRole, MembershipType
from app.database.database import db


def test_register_parent_returns_top_level_token_and_user(client):
    r = client.post("/api/auth/register", json={
        "email": "newparent@test.com", "password": "password123",
        "first_name": "New", "last_name": "Parent", "role": "parent",
    })
    assert r.status_code == 200, r.get_data(as_text=True)
    body = r.get_json()
    # Top level, NOT enveloped under "data".
    assert "data" not in body
    assert "token" in body and body["token"]
    assert body["user"]["email"] == "newparent@test.com"
    assert body["user"]["role"] == "parent"
    # password_hash must never be serialized
    assert "password_hash" not in body["user"]


def test_register_player_links_to_parent_membership_number(client):
    # A player self-registration requires the parent's membership number.
    parent = User(
        email="linkparent@test.com",
        password_hash=User.generate_password_hash("password123"),
        first_name="Link", last_name="Parent",
        role=UserRole.parent, membership_type=MembershipType.full,
        membership_number="KCC-1001",
    )
    db.session.add(parent)
    db.session.commit()

    r = client.post("/api/auth/register", json={
        "email": "newplayer@test.com", "password": "password123",
        "first_name": "New", "last_name": "Player", "role": "player",
        "parent_membership_number": "KCC-1001",
    })
    assert r.status_code == 200, r.get_data(as_text=True)
    body = r.get_json()
    assert body["user"]["role"] == "player"


def test_register_player_without_parent_number_rejected(client):
    r = client.post("/api/auth/register", json={
        "email": "lonelyplayer@test.com", "password": "password123",
        "first_name": "Lonely", "last_name": "Player", "role": "player",
    })
    assert r.status_code == 400
    # Auth error shape is a plain string under "error".
    assert isinstance(r.get_json()["error"], str)


def test_register_privileged_role_is_forced_to_player(client):
    # The public endpoint silently downgrades coach/committee/admin to player —
    # it never creates a privileged account. Player needs a parent number, so
    # this also surfaces the player-path validation error (proving NOT a coach).
    r = client.post("/api/auth/register", json={
        "email": "sneakycoach@test.com", "password": "password123",
        "first_name": "Sneaky", "last_name": "Coach", "role": "coach",
    })
    # Forced to player -> player path requires a parent membership number -> 400.
    assert r.status_code == 400
    assert isinstance(r.get_json()["error"], str)
    # And no coach account was created.
    assert User.query.filter_by(email="sneakycoach@test.com").first() is None


def test_register_duplicate_email_conflict(client):
    payload = {
        "email": "dupe@test.com", "password": "password123",
        "first_name": "Dupe", "last_name": "Parent", "role": "parent",
    }
    assert client.post("/api/auth/register", json=payload).status_code == 200
    r = client.post("/api/auth/register", json=payload)
    assert r.status_code == 409
    assert isinstance(r.get_json()["error"], str)


def test_login_returns_top_level_token_and_user(client, make_user):
    # make_user hashes "password123" for any role.
    user = make_user(role="parent", email="loginok@test.com")
    r = client.post("/api/auth/login", json={
        "email": "loginok@test.com", "password": "password123",
    })
    assert r.status_code == 200, r.get_data(as_text=True)
    body = r.get_json()
    assert "data" not in body
    assert body["token"]
    assert body["user"]["email"] == "loginok@test.com"


def test_login_bad_password_is_401_string_error(client, make_user):
    make_user(role="parent", email="badpw@test.com")
    r = client.post("/api/auth/login", json={
        "email": "badpw@test.com", "password": "wrongpassword",
    })
    assert r.status_code == 401
    assert isinstance(r.get_json()["error"], str)


def test_me_returns_bare_user_object(client, auth):
    user, headers = auth("admin")
    r = client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200
    body = r.get_json()
    # Bare user, NOT wrapped in {"data": ...} or {"user": ...}.
    assert "data" not in body
    assert "user" not in body
    assert body["email"] == user.email
    assert body["id"] == user.id
    assert "password_hash" not in body


def test_me_without_token_is_401(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_with_invalid_token_is_401(client):
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.real.token"})
    assert r.status_code == 401
