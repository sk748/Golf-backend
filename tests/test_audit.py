"""Audit log: service writes descriptive rows; endpoint is admin-only."""

from app.audit.models import AuditLog
from app.audit.service import record


def test_audit_log_admin_only(client, auth):
    _, admin_h = auth("admin")
    _, coach_h = auth("coach")
    assert client.get("/api/admin/audit-log", headers=admin_h).status_code == 200
    assert client.get("/api/admin/audit-log", headers=coach_h).status_code == 403
    assert client.get("/api/admin/audit-log").status_code == 401


def test_record_writes_plain_english(app):
    entry = record("tournament.created", target_label="Spring Cup")
    assert entry is not None
    row = AuditLog.query.filter_by(action="tournament.created").first()
    assert row.actor_name == "System"
    assert row.category == "tournament"
    assert "Spring Cup" in row.description


def test_user_creation_is_audited(client, auth):
    _, admin_h = auth("admin")
    r = client.post(
        "/api/users",
        json={
            "email": "newcoach@test.com",
            "password": "password123",
            "first_name": "New",
            "last_name": "Coach",
            "role": "coach",
            "membership_type": "full",
        },
        headers=admin_h,
    )
    assert r.status_code == 201, r.get_data(as_text=True)

    log = client.get("/api/admin/audit-log", headers=admin_h).get_json()
    entry = next(
        e for e in log["data"]
        if e["action"] == "user.created" and "New Coach" in e["description"]
    )
    assert entry["category"] == "user"
    assert entry["actor_role"] == "admin"
    assert "created a new coach account for New Coach" in entry["description"]


def test_role_change_is_audited_with_old_and_new(client, auth, make_user):
    _, admin_h = auth("admin")
    target = make_user(role="coach")
    r = client.put(
        f"/api/admin/users/{target.id}/role",
        json={"role": "committee"},
        headers=admin_h,
    )
    assert r.status_code == 200, r.get_data(as_text=True)

    log = client.get("/api/admin/audit-log", headers=admin_h).get_json()
    entry = next(e for e in log["data"] if e["action"] == "user.role_changed")
    assert "from coach to committee" in entry["description"]
