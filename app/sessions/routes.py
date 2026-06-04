from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.sessions.controllers import (
    session_schema, sessions_schema,
    class_schema, classes_schema,
    enrollment_schema, enrollments_schema,
    booking_schema, bookings_schema,
    list_sessions, get_session, create_session, update_session, delete_session,
    get_coach_schedule,
    list_classes, get_class, create_class, update_class, delete_class,
    list_enrollments, get_enrollment, create_enrollment, update_enrollment, delete_enrollment,
    list_booking_requests, get_booking_request, create_booking_request,
    update_booking_request, delete_booking_request,
)
from app.utils.decorators import require_roles, require_auth, admin_only, get_current_user, has_role

sessions_bp = Blueprint("sessions_bp", __name__, url_prefix="/api")


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def _not_found(resource="Resource"):
    return _err("NOT_FOUND", f"{resource} not found", 404)


# ── Sessions ──────────────────────────────────────────────────────────────────

@sessions_bp.route("/sessions", methods=["GET"])
@require_roles("admin", "coach", "committee")
def get_sessions():
    items = list_sessions(
        coach_id=request.args.get("coach_id"),
        class_id=request.args.get("class_id"),
        session_type=request.args.get("session_type"),
        status=request.args.get("status"),
        date_from=request.args.get("date_from"),
        date_to=request.args.get("date_to"),
    )
    return _data(sessions_schema.dump(items), count=len(items))


@sessions_bp.route("/sessions", methods=["POST"])
@require_roles("admin", "coach")
def post_session():
    try:
        s = create_session(request.get_json() or {})
        return _data(session_schema.dump(s), 201)
    except IntegrityError:
        return _err("CONFLICT", "Session conflicts with existing data", 409)


@sessions_bp.route("/sessions/<int:session_id>", methods=["GET"])
@require_roles("admin", "coach", "committee")
def get_session_route(session_id):
    s = get_session(session_id)
    if s is None:
        return _not_found("Session")
    return _data(session_schema.dump(s))


@sessions_bp.route("/sessions/<int:session_id>", methods=["PUT"])
@require_roles("admin", "coach")
def put_session(session_id):
    s = get_session(session_id)
    if s is None:
        return _not_found("Session")
    caller = get_current_user()
    if has_role(caller, "coach") and str(s.coach_id) != str(caller.id):
        return _err("FORBIDDEN", "Coaches can only edit their own sessions", 403)
    return _data(session_schema.dump(update_session(s, request.get_json() or {})))


@sessions_bp.route("/sessions/<int:session_id>", methods=["DELETE"])
@admin_only
def delete_session_route(session_id):
    s = get_session(session_id)
    if s is None:
        return _not_found("Session")
    delete_session(s)
    return "", 204


@sessions_bp.route("/coaches/<coach_id>/schedule", methods=["GET"])
@require_roles("admin", "coach", "committee")
def coach_schedule(coach_id):
    # Coaches can only view their own schedule unless admin/committee
    caller = get_current_user()
    if has_role(caller, "coach") and str(caller.id) != str(coach_id):
        return _err("FORBIDDEN", "Coaches can only view their own schedule", 403)
    week = request.args.get("week")
    if not week:
        return _err("VALIDATION_ERROR", "week is required (YYYY-MM-DD)", 400)
    try:
        items = get_coach_schedule(coach_id, week)
        return _data(sessions_schema.dump(items), count=len(items))
    except ValueError:
        return _err("VALIDATION_ERROR", "week must be in YYYY-MM-DD format", 400)


# ── Classes ───────────────────────────────────────────────────────────────────

@sessions_bp.route("/classes", methods=["GET"])
@require_auth
def get_classes():
    is_active = request.args.get("is_active")
    if is_active is not None:
        is_active = is_active.lower() in ("true", "1")
    items = list_classes(
        coach_id=request.args.get("coach_id"),
        band_id=request.args.get("band_id"),
        age_group=request.args.get("age_group"),
        is_active=is_active,
    )
    return _data(classes_schema.dump(items), count=len(items))


@sessions_bp.route("/classes", methods=["POST"])
@require_roles("admin", "coach")
def post_class():
    try:
        c = create_class(request.get_json() or {})
        return _data(class_schema.dump(c), 201)
    except IntegrityError:
        return _err("CONFLICT", "Class conflicts with existing data", 409)


@sessions_bp.route("/classes/<int:class_id>", methods=["GET"])
@require_auth
def get_class_route(class_id):
    c = get_class(class_id)
    if c is None:
        return _not_found("Class")
    return _data(class_schema.dump(c))


