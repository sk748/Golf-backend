from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.sessions.controllers import (
    session_schema, sessions_schema,
    class_schema, classes_schema,
    enrollment_schema, enrollments_schema,
    booking_schema, bookings_schema,
    list_sessions, get_session, create_session, update_session, delete_session,
    get_coach_schedule, list_my_sessions,
    list_classes, get_class, create_class, update_class, delete_class,
    list_enrollments, get_enrollment, create_enrollment, update_enrollment, delete_enrollment,
    list_booking_requests, get_booking_request, create_booking_request,
    update_booking_request, delete_booking_request,
    validate_session_booking, approve_booking, decline_booking, approved_count,
)
from app.juniors.controllers import get_junior
from app.utils.decorators import require_roles, require_auth, admin_only, get_current_user, has_role, coach_owns_junior

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

def _dump_session_with_booking(s):
    """Session row + live booking occupancy (approved count vs capacity)."""
    out = session_schema.dump(s)
    out["approved_count"] = approved_count(s.id)
    return out


@sessions_bp.route("/sessions", methods=["GET"])
@require_auth
def get_sessions():
    caller = get_current_user()
    open_arg = request.args.get("open_for_booking")
    open_filter = None
    if open_arg is not None:
        open_filter = str(open_arg).lower() in ("true", "1", "yes")
    # Parents/players may browse ONLY published bookable sessions; the full
    # schedule stays staff-visible.
    if has_role(caller, "parent", "player"):
        open_filter = True
    items = list_sessions(
        coach_id=request.args.get("coach_id"),
        class_id=request.args.get("class_id"),
        session_type=request.args.get("session_type"),
        status=request.args.get("status"),
        date_from=request.args.get("date_from"),
        date_to=request.args.get("date_to"),
        open_for_booking=open_filter,
    )
    return _data([_dump_session_with_booking(s) for s in items], count=len(items))


@sessions_bp.route("/sessions/mine", methods=["GET"])
@require_auth
def get_my_sessions():
    """The caller's own sessions for a date range — used by the personal
    calendar so every role (not just coaches) sees the sessions they attend."""
    caller = get_current_user()
    items = list_my_sessions(
        caller,
        date_from=request.args.get("date_from"),
        date_to=request.args.get("date_to"),
    )
    return _data([_dump_session_with_booking(s) for s in items], count=len(items))


@sessions_bp.route("/sessions", methods=["POST"])
@require_roles("admin", "coach")
def post_session():
    caller = get_current_user()
    data = request.get_json() or {}
    if has_role(caller, "coach"):
        data["coach_id"] = caller.id
    try:
        s = create_session(data)
        return _data(session_schema.dump(s), 201)
    except IntegrityError:
        return _err("CONFLICT", "Session conflicts with existing data", 409)


@sessions_bp.route("/sessions/<int:session_id>", methods=["GET"])
@require_auth
def get_session_route(session_id):
    s = get_session(session_id)
    if s is None:
        return _not_found("Session")
    # Parents/players only see published bookable sessions.
    caller = get_current_user()
    if has_role(caller, "parent", "player") and not s.open_for_booking:
        return _not_found("Session")
    return _data(_dump_session_with_booking(s))


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
    caller = get_current_user()
    data = request.get_json() or {}
    if has_role(caller, "coach"):
        data["coach_id"] = caller.id
    try:
        c = create_class(data)
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
    caller = get_current_user()
    data = request.get_json() or {}
    if has_role(caller, "coach") and not coach_owns_junior(caller, get_junior(data.get("junior_id"))):
        return _err("FORBIDDEN", "Coaches can only enroll their own juniors", 403)
    try:
        e = create_enrollment(data)
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
    caller = get_current_user()
    if has_role(caller, "coach") and not coach_owns_junior(caller, get_junior(e.junior_id)):
        return _err("FORBIDDEN", "Coaches can only manage enrollments for their own juniors", 403)
    return _data(enrollment_schema.dump(update_enrollment(e, request.get_json() or {})))


@sessions_bp.route("/enrollments/<int:enrollment_id>", methods=["DELETE"])
@require_roles("admin", "coach")
def delete_enrollment_route(enrollment_id):
    e = get_enrollment(enrollment_id)
    if e is None:
        return _not_found("Enrollment")
    caller = get_current_user()
    if has_role(caller, "coach") and not coach_owns_junior(caller, get_junior(e.junior_id)):
        return _err("FORBIDDEN", "Coaches can only manage enrollments for their own juniors", 403)
    delete_enrollment(e)
    return "", 204


# ── Booking Requests ──────────────────────────────────────────────────────────

@sessions_bp.route("/booking-requests", methods=["GET"])
@require_roles("admin", "coach", "parent", "player")
def get_booking_requests():
    caller = get_current_user()
    parent_id = request.args.get("parent_id")
    # parents and players only see requests they made (the requester's user id
    # lives in parent_id regardless of role)
    if has_role(caller, "parent", "player"):
        parent_id = caller.id
    coach_id = request.args.get("coach_id")
    if has_role(caller, "coach"):
        coach_id = caller.id
    items = list_booking_requests(
        parent_id=parent_id,
        status=request.args.get("status"),
        coach_id=coach_id,
        session_id=request.args.get("session_id"),
        junior_id=request.args.get("junior_id"),
    )
    return _data(bookings_schema.dump(items), count=len(items))


