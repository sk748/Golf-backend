"""
Audit logging service.

Call `record(...)` at an action site (in a route handler, where the current
user is known) AFTER the primary action has committed. Writing the audit row is
observational and MUST NOT break the primary action — failures are swallowed.

`description` is built from a template registry so entries read as plain
English for a non-technical admin. Pass an explicit `description` to override.
"""
from app.database.database import db
from app.audit.models import AuditLog


def _actor_name(actor) -> str:
    if actor is None:
        return "System"
    name = f"{actor.first_name} {actor.last_name}".strip()
    return name or actor.email


def _actor_role(actor):
    if actor is None:
        return None
    return actor.role.value if hasattr(actor.role, "value") else actor.role


# action -> (actor_name, target_label, metadata) -> sentence
TEMPLATES = {
    "user.created": lambda a, t, m: f"{a} created a new {m.get('role', 'user')} account for {t}.",
    "user.role_changed": lambda a, t, m: f"{a} changed {t}'s role from {m.get('old_role', '?')} to {m.get('new_role', '?')}.",
    "user.deactivated": lambda a, t, m: f"{a} deactivated the account for {t}.",
    "user.activated": lambda a, t, m: f"{a} re-activated the account for {t}.",
    "evaluation.signed": lambda a, t, m: f"{a} signed the {m.get('month', 'monthly')} evaluation for {t}.",
    "evaluation.counter_signed": lambda a, t, m: f"{a} counter-signed the {m.get('month', 'monthly')} evaluation for {t}.",
    "tournament.created": lambda a, t, m: f"{a} created the tournament “{t}”.",
}


def junior_label(junior_id) -> str:
    """Resolve a junior's display name for a human-readable target_label."""
    from app.juniors.models import JuniorProfile
    from app.auth.models import User

    jp = db.session.get(JuniorProfile, junior_id)
    if jp is None:
        return f"junior #{junior_id}"
    user = db.session.get(User, jp.user_id)
    if user is not None:
        return f"{user.first_name} {user.last_name}".strip() or user.email
    return f"junior #{junior_id}"


def record(
    action,
    *,
    actor=None,
    target_type=None,
    target_id=None,
    target_label=None,
    metadata=None,
    description=None,
    ip_address=None,
):
    """Write one audit row. Never raises — returns the row or None on failure."""
    try:
        actor_name = _actor_name(actor)
        meta = metadata or {}
        if description is None:
            template = TEMPLATES.get(action)
            if template is not None:
                description = template(actor_name, target_label or "", meta)
            else:
                tail = f" on {target_label}" if target_label else ""
                description = f"{actor_name} performed {action}{tail}."

        entry = AuditLog(
            actor_user_id=getattr(actor, "id", None),
            actor_name=actor_name,
            actor_role=_actor_role(actor),
            category=action.split(".")[0],
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            target_label=target_label,
            description=description[:400],
            meta=meta or None,
            ip_address=ip_address,
        )
        db.session.add(entry)
        db.session.commit()
        return entry
    except Exception:
        db.session.rollback()
        return None
