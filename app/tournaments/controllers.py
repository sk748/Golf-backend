"""
Junior Tournaments domain — controllers.

CRUD plus the computed/authoritative endpoints (score submission with handicap
integration, leaderboard, bracket generation + advancement, series standings,
combined junior competition history). Mirrors the house style: SimpleModelSchema
for serialization, plain functions returning models or (result, error) tuples.
"""

import json
import math
import random
from datetime import date as date_cls
from decimal import Decimal

from app.database.database import db
from app.utils.schemas import SimpleModelSchema
from app.tournaments.models import (
    Tournament, TournamentDivision, TournamentEntry, TournamentScore,
    TournamentHoleScore, TournamentMatch, ExternalResult, Series,
)
from app.tournaments import scoring

# ── Schemas ─────────────────────────────────────────────────────────────────────
tournament_schema = SimpleModelSchema(Tournament)
tournaments_schema = SimpleModelSchema(Tournament, many=True)
division_schema = SimpleModelSchema(TournamentDivision)
divisions_schema = SimpleModelSchema(TournamentDivision, many=True)
entry_schema = SimpleModelSchema(TournamentEntry)
entries_schema = SimpleModelSchema(TournamentEntry, many=True)
score_schema = SimpleModelSchema(TournamentScore)
scores_schema = SimpleModelSchema(TournamentScore, many=True)
thole_schema = SimpleModelSchema(TournamentHoleScore)
tholes_schema = SimpleModelSchema(TournamentHoleScore, many=True)
match_schema = SimpleModelSchema(TournamentMatch)
matches_schema = SimpleModelSchema(TournamentMatch, many=True)
external_schema = SimpleModelSchema(ExternalResult)
externals_schema = SimpleModelSchema(ExternalResult, many=True)
series_schema = SimpleModelSchema(Series)
series_list_schema = SimpleModelSchema(Series, many=True)


# An (code, message, http_status) error tuple, or None on success.
def _e(code, message, status):
    return (code, message, status)


# ── Tournaments CRUD ─────────────────────────────────────────────────────────────

def list_tournaments(status=None, format=None, series_id=None, date_from=None, date_to=None):
    q = Tournament.query
    if status:
        q = q.filter_by(status=status)
    if format:
        q = q.filter_by(format=format)
    if series_id:
        q = q.filter_by(series_id=series_id)
    if date_from:
        q = q.filter(Tournament.start_date >= date_from)
    if date_to:
        q = q.filter(Tournament.start_date <= date_to)
    return q.order_by(Tournament.start_date.desc()).all()


def get_tournament(tid):
    return db.session.get(Tournament, tid)


def create_tournament(data):
    t = tournament_schema.load(data)
    db.session.add(t)
    db.session.commit()
    return t


def update_tournament(t, data):
    for k, v in data.items():
        if k in {"id", "created_at", "updated_at"}:
            continue
        setattr(t, k, v)
    db.session.commit()
    return t


def delete_tournament(t):
    db.session.delete(t)
    db.session.commit()


# ── Divisions CRUD ───────────────────────────────────────────────────────────────

def list_divisions(tournament_id=None):
    q = TournamentDivision.query
    if tournament_id:
        q = q.filter_by(tournament_id=tournament_id)
    return q.order_by(TournamentDivision.id).all()


def get_division(did):
    return db.session.get(TournamentDivision, did)


def create_division(data):
    d = division_schema.load(data)
    db.session.add(d)
    db.session.commit()
    return d


def update_division(d, data):
    for k, v in data.items():
        if k in {"id", "created_at", "updated_at"}:
            continue
        setattr(d, k, v)
    db.session.commit()
    return d


def delete_division(d):
    db.session.delete(d)
    db.session.commit()


