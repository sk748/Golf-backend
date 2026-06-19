"""
Coach Analytics routes — admin + committee oversight only.

  GET /api/coach-analytics              overview (one row per coach)
  GET /api/coach-analytics/<coach_id>   detail for one coach

Both accept ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD (default: last 90 days).
Read-only; no writes, no new tables.
"""

from flask import Blueprint, jsonify, request

from app.coach_analytics.controllers import (
    list_coach_analytics, get_coach_analytics,
)
from app.coach_analytics.export import (
    build_coach_workbook, build_all_coaches_workbook,
)
from app.utils.decorators import require_roles

coach_analytics_bp = Blueprint(
    "coach_analytics_bp", __name__, url_prefix="/api/coach-analytics"
)


def _data(data, status=200):
    return jsonify({"data": data}), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


@coach_analytics_bp.route("", methods=["GET"])
@require_roles("admin", "committee")
def coach_analytics_overview():
    try:
        payload = list_coach_analytics(
            date_from=request.args.get("date_from"),
            date_to=request.args.get("date_to"),
        )
    except ValueError:
        return _err("VALIDATION_ERROR", "date_from / date_to must be ISO dates (YYYY-MM-DD)", 400)
    return _data(payload)


@coach_analytics_bp.route("/export", methods=["GET"])
@require_roles("admin", "committee")
def coach_analytics_export_all():
    """All-coaches summary workbook (base64 .xlsx in the {data} envelope)."""
    try:
        payload = build_all_coaches_workbook(
            date_from=request.args.get("date_from"),
            date_to=request.args.get("date_to"),
        )
    except ValueError:
        return _err("VALIDATION_ERROR", "date_from / date_to must be ISO dates (YYYY-MM-DD)", 400)
    return _data(payload)


@coach_analytics_bp.route("/<coach_id>", methods=["GET"])
@require_roles("admin", "committee")
def coach_analytics_detail(coach_id):
    try:
        payload, err = get_coach_analytics(
            coach_id,
            date_from=request.args.get("date_from"),
            date_to=request.args.get("date_to"),
        )
    except ValueError:
        return _err("VALIDATION_ERROR", "date_from / date_to must be ISO dates (YYYY-MM-DD)", 400)
    if err:
        return _err("NOT_FOUND", err, 404)
    return _data(payload)


@coach_analytics_bp.route("/<coach_id>/export", methods=["GET"])
@require_roles("admin", "committee")
def coach_analytics_export_one(coach_id):
    """Per-coach billing workbook (base64 .xlsx in the {data} envelope)."""
    try:
        payload, err = build_coach_workbook(
            coach_id,
            date_from=request.args.get("date_from"),
            date_to=request.args.get("date_to"),
        )
    except ValueError:
        return _err("VALIDATION_ERROR", "date_from / date_to must be ISO dates (YYYY-MM-DD)", 400)
    if err:
        return _err("NOT_FOUND", err, 404)
    return _data(payload)
