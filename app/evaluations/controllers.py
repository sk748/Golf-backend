from app.database.database import db
from app.evaluations.models import Evaluation
from app.utils.schemas import SimpleModelSchema

evaluation_schema = SimpleModelSchema(Evaluation)
evaluations_schema = SimpleModelSchema(Evaluation, many=True)


def _enum_value(v):
    return v.value if hasattr(v, "value") else v


def latest_player_feedback(junior_id: int):
    """
    The most recent COACH-SIGNED evaluation for a junior, anonymized for the
    student: shows where they are and what to improve, but NOT who wrote it
    (no coach_id / coach name / committee_signed_by, no internal signature ids).
    Returns None if the junior has no signed evaluation yet.
    """
    ev = (
        Evaluation.query.filter_by(junior_id=junior_id, coach_signed=True)
        .order_by(Evaluation.report_month.desc())
        .first()
    )
    if ev is None:
        return None

    def _num(x):
        return float(x) if x is not None else None

    return {
        "report_month": ev.report_month.isoformat() if ev.report_month else None,
        "current_level": ev.current_level,
        "assessment": _enum_value(ev.assessment),
        "recommendation": _enum_value(ev.recommendation),
        "special_remarks": ev.special_remarks,
        "putting_assessment": ev.putting_assessment,
        "chipping_assessment": ev.chipping_assessment,
        "full_swing_assessment": ev.full_swing_assessment,
        "avg_score_9": _num(ev.avg_score_9),
        "avg_score_18": _num(ev.avg_score_18),
        "competitions_played": ev.competitions_played,
        "best_gross_score": ev.best_gross_score,
        "attendance_count": ev.attendance_count,
        "attendance_total": ev.attendance_total,
        # Status only — never the identities behind it.
        "fully_signed_off": bool(ev.coach_signed and ev.committee_signed),
    }


# ── Evaluations ───────────────────────────────────────────────────────────────

def list_evaluations(junior_id=None, coach_id=None, report_month=None,
                     committee_signed=None, coach_signed=None):
    q = Evaluation.query
    if junior_id:
        q = q.filter_by(junior_id=junior_id)
    if coach_id:
        q = q.filter_by(coach_id=coach_id)
    if report_month:
        q = q.filter_by(report_month=report_month)
    if committee_signed is not None:
        q = q.filter_by(committee_signed=committee_signed)
    if coach_signed is not None:
        q = q.filter_by(coach_signed=coach_signed)
    return q.all()


def get_evaluation(evaluation_id: int):
    return db.session.get(Evaluation, evaluation_id)


def create_evaluation(data: dict):
    _validate(data)
    ev = evaluation_schema.load(data)
    db.session.add(ev)
    db.session.commit()
    return ev


# Sign-off state is set ONLY through coach_sign()/committee_sign() (their
# dedicated, role-guarded routes enforce the sequential coach→committee order).
# Stripping these from a blanket PUT blocks a coach forging the committee
# signature / self-approving via update (security audit 2026-06-15, CRITICAL).
_SIGNOFF_FIELDS = {
    "coach_signed",
    "coach_signed_date",
    "committee_signed",
    "committee_signed_date",
    "committee_signed_by",
}


def update_evaluation(ev, data: dict):
    data = {k: v for k, v in data.items() if k not in _SIGNOFF_FIELDS}
    _validate(data, instance=ev)
    for k, v in data.items():
        setattr(ev, k, v)
    db.session.commit()
    return ev


def delete_evaluation(ev):
    db.session.delete(ev)
    db.session.commit()


def _validate(data: dict, instance=None):
    cs = data.get("committee_signed", getattr(instance, "committee_signed", False))
    ks = data.get("coach_signed", getattr(instance, "coach_signed", False))
    if cs and not ks:
        raise ValueError("committee_signed may only be true if coach_signed is true")


# ── Sign-off helpers ──────────────────────────────────────────────────────────

def coach_sign(evaluation_id: int, coach_id: str):
    from datetime import date
    ev = db.session.get(Evaluation, evaluation_id)
    if ev is None:
        return None, "Evaluation not found"
    if str(ev.coach_id) != str(coach_id):
        return None, "Only the assigned coach can sign this evaluation"
    ev.coach_signed = True
    ev.coach_signed_date = date.today()
    db.session.commit()
    return ev, None


def committee_sign(evaluation_id: int, signer_id: str):
    from datetime import date
    ev = db.session.get(Evaluation, evaluation_id)
    if ev is None:
        return None, "Evaluation not found"
    if not ev.coach_signed:
        return None, "Coach must sign before committee can sign"
    ev.committee_signed = True
    ev.committee_signed_date = date.today()
    ev.committee_signed_by = signer_id
    db.session.commit()
    return ev, None


# ── Summary ────────────────────────────────────────────────────────────────────

def get_evaluation_summary(band_id: int, month: str):
    from app.juniors.models import JuniorProfile

    juniors = JuniorProfile.query.filter_by(band_id=band_id).all()
    junior_ids = [j.id for j in juniors]
    evs = Evaluation.query.filter(
        Evaluation.junior_id.in_(junior_ids),
        Evaluation.report_month == month,
    ).all()
    by_junior = {e.junior_id: e for e in evs}

    return [
        {
            "junior_id": j.id,
            "user_id": j.user_id,
            "current_level": j.current_level,
            "evaluation": evaluation_schema.dump(by_junior.get(j.id)),
            "coach_signed": bool(by_junior[j.id].coach_signed) if j.id in by_junior else False,
            "committee_signed": bool(by_junior[j.id].committee_signed) if j.id in by_junior else False,
        }
        for j in juniors
    ]
