"""
Reports for analysis — read-only aggregation behind the downloadable exports.

Two builders, both reusing existing controllers (no new math, no new tables):
  • build_junior_report    — one junior's attendance / evaluations / handicap
    trend / competition history. Identity fields are an explicit allowlist:
    these land in a downloadable file, so medical_conditions, date_of_birth
    and contact details are deliberately never included.
  • build_programme_report — club-wide AGGREGATES only (distributions, rates,
    averages via SQL group-bys). Deliberately never row-per-junior: a mass
    export must not embed any junior's individual data.
"""

from sqlalchemy import func

from app.attendance.controllers import summarize_attendance
from app.attendance.models import Attendance
from app.database.database import db
from app.evaluations.models import Evaluation
from app.handicap.controllers import (
    DEFAULT_TARGET_SIGNED_CARDS, compute_progress, get_journey,
)
from app.juniors.controllers import get_junior_progress
from app.juniors.models import JuniorProfile, LevelBand
from app.league.models import LeagueFixture
from app.rounds.controllers import get_handicap_history
from app.rounds.models import Round, RoundStatus
from app.sessions.models import Session
from app.tournaments.controllers import (
    competition_requirements, junior_competitions,
)
from app.tournaments.models import ExternalResult, Tournament, TournamentEntry


def _window(date_from, date_to):
    return {
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
    }


# ── per-junior report ─────────────────────────────────────────────────────────

def build_junior_report(junior, date_from=None, date_to=None):
    progress, _ = get_junior_progress(junior.id)

    evaluations = progress["evaluations"]
    if date_from:
        evaluations = [e for e in evaluations if e["report_month"] >= date_from.isoformat()]
    if date_to:
        evaluations = [e for e in evaluations if e["report_month"] <= date_to.isoformat()]
    assessment_mix = {
        "below_expectation": sum(1 for e in evaluations if e["assessment"] == "below_expectation"),
        "meeting_expectation": sum(1 for e in evaluations if e["assessment"] == "meeting_expectation"),
        "exceeding_expectation": sum(1 for e in evaluations if e["assessment"] == "exceeding_expectation"),
    }
    latest = evaluations[-1] if evaluations else None

    journey = get_journey(junior.id)
    target = journey.target_signed_cards if journey else DEFAULT_TARGET_SIGNED_CARDS

    history = []
    # compute_progress / get_handicap_history take the linked USER's id
    # (Round.user_id), not the junior/profile id.
    for r in get_handicap_history(junior.user_id):
        if date_from and r.date_played < date_from:
            continue
        if date_to and r.date_played > date_to:
            continue
        history.append({
            "date_played": r.date_played.isoformat(),
            "gross_score": r.gross_score,
            "score_differential": float(r.score_differential) if r.score_differential is not None else None,
            "handicap_after": float(r.handicap_after) if r.handicap_after is not None else None,
            "counts_toward_handicap": r.counts_toward_handicap,
            "status": getattr(r.status, "value", r.status),
        })

    requirements, _ = competition_requirements(
        junior.id, season=date_to.year if date_to else None
    )

    user = junior.user
    return {
        "junior": {
            "junior_id": junior.id,
            "full_name": f"{user.first_name} {user.last_name}".strip() if user else "",
            "band": junior.band.band_label if junior.band else None,
            "current_level": junior.current_level,
        },
        "window": _window(date_from, date_to),
        "attendance": summarize_attendance(junior.id, date_from=date_from, date_to=date_to),
        "evaluations": {
            "items": evaluations,
            "assessment_mix": assessment_mix,
            "latest_recommendation": latest["recommendation"] if latest else None,
        },
        "handicap_progress": compute_progress(junior.user_id, target),
        "handicap_history": history,
        "competitions": junior_competitions(junior.id, date_from=date_from, date_to=date_to),
        "competition_requirements": requirements,
    }


# ── programme-wide report (aggregates only) ──────────────────────────────────

