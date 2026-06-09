from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.evaluations.controllers import (
    evaluation_schema, evaluations_schema,
    list_evaluations, get_evaluation, create_evaluation, update_evaluation, delete_evaluation,
    coach_sign, committee_sign, get_evaluation_summary,
)
from app.utils.decorators import require_roles, require_auth, admin_only, get_current_user
from app.audit.service import record, junior_label

evaluations_bp = Blueprint("evaluations_bp", __name__, url_prefix="/api")


def _eval_month(ev):
    return ev.report_month.strftime("%B %Y") if ev.report_month else "monthly"


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def _not_found(resource="Resource"):
    return _err("NOT_FOUND", f"{resource} not found", 404)


# ── Aggregate (registered before /<int:id> routes) ───────────────────────────

@evaluations_bp.route("/evaluations/summary", methods=["GET"])
@require_roles("admin", "coach", "committee")
def evaluation_summary():
    band_id = request.args.get("band_id", type=int)
    month = request.args.get("month")
    if not band_id or not month:
        return _err("VALIDATION_ERROR", "band_id and month are required", 400)
    data = get_evaluation_summary(band_id, month)
    return _data(data, count=len(data))


# ── CRUD ──────────────────────────────────────────────────────────────────────

@evaluations_bp.route("/evaluations", methods=["GET"])
@require_roles("admin", "coach", "committee")
def get_evaluations():
    items = list_evaluations(
        junior_id=request.args.get("junior_id"),
        coach_id=request.args.get("coach_id"),
        report_month=request.args.get("report_month"),
        committee_signed=request.args.get("committee_signed"),
        coach_signed=request.args.get("coach_signed"),
    )
    return _data(evaluations_schema.dump(items), count=len(items))


@evaluations_bp.route("/evaluations", methods=["POST"])
@require_roles("admin", "coach")
def post_evaluation():
    data = request.get_json() or {}
    try:
        ev = create_evaluation(data)
        return _data(evaluation_schema.dump(ev), 201)
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)
    except IntegrityError:
        return _err("CONFLICT", "Evaluation for this junior/month already exists", 409)


@evaluations_bp.route("/evaluations/<int:evaluation_id>", methods=["GET"])
@require_roles("admin", "coach", "committee")
def get_evaluation_route(evaluation_id):
    ev = get_evaluation(evaluation_id)
    if ev is None:
        return _not_found("Evaluation")
    return _data(evaluation_schema.dump(ev))


@evaluations_bp.route("/evaluations/<int:evaluation_id>", methods=["PUT"])
@require_roles("admin", "coach")
def put_evaluation(evaluation_id):
    ev = get_evaluation(evaluation_id)
    if ev is None:
        return _not_found("Evaluation")
    # coaches can only edit their own evaluations
    caller = get_current_user()
    if caller and caller.role.value == "coach" and str(ev.coach_id) != str(caller.id):
        return _err("FORBIDDEN", "Coaches can only edit their own evaluations", 403)
    data = request.get_json() or {}
    try:
        return _data(evaluation_schema.dump(update_evaluation(ev, data)))
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)


@evaluations_bp.route("/evaluations/<int:evaluation_id>", methods=["DELETE"])
@admin_only
def delete_evaluation_route(evaluation_id):
    ev = get_evaluation(evaluation_id)
    if ev is None:
        return _not_found("Evaluation")
    delete_evaluation(ev)
    return "", 204


# ── Sign-off ──────────────────────────────────────────────────────────────────

@evaluations_bp.route("/evaluations/<int:evaluation_id>/coach-sign", methods=["POST"])
@require_roles("admin", "coach")
def coach_sign_route(evaluation_id):
    caller = get_current_user()
    ev, err = coach_sign(evaluation_id, caller.id)
    if err:
        status = 404 if "not found" in err.lower() else 403
        return _err("FORBIDDEN" if status == 403 else "NOT_FOUND", err, status)
    record("evaluation.signed", actor=caller, target_type="evaluation",
           target_id=ev.id, target_label=junior_label(ev.junior_id),
           metadata={"month": _eval_month(ev)})
    return _data(evaluation_schema.dump(ev))


@evaluations_bp.route("/evaluations/<int:evaluation_id>/committee-sign", methods=["POST"])
@require_roles("admin", "committee")
def committee_sign_route(evaluation_id):
    caller = get_current_user()
    ev, err = committee_sign(evaluation_id, caller.id)
    if err:
        status = 404 if "not found" in err.lower() else 403
        return _err("FORBIDDEN" if status == 403 else "NOT_FOUND", err, status)
    record("evaluation.counter_signed", actor=caller, target_type="evaluation",
           target_id=ev.id, target_label=junior_label(ev.junior_id),
           metadata={"month": _eval_month(ev)})
    return _data(evaluation_schema.dump(ev))
