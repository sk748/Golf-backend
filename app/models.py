"""
Single import point that ensures every SQLAlchemy model is registered
with the metadata before Flask-Migrate runs autogenerate.

Import this module once in create_app() so `flask db migrate` can
detect all tables across all modules.
"""

from app.auth.models import User, UserRole, MembershipType
from app.courses.models import Course, TeeSet, Hole
from app.tournaments.models import (
    Tournament, TournamentDivision, TournamentEntry, TournamentScore,
    TournamentHoleScore, TournamentMatch, ExternalResult, Series,
)
from app.rounds.models import Round, HoleScore
from app.juniors.models import JuniorProfile, LevelBand, LevelBenchmark, Badge, JuniorBadge
from app.evaluations.models import Evaluation
from app.attendance.models import Attendance
from app.sessions.models import Session, Class, ClassEnrollment, BookingRequest
from app.audit.models import AuditLog
from app.messaging.models import Conversation, ConversationMember, Message, MessageFlag
from app.announcements.models import Announcement
from app.notifications.models import Notification

__all__ = [
    "User", "UserRole", "MembershipType",
    "Course", "TeeSet", "Hole",
    "Tournament", "TournamentDivision", "TournamentEntry", "TournamentScore",
    "TournamentHoleScore", "TournamentMatch", "ExternalResult", "Series",
    "Round", "HoleScore",
    "JuniorProfile", "LevelBand", "LevelBenchmark", "Badge", "JuniorBadge",
    "Evaluation",
    "Attendance",
    "Session", "Class", "ClassEnrollment", "BookingRequest",
    "AuditLog",
    "Conversation", "ConversationMember", "Message", "MessageFlag",
    "Announcement",
    "Notification",
    "register_all",
]


def register_all() -> None:
    """
    No-op — importing this module is what registers all SQLAlchemy models.
    Call this in create_app() so Flask-Migrate autogenerate detects every table.
    """
