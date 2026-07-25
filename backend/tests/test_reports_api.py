"""Reports-for-analysis exports: per-junior scoping + aggregate-only programme report."""

import base64
from datetime import date

from app.database.database import db


def test_parent_cannot_export_other_childs_report(client, auth, make_user, make_junior):
    _, parent_h = auth("parent")
    other_parent = make_user(role="parent")
    other_child = make_junior(level=3, parent=other_parent)

    r = client.get(f"/api/reports/junior/{other_child.id}", headers=parent_h)
    assert r.status_code == 403


def test_coach_cannot_export_unassigned_juniors_report(client, auth, make_user, make_junior):
    _, coach_h = auth("coach")
    other_coach = make_user(role="coach")
    junior = make_junior(level=3, coach=other_coach)

    r = client.get(f"/api/reports/junior/{junior.id}", headers=coach_h)
    assert r.status_code == 403


def test_parent_exports_own_childs_report(client, auth, make_junior):
    parent, parent_h = auth("parent")
    child = make_junior(level=5, parent=parent)

    r = client.get(f"/api/reports/junior/{child.id}", headers=parent_h)
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert set(data) == {"filename", "mime", "content_base64"}
    assert data["filename"].endswith(".xlsx")
    assert data["content_base64"]


def test_parent_exports_own_childs_report_as_pdf(client, auth, make_junior):
    parent, parent_h = auth("parent")
    child = make_junior(level=5, parent=parent)

    r = client.get(f"/api/reports/junior/{child.id}?format=pdf", headers=parent_h)
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert set(data) == {"filename", "mime", "content_base64"}
    assert data["mime"] == "application/pdf"
    assert data["filename"].endswith(".pdf")
    assert data["content_base64"]
    assert base64.b64decode(data["content_base64"]).startswith(b"%PDF")


def test_programme_report_as_pdf_for_admin(client, auth, make_junior):
    make_junior(level=3)
    _, admin_h = auth("admin")

    r = client.get("/api/reports/programme?format=pdf", headers=admin_h)
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert set(data) == {"filename", "mime", "content_base64"}
    assert data["mime"] == "application/pdf"
    assert data["filename"].endswith(".pdf")
    assert data["content_base64"]
    assert base64.b64decode(data["content_base64"]).startswith(b"%PDF")


def test_junior_report_unknown_junior_404(client, auth):
    _, admin_h = auth("admin")
    r = client.get("/api/reports/junior/999999", headers=admin_h)
    assert r.status_code == 404


def test_programme_report_forbidden_for_non_staff(client, auth):
    for role in ("coach", "parent", "player"):
        _, h = auth(role)
        r = client.get("/api/reports/programme", headers=h)
        assert r.status_code == 403, role


def test_programme_report_for_admin_and_committee(client, auth, make_junior):
    make_junior(level=3)
    for role in ("admin", "committee"):
        _, h = auth(role)
        r = client.get("/api/reports/programme", headers=h)
        assert r.status_code == 200, role
        data = r.get_json()["data"]
        assert set(data) == {"filename", "mime", "content_base64"}
        assert data["filename"].endswith(".xlsx")


def test_programme_report_never_contains_junior_pii(client, auth, make_junior):
    _, admin_h = auth("admin")
    for _ in range(3):
        junior = make_junior(level=3, dob=date(2013, 4, 7))
        junior.medical_conditions = "asthma - carries inhaler"
        db.session.commit()

        r = client.get("/api/reports/programme", headers=admin_h)
        assert r.status_code == 200
        raw = r.get_data(as_text=True)
        assert "medical_conditions" not in raw
        assert "2013-04-07" not in raw
