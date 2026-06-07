from flask import Blueprint, jsonify, request

from app.audit.controllers import list_audit_log, audit_schema
from app.utils.decorators import admin_only

audit_bp = Blueprint("audit_bp", __name__, url_prefix="/api/admin")


@audit_bp.route("/audit-log", methods=["GET"])
@admin_only
def get_audit_log():
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
        offset = max(int(request.args.get("offset", 0)), 0)
    except (ValueError, TypeError):
        limit, offset = 50, 0

    rows, total = list_audit_log(
        limit=limit,
        offset=offset,
        category=request.args.get("category"),
        action=request.args.get("action"),
        actor_id=request.args.get("actor_id"),
        date_from=request.args.get("from"),
        date_to=request.args.get("to"),
        q=request.args.get("q"),
    )
    return jsonify({"data": audit_schema.dump(rows), "count": total}), 200
