from datetime import date

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.database.database import db
from app.juniors.models import JuniorProfile
from app.juniors.controllers import (
    junior_schema, juniors_schema,
    level_band_schema, level_bands_schema,
    level_benchmark_schema, level_benchmarks_schema,
    badge_schema, badges_schema,
    junior_badge_schema, junior_badges_schema,
    list_juniors, get_junior, create_junior, update_junior, delete_junior,
    assign_coach, get_junior_progress, get_monthly_report,
    list_level_bands, get_level_band, create_level_band, update_level_band, delete_level_band,
    list_level_benchmarks, get_level_benchmark, create_level_benchmark,
    update_level_benchmark, delete_level_benchmark,
    list_badges, get_badge, create_badge, update_badge, delete_badge,
    list_junior_badges, award_badge, revoke_badge,
    set_featured_badge, set_featured_achievement,
    sync_achievements, list_achievement_unlocks,
    preview_import, commit_import,
)
from app.utils.decorators import (
    require_roles, require_auth, admin_only, get_current_user, require_ownership, has_role
)

juniors_bp = Blueprint("juniors_bp", __name__, url_prefix="/api")


def _data(data, status=200, count=None):
    payload = {"data": data}
    if count is not None:
        payload["count"] = count
    return jsonify(payload), status


def _err(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


def _not_found(resource="Resource"):
    return _err("NOT_FOUND", f"{resource} not found", 404)


def _with_child_name(dumped, junior):
    """Embed the child's name on a dumped junior profile.

    SimpleModelSchema only serializes table columns, so the linked player's
    name never reaches the client. Parents can't call /api/users to resolve it
    themselves, so without this their pages can only show "Your child". Coach/
    committee pages benefit too (one fewer join). Name isn't sensitive within
    the app, so this is added for every caller, not just parents.
    """
    user = junior.user
    if user is not None:
        dumped["full_name"] = f"{user.first_name} {user.last_name}".strip()
        dumped["first_name"] = user.first_name
        dumped["last_name"] = user.last_name
    return dumped


# ── Junior Profiles ────────────────────────────────────────────────────────────

@juniors_bp.route("/juniors", methods=["GET"])
@require_auth
def get_juniors():
    caller = get_current_user()
    # parents can only see their own children
    parent_id = request.args.get("parent_id")
    if has_role(caller, "parent"):
        parent_id = caller.id      # force scope to own children
    items = list_juniors(
        parent_id=parent_id,
        band_id=request.args.get("band_id"),
        current_level=request.args.get("current_level"),
        age_min=request.args.get("age_min", type=int),
        age_max=request.args.get("age_max", type=int),
        coach_id=request.args.get("coach_id"),
        approval_status=request.args.get("approval_status"),
        participant_type=request.args.get("participant_type"),
    )
    dumped = [_with_child_name(d, j) for d, j in zip(juniors_schema.dump(items), items)]
    return _data(dumped, count=len(items))


# ── Player self-service ("me") ─────────────────────────────────────────────────
# Let a signed-in player fetch their OWN junior profile + anonymized feedback
# without learning other juniors' ids. ("me" never matches <int:junior_id>.)

@juniors_bp.route("/juniors/me", methods=["GET"])
@require_auth
def get_my_junior():
    caller = get_current_user()
    junior = JuniorProfile.query.filter_by(user_id=caller.id).first()
    if junior is None:
        return _not_found("Junior profile")
    return _data(junior_schema.dump(junior))


@juniors_bp.route("/juniors/me/achievements", methods=["GET"])
@require_roles("player")
def get_my_achievement_unlocks():
    """The signed-in player's recorded catalog-achievement unlocks (with
    timestamps) — drives the 'most recent' glow on the achievements wall."""
    junior = JuniorProfile.query.filter_by(user_id=get_current_user().id).first()
    if junior is None:
        return _not_found("Junior profile")
    return _data({"unlocked": list_achievement_unlocks(junior)})


@juniors_bp.route("/juniors/me/achievements/sync", methods=["POST"])
@require_roles("player")
def sync_my_achievements():
    """The player's app reports the catalog achievements it has earned
    ({achievements: [{key, title}]}); we record any new ones and (after the
    first baseline sync) congratulate the player + notify their parent. Returns
    the keys newly unlocked this call plus the full unlocked list."""
    junior = JuniorProfile.query.filter_by(user_id=get_current_user().id).first()
    if junior is None:
        return _not_found("Junior profile")
    data = request.get_json(silent=True) or {}
    items = data.get("achievements")
    if items is not None and not isinstance(items, list):
        return _err("VALIDATION_ERROR", "achievements must be a list", 400)
    newly, unlocked = sync_achievements(junior, items or [])
    return _data({"newly_unlocked": newly, "unlocked": unlocked})


@juniors_bp.route("/juniors/me/feedback", methods=["GET"])
@require_auth
def get_my_feedback():
    """Latest coach-signed evaluation feedback, anonymized (no coach identity)."""
    from app.evaluations.controllers import latest_player_feedback

    caller = get_current_user()
    junior = JuniorProfile.query.filter_by(user_id=caller.id).first()
    if junior is None:
        return _not_found("Junior profile")
    return _data(latest_player_feedback(junior.id))


@juniors_bp.route("/juniors", methods=["POST"])
@require_roles("admin", "coach", "committee")
def post_junior():
    data = request.get_json() or {}
    try:
        junior = create_junior(data)
        return _data(junior_schema.dump(junior), 201)
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)
    except IntegrityError:
        return _err("CONFLICT", "Junior profile conflicts with existing data", 409)