@sessions_bp.route("/booking-requests", methods=["POST"])
@require_roles("admin", "parent", "player")
def post_booking_request():
    """Two booking shapes share this route:
    - freeform request (parent): junior_id + preferred_date/time [+ coach_id]
    - group-session booking (parent or player): session_id [+ junior_id for a
      parent] — date/time/coach derive from the session; eligibility, capacity
      and duplicates are enforced server-side."""
    caller = get_current_user()
    data = request.get_json() or {}

    # Resolve the junior + requester. The requester's user id is stored in
    # parent_id whichever role makes the request (it's the request owner).
    if has_role(caller, "player"):
        from app.juniors.models import JuniorProfile
        junior = JuniorProfile.query.filter_by(user_id=caller.id).first()
        if junior is None:
            return _err("NOT_FOUND", "No junior profile for this account", 404)
        data["parent_id"] = caller.id
        data["junior_id"] = junior.id
    elif has_role(caller, "parent"):
        data["parent_id"] = caller.id
        junior = get_junior(data.get("junior_id"))
        if junior is None or str(junior.parent_id) != str(caller.id):
            return _err("FORBIDDEN", "Parents can only request sessions for their own child", 403)
    else:  # admin on someone's behalf
        junior = get_junior(data.get("junior_id"))
        if junior is None:
            return _err("NOT_FOUND", "Junior not found", 404)
        data.setdefault("parent_id", caller.id)

    # Group-session booking: derive schedule fields from the session and
    # enforce its rules (players cannot book freeform — session_id required).
    session_id = data.get("session_id")
    if session_id:
        s = get_session(int(session_id))
        problem = validate_session_booking(s, junior)
        if problem == "DUPLICATE":
            return _err("CONFLICT", "Already booked onto this session", 409)
        if problem:
            return _err("INELIGIBLE", problem, 400)
        data["coach_id"] = s.coach_id
        data["preferred_date"] = s.date.isoformat()
        data["preferred_time"] = s.start_time.isoformat()
    elif has_role(caller, "player"):
        return _err("VALIDATION_ERROR", "Players book onto a published session (session_id required)", 400)

    # New requests start pending unless an admin says otherwise (status is
    # nullable=False with no DB default).
    data.setdefault("status", "pending")
    b = create_booking_request(data)
    return _data(booking_schema.dump(b), 201)


@sessions_bp.route("/booking-requests/<int:booking_id>/approve", methods=["PUT"])
@require_roles("admin", "coach")
def approve_booking_route(booking_id):
    """One sign-off (build-phase-2 decision 4): a coach approves bookings for
    their own sessions/requests; an admin approves any. Capacity enforced."""
    b = get_booking_request(booking_id)
    if b is None:
        return _not_found("Booking request")
    caller = get_current_user()
    if has_role(caller, "coach") and not has_role(caller, "admin"):
        target_coach = b.coach_id
        if b.session_id:
            s = get_session(b.session_id)
            target_coach = s.coach_id if s else target_coach
        # NULL coach_id = unassigned request; only admin may act on it.
        if target_coach is None or str(target_coach) != str(caller.id):
            return _err("FORBIDDEN", "Coaches can only approve bookings for their own sessions", 403)
    notes = (request.get_json(silent=True) or {}).get("admin_notes")
    b, err = approve_booking(b, approver_notes=notes)
    if err:
        return _err("CONFLICT", err, 409)
    return _data(booking_schema.dump(b))


@sessions_bp.route("/booking-requests/<int:booking_id>/decline", methods=["PUT"])
@require_roles("admin", "coach")
def decline_booking_route(booking_id):
    b = get_booking_request(booking_id)
    if b is None:
        return _not_found("Booking request")
    caller = get_current_user()
    if has_role(caller, "coach") and not has_role(caller, "admin"):
        target_coach = b.coach_id
        if b.session_id:
            s = get_session(b.session_id)
            target_coach = s.coach_id if s else target_coach
        # NULL coach_id = unassigned request; only admin may act on it.
        if target_coach is None or str(target_coach) != str(caller.id):
            return _err("FORBIDDEN", "Coaches can only decline bookings for their own sessions", 403)
    notes = (request.get_json(silent=True) or {}).get("admin_notes")
    return _data(booking_schema.dump(decline_booking(b, approver_notes=notes)))


@sessions_bp.route("/booking-requests/<int:booking_id>", methods=["GET"])
@require_roles("admin", "coach", "parent", "player")
def get_booking_request_route(booking_id):
    b = get_booking_request(booking_id)
    if b is None:
        return _not_found("Booking request")
    caller = get_current_user()
    if has_role(caller, "parent", "player") and str(b.parent_id) != str(caller.id):
        return _err("FORBIDDEN", "You can only view your own requests", 403)
    return _data(booking_schema.dump(b))


@sessions_bp.route("/booking-requests/<int:booking_id>", methods=["PUT"])
@require_roles("admin", "coach")
def put_booking_request(booking_id):
    b = get_booking_request(booking_id)
    if b is None:
        return _not_found("Booking request")
    caller = get_current_user()
    if has_role(caller, "coach"):
        target_coach = b.coach_id
        if b.session_id:
            s = get_session(b.session_id)
            target_coach = s.coach_id if s else target_coach
        # NULL coach_id = unassigned request; only admin may act on it.
        if target_coach is None or str(target_coach) != str(caller.id):
            return _err("FORBIDDEN", "Coaches can only edit bookings for their own sessions", 403)
    return _data(booking_schema.dump(update_booking_request(b, request.get_json() or {})))


@sessions_bp.route("/booking-requests/<int:booking_id>", methods=["DELETE"])
@require_roles("admin", "parent", "player")
def delete_booking_request_route(booking_id):
    b = get_booking_request(booking_id)
    if b is None:
        return _not_found("Booking request")
    caller = get_current_user()
    if has_role(caller, "parent", "player") and str(b.parent_id) != str(caller.id):
        return _err("FORBIDDEN", "You can only cancel your own requests", 403)
    delete_booking_request(b)
    return "", 204
