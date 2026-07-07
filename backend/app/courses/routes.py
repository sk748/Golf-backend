from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.courses.controllers import (
    course_schema, courses_schema, tee_set_schema, tee_sets_schema,
    hole_schema, holes_schema,
    list_courses, get_course, create_course, update_course, delete_course,
    get_courses_with_tees,
    list_tee_sets, get_tee_set, create_tee_set, update_tee_set, delete_tee_set,
    list_holes, get_hole, create_hole, update_hole, delete_hole,
    seed_reference_data,
)
from app.utils.decorators import require_auth, admin_only

courses_bp = Blueprint("courses_bp", __name__, url_prefix="/api")


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def _not_found(resource="Resource"):
    return _err("NOT_FOUND", f"{resource} not found", 404)


# ── Seed ─────────────────────────────────────────────────────────────────────

@courses_bp.route("/seed", methods=["POST"])
@admin_only
def seed():
    return _data(seed_reference_data(), 201)


# ── Courses ──────────────────────────────────────────────────────────────────

@courses_bp.route("/courses", methods=["GET"])
@require_auth
def get_courses():
    items = list_courses()
    return _data(courses_schema.dump(items), count=len(items))


@courses_bp.route("/courses", methods=["POST"])
@admin_only
def post_course():
    data = request.get_json() or {}
    try:
        course = create_course(data)
        return _data(course_schema.dump(course), 201)
    except IntegrityError:
        return _err("CONFLICT", "Course conflicts with existing data", 409)


@courses_bp.route("/courses/<int:course_id>", methods=["GET"])
@require_auth
def get_course_route(course_id):
    course = get_course(course_id)
    if course is None:
        return _not_found("Course")
    return _data(course_schema.dump(course))


@courses_bp.route("/courses/<int:course_id>", methods=["PUT"])
@admin_only
def put_course(course_id):
    course = get_course(course_id)
    if course is None:
        return _not_found("Course")
    return _data(course_schema.dump(update_course(course, request.get_json() or {})))


@courses_bp.route("/courses/<int:course_id>", methods=["DELETE"])
@admin_only
def delete_course_route(course_id):
    course = get_course(course_id)
    if course is None:
        return _not_found("Course")
    delete_course(course)
    return "", 204


@courses_bp.route("/courses-with-tees", methods=["GET"])
@require_auth
def courses_with_tees():
    result = get_courses_with_tees()
    return _data(result, count=len(result))


# ── Tee Sets ─────────────────────────────────────────────────────────────────

@courses_bp.route("/tee-sets", methods=["GET"])
@require_auth
def get_tee_sets():
    items = list_tee_sets(course_id=request.args.get("course_id"))
    return _data(tee_sets_schema.dump(items), count=len(items))


@courses_bp.route("/tee-sets", methods=["POST"])
@admin_only
def post_tee_set():
    data = request.get_json() or {}
    try:
        tee = create_tee_set(data)
        return _data(tee_set_schema.dump(tee), 201)
    except IntegrityError:
        return _err("CONFLICT", "Tee set conflicts with existing data", 409)


@courses_bp.route("/tee-sets/<int:tee_set_id>", methods=["GET"])
@require_auth
def get_tee_set_route(tee_set_id):
    tee = get_tee_set(tee_set_id)
    if tee is None:
        return _not_found("Tee set")
    return _data(tee_set_schema.dump(tee))


@courses_bp.route("/tee-sets/<int:tee_set_id>", methods=["PUT"])
@admin_only
def put_tee_set(tee_set_id):
    tee = get_tee_set(tee_set_id)
    if tee is None:
        return _not_found("Tee set")
    return _data(tee_set_schema.dump(update_tee_set(tee, request.get_json() or {})))


@courses_bp.route("/tee-sets/<int:tee_set_id>", methods=["DELETE"])
@admin_only
def delete_tee_set_route(tee_set_id):
    tee = get_tee_set(tee_set_id)
    if tee is None:
        return _not_found("Tee set")
    delete_tee_set(tee)
    return "", 204


# ── Holes ─────────────────────────────────────────────────────────────────────

@courses_bp.route("/holes", methods=["GET"])
@require_auth
def get_holes():
    items = list_holes(course_id=request.args.get("course_id"))
    return _data(holes_schema.dump(items), count=len(items))


@courses_bp.route("/holes", methods=["POST"])
@admin_only
def post_hole():
    data = request.get_json() or {}
    try:
        hole = create_hole(data)
        return _data(hole_schema.dump(hole), 201)
    except IntegrityError:
        return _err("CONFLICT", "Hole conflicts with existing data", 409)


@courses_bp.route("/holes/<int:hole_id>", methods=["GET"])
@require_auth
def get_hole_route(hole_id):
    hole = get_hole(hole_id)
    if hole is None:
        return _not_found("Hole")
    return _data(hole_schema.dump(hole))


@courses_bp.route("/holes/<int:hole_id>", methods=["PUT"])
@admin_only
def put_hole(hole_id):
    hole = get_hole(hole_id)
    if hole is None:
        return _not_found("Hole")
    return _data(hole_schema.dump(update_hole(hole, request.get_json() or {})))


@courses_bp.route("/holes/<int:hole_id>", methods=["DELETE"])
@admin_only
def delete_hole_route(hole_id):
    hole = get_hole(hole_id)
    if hole is None:
        return _not_found("Hole")
    delete_hole(hole)
    return "", 204
