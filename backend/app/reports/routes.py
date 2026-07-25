"""
Reports for analysis — downloadable exports.

  GET /api/reports/junior/<junior_id>   ?format=xlsx|pdf&date_from=&date_to=
  GET /api/reports/programme            ?format=xlsx|pdf&date_from=&date_to=

The junior report is scoped by junior_in_scope (admin/committee any junior,
coach own roster, parent own child, player self). The programme report is
admin + committee only and strictly aggregate. Both return
{filename, mime, content_base64} in the {data} envelope, matching
/api/coach-analytics/export.
"""

from datetime import date

from flask import Blueprint, jsonify, request

from app.juniors.controllers import get_junior
from app.reports.controllers import build_junior_report, build_programme_report
from app.reports.export_xlsx import build_junior_workbook, build_programme_workbook
from app.utils.decorators import (
    get_current_user, junior_in_scope, require_auth, require_roles,
)

reports_bp = Blueprint("reports_bp", __name__, url_prefix="/api/reports")


def _data(data, status=200):
    return jsonify({"data": data}), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def _window_args():
    frm = request.args.get("date_from")
    to = request.args.get("date_to")
    return (
        date.fromisoformat(frm) if frm else None,
        date.fromisoformat(to) if to else None,
    )


@reports_bp.route("/junior/<int:junior_id>", methods=["GET"])
@require_auth
def junior_report(junior_id):
    junior = get_junior(junior_id)
    if junior is None:
        return _err("NOT_FOUND", "Junior not found", 404)
    caller = get_current_user()
    if not junior_in_scope(caller, junior):
        return _err("FORBIDDEN", "You do not have permission to export this junior's report", 403)
    fmt = request.args.get("format", "xlsx")
    if fmt not in ("xlsx", "pdf"):
        return _err("VALIDATION_ERROR", "format must be xlsx or pdf", 400)
    try:
        frm, to = _window_args()
    except ValueError:
        return _err("VALIDATION_ERROR", "date_from / date_to must be ISO dates (YYYY-MM-DD)", 400)
    report = build_junior_report(junior, date_from=frm, date_to=to)
    if fmt == "pdf":
        # reportlab is only needed for the pdf branch; imported lazily so the
        # xlsx path (and app boot) never depends on it.
        from app.reports.export_pdf import build_junior_pdf
        return _data(build_junior_pdf(report))
    return _data(build_junior_workbook(report))


@reports_bp.route("/programme", methods=["GET"])
@require_roles("admin", "committee")
def programme_report():
    fmt = request.args.get("format", "xlsx")
    if fmt not in ("xlsx", "pdf"):
        return _err("VALIDATION_ERROR", "format must be xlsx or pdf", 400)
    try:
        frm, to = _window_args()
    except ValueError:
        return _err("VALIDATION_ERROR", "date_from / date_to must be ISO dates (YYYY-MM-DD)", 400)
    report = build_programme_report(date_from=frm, date_to=to)
    if fmt == "pdf":
        from app.reports.export_pdf import build_programme_pdf
        return _data(build_programme_pdf(report))
    return _data(build_programme_workbook(report))
