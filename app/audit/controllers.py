from datetime import date

from sqlalchemy import or_

from app.audit.models import AuditLog
from app.utils.schemas import SimpleModelSchema

audit_schema = SimpleModelSchema(AuditLog, many=True)


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def list_audit_log(
    limit=50,
    offset=0,
    category=None,
    action=None,
    actor_id=None,
    date_from=None,
    date_to=None,
    q=None,
):
    """Return (rows, total) newest-first, with optional filters."""
    query = AuditLog.query
    if category:
        query = query.filter(AuditLog.category == category)
    if action:
        query = query.filter(AuditLog.action == action)
    if actor_id:
        query = query.filter(AuditLog.actor_user_id == actor_id)

    df = _parse_date(date_from)
    dt = _parse_date(date_to)
    if df:
        query = query.filter(AuditLog.created_at >= df)
    if dt:
        query = query.filter(AuditLog.created_at <= dt)

    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(AuditLog.description.ilike(like), AuditLog.target_label.ilike(like))
        )

    total = query.count()
    rows = query.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset).all()
    return rows, total