@juniors_bp.route("/juniors/<int:junior_id>", methods=["GET"])
@require_auth
def get_junior_route(junior_id):
    junior = get_junior(junior_id)
    if junior is None:
        return _not_found("Junior")
    # parents can only view their own child; a player only their own profile
    caller = get_current_user()
    if has_role(caller, "parent") and str(junior.parent_id) != str(caller.id):
        return _err("FORBIDDEN", "Parents can only view their own children", 403)
    if has_role(caller, "player") and str(junior.user_id) != str(caller.id):
        return _err("FORBIDDEN", "You can only view your own profile", 403)
    return _data(_with_child_name(junior_schema.dump(junior), junior))


# Fields a PARENT may edit on their own child's profile (build-phase-2
# decision 5): family-owned coaching context only. Identity, level/band and
# programme fields stay staff-only.
PARENT_EDITABLE_FIELDS = {"availability", "medical_conditions", "golf_goals", "experience"}

# Relationship / approval-chain / identity columns that have dedicated, role-
# guarded endpoints (PUT /juniors/:id/coach, /approve, admin user mgmt). Never
# settable through the generic profile PUT by a non-admin — strips a coach
# self-assigning a junior or skipping the approval chain (security audit
# 2026-06-15).
STAFF_PROTECTED_FIELDS = {"coach_id", "parent_id", "approval_status", "user_id", "id"}


@juniors_bp.route("/juniors/<int:junior_id>", methods=["PUT"])
@require_roles("admin", "coach", "committee", "parent")
def put_junior(junior_id):
    junior = get_junior(junior_id)
    if junior is None:
        return _not_found("Junior")
    data = request.get_json() or {}
    caller = get_current_user()
    if has_role(caller, "parent"):
        if str(junior.parent_id) != str(caller.id):
            return _err("FORBIDDEN", "Parents can only edit their own child's profile", 403)
        rejected = set(data) - PARENT_EDITABLE_FIELDS
        if rejected:
            return _err(
                "FORBIDDEN",
                f"Parents may only edit: {', '.join(sorted(PARENT_EDITABLE_FIELDS))}",
                403,
            )
    elif not has_role(caller, "admin"):
        # coach / committee: drop protected relationship/approval/identity fields.
        data = {k: v for k, v in data.items() if k not in STAFF_PROTECTED_FIELDS}
    try:
        return _data(_with_child_name(junior_schema.dump(update_junior(junior, data)), junior))
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)


