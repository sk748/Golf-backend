from decimal import Decimal

from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError

from app.database.database import db
from app.tournaments.models import (
    Tournament, Team, Match, Penalty,
    MatchResult, PenaltyType,
)
from app.utils.schemas import SimpleModelSchema

tournament_schema = SimpleModelSchema(Tournament)
tournaments_schema = SimpleModelSchema(Tournament, many=True)
team_schema = SimpleModelSchema(Team)
teams_schema = SimpleModelSchema(Team, many=True)
match_schema = SimpleModelSchema(Match)
matches_schema = SimpleModelSchema(Match, many=True)
penalty_schema = SimpleModelSchema(Penalty)
penalties_schema = SimpleModelSchema(Penalty, many=True)


# ── Tournaments ──────────────────────────────────────────────────────────────

def list_tournaments(year=None, status=None):
    q = Tournament.query
    if year:
        q = q.filter_by(year=year)
    if status:
        q = q.filter_by(status=status)
    return q.all()


def get_tournament(tournament_id: int):
    return db.session.get(Tournament, tournament_id)


def create_tournament(data: dict):
    t = tournament_schema.load(data)
    db.session.add(t)
    db.session.commit()
    return t


def update_tournament(t, data: dict):
    for k, v in data.items():
        setattr(t, k, v)
    db.session.commit()
    return t


def delete_tournament(t):
    db.session.delete(t)
    db.session.commit()


# ── Teams ────────────────────────────────────────────────────────────────────

def list_teams(tournament_id=None, search=None):
    q = Team.query
    if tournament_id:
        q = q.filter_by(tournament_id=tournament_id)
    if search:
        q = q.filter(Team.name.ilike(f"%{search}%"))
    return q.all()


def get_team(team_id: int):
    return db.session.get(Team, team_id)


def create_team(data: dict):
    team = team_schema.load(data)
    db.session.add(team)
    db.session.commit()
    return team


def update_team(team, data: dict):
    for k, v in data.items():
        setattr(team, k, v)
    db.session.commit()
    return team


def delete_team(team):
    db.session.delete(team)
    db.session.commit()


# ── Matches ───────────────────────────────────────────────────────────────────

def list_matches(tournament_id=None, stage=None, result=None, team_id=None,
                 date_from=None, date_to=None):
    q = Match.query
    if tournament_id:
        q = q.filter_by(tournament_id=tournament_id)
    if stage:
        q = q.filter_by(stage=stage)
    if result:
        q = q.filter_by(result=result)
    if team_id:
        q = q.filter(or_(Match.team_a_id == team_id, Match.team_b_id == team_id))
    if date_from:
        q = q.filter(Match.match_date >= date_from)
    if date_to:
        q = q.filter(Match.match_date <= date_to)
    return q.all()


def get_match(match_id: int):
    return db.session.get(Match, match_id)


def create_match(data: dict):
    _validate_match(data)
    m = match_schema.load(data)
    db.session.add(m)
    db.session.commit()
    return m


def update_match(m, data: dict):
    _validate_match(data, instance=m)
    for k, v in data.items():
        setattr(m, k, v)
    db.session.commit()
    return m


def delete_match(m):
    db.session.delete(m)
    db.session.commit()


def _validate_match(data: dict, instance=None):
    team_a_id = data.get("team_a_id", getattr(instance, "team_a_id", None))
    team_b_id = data.get("team_b_id", getattr(instance, "team_b_id", None))
    result = data.get("result", getattr(instance, "result", None))
    winner_id = data.get("winner_id", getattr(instance, "winner_id", None))
    if team_a_id and team_b_id and team_a_id == team_b_id:
        raise ValueError("team_a_id and team_b_id must be different")
    if result == MatchResult.tie.value and winner_id is not None:
        raise ValueError("winner_id must be null when result is tie")
    if winner_id is not None and winner_id not in (team_a_id, team_b_id):
        raise ValueError("winner_id must equal team_a_id or team_b_id")


# ── Penalties ─────────────────────────────────────────────────────────────────

def list_penalties(team_id=None, match_id=None, penalty_type=None):
    q = Penalty.query
    if team_id:
        q = q.filter_by(team_id=team_id)
    if match_id:
        q = q.filter_by(match_id=match_id)
    if penalty_type:
        q = q.filter_by(penalty_type=penalty_type)
    return q.all()


def get_penalty(penalty_id: int):
    return db.session.get(Penalty, penalty_id)


def create_penalty(data: dict):
    _validate_penalty(data)
    p = penalty_schema.load(data)
    db.session.add(p)
    db.session.commit()
    return p


def update_penalty(p, data: dict):
    for k, v in data.items():
        setattr(p, k, v)
    db.session.commit()
    return p


def delete_penalty(p):
    db.session.delete(p)
    db.session.commit()


def _validate_penalty(data: dict):
    match_id = data.get("match_id")
    team_id = data.get("team_id")
    if match_id and team_id:
        m = db.session.get(Match, match_id)
        if m and team_id not in (m.team_a_id, m.team_b_id):
            raise ValueError("team_id must be one of the match teams")