def _auto_assign_division(tournament, junior, on_date):
    """Return the first division whose criteria the junior matches, or None."""
    for d in tournament.divisions:
        if d.gender is not None and (junior.gender.value if hasattr(junior.gender, "value") else junior.gender) != d.gender:
            continue
        if d.age_min is not None or d.age_max is not None:
            age = scoring.compute_age(junior.date_of_birth, on_date)
            if d.age_min is not None and age < d.age_min:
                continue
            if d.age_max is not None and age > d.age_max:
                continue
        if d.level_min is not None and junior.current_level < d.level_min:
            continue
        if d.level_max is not None and junior.current_level > d.level_max:
            continue
        hi = float(junior.handicap_index) if junior.handicap_index is not None else None
        if d.handicap_min is not None and (hi is None or hi < float(d.handicap_min)):
            continue
        if d.handicap_max is not None and (hi is None or hi > float(d.handicap_max)):
            continue
        return d
    return None


# ── Entries (registration) ───────────────────────────────────────────────────────

def list_entries(tournament_id=None, junior_id=None, division_id=None, status=None):
    q = TournamentEntry.query
    if tournament_id:
        q = q.filter_by(tournament_id=tournament_id)
    if junior_id:
        q = q.filter_by(junior_id=junior_id)
    if division_id:
        q = q.filter_by(division_id=division_id)
    if status:
        q = q.filter_by(status=status)
    return q.order_by(TournamentEntry.id).all()


def get_entry(eid):
    return db.session.get(TournamentEntry, eid)


def create_entry(data, registered_by):
    """Register a junior. Validates status + eligibility + uniqueness.
    Returns (entry, error_tuple)."""
    from app.juniors.models import JuniorProfile

    tournament = get_tournament(data.get("tournament_id"))
    if tournament is None:
        return None, _e("NOT_FOUND", "Tournament not found", 404)
    if tournament.status != "registration_open" and (
        getattr(tournament.status, "value", tournament.status) != "registration_open"
    ):
        return None, _e("INVALID_STATUS", "Registration is not open for this tournament", 400)

    junior = db.session.get(JuniorProfile, data.get("junior_id"))
    if junior is None:
        return None, _e("NOT_FOUND", "Junior not found", 404)

    # Uniqueness
    existing = TournamentEntry.query.filter_by(
        tournament_id=tournament.id, junior_id=junior.id
    ).first()
    if existing is not None:
        return None, _e("CONFLICT", "Junior already registered for this tournament", 409)

    # Max entrants
    if tournament.max_entrants is not None:
        count = TournamentEntry.query.filter(
            TournamentEntry.tournament_id == tournament.id,
            TournamentEntry.status != "withdrawn",
        ).count()
        if count >= tournament.max_entrants:
            return None, _e("FULL", "Tournament has reached its maximum entrants", 400)

    # Eligibility
    ok, reason = scoring.check_eligibility(tournament, junior, tournament.start_date)
    if not ok:
        return None, _e("INELIGIBLE", reason, 400)

    division_id = data.get("division_id")
    if division_id is None:
        auto = _auto_assign_division(tournament, junior, tournament.start_date)
        division_id = auto.id if auto else None

    entry = TournamentEntry(
        tournament_id=tournament.id,
        junior_id=junior.id,
        division_id=division_id,
        registered_by=registered_by,
        status=data.get("status", "registered"),
        registered_at=date_cls.today(),
    )
    db.session.add(entry)
    db.session.commit()
    return entry, None


def update_entry(entry, data):
    for k in ("status", "division_id"):
        if k in data:
            setattr(entry, k, data[k])
    db.session.commit()
    return entry


def delete_entry(entry):
    db.session.delete(entry)
    db.session.commit()


# ── Tee / hole helpers ───────────────────────────────────────────────────────────

def _resolve_tee(tournament, entry):
    """Division tee overrides the tournament default tee."""
    from app.courses.models import TeeSet
    tee_set_id = None
    if entry.division_id:
        div = db.session.get(TournamentDivision, entry.division_id)
        if div and div.tee_set_id:
            tee_set_id = div.tee_set_id
    if tee_set_id is None:
        tee_set_id = tournament.tee_set_id
    if tee_set_id is None:
        return None
    return db.session.get(TeeSet, tee_set_id)