@juniors_bp.route("/juniors/<int:junior_id>/approve", methods=["PUT"])
@require_roles("admin", "committee", "parent")
def approve_junior_route(junior_id):
    """Signup approval chain (build-phase-2 decisions 5+7):
    pending_parent --parent (own child)--> pending_staff
    pending_staff  --admin/committee-----> active
    Wrong state or wrong role for the current step -> 409/403."""
    junior = get_junior(junior_id)
    if junior is None:
        return _not_found("Junior")
    caller = get_current_user()
    status = getattr(junior.approval_status, "value", junior.approval_status)

    if status == "pending_parent":
        # Only the linked parent consents at this step (admins use intake
        # flows; the chain exists precisely so the parent confirms first).
        if not has_role(caller, "parent") or str(junior.parent_id) != str(caller.id):
            return _err("FORBIDDEN", "This signup is waiting for the parent's approval", 403)
        junior.approval_status = "pending_staff"
    elif status == "pending_staff":
        if not has_role(caller, "admin", "committee"):
            return _err("FORBIDDEN", "This signup is waiting for club approval", 403)
        junior.approval_status = "active"
    else:
        return _err("CONFLICT", "This junior is already active", 409)

    from app.database.database import db
    db.session.commit()
    return _data(_with_child_name(junior_schema.dump(junior), junior))


@juniors_bp.route("/juniors/<int:junior_id>/promote", methods=["POST"])
@require_roles("admin", "coach")
def promote_junior_route(junior_id):
    """Advance the junior one level, traceable to a counter-signed evaluation
    that recommends move_next_level (build-phase-2 decision 6)."""
    from app.juniors.controllers import promote_junior
    from app.evaluations.controllers import get_evaluation

    junior = get_junior(junior_id)
    if junior is None:
        return _not_found("Junior")
    data = request.get_json() or {}
    if not data.get("evaluation_id"):
        return _err("VALIDATION_ERROR", "evaluation_id is required", 400)
    ev = get_evaluation(int(data["evaluation_id"]))
    junior, err = promote_junior(junior, ev)
    if err:
        return _err("VALIDATION_ERROR", err, 400)
    return _data(_with_child_name(junior_schema.dump(junior), junior))


@juniors_bp.route("/juniors/<int:junior_id>", methods=["DELETE"])
@admin_only
def delete_junior_route(junior_id):
    junior = get_junior(junior_id)
    if junior is None:
        return _not_found("Junior")
    delete_junior(junior)
    return "", 204


@juniors_bp.route("/juniors/<int:junior_id>/coach", methods=["PUT"])
@admin_only
def assign_junior_coach(junior_id):
    junior = get_junior(junior_id)
    if junior is None:
        return _not_found("Junior")
    data = request.get_json() or {}
    if "coach_id" not in data:
        return _err("VALIDATION_ERROR", "coach_id is required (use null to unassign)", 400)
    try:
        assign_coach(junior, data["coach_id"])
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)
    return _data(_with_child_name(junior_schema.dump(junior), junior))


@juniors_bp.route("/coaches/<coach_id>/juniors", methods=["GET"])
@require_roles("admin", "coach", "committee")
def coach_juniors(coach_id):
    # Coaches can only see their own assigned juniors; admin/committee see any.
    caller = get_current_user()
    if has_role(caller, "coach") and str(caller.id) != str(coach_id):
        return _err("FORBIDDEN", "Coaches can only view their own juniors", 403)
    items = list_juniors(coach_id=coach_id)
    dumped = [_with_child_name(d, j) for d, j in zip(juniors_schema.dump(items), items)]
    return _data(dumped, count=len(items))