@sessions_bp.route("/classes/<int:class_id>", methods=["PUT"])
@require_roles("admin", "coach")
def put_class(class_id):
    c = get_class(class_id)
    if c is None:
        return _not_found("Class")
    caller = get_current_user()
    if has_role(caller, "coach") and str(c.coach_id) != str(caller.id):
        return _err("FORBIDDEN", "Coaches can only edit their own classes", 403)
    return _data(class_schema.dump(update_class(c, request.get_json() or {})))


@sessions_bp.route("/classes/<int:class_id>", methods=["DELETE"])
@admin_only
def delete_class_route(class_id):
    c = get_class(class_id)
    if c is None:
        return _not_found("Class")
    delete_class(c)
    return "", 204


# ── Class Enrollments ─────────────────────────────────────────────────────────

@sessions_bp.route("/enrollments", methods=["GET"])
@require_roles("admin", "coach", "committee")
def get_enrollments():
    items = list_enrollments(
        class_id=request.args.get("class_id"),
        junior_id=request.args.get("junior_id"),
        status=request.args.get("status"),
    )
    return _data(enrollments_schema.dump(items), count=len(items))


@sessions_bp.route("/enrollments", methods=["POST"])
@require_roles("admin", "coach")
def post_enrollment():
    try:
        e = create_enrollment(request.get_json() or {})
        return _data(enrollment_schema.dump(e), 201)
    except IntegrityError:
        return _err("CONFLICT", "Enrollment already exists for this class/junior", 409)


@sessions_bp.route("/enrollments/<int:enrollment_id>", methods=["GET"])
@require_roles("admin", "coach", "committee")
def get_enrollment_route(enrollment_id):
    e = get_enrollment(enrollment_id)
    if e is None:
        return _not_found("Enrollment")
    return _data(enrollment_schema.dump(e))


@sessions_bp.route("/enrollments/<int:enrollment_id>", methods=["PUT"])
@require_roles("admin", "coach")
def put_enrollment(enrollment_id):
    e = get_enrollment(enrollment_id)
    if e is None:
        return _not_found("Enrollment")
    return _data(enrollment_schema.dump(update_enrollment(e, request.get_json() or {})))


@sessions_bp.route("/enrollments/<int:enrollment_id>", methods=["DELETE"])
@require_roles("admin", "coach")
def delete_enrollment_route(enrollment_id):
    e = get_enrollment(enrollment_id)
    if e is None:
        return _not_found("Enrollment")
    delete_enrollment(e)
    return "", 204


# ── Booking Requests ──────────────────────────────────────────────────────────

@sessions_bp.route("/booking-requests", methods=["GET"])
@require_roles("admin", "coach", "parent")
def get_booking_requests():
    caller = get_current_user()
    parent_id = request.args.get("parent_id")
    # parents only see their own requests
    if has_role(caller, "parent"):
        parent_id = caller.id
    items = list_booking_requests(
        parent_id=parent_id,
        status=request.args.get("status"),
        coach_id=request.args.get("coach_id"),
    )
    return _data(bookings_schema.dump(items), count=len(items))


@sessions_bp.route("/booking-requests", methods=["POST"])
@require_roles("admin", "parent")
def post_booking_request():
    b = create_booking_request(request.get_json() or {})
    return _data(booking_schema.dump(b), 201)


@sessions_bp.route("/booking-requests/<int:booking_id>", methods=["GET"])
@require_roles("admin", "coach", "parent")
def get_booking_request_route(booking_id):
    b = get_booking_request(booking_id)
    if b is None:
        return _not_found("Booking request")
    caller = get_current_user()
    if has_role(caller, "parent") and str(b.parent_id) != str(caller.id):
        return _err("FORBIDDEN", "Parents can only view their own requests", 403)
    return _data(booking_schema.dump(b))


@sessions_bp.route("/booking-requests/<int:booking_id>", methods=["PUT"])
@require_roles("admin", "coach")
def put_booking_request(booking_id):
    b = get_booking_request(booking_id)
    if b is None:
        return _not_found("Booking request")
    return _data(booking_schema.dump(update_booking_request(b, request.get_json() or {})))


@sessions_bp.route("/booking-requests/<int:booking_id>", methods=["DELETE"])
@require_roles("admin", "parent")
def delete_booking_request_route(booking_id):
    b = get_booking_request(booking_id)
    if b is None:
        return _not_found("Booking request")
    caller = get_current_user()
    if has_role(caller, "parent") and str(b.parent_id) != str(caller.id):
        return _err("FORBIDDEN", "Parents can only delete their own requests", 403)
    delete_booking_request(b)
    return "", 204