def _holes_meta(course_id):
    """{hole_number: {'par', 'stroke_index'}} for a course."""
    from app.courses.models import Hole
    meta = {}
    for h in Hole.query.filter_by(course_id=course_id).all():
        meta[h.hole_number] = {"par": h.par, "stroke_index": h.stroke_index}
    return meta


def _course_handicap_for_entry(tournament, entry, tee):
    """Course handicap for the entry's junior on the resolved tee; 0 if no index."""
    from app.courses.models import Course
    junior = entry.junior
    if junior is None or junior.handicap_index is None:
        return 0
    course = db.session.get(Course, tee.course_id)
    par = course.par if course else 72
    return scoring.course_handicap_for(
        junior.handicap_index, tee.slope_rating, tee.course_rating, par, tournament.holes
    )


# ── Score submission (computed; spec §8.1 + §9) ─────────────────────────────────

def submit_score(tournament_id, data):
    """Submit one junior's score. Computes course handicap, net, Stableford, and
    (for counting events) creates a WHS round and recomputes the index.
    Returns (result_dict, error_tuple)."""
    from app.courses.models import Course

    tournament = get_tournament(tournament_id)
    if tournament is None:
        return None, _e("NOT_FOUND", "Tournament not found", 404)

    status_val = getattr(tournament.status, "value", tournament.status)
    if status_val != "in_progress":
        return None, _e("INVALID_STATUS", "Scores can only be entered while the tournament is in_progress", 400)

    fmt = getattr(tournament.format, "value", tournament.format)

    entry = get_entry(data.get("entry_id"))
    if entry is None or entry.tournament_id != tournament.id:
        return None, _e("NOT_FOUND", "Entry not found for this tournament", 404)
    if getattr(entry.status, "value", entry.status) == "withdrawn":
        return None, _e("WITHDRAWN", "Cannot score a withdrawn entry", 400)

    tee = _resolve_tee(tournament, entry)
    if tee is None:
        return None, _e("NO_TEE", "No tee set configured for this tournament/division", 400)

    holes_played = int(data.get("holes_played", tournament.holes))
    raw_hole_scores = data.get("hole_scores") or []
    hole_strokes = {}
    for hs in raw_hole_scores:
        hn = int(hs["hole_number"])
        if not 1 <= hn <= 18:
            return None, _e("VALIDATION_ERROR", f"Invalid hole_number {hn}", 400)
        hole_strokes[hn] = int(hs["strokes"])

    gross_score = data.get("gross_score")
    if gross_score is None:
        if not hole_strokes:
            return None, _e("VALIDATION_ERROR", "Provide gross_score or hole_scores", 400)
        gross_score = sum(hole_strokes.values())
    gross_score = int(gross_score)

    course_handicap = _course_handicap_for_entry(tournament, entry, tee)
    net_score = scoring.compute_net_score(gross_score, course_handicap)

    stableford_points = None
    if fmt == "stableford":
        if not hole_strokes:
            return None, _e("VALIDATION_ERROR", "Stableford scoring requires per-hole scores", 400)
        meta = _holes_meta(tee.course_id)
        stableford_points = scoring.compute_stableford(hole_strokes, meta, course_handicap)

    # Upsert score (one per entry)
    sc = TournamentScore.query.filter_by(entry_id=entry.id).first()
    if sc is None:
        sc = TournamentScore(entry_id=entry.id)
        db.session.add(sc)
    sc.holes_played = holes_played
    sc.gross_score = gross_score
    sc.net_score = net_score
    sc.stableford_points = stableford_points
    sc.status = data.get("status", "submitted")

    # Replace hole scores
    for old in list(sc.hole_scores):
        db.session.delete(old)
    db.session.flush()
    for hn, strokes in sorted(hole_strokes.items()):
        db.session.add(TournamentHoleScore(
            tournament_score_id=sc.id, hole_number=hn, strokes=strokes
        ))

    # Handicap integration
    new_index = None
    if tournament.counts_toward_handicap:
        new_index = _create_handicap_round(tournament, entry, tee, gross_score, holes_played, hole_strokes, sc)

    db.session.commit()

    result = score_schema.dump(sc)
    result["course_handicap"] = course_handicap
    if new_index is not None:
        result["new_handicap_index"] = new_index
    return result, None


