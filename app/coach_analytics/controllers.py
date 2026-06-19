"""
Coach Analytics — read-only aggregation for admin + committee oversight.

Rolls up EXISTING data (no new tables) per coach over a date window:
  • sessions run (count + by-type + timeline)
  • 1-on-1 sessions, flagged billable (count + attendees) — charging stays
    parked per CLAUDE.md; this is track-and-count only, no rates/money
  • aggregate performance of the coach's ASSIGNED juniors across four signals:
      - handicap improvement (avg change in index over the window)
      - evaluation assessment mix (below/meeting/exceeding) + promotion recs
      - level progress (avg current level, move-next-level recommendations)
      - attendance adherence (present / total across their sessions)

A coach owns juniors via JuniorProfile.coach_id. Sessions/attendance/
evaluations are attributed to the coach via their own coach_id columns.
"""

from datetime import date, timedelta

from app.auth.models import User, UserRole
from app.sessions.models import Session, SessionType, SessionStatus
from app.attendance.models import Attendance, AttendanceStatus
from app.evaluations.models import (
    Evaluation, EvaluationAssessment, EvaluationRecommendation,
)
from app.juniors.models import JuniorProfile
from app.rounds.models import Round, RoundStatus


DEFAULT_WINDOW_DAYS = 90


def parse_window(date_from=None, date_to=None):
    """Resolve the (date_from, date_to) window, defaulting to the last 90 days.
    Returns (date, date). Raises ValueError on a malformed ISO date."""
    to = date.fromisoformat(date_to) if date_to else date.today()
    frm = date.fromisoformat(date_from) if date_from else to - timedelta(days=DEFAULT_WINDOW_DAYS)
    return frm, to


def _coach_name(coach):
    full = f"{coach.first_name} {coach.last_name}".strip()
    return full or coach.email


def _decimal(value):
    return float(value) if value is not None else None


def _round1(value):
    return round(value, 1) if value is not None else None


# ── per-junior handicap change ────────────────────────────────────────────────

def _handicap_change(user_id, frm, to):
    """Change in handicap index across the window for one junior.
    Positive == improvement (index went DOWN). Uses the handicap snapshots
    written onto verified, counting rounds. None if there isn't enough data."""
    rounds = (
        Round.query
        .filter(Round.user_id == user_id)
        .filter(Round.date_played >= frm, Round.date_played <= to)
        .filter(Round.status == RoundStatus.verified)
        .filter(Round.counts_toward_handicap.is_(True))
        .order_by(Round.date_played, Round.id)
        .all()
    )
    starts = [r for r in rounds if r.handicap_before is not None]
    ends = [r for r in rounds if r.handicap_after is not None]
    if not starts or not ends:
        return None
    return _round1(float(starts[0].handicap_before) - float(ends[-1].handicap_after))


# ── core aggregation ──────────────────────────────────────────────────────────

def _coach_summary(coach, frm, to):
    """Headline metrics for one coach over the window. Shared by the overview
    list and the detail endpoint."""
    juniors = (
        JuniorProfile.query.filter(JuniorProfile.coach_id == coach.id).all()
    )

    # Sessions run (completed, in window) + by-type breakdown + billable 1-on-1s.
    sessions = (
        Session.query
        .filter(Session.coach_id == coach.id)
        .filter(Session.status == SessionStatus.completed)
        .filter(Session.date >= frm, Session.date <= to)
        .all()
    )
    by_type = {t.value: 0 for t in SessionType}
    for s in sessions:
        by_type[s.session_type.value] += 1

    session_ids = [s.id for s in sessions]

    # Attendance across this coach's completed sessions in the window.
    att_records = (
        Attendance.query.filter(Attendance.session_id.in_(session_ids)).all()
        if session_ids else []
    )
    present = sum(1 for a in att_records if a.status == AttendanceStatus.present)
    att_total = len(att_records)
    attendance_rate = round(present / att_total, 3) if att_total else None

    # 1-on-1 sessions are billable (track + count only — no rates).
    one_on_one_ids = [
        s.id for s in sessions if s.session_type == SessionType.one_on_one
    ]
    billable_attendees = sum(
        1 for a in att_records
        if a.session_id in set(one_on_one_ids) and a.status == AttendanceStatus.present
    )

    # Evaluations authored by this coach in the window (report_month in range).
    evals = (
        Evaluation.query
        .filter(Evaluation.coach_id == coach.id)
        .filter(Evaluation.report_month >= frm, Evaluation.report_month <= to)
        .all()
    )
    eval_mix = {a.value: 0 for a in EvaluationAssessment}
    move_next = 0
    for e in evals:
        eval_mix[e.assessment.value] += 1
        if e.recommendation == EvaluationRecommendation.move_next_level:
            move_next += 1

    # Level progress + handicap improvement across assigned juniors.
    levels = [j.current_level for j in juniors if j.current_level is not None]
    avg_level = round(sum(levels) / len(levels), 1) if levels else None

    changes = []
    juniors_with_handicap = 0
    for j in juniors:
        if j.has_handicap:
            juniors_with_handicap += 1
        change = _handicap_change(j.user_id, frm, to)
        if change is not None:
            changes.append(change)
    avg_handicap_change = round(sum(changes) / len(changes), 1) if changes else None

    return {
        "coach_id": coach.id,
        "coach_name": _coach_name(coach),
        "junior_count": len(juniors),
        "sessions_run": len(sessions),
        "sessions_by_type": by_type,
        "billable_one_on_one": {
            "count": len(one_on_one_ids),
            "attendees": billable_attendees,
        },
        "attendance": {
            "present": present,
            "total": att_total,
            "rate": attendance_rate,
        },
        "evaluations": {
            "total": len(evals),
            **eval_mix,
            "move_next_level": move_next,
        },
        "avg_current_level": avg_level,
        "avg_handicap_change": avg_handicap_change,
        "juniors_with_handicap": juniors_with_handicap,
    }


