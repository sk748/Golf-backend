"""Coach-ownership scoping for the sessions module (audit findings H-5r, NEW-2).

A coach acts only on their own sessions, classes, enrollments and booking
requests; a booking request with a NULL coach_id is unassigned and only admin
may act on it. Admin remains unscoped throughout.
"""

from datetime import date, time

from app.database.database import db
from app.sessions.models import Class, ClassEnrollment, BookingRequest


def _make_booking(parent, junior, coach=None, session_id=None, status="pending"):
    b = BookingRequest(
        parent_id=parent.id, junior_id=junior.id,
        coach_id=coach.id if coach else None,
        preferred_date=date(2026, 8, 1), preferred_time=time(10, 0),
        status=status, session_id=session_id,
    )
    db.session.add(b)
    db.session.commit()
    return b


def _make_class(coach):
    c = Class(name="Test Class", coach_id=coach.id, schedule="Sat 9am", max_students=6)
    db.session.add(c)
    db.session.commit()
    return c


def _make_enrollment(klass, junior):
    e = ClassEnrollment(
        class_id=klass.id, junior_id=junior.id,
        enrolled_date=date(2026, 7, 1), status="active",
    )
    db.session.add(e)
    db.session.commit()
    return e


# ── PUT /booking-requests/<id> ownership ─────────────────────────────────────

def test_coach_cannot_put_other_coachs_booking_request(client, auth, make_user, make_junior):
    _, coach_h = auth("coach")
    other_coach = make_user(role="coach")
    parent = make_user(role="parent")
    junior = make_junior(parent=parent, coach=other_coach)
    b = _make_booking(parent, junior, coach=other_coach)

    r = client.put(f"/api/booking-requests/{b.id}",
                   json={"admin_notes": "hijack"}, headers=coach_h)
    assert r.status_code == 403


def test_coach_can_put_own_booking_request(client, auth, make_user, make_junior):
    coach, coach_h = auth("coach")
    parent = make_user(role="parent")
    junior = make_junior(parent=parent, coach=coach)
    b = _make_booking(parent, junior, coach=coach)

    r = client.put(f"/api/booking-requests/{b.id}",
                   json={"admin_notes": "confirmed"}, headers=coach_h)
    assert r.status_code == 200
    assert r.get_json()["data"]["admin_notes"] == "confirmed"


def test_admin_can_put_any_booking_request(client, auth, make_user, make_junior):
    _, admin_h = auth("admin")
    coach = make_user(role="coach")
    parent = make_user(role="parent")
    junior = make_junior(parent=parent, coach=coach)
    b = _make_booking(parent, junior, coach=coach)

    r = client.put(f"/api/booking-requests/{b.id}",
                   json={"admin_notes": "admin edit"}, headers=admin_h)
    assert r.status_code == 200


# ── GET /booking-requests coach scoping ──────────────────────────────────────

def test_coach_booking_list_scoped_to_own(client, auth, make_user, make_junior):
    coach, coach_h = auth("coach")
    other_coach = make_user(role="coach")
    parent = make_user(role="parent")
    mine = _make_booking(parent, make_junior(parent=parent, coach=coach), coach=coach)
    _make_booking(parent, make_junior(parent=parent, coach=other_coach), coach=other_coach)
    _make_booking(parent, make_junior(parent=parent))  # unassigned

    r = client.get("/api/booking-requests", headers=coach_h)
    assert r.status_code == 200
    body = r.get_json()
    assert body["count"] == 1
    assert body["data"][0]["id"] == mine.id

    # a coach_id query param cannot widen the scope
    r = client.get(f"/api/booking-requests?coach_id={other_coach.id}", headers=coach_h)
    assert r.get_json()["count"] == 1
    assert r.get_json()["data"][0]["id"] == mine.id


# ── Enrollment ownership ─────────────────────────────────────────────────────

def test_coach_cannot_enroll_other_coachs_junior(client, auth, make_user, make_junior):
    coach, coach_h = auth("coach")
    other_coach = make_user(role="coach")
    junior = make_junior(coach=other_coach)
    klass = _make_class(coach)

    r = client.post("/api/enrollments", json={
        "class_id": klass.id, "junior_id": junior.id,
        "enrolled_date": "2026-07-01", "status": "active",
    }, headers=coach_h)
    assert r.status_code == 403


