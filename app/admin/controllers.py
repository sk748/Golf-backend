from app.auth.models import User, UserRole
from app.database.database import db


def get_platform_stats():
    """Aggregate counts used by the AdminDashboard page."""
    from app.juniors.models import JuniorProfile, LevelBand
    from app.tournaments.models import Tournament, Match
    from app.sessions.models import Session, Class
    from app.evaluations.models import Evaluation
    from app.rounds.models import Round

    total_users = User.query.count()
    players = User.query.filter_by(role=UserRole.player).count()
    coaches = User.query.filter_by(role=UserRole.coach).count()
    parents = User.query.filter_by(role=UserRole.parent).count()
    admins = User.query.filter_by(role=UserRole.admin).count()
    committee = User.query.filter_by(role=UserRole.committee).count()

    juniors = JuniorProfile.query.count()
    active_tournaments = Tournament.query.filter(
        Tournament.status.in_(["round_robin", "knockout"])
    ).count()
    total_tournaments = Tournament.query.count()
    total_sessions = Session.query.count()
    total_classes = Class.query.count()
    total_evaluations = Evaluation.query.count()
    unsigned_evaluations = Evaluation.query.filter_by(coach_signed=False).count()
    total_rounds = Round.query.count()

    return {
        "users": {
            "total": total_users,
            "players": players,
            "coaches": coaches,
            "parents": parents,
            "admins": admins,
            "committee": committee,
        },
        "juniors": juniors,
        "tournaments": {
            "total": total_tournaments,
            "active": active_tournaments,
        },
        "sessions": total_sessions,
        "classes": total_classes,
        "evaluations": {
            "total": total_evaluations,
            "unsigned": unsigned_evaluations,
        },
        "rounds": total_rounds,
    }


def list_all_users(role=None, is_active=None):
    q = User.query
    if role:
        q = q.filter_by(role=role)
    if is_active is not None:
        q = q.filter_by(is_active=is_active)
    return q.order_by(User.created_at.desc()).all()


def toggle_user_active(user_id: str, is_active: bool):
    user = db.session.get(User, user_id)
    if user is None:
        return None, "User not found"
    user.is_active = is_active
    db.session.commit()
    return user, None


def change_user_role(user_id: str, new_role: str):
    user = db.session.get(User, user_id)
    if user is None:
        return None, "User not found"
    try:
        user.role = UserRole(new_role)
    except ValueError:
        return None, f"Invalid role: {new_role}"
    db.session.commit()
    return user, None