@juniors_bp.route("/juniors/<int:junior_id>/progress", methods=["GET"])
@require_auth
def junior_progress(junior_id):
    junior = get_junior(junior_id)
    if junior is None:
        return _not_found("Junior")
    caller = get_current_user()
    if has_role(caller, "parent") and str(junior.parent_id) != str(caller.id):
        return _err("FORBIDDEN", "Parents can only view their own children", 403)
    if has_role(caller, "player") and str(junior.user_id) != str(caller.id):
        return _err("FORBIDDEN", "You can only view your own progress", 403)
    result, err = get_junior_progress(junior_id)
    if err:
        return _not_found("Junior")
    return _data(result)


@juniors_bp.route("/juniors/<int:junior_id>/monthly-report", methods=["GET"])
@require_roles("admin", "coach", "committee", "parent")
def monthly_report(junior_id):
    month = request.args.get("month")
    if not month:
        return _err("VALIDATION_ERROR", "month is required", 400)
    junior = get_junior(junior_id)
    if junior is None:
        return _not_found("Junior")
    caller = get_current_user()
    if has_role(caller, "parent") and str(junior.parent_id) != str(caller.id):
        return _err("FORBIDDEN", "Parents can only view their own children", 403)
    result, err = get_monthly_report(junior_id, month)
    if err:
        return _not_found("Junior")
    return _data(result)


# ── Level Bands ────────────────────────────────────────────────────────────────

@juniors_bp.route("/level-bands", methods=["GET"])
@require_auth
def get_level_bands():
    items = list_level_bands()
    return _data(level_bands_schema.dump(items), count=len(items))


@juniors_bp.route("/level-bands", methods=["POST"])
@admin_only
def post_level_band():
    try:
        band = create_level_band(request.get_json() or {})
        return _data(level_band_schema.dump(band), 201)
    except IntegrityError:
        return _err("CONFLICT", "Level band conflicts with existing data", 409)


@juniors_bp.route("/level-bands/<int:band_id>", methods=["GET"])
@require_auth
def get_level_band_route(band_id):
    band = get_level_band(band_id)
    if band is None:
        return _not_found("Level band")
    return _data(level_band_schema.dump(band))


@juniors_bp.route("/level-bands/<int:band_id>", methods=["PUT"])
@admin_only
def put_level_band(band_id):
    band = get_level_band(band_id)
    if band is None:
        return _not_found("Level band")
    return _data(level_band_schema.dump(update_level_band(band, request.get_json() or {})))


@juniors_bp.route("/level-bands/<int:band_id>", methods=["DELETE"])
@admin_only
def delete_level_band_route(band_id):
    band = get_level_band(band_id)
    if band is None:
        return _not_found("Level band")
    delete_level_band(band)
    return "", 204


# ── Level Benchmarks ──────────────────────────────────────────────────────────

@juniors_bp.route("/level-benchmarks", methods=["GET"])
@require_auth
def get_level_benchmarks():
    items = list_level_benchmarks(level_number=request.args.get("level_number"))
    return _data(level_benchmarks_schema.dump(items), count=len(items))


@juniors_bp.route("/level-benchmarks", methods=["POST"])
@admin_only
def post_level_benchmark():
    try:
        bm = create_level_benchmark(request.get_json() or {})
        return _data(level_benchmark_schema.dump(bm), 201)
    except IntegrityError:
        return _err("CONFLICT", "Benchmark conflicts with existing data", 409)


@juniors_bp.route("/level-benchmarks/<int:benchmark_id>", methods=["GET"])
@require_auth
def get_level_benchmark_route(benchmark_id):
    bm = get_level_benchmark(benchmark_id)
    if bm is None:
        return _not_found("Level benchmark")
    return _data(level_benchmark_schema.dump(bm))


@juniors_bp.route("/level-benchmarks/<int:benchmark_id>", methods=["PUT"])
@admin_only
def put_level_benchmark(benchmark_id):
    bm = get_level_benchmark(benchmark_id)
    if bm is None:
        return _not_found("Level benchmark")
    return _data(level_benchmark_schema.dump(update_level_benchmark(bm, request.get_json() or {})))


