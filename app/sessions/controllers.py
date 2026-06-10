from datetime import datetime, timedelta

from app.database.database import db
from app.sessions.models import Session, Class, ClassEnrollment, BookingRequest
from app.utils.schemas import SimpleModelSchema

session_schema = SimpleModelSchema(Session)
sessions_schema = SimpleModelSchema(Session, many=True)
class_schema = SimpleModelSchema(Class)
classes_schema = SimpleModelSchema(Class, many=True)
enrollment_schema = SimpleModelSchema(ClassEnrollment)
enrollments_schema = SimpleModelSchema(ClassEnrollment, many=True)
booking_schema = SimpleModelSchema(BookingRequest)
bookings_schema = SimpleModelSchema(BookingRequest, many=True)


# ── Sessions ──────────────────────────────────────────────────────────────────

def list_sessions(coach_id=None, class_id=None, session_type=None,
                  status=None, date_from=None, date_to=None,
                  open_for_booking=None):
    q = Session.query
    if coach_id:
        q = q.filter_by(coach_id=coach_id)
    if class_id:
        q = q.filter_by(class_id=class_id)
    if session_type:
        q = q.filter_by(session_type=session_type)
    if status:
        q = q.filter_by(status=status)
    if date_from:
        q = q.filter(Session.date >= date_from)
    if date_to:
        q = q.filter(Session.date <= date_to)
    if open_for_booking is not None:
        q = q.filter_by(open_for_booking=open_for_booking)
    return q.order_by(Session.date, Session.start_time).all()


def get_session(session_id: int):
    return db.session.get(Session, session_id)


def create_session(data: dict):
    s = session_schema.load(data)
    db.session.add(s)
    db.session.commit()
    return s


def update_session(s, data: dict):
    for k, v in data.items():
        setattr(s, k, v)
    db.session.commit()
    return s


def delete_session(s):
    db.session.delete(s)
    db.session.commit()


def get_coach_schedule(coach_id: str, week: str):
    day = datetime.strptime(week, "%Y-%m-%d").date()
    start = day - timedelta(days=day.weekday())
    end = start + timedelta(days=6)
    items = Session.query.filter(
        Session.coach_id == coach_id,
        Session.date >= start,
        Session.date <= end,
    ).order_by(Session.date, Session.start_time).all()
    return items


# ── Classes ───────────────────────────────────────────────────────────────────

def list_classes(coach_id=None, band_id=None, age_group=None, is_active=None):
    q = Class.query
    if coach_id:
        q = q.filter_by(coach_id=coach_id)
    if band_id:
        q = q.filter_by(band_id=band_id)
    if age_group:
        q = q.filter_by(age_group=age_group)
    if is_active is not None:
        q = q.filter_by(is_active=is_active)
    return q.all()


def get_class(class_id: int):
    return db.session.get(Class, class_id)


def create_class(data: dict):
    c = class_schema.load(data)
    db.session.add(c)
    db.session.commit()
    return c


def update_class(c, data: dict):
    for k, v in data.items():
        setattr(c, k, v)
    db.session.commit()
    return c


def delete_class(c):
    db.session.delete(c)
    db.session.commit()


# ── Class Enrollments ─────────────────────────────────────────────────────────

def list_enrollments(class_id=None, junior_id=None, status=None):
    q = ClassEnrollment.query
    if class_id:
        q = q.filter_by(class_id=class_id)
    if junior_id:
        q = q.filter_by(junior_id=junior_id)
    if status:
        q = q.filter_by(status=status)
    return q.all()


def get_enrollment(enrollment_id: int):
    return db.session.get(ClassEnrollment, enrollment_id)


def create_enrollment(data: dict):
    e = enrollment_schema.load(data)
    db.session.add(e)
    db.session.commit()
    return e


def update_enrollment(e, data: dict):
    for k, v in data.items():
        setattr(e, k, v)
    db.session.commit()
    return e


def delete_enrollment(e):
    db.session.delete(e)
    db.session.commit()


# ── Booking Requests ──────────────────────────────────────────────────────────

def list_booking_requests(parent_id=None, status=None, coach_id=None,
                          session_id=None, junior_id=None):
    q = BookingRequest.query
    if parent_id:
        q = q.filter_by(parent_id=parent_id)
    if status:
        q = q.filter_by(status=status)
    if coach_id:
        q = q.filter_by(coach_id=coach_id)
    if session_id:
        q = q.filter_by(session_id=session_id)
    if junior_id:
        q = q.filter_by(junior_id=junior_id)
    return q.all()


def get_booking_request(booking_id: int):
    return db.session.get(BookingRequest, booking_id)


def create_booking_request(data: dict):
    b = booking_schema.load(data)
    db.session.add(b)
    db.session.commit()
    return b


def update_booking_request(b, data: dict):
    for k, v in data.items():
        setattr(b, k, v)
    db.session.commit()
    return b


def delete_booking_request(b):
    db.session.delete(b)
    db.session.commit()


# ── Group-session booking (build-phase-2 decision 4) ─────────────────────────
# A coach publishes a session open_for_booking with capacity + eligibility;
# students/parents book onto it; a coach/admin approves (one sign-off).
# Capacity counts APPROVED bookings only — pending requests don't hold a spot.

def approved_count(session_id: int) -> int:
    return BookingRequest.query.filter_by(
        session_id=session_id, status="approved"
    ).count()


def validate_session_booking(session, junior):
    """Eligibility + availability checks for booking a junior onto a published
    session. Returns an error string or None. The session's level/age bounds
    are authoritative here (the UI only displays them)."""
    from datetime import date as date_cls

    if session is None:
        return "Session not found"
    if not session.open_for_booking:
        return "This session is not open for booking"
    if getattr(session.status, "value", session.status) != "scheduled":
        return "This session is no longer scheduled"
    if session.date < date_cls.today():
        return "This session has already taken place"
    if session.max_attendance is not None and approved_count(session.id) >= session.max_attendance:
        return "This session is full"

    if session.level_min is not None and junior.current_level < session.level_min:
        return f"Open from level {session.level_min}"
    if session.level_max is not None and junior.current_level > session.level_max:
        return f"Open up to level {session.level_max}"
    if (session.age_min is not None or session.age_max is not None) and junior.date_of_birth:
        today = date_cls.today()
        dob = junior.date_of_birth
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        if session.age_min is not None and age < session.age_min:
            return f"Minimum age is {session.age_min}"
        if session.age_max is not None and age > session.age_max:
            return f"Maximum age is {session.age_max}"

    duplicate = BookingRequest.query.filter(
        BookingRequest.session_id == session.id,
        BookingRequest.junior_id == junior.id,
        BookingRequest.status.in_(["pending", "approved"]),
    ).first()
    if duplicate is not None:
        return "DUPLICATE"  # routes map this to a 409
    return None


def approve_booking(b, approver_notes=None):
    """Approve a booking (one sign-off). Enforces session capacity at approval
    time. Returns (booking, error_string)."""
    if getattr(b.status, "value", b.status) == "approved":
        return b, None  # idempotent
    if b.session_id:
        s = get_session(b.session_id)
        if s is not None and s.max_attendance is not None:
            if approved_count(s.id) >= s.max_attendance:
                return None, "This session is already full"
    b.status = "approved"
    if approver_notes:
        b.admin_notes = approver_notes
    db.session.commit()
    return b, None


def decline_booking(b, approver_notes=None):
    b.status = "declined"
    if approver_notes:
        b.admin_notes = approver_notes
    db.session.commit()
    return b