def build_programme_report(date_from=None, date_to=None):
    band_rows = (
        db.session.query(LevelBand.band_label, func.count(JuniorProfile.id))
        .outerjoin(JuniorProfile, JuniorProfile.band_id == LevelBand.id)
        .group_by(LevelBand.id, LevelBand.band_label, LevelBand.min_level)
        .order_by(LevelBand.min_level)
        .all()
    )

    att_date = func.coalesce(Session.date, LeagueFixture.date)
    att_q = (
        db.session.query(Attendance.status, func.count(Attendance.id))
        .outerjoin(Session, Attendance.session_id == Session.id)
        .outerjoin(LeagueFixture, Attendance.league_fixture_id == LeagueFixture.id)
    )
    if date_from:
        att_q = att_q.filter(att_date >= date_from)
    if date_to:
        att_q = att_q.filter(att_date <= date_to)
    status_counts = {
        getattr(s, "value", s): n for s, n in att_q.group_by(Attendance.status).all()
    }
    present = status_counts.get("present", 0)
    total = sum(status_counts.values())

    eval_q = db.session.query(Evaluation.assessment, func.count(Evaluation.id))
    if date_from:
        eval_q = eval_q.filter(Evaluation.report_month >= date_from)
    if date_to:
        eval_q = eval_q.filter(Evaluation.report_month <= date_to)
    mix = {
        getattr(a, "value", a): n
        for a, n in eval_q.group_by(Evaluation.assessment).all()
    }

    trend_q = (
        db.session.query(
            func.extract("year", Round.date_played).label("y"),
            func.extract("month", Round.date_played).label("m"),
            func.avg(Round.handicap_after),
        )
        .filter(Round.status == RoundStatus.verified)
        .filter(Round.counts_toward_handicap.is_(True))
        .filter(Round.handicap_after.isnot(None))
    )
    if date_from:
        trend_q = trend_q.filter(Round.date_played >= date_from)
    if date_to:
        trend_q = trend_q.filter(Round.date_played <= date_to)
    trend = [
        {"month": f"{int(y):04d}-{int(m):02d}", "avg_handicap_index": round(float(avg), 1)}
        for y, m, avg in trend_q.group_by("y", "m").order_by("y", "m").all()
    ]

    current_avg = (
        db.session.query(func.avg(JuniorProfile.handicap_index))
        .filter(JuniorProfile.handicap_index.isnot(None))
        .scalar()
    )

    entry_q = db.session.query(
        func.count(TournamentEntry.id),
        func.count(func.distinct(TournamentEntry.junior_id)),
    ).join(Tournament, TournamentEntry.tournament_id == Tournament.id)
    if date_from:
        entry_q = entry_q.filter(Tournament.start_date >= date_from)
    if date_to:
        entry_q = entry_q.filter(Tournament.start_date <= date_to)
    internal_entries, internal_juniors = entry_q.one()

    ext_q = db.session.query(
        func.count(ExternalResult.id),
        func.count(func.distinct(ExternalResult.junior_id)),
    ).filter(ExternalResult.verified.is_(True))
    if date_from:
        ext_q = ext_q.filter(ExternalResult.date >= date_from)
    if date_to:
        ext_q = ext_q.filter(ExternalResult.date <= date_to)
    external_results, external_juniors = ext_q.one()

    return {
        "window": _window(date_from, date_to),
        "juniors_total": JuniorProfile.query.count(),
        "band_distribution": [
            {"band": label, "juniors": n} for label, n in band_rows
        ],
        "attendance": {
            "present": present,
            "absent": status_counts.get("absent", 0),
            "excused": status_counts.get("excused", 0),
            "total": total,
            "rate": round(present / total, 3) if total else None,
        },
        "evaluation_assessments": {
            "below_expectation": mix.get("below_expectation", 0),
            "meeting_expectation": mix.get("meeting_expectation", 0),
            "exceeding_expectation": mix.get("exceeding_expectation", 0),
        },
        "handicap": {
            "current_avg_index": round(float(current_avg), 1) if current_avg is not None else None,
            "monthly_avg_trend": trend,
        },
        "tournament_participation": {
            "internal_entries": internal_entries,
            "internal_juniors": internal_juniors,
            "verified_external_results": external_results,
            "external_juniors": external_juniors,
        },
    }