@juniors_bp.route("/level-benchmarks/<int:benchmark_id>", methods=["DELETE"])
@admin_only
def delete_level_benchmark_route(benchmark_id):
    bm = get_level_benchmark(benchmark_id)
    if bm is None:
        return _not_found("Level benchmark")
    delete_level_benchmark(bm)
    return "", 204


# ── Badges ─────────────────────────────────────────────────────────────────────

@juniors_bp.route("/badges", methods=["GET"])
@require_auth
def get_badges():
    items = list_badges()
    return _data(badges_schema.dump(items), count=len(items))


@juniors_bp.route("/badges", methods=["POST"])
@admin_only
def post_badge():
    b = create_badge(request.get_json() or {})
    return _data(badge_schema.dump(b), 201)


@juniors_bp.route("/badges/<int:badge_id>", methods=["GET"])
@require_auth
def get_badge_route(badge_id):
    b = get_badge(badge_id)
    if b is None:
        return _not_found("Badge")
    return _data(badge_schema.dump(b))


@juniors_bp.route("/badges/<int:badge_id>", methods=["PUT"])
@admin_only
def put_badge(badge_id):
    b = get_badge(badge_id)
    if b is None:
        return _not_found("Badge")
    return _data(badge_schema.dump(update_badge(b, request.get_json() or {})))


@juniors_bp.route("/badges/<int:badge_id>", methods=["DELETE"])
@admin_only
def delete_badge_route(badge_id):
    b = get_badge(badge_id)
    if b is None:
        return _not_found("Badge")
    delete_badge(b)
    return "", 204


# ── Junior Badges ─────────────────────────────────────────────────────────────

@juniors_bp.route("/junior-badges", methods=["GET"])
@require_auth
def get_junior_badges():
    """Staff (admin/coach/committee) may read any junior's badges; a player only
    their own; a parent only their own child's. Prevents one family reading
    another's recognitions."""
    caller = get_current_user()
    junior_id = request.args.get("junior_id")

    if has_role(caller, "player"):
        own = JuniorProfile.query.filter_by(user_id=caller.id).first()
        if own is None:
            return _data([], count=0)
        junior_id = own.id  # force to self regardless of the query param
    elif has_role(caller, "parent"):
        if junior_id is None or not str(junior_id).isdigit():
            return _err("VALIDATION_ERROR", "a numeric junior_id is required", 400)
        child = db.session.get(JuniorProfile, int(junior_id))
        if child is None or str(child.parent_id) != str(caller.id):
            return _err("FORBIDDEN", "You can only view your own child's badges", 403)

    items = list_junior_badges(junior_id=junior_id)
    return _data(junior_badges_schema.dump(items), count=len(items))


@juniors_bp.route("/junior-badges", methods=["POST"])
@require_roles("admin", "coach", "committee")
def post_junior_badge():
    data = dict(request.get_json() or {})
    # awarded_by is NOT NULL — stamp it from the JWT (the awarding staff member)
    # rather than trusting the body; default the date to today if omitted.
    data["awarded_by"] = get_current_user().id
    data.setdefault("awarded_date", date.today().isoformat())
    try:
        jb = award_badge(data)
    except IntegrityError:
        db.session.rollback()
        return _err("CONFLICT", "Badge already awarded to this junior", 409)
    # Celebrate like a catalog achievement: ping the player and their parent so
    # both get the confetti + congratulations (social-phase decision, both
    # achievement sources celebrate).
    from app.notifications.service import notify

    junior = jb.junior or get_junior(jb.junior_id)
    title = jb.badge.name if jb.badge else "a new badge"
    if junior is not None:
        payload = {"badge_id": jb.badge_id, "title": title}
        notify(junior.user_id, "achievement", payload)
        if junior.parent_id:
            # Always non-empty on the parent's copy (see sync_achievements) so
            # the frontend reliably treats it as a parent notification.
            child_name = (
                (junior.user.first_name or "").strip() if junior.user else ""
            ) or "Your child"
            notify(junior.parent_id, "achievement", {**payload, "child_name": child_name})
        db.session.commit()
    return _data(junior_badge_schema.dump(jb), 201)


