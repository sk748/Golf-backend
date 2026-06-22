"""
In-app notifications (social phase): bell feed + unread counts. In-app only —
no email/SMS in this phase. Rows are written by other domains via
app.notifications.service.notify().
"""
from sqlalchemy import JSON, Boolean, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database.database import db
from app.utils.mixins import TimestampMixin


class Notification(TimestampMixin, db.Model):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)  # e.g. first_contact, message_held, message_flagged
    payload = Column(JSON, nullable=True)
    read = Column(Boolean, nullable=False, default=False)

    user = relationship("User")
