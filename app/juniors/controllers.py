from datetime import datetime, timedelta

from app.database.database import db
from app.juniors.models import JuniorProfile, LevelBand, LevelBenchmark, Badge, JuniorBadge
from app.utils.schemas import SimpleModelSchema

junior_schema = SimpleModelSchema(JuniorProfile)
juniors_schema = SimpleModelSchema(JuniorProfile, many=True)
level_band_schema = SimpleModelSchema(LevelBand)
level_bands_schema = SimpleModelSchema(LevelBand, many=True)
level_benchmark_schema = SimpleModelSchema(LevelBenchmark)
level_benchmarks_schema = SimpleModelSchema(LevelBenchmark, many=True)
badge_schema = SimpleModelSchema(Badge)
badges_schema = SimpleModelSchema(Badge, many=True)
junior_badge_schema = SimpleModelSchema(JuniorBadge)
junior_badges_schema = SimpleModelSchema(JuniorBadge, many=True)


def _resolve_band(data: dict):
    current_level = data.get("current_level")
    if current_level is None:
        return data
    band = LevelBand.query.filter(
        LevelBand.min_level <= current_level,
        LevelBand.max_level >= current_level,
    ).first()
    if band is None:
        raise ValueError("No level band exists for current_level")
    data["band_id"] = band.id
    return data


# ── Junior Profiles ────────────────────────────────────────────────────────

def list_juniors(parent_id=None, band_id=None, current_level=None,
                 age_min=None, age_max=None, coach_id=None):
    q = JuniorProfile.query
    if parent_id:
        q = q.filter_by(parent_id=parent_id)
    if coach_id:
        q = q.filter_by(coach_id=coach_id)
    if band_id:
        q = q.filter_by(band_id=band_id)
    if current_level:
        q = q.filter_by(current_level=current_level)
    if age_min is not None or age_max is not None:
        today = datetime.utcnow().date()
        if age_min is not None:
            q = q.filter(JuniorProfile.date_of_birth <= today.replace(year=today.year - age_min))
        if age_max is not None:
            earliest = today.replace(year=today.year - age_max - 1) + timedelta(days=1)
            q = q.filter(JuniorProfile.date_of_birth >= earliest)
    return q.all()


def get_junior(junior_id: int):
    return db.session.get(JuniorProfile, junior_id)


def create_junior(data: dict):
    data = _resolve_band(dict(data))
    junior = junior_schema.load(data)
    db.session.add(junior)
    db.session.commit()
    return junior


def update_junior(junior, data: dict):
    data = _resolve_band(dict(data))
    for k, v in data.items():
        setattr(junior, k, v)
    db.session.commit()
    return junior


def delete_junior(junior):
    db.session.delete(junior)
    db.session.commit()


def promote_junior(junior, evaluation):
    """Advance a junior one level, traceable to a fully counter-signed
    evaluation that recommends it (build-phase-2 decision 6).
    Returns (junior, error_string)."""
    if evaluation is None or evaluation.junior_id != junior.id:
        return None, "Evaluation not found for this golfer"
    rec = getattr(evaluation.recommendation, "value", evaluation.recommendation)
    if rec != "move_next_level":
        return None, "That evaluation does not recommend a level move"
    if not (evaluation.coach_signed and evaluation.committee_signed):
        return None, "Promotion needs a coach-signed AND committee-signed evaluation"
    if junior.current_level >= 9:
        return None, "Already at the top level"
    update_junior(junior, {"current_level": junior.current_level + 1})
    return junior, None


def assign_coach(junior, coach_id):
    """Assign (or, with coach_id=None, unassign) a coach to a junior.

    Raises ValueError if coach_id is given but doesn't resolve to a user with
    the coach role — the column is a plain users FK, so we enforce the role here.
    """
    from app.auth.models import User

    if coach_id is None:
        junior.coach_id = None
    else:
        coach = db.session.get(User, coach_id)
        role = coach.role.value if (coach and hasattr(coach.role, "value")) else None
        if coach is None or role != "coach":
            raise ValueError("coach_id must reference a user with the coach role")
        junior.coach_id = coach_id
    db.session.commit()
    return junior