def _create_handicap_round(tournament, entry, tee, gross_score, holes_played, hole_strokes, score_row):
    """Create a WHS round for a counting event and recompute the junior's index.
    Links score_row.round_id. Returns the new handicap index."""
    from app.auth.models import User
    from app.rounds.models import Round, HoleScore
    from app.whs.controllers import calculate_score_differential, calculate_handicap_index

    junior = entry.junior
    user = db.session.get(User, junior.user_id)
    current_index = float(user.handicap_index) if user and user.handicap_index is not None else 54.0

    differential = calculate_score_differential(
        actual_gross_score=gross_score,
        holes_played=holes_played,
        handicap_index=current_index,
        course_rating=float(tee.course_rating),
        slope_rating=int(tee.slope_rating),
        pcc=0,
    )

    round_obj = Round(
        user_id=junior.user_id,
        course_id=tee.course_id,
        tee_set_id=tee.id,
        date_played=tournament.start_date,
        round_type="tournament",
        competition_name=tournament.name,
        gross_score=gross_score,
        score_differential=Decimal(str(differential)),
        handicap_before=user.handicap_index if user else None,
    )
    db.session.add(round_obj)
    db.session.flush()

    for hn, strokes in sorted(hole_strokes.items()):
        db.session.add(HoleScore(round_id=round_obj.id, hole_number=hn, strokes=strokes))

    score_row.round_id = round_obj.id

    all_diffs = [
        float(r.score_differential)
        for r in Round.query.filter_by(user_id=junior.user_id)
        .order_by(Round.date_played.desc()).limit(20).all()
        if r.score_differential is not None
    ]
    new_index = calculate_handicap_index(all_diffs)
    round_obj.handicap_after = Decimal(str(new_index))
    if user:
        user.handicap_index = Decimal(str(new_index))
    # keep the junior profile's snapshot consistent (eligibility reads it)
    junior.handicap_index = Decimal(str(new_index))
    junior.has_handicap = True
    return new_index


# ── Scores CRUD (read/verify) ───────────────────────────────────────────────────

def list_scores(tournament_id=None, entry_id=None):
    q = TournamentScore.query
    if entry_id:
        q = q.filter_by(entry_id=entry_id)
    if tournament_id:
        q = q.join(TournamentEntry).filter(TournamentEntry.tournament_id == tournament_id)
    return q.order_by(TournamentScore.id).all()


def get_score(sid):
    return db.session.get(TournamentScore, sid)


def update_score(sc, data):
    for k in ("status", "position"):
        if k in data:
            setattr(sc, k, data[k])
    db.session.commit()
    return sc


def delete_score(sc):
    db.session.delete(sc)
    db.session.commit()


# ── Leaderboard (computed; spec §8.2) ───────────────────────────────────────────

def leaderboard(tournament_id):
    tournament = get_tournament(tournament_id)
    if tournament is None:
        return None, _e("NOT_FOUND", "Tournament not found", 404)

    basis = getattr(tournament.scoring_basis, "value", tournament.scoring_basis)
    entries = TournamentEntry.query.filter(
        TournamentEntry.tournament_id == tournament.id,
        TournamentEntry.status != "withdrawn",
    ).all()

    # group rows by division
    groups = {}
    for entry in entries:
        sc = TournamentScore.query.filter_by(entry_id=entry.id).first()
        if sc is None:
            continue
        junior = entry.junior
        name = ""
        if junior and junior.user:
            name = f"{junior.user.first_name} {junior.user.last_name}".strip()
        row = {
            "entry_id": entry.id,
            "junior_id": entry.junior_id,
            "name": name,
            "gross": sc.gross_score,
            "net": sc.net_score,
            "stableford_points": sc.stableford_points,
            "holes_played": sc.holes_played,
            "_score": sc,
        }
        groups.setdefault(entry.division_id, []).append(row)

    divisions = {d.id: d.name for d in tournament.divisions}
    result = []
    for division_id, rows in groups.items():
        ranked = scoring.rank_rows(rows, basis)
        # persist numeric rank for series standings
        for r in ranked:
            r["_score"].position = r["rank"]
        clean = [{k: v for k, v in r.items() if not k.startswith("_")} for r in ranked]
        result.append({
            "division_id": division_id,
            "division": divisions.get(division_id, "Overall"),
            "rows": clean,
        })
    db.session.commit()
    return {"basis": basis, "divisions": result}, None


