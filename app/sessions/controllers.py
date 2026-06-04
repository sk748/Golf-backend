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
                  status=None, date_from=None, date_to=None):
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

def list_booking_requests(parent_id=None, status=None, coach_id=None):
    q = BookingRequest.query
    if parent_id:
        q = q.filter_by(parent_id=parent_id)
    if status:
        q = q.filter_by(status=status)
    if coach_id:
        q = q.filter_by(coach_id=coach_id)
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