def get_junior_progress(junior_id: int):
    from app.evaluations.models import Evaluation
    from app.attendance.models import Attendance

    junior = db.session.get(JuniorProfile, junior_id)
    if junior is None:
        return None, "Junior not found"

    evaluations = Evaluation.query.filter_by(junior_id=junior_id).order_by(Evaluation.report_month).all()
    attendance_rows = Attendance.query.filter_by(junior_id=junior_id).all()

    benchmarks = []
    if junior.current_level in (6, 7, 8):
        bm = LevelBenchmark.query.filter_by(level_number=junior.current_level).first()
        if bm:
            benchmarks = [{
                "level_number": bm.level_number,
                "full_swing_target": bm.full_swing_target,
                "around_green_target": bm.around_green_target,
                "putting_target": bm.putting_target,
                "nine_hole_target": bm.nine_hole_target,
            }]

    return {
        "junior_id": junior.id,
        "current_level": junior.current_level,
        "level_changes": [
            {"report_month": e.report_month.isoformat(), "current_level": e.current_level}
            for e in evaluations
        ],
        "evaluations": [
            {
                "report_month": e.report_month.isoformat(),
                "current_level": e.current_level,
                "assessment": e.assessment.value,
                "recommendation": e.recommendation.value,
                "avg_score_9": float(e.avg_score_9) if e.avg_score_9 is not None else None,
                "avg_score_18": float(e.avg_score_18) if e.avg_score_18 is not None else None,
                "best_gross_score": e.best_gross_score,
            }
            for e in evaluations
        ],
        "attendance": {
            "present": sum(1 for a in attendance_rows if a.status.value == "present"),
            "absent": sum(1 for a in attendance_rows if a.status.value == "absent"),
            "excused": sum(1 for a in attendance_rows if a.status.value == "excused"),
            "total": len(attendance_rows),
        },
        "benchmarks": benchmarks,
    }, None


def get_monthly_report(junior_id: int, month: str):
    from app.evaluations.models import Evaluation
    from app.attendance.models import Attendance
    from app.sessions.models import Session

    junior = db.session.get(JuniorProfile, junior_id)
    if junior is None:
        return None, "Junior not found"

    evaluation = Evaluation.query.filter_by(junior_id=junior_id, report_month=month).first()
    attendance_rows = (
        Attendance.query.join(Session)
        .filter(Attendance.junior_id == junior_id, Session.date >= month)
        .all()
    )
    return {
        "profile": junior_schema.dump(junior),
        "evaluation": SimpleModelSchema(Evaluation).dump(evaluation) if evaluation else None,
        "attendance": {
            "present": sum(1 for a in attendance_rows if a.status.value == "present"),
            "absent": sum(1 for a in attendance_rows if a.status.value == "absent"),
            "excused": sum(1 for a in attendance_rows if a.status.value == "excused"),
            "total": len(attendance_rows),
        },
    }, None


# ── Level Bands ──────────────────────────────────────────────────────────────

def list_level_bands():
    return LevelBand.query.all()


def get_level_band(band_id: int):
    return db.session.get(LevelBand, band_id)


def create_level_band(data: dict):
    band = level_band_schema.load(data)
    db.session.add(band)
    db.session.commit()
    return band


def update_level_band(band, data: dict):
    for k, v in data.items():
        setattr(band, k, v)
    db.session.commit()
    return band


def delete_level_band(band):
    db.session.delete(band)
    db.session.commit()


# ── Level Benchmarks ──────────────────────────────────────────────────────────

def list_level_benchmarks(level_number=None):
    q = LevelBenchmark.query
    if level_number:
        q = q.filter_by(level_number=level_number)
    return q.all()


def get_level_benchmark(benchmark_id: int):
    return db.session.get(LevelBenchmark, benchmark_id)


def create_level_benchmark(data: dict):
    bm = level_benchmark_schema.load(data)
    db.session.add(bm)
    db.session.commit()
    return bm


def update_level_benchmark(bm, data: dict):
    for k, v in data.items():
        setattr(bm, k, v)
    db.session.commit()
    return bm


def delete_level_benchmark(bm):
    db.session.delete(bm)
    db.session.commit()


# ── Badges ────────────────────────────────────────────────────────────────────

def list_badges():
    return Badge.query.all()


def get_badge(badge_id: int):
    return db.session.get(Badge, badge_id)


def create_badge(data: dict):
    b = badge_schema.load(data)
    db.session.add(b)
    db.session.commit()
    return b


def update_badge(b, data: dict):
    for k, v in data.items():
        setattr(b, k, v)
    db.session.commit()
    return b


def delete_badge(b):
    db.session.delete(b)
    db.session.commit()


# ── Junior Badges ─────────────────────────────────────────────────────────────

def list_junior_badges(junior_id=None):
    q = JuniorBadge.query
    if junior_id:
        q = q.filter_by(junior_id=junior_id)
    return q.all()


def award_badge(data: dict):
    jb = junior_badge_schema.load(data)
    db.session.add(jb)
    db.session.commit()
    return jb


def revoke_badge(junior_id: int, badge_id: int):
    jb = db.session.get(JuniorBadge, (junior_id, badge_id))
    if jb:
        db.session.delete(jb)
        db.session.commit()
    return jb