def test_coach_can_enroll_own_junior(client, auth, make_junior):
    coach, coach_h = auth("coach")
    junior = make_junior(coach=coach)
    klass = _make_class(coach)

    r = client.post("/api/enrollments", json={
        "class_id": klass.id, "junior_id": junior.id,
        "enrolled_date": "2026-07-01", "status": "active",
    }, headers=coach_h)
    assert r.status_code == 201


def test_coach_cannot_update_other_coachs_enrollment(client, auth, make_user, make_junior):
    _, coach_h = auth("coach")
    other_coach = make_user(role="coach")
    junior = make_junior(coach=other_coach)
    e = _make_enrollment(_make_class(other_coach), junior)

    r = client.put(f"/api/enrollments/{e.id}", json={"status": "dropped"}, headers=coach_h)
    assert r.status_code == 403


def test_coach_cannot_drop_other_coachs_junior(client, auth, make_user, make_junior):
    _, coach_h = auth("coach")
    other_coach = make_user(role="coach")
    junior = make_junior(coach=other_coach)
    e = _make_enrollment(_make_class(other_coach), junior)

    r = client.delete(f"/api/enrollments/{e.id}", headers=coach_h)
    assert r.status_code == 403


def test_admin_can_drop_any_enrollment(client, auth, make_user, make_junior):
    _, admin_h = auth("admin")
    coach = make_user(role="coach")
    e = _make_enrollment(_make_class(coach), make_junior(coach=coach))

    r = client.delete(f"/api/enrollments/{e.id}", headers=admin_h)
    assert r.status_code == 204


# ── Null-coach booking requests: only admin acts ─────────────────────────────

def test_coach_cannot_approve_unassigned_booking(client, auth, make_user, make_junior):
    _, coach_h = auth("coach")
    parent = make_user(role="parent")
    b = _make_booking(parent, make_junior(parent=parent))

    r = client.put(f"/api/booking-requests/{b.id}/approve", headers=coach_h)
    assert r.status_code == 403


def test_coach_cannot_decline_unassigned_booking(client, auth, make_user, make_junior):
    _, coach_h = auth("coach")
    parent = make_user(role="parent")
    b = _make_booking(parent, make_junior(parent=parent))

    r = client.put(f"/api/booking-requests/{b.id}/decline", headers=coach_h)
    assert r.status_code == 403


def test_coach_cannot_put_unassigned_booking(client, auth, make_user, make_junior):
    _, coach_h = auth("coach")
    parent = make_user(role="parent")
    b = _make_booking(parent, make_junior(parent=parent))

    r = client.put(f"/api/booking-requests/{b.id}",
                   json={"coach_id": None}, headers=coach_h)
    assert r.status_code == 403


def test_admin_can_approve_unassigned_booking(client, auth, make_user, make_junior):
    _, admin_h = auth("admin")
    parent = make_user(role="parent")
    b = _make_booking(parent, make_junior(parent=parent))

    r = client.put(f"/api/booking-requests/{b.id}/approve", headers=admin_h)
    assert r.status_code == 200
    assert r.get_json()["data"]["status"] == "approved"


# ── coach_id stamped from the token on create ────────────────────────────────

def test_coach_session_create_stamps_own_coach_id(client, auth, make_user):
    coach, coach_h = auth("coach")
    other_coach = make_user(role="coach")

    r = client.post("/api/sessions", json={
        "coach_id": other_coach.id, "session_type": "group",
        "date": "2026-08-01", "start_time": "10:00:00", "end_time": "11:00:00",
        "status": "scheduled",
    }, headers=coach_h)
    assert r.status_code == 201
    assert r.get_json()["data"]["coach_id"] == coach.id


def test_coach_class_create_stamps_own_coach_id(client, auth, make_user):
    coach, coach_h = auth("coach")
    other_coach = make_user(role="coach")

    r = client.post("/api/classes", json={
        "coach_id": other_coach.id, "name": "Sneaky Class",
        "schedule": "Sat 9am", "max_students": 6,
    }, headers=coach_h)
    assert r.status_code == 201
    assert r.get_json()["data"]["coach_id"] == coach.id