# ── Leaderboard ───────────────────────────────────────────────────────────────

def _h2h_score(tournament_id, team_a_id, team_b_id):
    matches = Match.query.filter(
        Match.tournament_id == tournament_id,
        Match.result.isnot(None),
        or_(
            and_(Match.team_a_id == team_a_id, Match.team_b_id == team_b_id),
            and_(Match.team_a_id == team_b_id, Match.team_b_id == team_a_id),
        ),
    ).all()
    wins_a = sum(1 for m in matches if m.winner_id == team_a_id)
    wins_b = sum(1 for m in matches if m.winner_id == team_b_id)
    return wins_a - wins_b


def get_leaderboard(tournament_id: int):
    tournament = db.session.get(Tournament, tournament_id)
    if tournament is None:
        return None, "Tournament not found"

    rows = []
    for team in Team.query.filter_by(tournament_id=tournament_id, is_active=True).order_by(Team.id).all():
        played_matches = Match.query.filter(
            Match.tournament_id == tournament_id,
            Match.result.isnot(None),
            or_(Match.team_a_id == team.id, Match.team_b_id == team.id),
        ).all()
        wins = sum(1 for m in played_matches if m.winner_id == team.id)
        ties = sum(1 for m in played_matches if m.result == MatchResult.tie)
        played = len(played_matches)
        losses = played - wins - ties
        match_points = (wins * tournament.points_win + ties * tournament.points_tie
                        + losses * tournament.points_loss)
        late_penalty = (Penalty.query.filter_by(team_id=team.id, penalty_type=PenaltyType.late_cancel).count()
                        * tournament.penalty_late_cancel)
        declined_penalty = (Penalty.query.filter_by(team_id=team.id, penalty_type=PenaltyType.declined_invite).count()
                            * tournament.penalty_declined)
        total_points = match_points + late_penalty + declined_penalty
        rows.append({
            "team_id": team.id, "team_name": team.name,
            "played": played, "wins": wins, "ties": ties, "losses": losses,
            "match_points": match_points, "late_cancel_penalty": late_penalty,
            "declined_penalty": declined_penalty, "total_points": total_points,
        })

    rows.sort(key=lambda r: r["total_points"], reverse=True)
    i = 0
    while i < len(rows) - 1:
        if rows[i]["total_points"] == rows[i + 1]["total_points"]:
            if _h2h_score(tournament_id, rows[i]["team_id"], rows[i + 1]["team_id"]) < 0:
                rows[i], rows[i + 1] = rows[i + 1], rows[i]
        i += 1

    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
        row["qualified"] = (
            tournament.min_games <= row["played"] <= tournament.max_games
            and rank <= tournament.qualify_top_n
        )

    return rows, None


def get_head_to_head(tournament_id: int, team_a: int, team_b: int):
    matches = Match.query.filter(
        Match.tournament_id == tournament_id,
        Match.result.isnot(None),
        or_(
            and_(Match.team_a_id == team_a, Match.team_b_id == team_b),
            and_(Match.team_a_id == team_b, Match.team_b_id == team_a),
        ),
    ).all()
    wins_a = sum(1 for m in matches if m.winner_id == team_a)
    wins_b = sum(1 for m in matches if m.winner_id == team_b)
    ties = sum(1 for m in matches if m.result == MatchResult.tie)
    if not matches:
        winner = "not_played"
    elif wins_a > wins_b:
        winner = team_a
    elif wins_b > wins_a:
        winner = team_b
    else:
        winner = "tied"
    return {"times_played": len(matches), "team_a_wins": wins_a,
            "team_b_wins": wins_b, "ties": ties, "winner": winner}


def get_stroke_calc(match_id: int):
    from app.courses.models import Hole
    m = db.session.get(Match, match_id)
    if m is None:
        return None, "Match not found"
    tournament = m.tournament
    best_a = min(Decimal(m.team_a.player_1_handicap), Decimal(m.team_a.player_2_handicap))
    best_b = min(Decimal(m.team_b.player_1_handicap), Decimal(m.team_b.player_2_handicap))
    raw_diff = abs(best_a - best_b)
    ninety = round(raw_diff * Decimal(tournament.handicap_allowance))
    strokes = min(int(ninety), tournament.max_stroke_diff)
    receiving_team_id = None if best_a == best_b else (m.team_a_id if best_a > best_b else m.team_b_id)
    holes = Hole.query.order_by(Hole.hole_number).limit(18).all()
    return {
        "team_a_best": float(best_a), "team_b_best": float(best_b),
        "raw_diff": float(raw_diff), "ninety": int(ninety), "strokes": strokes,
        "receiving_team_id": receiving_team_id,
        "holes": [{"hole": h.hole_number, "stroke_index": h.stroke_index,
                   "stroke": h.stroke_index <= strokes} for h in holes],
    }, None