# ── Match play (computed; spec §8.3) ─────────────────────────────────────────────

def generate_bracket(tournament_id, seed_mode="handicap"):
    tournament = get_tournament(tournament_id)
    if tournament is None:
        return None, _e("NOT_FOUND", "Tournament not found", 404)
    if getattr(tournament.format, "value", tournament.format) != "match_play":
        return None, _e("INVALID_FORMAT", "Bracket generation is only for match_play tournaments", 400)

    entries = TournamentEntry.query.filter_by(
        tournament_id=tournament.id, status="confirmed"
    ).all()
    if len(entries) < 2:
        return None, _e("NOT_ENOUGH_ENTRIES", "Need at least 2 confirmed entries to generate a bracket", 400)

    # Seed order
    if seed_mode == "random":
        random.shuffle(entries)
    else:  # handicap: best (lowest) handicap is the top seed
        entries.sort(key=lambda e: (
            float(e.junior.handicap_index) if e.junior and e.junior.handicap_index is not None else math.inf
        ))
    entry_ids = [e.id for e in entries]

    # Wipe any existing bracket
    TournamentMatch.query.filter_by(tournament_id=tournament.id).delete()
    db.session.flush()

    pot = scoring._next_power_of_two(len(entry_ids))
    total_rounds = max(1, (pot - 1).bit_length())
    round1 = scoring.build_round1_matches(entry_ids)

    # Build skeleton: round 1 populated, later rounds empty
    matches_by_round = {}
    r1 = []
    for pos, (a, b) in enumerate(round1):
        m = TournamentMatch(
            tournament_id=tournament.id, round_number=1, bracket_position=pos,
            player_a_entry_id=a, player_b_entry_id=b, status="scheduled",
        )
        db.session.add(m)
        r1.append(m)
    matches_by_round[1] = r1
    for rnd in range(2, total_rounds + 1):
        count = pot // (2 ** rnd)
        rlist = []
        for pos in range(count):
            m = TournamentMatch(
                tournament_id=tournament.id, round_number=rnd, bracket_position=pos,
                status="scheduled",
            )
            db.session.add(m)
            rlist.append(m)
        matches_by_round[rnd] = rlist
    db.session.flush()

    # Resolve byes in round 1 (opponent is None → other player auto-advances)
    for m in matches_by_round[1]:
        if m.player_a_entry_id is not None and m.player_b_entry_id is None:
            m.winner_entry_id = m.player_a_entry_id
            m.status = "completed"
            m.result_text = "bye"
            _advance(m, matches_by_round)
        elif m.player_b_entry_id is not None and m.player_a_entry_id is None:
            m.winner_entry_id = m.player_b_entry_id
            m.status = "completed"
            m.result_text = "bye"
            _advance(m, matches_by_round)

    db.session.commit()
    return get_bracket(tournament_id)[0], None


