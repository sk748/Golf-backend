from datetime import date as date_cls
from decimal import Decimal

from app.database.database import db
from app.rounds.models import Round, HoleScore
from app.utils.schemas import SimpleModelSchema

round_schema = SimpleModelSchema(Round)
rounds_schema = SimpleModelSchema(Round, many=True)
hole_score_schema = SimpleModelSchema(HoleScore)
hole_scores_schema = SimpleModelSchema(HoleScore, many=True)


# ── Rounds ────────────────────────────────────────────────────────────────────

def list_rounds(user_id=None, course_id=None, round_type=None, status=None):
    q = Round.query
    if user_id:
        q = q.filter_by(user_id=user_id)
    if course_id:
        q = q.filter_by(course_id=course_id)
    if round_type:
        q = q.filter_by(round_type=round_type)
    if status:
        q = q.filter_by(status=status)
    return q.order_by(Round.date_played.desc()).all()


def get_round(round_id: int):
    return db.session.get(Round, round_id)


def create_round(data: dict):
    r = round_schema.load(data)
    db.session.add(r)
    db.session.commit()
    return r


def update_round(r, data: dict):
    for k, v in data.items():
        setattr(r, k, v)
    db.session.commit()
    return r


def delete_round(r):
    db.session.delete(r)
    db.session.commit()


def get_handicap_history(user_id: str):
    return Round.query.filter_by(user_id=user_id).order_by(Round.date_played).all()


# ── Hole Scores ───────────────────────────────────────────────────────────────

def list_hole_scores(round_id=None):
    q = HoleScore.query
    if round_id:
        q = q.filter_by(round_id=round_id)
    return q.all()


def get_hole_score(hole_score_id: int):
    return db.session.get(HoleScore, hole_score_id)


def create_hole_score(data: dict):
    hs = hole_score_schema.load(data)
    db.session.add(hs)
    db.session.commit()
    return hs


def update_hole_score(hs, data: dict):
    for k, v in data.items():
        setattr(hs, k, v)
    db.session.commit()
    return hs


def delete_hole_score(hs):
    db.session.delete(hs)
    db.session.commit()


# ── Score sync (submit scorecard + update handicap) ───────────────────────────

def _recompute_index(user):
    """Recompute the user's handicap index from their VERIFIED + COUNTING
    rounds (last 20 by date). Returns the new index (float) and writes it onto
    the user; caller commits."""
    from app.whs.controllers import calculate_handicap_index

    diffs = [
        float(r.score_differential)
        for r in Round.query.filter_by(
            user_id=user.id, status="verified", counts_toward_handicap=True
        )
        .order_by(Round.date_played.desc())
        .limit(20)
        .all()
        if r.score_differential is not None
    ]
    new_index = calculate_handicap_index(diffs)
    user.handicap_index = Decimal(str(new_index))
    return new_index


def sync_score(email: str, data: dict, entered_by=None, initial_status="verified"):
    """
    Submit a round scorecard, compute the WHS differential, store the Round,
    and — when the round is verified AND counts toward handicap — recompute the
    user's handicap index. Pending rounds store the differential but do not
    touch the index until verify_round().
    Returns (result_dict, error_string).
    """
    from app.auth.models import User
    from app.courses.models import TeeSet, Course

    user = User.query.filter_by(email=email).first()
    if user is None:
        return None, "User not found"

    tee_set_id = data.get("tee_set_id") or data.get("tee_id")
    gross_score = data.get("gross_score")
    holes_played = int(data.get("holes_played", 18))
    pcc = float(data.get("pcc", 0))
    counts = bool(data.get("counts_toward_handicap", True))
    date_played = data.get("date_played")
    if date_played:
        try:
            date_played = date_cls.fromisoformat(str(date_played))
        except ValueError:
            return None, "date_played must be ISO YYYY-MM-DD"
        if date_played > date_cls.today():
            return None, "date_played cannot be in the future"
    else:
        date_played = date_cls.today()

    if not tee_set_id or gross_score is None:
        return None, "tee_set_id and gross_score are required"

    tee = db.session.get(TeeSet, int(tee_set_id))
    if tee is None:
        return None, "Tee set not found"

    from app.whs.controllers import calculate_score_differential

    current_index = float(user.handicap_index) if user.handicap_index is not None else 54.0
    differential = calculate_score_differential(
        actual_gross_score=int(gross_score),
        holes_played=holes_played,
        handicap_index=current_index,
        course_rating=float(tee.course_rating),
        slope_rating=int(tee.slope_rating),
        pcc=pcc,
    )

    is_verified = initial_status == "verified"
    round_obj = Round(
        user_id=user.id,
        course_id=tee.course_id,
        tee_set_id=tee.id,
        date_played=date_played,
        round_type="casual",
        gross_score=int(gross_score),
        score_differential=Decimal(str(differential)),
        pcc_adjustment=Decimal(str(pcc)),
        handicap_before=user.handicap_index,
        status=initial_status,
        counts_toward_handicap=counts,
        entered_by=entered_by,
        verified_by=entered_by if is_verified else None,
        verified_date=date_cls.today() if is_verified else None,
    )
    db.session.add(round_obj)
    db.session.flush()

    new_index = None
    if is_verified and counts:
        new_index = _recompute_index(user)
        round_obj.handicap_after = Decimal(str(new_index))
    db.session.commit()

    tee_color = tee.name.value if hasattr(tee.name, "value") else tee.name
    course = db.session.get(Course, tee.course_id)

    return {
        "success": True,
        "scorecard": {
            "id": round_obj.id,
            "gross_score": round_obj.gross_score,
            "score_differential": differential,
            "course_name": course.name if course else "",
            "tee_color": tee_color,
            "date_played": round_obj.date_played.isoformat(),
            "status": initial_status,
            "counts_toward_handicap": counts,
        },
        # None while the round is pending or practice-only (index untouched).
        "new_handicap_index": new_index,
        "differential": differential,
    }, None


def verify_round(round_obj, verifier_id: str):
    """Mark a pending round verified and, if it counts, recompute the player's
    index. Idempotent: verifying an already-verified round is a no-op.
    Returns (round, new_index|None)."""
    if getattr(round_obj.status, "value", round_obj.status) == "verified":
        return round_obj, None
    round_obj.status = "verified"
    round_obj.verified_by = verifier_id
    round_obj.verified_date = date_cls.today()

    new_index = None
    if round_obj.counts_toward_handicap:
        new_index = _recompute_index(round_obj.user)
        round_obj.handicap_after = Decimal(str(new_index))
    db.session.commit()
    return round_obj, new_index
