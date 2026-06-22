from sqlalchemy import JSON, Column, ForeignKey, Integer, String

from app.database.database import db
from app.utils.mixins import TimestampMixin


class AuditLog(TimestampMixin, db.Model):
    """
    A human-readable record of who did what, when. `description` is a
    pre-rendered plain-English sentence shown to the (non-technical) admin
    verbatim; the structured columns exist for filtering/search.

    Actor/target labels are snapshots taken at write time so the log stays
    readable even if the user or record is later renamed or deleted.
    """

    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True)

    actor_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    actor_name = Column(String(150), nullable=False, default="System")
    actor_role = Column(String(20), nullable=True)

    category = Column(String(30), nullable=False)          # user, evaluation, tournament, ...
    action = Column(String(50), nullable=False, index=True)  # user.created, evaluation.signed, ...

    target_type = Column(String(40), nullable=True)
    target_id = Column(String(64), nullable=True)
    target_label = Column(String(200), nullable=True)

    description = Column(String(400), nullable=False)
    # 'metadata' is reserved by SQLAlchemy's declarative base, so the attribute
    # is `meta` (serialized as "meta").
    meta = Column(JSON, nullable=True)
    ip_address = Column(String(64), nullable=True)
