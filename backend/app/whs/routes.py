from flask import Blueprint, jsonify, request

from app.whs.controllers import (
    calculate_course_handicap,
    calculate_handicap_index,
    calculate_score_differential,
)
from app.whs.models import (
    COURSE_HANDICAP_REQUIRED,
    HANDICAP_INDEX_REQUIRED,
    SCORE_DIFFERENTIAL_REQUIRED,
    validate_fields,
)
from app.utils.decorators import require_auth

whs_v1 = Blueprint("whs_v1", __name__, url_prefix="/api/whs")


def _ok(payload: dict):
    return jsonify({"data": payload}), 200


def _err(message: str, missing: list = None):
    body = {"error": {"code": "VALIDATION_ERROR", "message": message}}
    if missing:
        body["error"]["fields"] = {f: "required" for f in missing}
    return jsonify(body), 400


@whs_v1.route("/score-differential", methods=["POST"])
@require_auth
def score_differential():
    """
    Compute a WHS 2024 Score Differential for a round (9–18 holes).
    Used by the frontend and by the backend rounds module.
    """
    data = request.get_json() or {}
    missing = validate_fields(data, SCORE_DIFFERENTIAL_REQUIRED)
    if missing:
        return _err("Missing required fields", missing)

    try:
        result = calculate_score_differential(
            actual_gross_score=int(data["actual_gross_score"]),
            holes_played=int(data["holes_played"]),
            handicap_index=float(data["handicap_index"]),
            course_rating=float(data["course_rating"]),
            slope_rating=int(data["slope_rating"]),
            pcc=float(data.get("pcc", 0)),
        )
    except (ValueError, ZeroDivisionError) as exc:
        return _err(str(exc))

    return _ok({"differential": result})


@whs_v1.route("/handicap-index", methods=["POST"])
@require_auth
def handicap_index():
    """
    Compute a WHS 2024 Handicap Index from up to 20 recent differentials.
    """
    data = request.get_json() or {}
    missing = validate_fields(data, HANDICAP_INDEX_REQUIRED)
    if missing:
        return _err("Missing required fields", missing)

    differentials = data["differentials"]
    if not isinstance(differentials, list):
        return _err("differentials must be an array")

    try:
        result = calculate_handicap_index([float(d) for d in differentials])
    except (TypeError, ValueError) as exc:
        return _err(str(exc))

    return _ok({"handicap_index": result})


@whs_v1.route("/course-handicap", methods=["POST"])
@require_auth
def course_handicap():
    """
    Compute a WHS 2024 Course Handicap.
    CH = (Index × (Slope / 113)) + (CR − Par)
    """
    data = request.get_json() or {}
    missing = validate_fields(data, COURSE_HANDICAP_REQUIRED)
    if missing:
        return _err("Missing required fields", missing)

    try:
        result = calculate_course_handicap(
            handicap_index=float(data["handicap_index"]),
            slope_rating=int(data["slope_rating"]),
            course_rating=float(data["course_rating"]),
            par=int(data["par"]),
        )
    except (ValueError, TypeError) as exc:
        return _err(str(exc))

    return _ok({"course_handicap": result})