def _advance(match, matches_by_round=None):
    """Place a completed match's winner into the next round's slot."""
    next_round = match.round_number + 1
    if matches_by_round is not None:
        nxt_list = matches_by_round.get(next_round)
        nxt = nxt_list[match.bracket_position // 2] if nxt_list and match.bracket_position // 2 < len(nxt_list) else None
    else:
        nxt = TournamentMatch.query.filter_by(
            tournament_id=match.tournament_id, round_number=next_round,
            bracket_position=match.bracket_position // 2,
        ).first()
    if nxt is None:
        return
    if match.bracket_position % 2 == 0:
        nxt.player_a_entry_id = match.winner_entry_id
    else:
        nxt.player_b_entry_id = match.winner_entry_id


def get_bracket(tournament_id):
    tournament = get_tournament(tournament_id)
    if tournament is None:
        return None, _e("NOT_FOUND", "Tournament not found", 404)
    matches = TournamentMatch.query.filter_by(tournament_id=tournament.id).order_by(
        TournamentMatch.round_number, TournamentMatch.bracket_position
    ).all()
    rounds = {}
    for m in matches:
        rounds.setdefault(m.round_number, []).append(match_schema.dump(m))
    out = [{"round_number": rn, "matches": rounds[rn]} for rn in sorted(rounds.keys())]
    return {"tournament_id": tournament.id, "rounds": out}, None


def list_matches(tournament_id=None, round_number=None, status=None):
    q = TournamentMatch.query
    if tournament_id:
        q = q.filter_by(tournament_id=tournament_id)
    if round_number:
        q = q.filter_by(round_number=round_number)
    if status:
        q = q.filter_by(status=status)
    return q.order_by(TournamentMatch.round_number, TournamentMatch.bracket_position).all()


def get_match(mid):
    return db.session.get(TournamentMatch, mid)


def update_match(match, data):
    """Set winner_entry_id + result_text; on completion advance the winner.
    Returns (match, error_tuple)."""
    if "winner_entry_id" in data and data["winner_entry_id"] is not None:
        winner = data["winner_entry_id"]
        if winner not in (match.player_a_entry_id, match.player_b_entry_id):
            return None, _e("VALIDATION_ERROR", "winner_entry_id must be one of the match's two entries", 400)
        match.winner_entry_id = winner
        match.status = "completed"
    if "result_text" in data:
        match.result_text = data["result_text"]
    if "scheduled_date" in data:
        match.scheduled_date = data["scheduled_date"]
    if "status" in data:
        match.status = data["status"]

    if getattr(match.status, "value", match.status) == "completed" and match.winner_entry_id:
        _advance(match)
    db.session.commit()
    return match, None


def match_detail(mid):
    """Match with its stroke allocation (difference in course handicaps)."""
    match = get_match(mid)
    if match is None:
        return None, _e("NOT_FOUND", "Match not found", 404)
    tournament = get_tournament(match.tournament_id)
    data = match_schema.dump(match)

    if match.player_a_entry_id and match.player_b_entry_id:
        ea = get_entry(match.player_a_entry_id)
        eb = get_entry(match.player_b_entry_id)
        tee_a = _resolve_tee(tournament, ea)
        tee_b = _resolve_tee(tournament, eb)
        if tee_a and tee_b:
            ch_a = _course_handicap_for_entry(tournament, ea, tee_a)
            ch_b = _course_handicap_for_entry(tournament, eb, tee_b)
            meta = _holes_meta(tee_a.course_id)
            data["stroke_allocation"] = scoring.match_stroke_allocation(ch_a, ch_b, meta)
            data["course_handicap_a"] = ch_a
            data["course_handicap_b"] = ch_b
    return data, None


# ── External results CRUD (spec §5.7) ───────────────────────────────────────────

def list_external_results(junior_id=None, event_type=None, date_from=None, date_to=None):
    q = ExternalResult.query
    if junior_id:
        q = q.filter_by(junior_id=junior_id)
    if event_type:
        q = q.filter_by(event_type=event_type)
    if date_from:
        q = q.filter(ExternalResult.date >= date_from)
    if date_to:
        q = q.filter(ExternalResult.date <= date_to)
    return q.order_by(ExternalResult.date.desc()).all()


def get_external_result(rid):
    return db.session.get(ExternalResult, rid)


def create_external_result(data, logged_by, verified=True):
    """Staff-logged results are verified at creation; parent-logged ones wait
    for a staff verification before feeding the junior's stats (decision 11)."""
    r = external_schema.load(data)
    r.logged_by = logged_by
    r.verified = verified
    r.verified_by = logged_by if verified else None
    db.session.add(r)
    db.session.commit()
    return r


def update_external_result(r, data):
    for k, v in data.items():
        if k in {"id", "created_at", "updated_at", "logged_by", "verified", "verified_by"}:
            continue
        setattr(r, k, v)
    db.session.commit()
    return r


def verify_external_result(r, verifier_id):
    """Staff verification (idempotent)."""
    if not r.verified:
        r.verified = True
        r.verified_by = verifier_id
        db.session.commit()
    return r


def delete_external_result(r):
    db.session.delete(r)
    db.session.commit()


# ── Combined junior competition history (spec §8.5) ─────────────────────────────

def junior_competitions(junior_id, date_from=None, date_to=None):
    """Internal entries (with scores) + external results in the window. Feeds the
    monthly evaluation's 'competitions played' / 'best gross' stats."""
    internal = []
    best_gross = None
    entries = TournamentEntry.query.filter_by(junior_id=junior_id).all()
    for entry in entries:
        tournament = get_tournament(entry.tournament_id)
        if tournament is None:
            continue
        if date_from and tournament.start_date < date_from:
            continue
        if date_to and tournament.start_date > date_to:
            continue
        sc = TournamentScore.query.filter_by(entry_id=entry.id).first()
        row = {
            "tournament_id": tournament.id,
            "tournament_name": tournament.name,
            "date": tournament.start_date.isoformat(),
            "format": getattr(tournament.format, "value", tournament.format),
            "gross_score": sc.gross_score if sc else None,
            "net_score": sc.net_score if sc else None,
            "stableford_points": sc.stableford_points if sc else None,
            "position": sc.position if sc else None,
        }
        internal.append(row)
        if sc and sc.gross_score is not None:
            best_gross = sc.gross_score if best_gross is None else min(best_gross, sc.gross_score)

    # Externals are all LISTED (rows carry their verified flag) but only
    # verified ones feed the stats (decision 11: parents log, staff verify).
    external = []
    verified_external_count = 0
    for r in list_external_results(junior_id=junior_id, date_from=date_from, date_to=date_to):
        external.append(external_schema.dump(r))
        if r.verified:
            verified_external_count += 1
            if r.gross_score is not None:
                best_gross = r.gross_score if best_gross is None else min(best_gross, r.gross_score)

    return {
        "junior_id": junior_id,
        "competitions_played": len(internal) + verified_external_count,
        "best_gross_score": best_gross,
        "internal": internal,
        "external": external,
    }


# ── Series CRUD + standings (spec §8.4) ─────────────────────────────────────────

def list_series(year=None):
    q = Series.query
    if year:
        q = q.filter_by(year=year)
    return q.order_by(Series.year.desc()).all()


def get_series(sid):
    return db.session.get(Series, sid)


def create_series(data):
    s = series_schema.load(data)
    db.session.add(s)
    db.session.commit()
    return s


def update_series(s, data):
    for k, v in data.items():
        if k in {"id", "created_at", "updated_at"}:
            continue
        setattr(s, k, v)
    db.session.commit()
    return s


def delete_series(s):
    db.session.delete(s)
    db.session.commit()


def series_standings(series_id):
    s = get_series(series_id)
    if s is None:
        return None, _e("NOT_FOUND", "Series not found", 404)
    try:
        scheme = json.loads(s.points_scheme) if s.points_scheme else {}
    except (ValueError, TypeError):
        scheme = {}

    totals = {}  # junior_id -> {name, points, events}
    completed = Tournament.query.filter_by(series_id=s.id, status="completed").all()
    for t in completed:
        for entry in t.entries:
            sc = TournamentScore.query.filter_by(entry_id=entry.id).first()
            if sc is None or sc.position is None:
                continue
            pts = int(scheme.get(str(sc.position), 0))
            junior = entry.junior
            name = ""
            if junior and junior.user:
                name = f"{junior.user.first_name} {junior.user.last_name}".strip()
            rec = totals.setdefault(entry.junior_id, {"junior_id": entry.junior_id, "name": name, "points": 0, "events": 0})
            rec["points"] += pts
            rec["events"] += 1

    standings = sorted(totals.values(), key=lambda r: -r["points"])
    for i, r in enumerate(standings):
        r["rank"] = i + 1
    return {"series_id": s.id, "name": s.name, "standings": standings}, None