def list_coach_analytics(date_from=None, date_to=None):
    """Overview: one summary row per coach for the window."""
    frm, to = parse_window(date_from, date_to)
    coaches = (
        User.query
        .filter(User.role == UserRole.coach, User.is_active.is_(True))
        .order_by(User.first_name, User.last_name)
        .all()
    )
    rows = [_coach_summary(c, frm, to) for c in coaches]
    return {
        "window": {"date_from": frm.isoformat(), "date_to": to.isoformat()},
        "coaches": rows,
    }


def get_coach_analytics(coach_id, date_from=None, date_to=None):
    """Detail for one coach: summary + sessions timeline + per-junior breakdown.
    Returns (payload, None) or (None, error_message) for a 404."""
    coach = User.query.filter(User.id == coach_id).first()
    if coach is None:
        return None, "Coach not found"
    role_val = coach.role.value if hasattr(coach.role, "value") else str(coach.role)
    if role_val != "coach":
        return None, "Coach not found"

    frm, to = parse_window(date_from, date_to)
    summary = _coach_summary(coach, frm, to)

    # Sessions timeline (completed, in window) with attendance counts.
    sessions = (
        Session.query
        .filter(Session.coach_id == coach.id)
        .filter(Session.status == SessionStatus.completed)
        .filter(Session.date >= frm, Session.date <= to)
        .order_by(Session.date.desc(), Session.start_time.desc())
        .all()
    )
    timeline = []
    for s in sessions:
        recs = [a for a in s.attendance]
        timeline.append({
            "id": s.id,
            "date": s.date.isoformat(),
            "session_type": s.session_type.value,
            "title": s.title,
            "billable": s.session_type == SessionType.one_on_one,
            "present": sum(1 for a in recs if a.status == AttendanceStatus.present),
            "total": len(recs),
        })

    # Per-junior performance breakdown.
    juniors = (
        JuniorProfile.query.filter(JuniorProfile.coach_id == coach.id).all()
    )
    junior_rows = []
    for j in juniors:
        latest = (
            Evaluation.query
            .filter(Evaluation.junior_id == j.id)
            .order_by(Evaluation.report_month.desc())
            .first()
        )
        user = j.user
        full_name = (
            f"{user.first_name} {user.last_name}".strip() if user else ""
        ) or (user.email if user else f"Junior #{j.id}")
        junior_rows.append({
            "junior_id": j.id,
            "user_id": j.user_id,
            "full_name": full_name,
            "current_level": j.current_level,
            "band_label": j.band.band_label if j.band else None,
            "has_handicap": j.has_handicap,
            "handicap_index": _decimal(j.handicap_index),
            "handicap_change": _handicap_change(j.user_id, frm, to),
            "latest_assessment": latest.assessment.value if latest else None,
            "latest_recommendation": latest.recommendation.value if latest else None,
            "latest_eval_month": latest.report_month.isoformat() if latest else None,
        })
    junior_rows.sort(key=lambda r: r["full_name"].lower())

    payload = dict(summary)
    payload["window"] = {"date_from": frm.isoformat(), "date_to": to.isoformat()}
    payload["sessions"] = timeline
    payload["juniors"] = junior_rows
    return payload, None