@juniors_bp.route("/junior-badges/<int:junior_id>/<int:badge_id>", methods=["DELETE"])
@require_roles("admin", "coach", "committee")
def delete_junior_badge(junior_id, badge_id):
    jb = revoke_badge(junior_id, badge_id)
    if jb is None:
        return _not_found("Junior badge")
    return "", 204


@juniors_bp.route("/juniors/<int:junior_id>/featured-badge", methods=["PUT"])
@require_roles("admin", "coach", "committee", "player")
def put_featured_badge(junior_id):
    """A player picks which award to show off in chat (staff may set it too).
    Body is ONE of: {badge_id:int} (a staff-granted badge they hold),
    {achievement_key:str} (an auto-unlocked achievement), or either field null
    / {} to clear. Players may only set their own. Setting one source clears
    the other."""
    junior = get_junior(junior_id)
    if junior is None:
        return _not_found("Junior")
    caller = get_current_user()
    if has_role(caller, "player") and str(junior.user_id) != str(caller.id):
        return _err("FORBIDDEN", "You can only set your own featured award", 403)
    data = request.get_json() or {}

    if "achievement_key" in data:
        key = data.get("achievement_key")
        if key is not None and not isinstance(key, str):
            return _err("VALIDATION_ERROR", "achievement_key must be a string or null", 400)
        if isinstance(key, str) and len(key) > 80:
            return _err("VALIDATION_ERROR", "achievement_key is too long", 400)
        updated, err = set_featured_achievement(junior, key)
    else:
        badge_id = data.get("badge_id")
        if badge_id is not None and not isinstance(badge_id, int):
            return _err("VALIDATION_ERROR", "badge_id must be an integer or null", 400)
        updated, err = set_featured_badge(junior, badge_id)

    if err:
        return _err("VALIDATION_ERROR", err, 400)
    return _data({
        "junior_id": junior.id,
        "featured_badge_id": updated.featured_badge_id,
        "featured_achievement_key": updated.featured_achievement_key,
    })


# ── Bulk intake import (CSV → preview → commit) ──────────────────────────────
# Staff upload the junior-development roster (CSV) to onboard many juniors at
# once. The request body is the CSV itself: send raw text with Content-Type
# text/csv, OR a JSON object {"csv": "<text>"}. Both are accepted.

def _extract_csv():
    """Read CSV text from a raw text/csv body or a JSON {csv: "..."} body.
    Returns (csv_text, error_response). One of the two is always None."""
    ctype = (request.content_type or "")
    if "application/json" in ctype:
        body = request.get_json(silent=True) or {}
        text = body.get("csv")
        if not isinstance(text, str) or not text.strip():
            return None, _err("VALIDATION_ERROR", "JSON body must include a non-empty 'csv' string", 400)
        return text, None
    # default: treat the raw body as CSV (text/csv, or anything else)
    text = request.get_data(as_text=True)
    if not text or not text.strip():
        return None, _err("VALIDATION_ERROR", "Request body is empty — send CSV as text/csv or JSON {csv}", 400)
    return text, None


@juniors_bp.route("/juniors/import/preview", methods=["POST"])
@require_roles("admin", "committee")
def import_preview():
    """Parse + validate the uploaded CSV and report per-row results. No writes."""
    csv_text, err = _extract_csv()
    if err:
        return err
    try:
        return _data(preview_import(csv_text))
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)


@juniors_bp.route("/juniors/import/commit", methods=["POST"])
@require_roles("admin", "committee")
def import_commit():
    """Re-parse the SAME CSV and create a player User + JuniorProfile
    (pending_staff) per importable row. Error rows are skipped; each create is
    isolated in a savepoint so one bad row can't abort the batch."""
    csv_text, err = _extract_csv()
    if err:
        return err
    try:
        return _data(commit_import(csv_text))
    except ValueError as exc:
        return _err("VALIDATION_ERROR", str(exc), 400)
