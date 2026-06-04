from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.attendance.controllers import (
    attendance_schema, attendances_schema,
    list_attendance, get_attendance, create_attendance, update_attendance, delete_attendance,
    bulk_mark_attendance, get_session_summary,
)
from app.utils.decorators import require_roles, admin_only

attendance_bp = Blueprint("attendance_bp", __name__, url_prefix="/api")


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def _not_found(resource="Resource"):
    return _err("NOT_FOUND", f"{resource} not found", 404)


# ── Attendance CRUD ───────────────────────────────────────────────────────────

@attendance_bp.route("/attendance", methods=["GET"])
@require_roles("admin", "coach", "committee")
def get_attendance_list():
    items = list_attendance(
        session_id=request.args.get("session_id"),
        junior_id=request.args.get("junior_id"),
    )
    return _data(attendances_schema.dump(items), count=len(items))


@attendance_bp.route("/attendance", methods=["POST"])
@require_roles("admin", "coach")
def post_attendance():
    data = request.get_json() or {}
    try:
        a = create_attendance(data)
        return _data(attendance_schema.dump(a), 201)
    except IntegrityError:
        return _err("CONFLICT", "Attendance record already exists for this session/junior", 409)


@attendance_bp.route("/attendance/<int:attendance_id>", methods=["GET"])
@require_roles("admin", "coach", "committee")
def get_attendance_route(attendance_id):
    a = get_attendance(attendance_id)
    if a is None:
        return _not_found("Attendance record")
    return _data(attendance_schema.dump(a))


@attendance_bp.route("/attendance/<int:attendance_id>", methods=["PUT"])
@require_roles("admin", "coach")
def put_attendance(attendance_id):
    a = get_attendance(attendance_id)
    if a is None:
        return _not_found("Attendance record")
    return _data(attendance_schema.dump(update_attendance(a, request.get_json() or {})))


@attendance_bp.route("/attendance/<int:attendance_id>", methods=["DELETE"])
@require_roles("admin", "coach")
def delete_attendance_route(attendance_id):
    a = get_attendance(attendance_id)
    if a is None:
        return _not_found("Attendance record")
    delete_attendance(a)
    return "", 204


# ── Bulk mark ──────────────────────────────────────────────────────────────────

@attendance_bp.route("/attendance/bulk", methods=["POST"])
@require_roles("admin", "coach")
def bulk_attendance():
    data = request.get_json() or {}
    session_id = data.get("session_id")
    records = data.get("records", [])
    if not session_id:
        return _err("VALIDATION_ERROR", "session_id is required", 400)
    results = bulk_mark_attendance(session_id, records)
    return _data(attendances_schema.dump(results), count=len(results))


# ── Session summary ───────────────────────────────────────────────────────────

@attendance_bp.route("/attendance/session/<int:session_id>/summary", methods=["GET"])
@require_roles("admin", "coach", "committee")
def session_summary(session_id):
    return _data(get_session_summary(session_id))
