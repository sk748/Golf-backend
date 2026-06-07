"""Integration tests for the tournaments API (Flask test client + karen_test_db)."""

from app.database.database import db
from app.tournaments.models import Tournament
from app.rounds.models import Round


# ── Permissions / CRUD ───────────────────────────────────────────────────────────

def test_create_tournament_permission(client, auth):
    _, admin_h = auth("admin")
    _, player_h = auth("player")
    body = {"name": "Spring Cup", "format": "stroke_play", "holes": 18, "start_date": "2026-07-01"}
    assert client.post("/api/tournaments", json=body, headers=admin_h).status_code == 201
    assert client.post("/api/tournaments", json=body, headers=player_h).status_code == 403


def test_list_includes_seeded(client, auth):
    _, admin_h = auth("admin")
    data = client.get("/api/tournaments", headers=admin_h).get_json()["data"]
    names = {t["name"] for t in data}
    assert "Karen Junior Challenge" in names
    assert "Karen Junior Open - Beginners" in names


# ── Registration: eligibility, uniqueness, status ────────────────────────────────

def test_eligibility_and_duplicate(client, auth, make_junior, make_tournament):
    _, admin_h = auth("admin")
    t = make_tournament(format="stableford", status="registration_open", level_min=6, level_max=9)
    low = make_junior(level=3, handicap=10)
    r = client.post("/api/tournament-entries", json={"tournament_id": t.id, "junior_id": low.id}, headers=admin_h)
    assert r.status_code == 400  # ineligible (level too low)

    ok_j = make_junior(level=7, handicap=10)
    r2 = client.post("/api/tournament-entries", json={"tournament_id": t.id, "junior_id": ok_j.id}, headers=admin_h)
    assert r2.status_code == 201
    dup = client.post("/api/tournament-entries", json={"tournament_id": t.id, "junior_id": ok_j.id}, headers=admin_h)
    assert dup.status_code == 409  # already registered


def test_register_closed_when_not_open(client, auth, make_junior, make_tournament):
    _, admin_h = auth("admin")
    t = make_tournament(status="draft")  # not registration_open
    j = make_junior(level=7, handicap=10)
    r = client.post("/api/tournament-entries", json={"tournament_id": t.id, "junior_id": j.id}, headers=admin_h)
    assert r.status_code == 400


def test_parent_registers_own_child_only(client, auth, make_user, make_junior, make_tournament):
    parent, parent_h = auth("parent")
    other_parent = make_user(role="parent")
    child = make_junior(level=2, parent=parent)
    other_child = make_junior(level=2, parent=other_parent)
    t = make_tournament(status="registration_open", level_min=1, level_max=5)

    ok = client.post("/api/tournament-entries", json={"tournament_id": t.id, "junior_id": child.id}, headers=parent_h)
    assert ok.status_code == 201
    no = client.post("/api/tournament-entries", json={"tournament_id": t.id, "junior_id": other_child.id}, headers=parent_h)
    assert no.status_code == 403


# ── Scoring ──────────────────────────────────────────────────────────────────────

def test_score_blocked_until_in_progress(client, auth, make_tournament, make_junior, make_entry):
    _, admin_h = auth("admin")
    t = make_tournament(status="registration_open")
    j = make_junior(handicap=10)
    e = make_entry(t, j)
    r = client.post(f"/api/tournaments/{t.id}/scores",
                    json={"entry_id": e.id, "holes_played": 18, "gross_score": 90}, headers=admin_h)
    assert r.status_code == 400


def test_stableford_scoring_and_leaderboard(client, auth, make_tournament, make_junior, make_entry):
    _, admin_h = auth("admin")
    t = make_tournament(format="stableford", scoring_basis="net", status="in_progress", holes=18)
    j = make_junior(level=7, handicap=10)
    e = make_entry(t, j)
    holes = [{"hole_number": i, "strokes": 5} for i in range(1, 19)]  # gross 90
    r = client.post(f"/api/tournaments/{t.id}/scores",
                    json={"entry_id": e.id, "holes_played": 18, "hole_scores": holes}, headers=admin_h)
    assert r.status_code == 201, r.get_data(as_text=True)
    data = r.get_json()["data"]
    assert data["stableford_points"] is not None
    assert data["net_score"] == 90 - data["course_handicap"]

    lb = client.get(f"/api/tournaments/{t.id}/leaderboard", headers=admin_h).get_json()["data"]
    rows = lb["divisions"][0]["rows"]
    assert rows[0]["entry_id"] == e.id
    assert rows[0]["position"] == "1"


def test_stableford_requires_hole_scores(client, auth, make_tournament, make_junior, make_entry):
    _, admin_h = auth("admin")
    t = make_tournament(format="stableford", scoring_basis="net", status="in_progress")
    j = make_junior(handicap=10)
    e = make_entry(t, j)
    r = client.post(f"/api/tournaments/{t.id}/scores",
                    json={"entry_id": e.id, "holes_played": 18, "gross_score": 90}, headers=admin_h)
    assert r.status_code == 400  # Stableford needs per-hole scores


def test_counting_event_creates_round_and_moves_index(client, auth, make_tournament, make_junior, make_entry):
    _, admin_h = auth("admin")
    t = make_tournament(format="stroke_play", scoring_basis="gross",
                        status="in_progress", counts_toward_handicap=True)
    j = make_junior(level=8, handicap=20)
    user_id = j.user_id
    e = make_entry(t, j)
    holes = [{"hole_number": i, "strokes": 4} for i in range(1, 19)]  # gross 72
    r = client.post(f"/api/tournaments/{t.id}/scores",
                    json={"entry_id": e.id, "holes_played": 18, "hole_scores": holes}, headers=admin_h)
    assert r.status_code == 201, r.get_data(as_text=True)
    data = r.get_json()["data"]
    assert "new_handicap_index" in data
    assert data["round_id"] is not None
    assert Round.query.filter_by(user_id=user_id, round_type="tournament").count() == 1


def test_noncounting_event_creates_no_round(client, auth, make_tournament, make_junior, make_entry):
    _, admin_h = auth("admin")
    t = make_tournament(format="stroke_play", status="in_progress", counts_toward_handicap=False)
    j = make_junior(handicap=20)
    user_id = j.user_id
    e = make_entry(t, j)
    holes = [{"hole_number": i, "strokes": 4} for i in range(1, 19)]
    client.post(f"/api/tournaments/{t.id}/scores",
                json={"entry_id": e.id, "holes_played": 18, "hole_scores": holes}, headers=admin_h)
    assert Round.query.filter_by(user_id=user_id).count() == 0


# ── Match play ───────────────────────────────────────────────────────────────────

def test_bracket_generate_and_advance(client, auth, make_tournament, make_junior, make_entry):
    _, admin_h = auth("admin")
    t = make_tournament(format="match_play", status="in_progress")
    juniors = [make_junior(level=7, handicap=h) for h in (5, 10, 15, 20)]
    for j in juniors:
        make_entry(t, j, status="confirmed")

    r = client.post(f"/api/tournaments/{t.id}/generate-bracket?seed=handicap", headers=admin_h)
    assert r.status_code == 201, r.get_data(as_text=True)
    rounds = {rd["round_number"]: rd["matches"] for rd in r.get_json()["data"]["rounds"]}
    assert len(rounds[1]) == 2 and len(rounds[2]) == 1

    m = rounds[1][0]
    upd = client.put(f"/api/tournament-matches/{m['id']}",
                     json={"winner_entry_id": m["player_a_entry_id"], "result_text": "3&2"}, headers=admin_h)
    assert upd.status_code == 200

    br2 = client.get(f"/api/tournaments/{t.id}/bracket", headers=admin_h).get_json()["data"]
    r2 = {rd["round_number"]: rd["matches"] for rd in br2["rounds"]}[2][0]
    assert r2["player_a_entry_id"] == m["player_a_entry_id"]


def test_bracket_rejects_invalid_winner(client, auth, make_tournament, make_junior, make_entry):
    _, admin_h = auth("admin")
    t = make_tournament(format="match_play", status="in_progress")
    for h in (5, 10):
        make_entry(t, make_junior(handicap=h), status="confirmed")
    client.post(f"/api/tournaments/{t.id}/generate-bracket", headers=admin_h)
    matches = client.get(f"/api/tournament-matches?tournament_id={t.id}", headers=admin_h).get_json()["data"]
    m = matches[0]
    bad = client.put(f"/api/tournament-matches/{m['id']}", json={"winner_entry_id": 9999}, headers=admin_h)
    assert bad.status_code == 400


# ── External results + combined competitions ─────────────────────────────────────

def test_external_results_and_competitions(client, auth, make_junior):
    _, admin_h = auth("admin")
    j = make_junior(level=8, handicap=12)
    jid = j.id
    r = client.post("/api/external-results", json={
        "junior_id": jid, "event_name": "Faldo KE Q1", "event_type": "faldo_series",
        "date": "2026-05-01", "gross_score": 80,
    }, headers=admin_h)
    assert r.status_code == 201, r.get_data(as_text=True)
    comps = client.get(f"/api/juniors/{jid}/competitions", headers=admin_h).get_json()["data"]
    assert comps["competitions_played"] == 1
    assert comps["best_gross_score"] == 80


# ── Series standings ─────────────────────────────────────────────────────────────

def test_series_standings(client, auth, make_tournament, make_junior, make_entry):
    _, admin_h = auth("admin")
    s = client.post("/api/series", json={
        "name": "Order of Merit 2026", "year": 2026,
        "points_scheme": "{\"1\": 100, \"2\": 80}",
    }, headers=admin_h).get_json()["data"]

    t = make_tournament(format="stroke_play", scoring_basis="gross",
                        status="in_progress", series_id=s["id"])
    j1 = make_junior(handicap=5)
    j2 = make_junior(handicap=10)
    e1 = make_entry(t, j1)
    e2 = make_entry(t, j2)
    for e, strokes in ((e1, 4), (e2, 5)):  # j1 gross 72 (better), j2 gross 90
        holes = [{"hole_number": i, "strokes": strokes} for i in range(1, 19)]
        client.post(f"/api/tournaments/{t.id}/scores",
                    json={"entry_id": e.id, "holes_played": 18, "hole_scores": holes}, headers=admin_h)

    client.get(f"/api/tournaments/{t.id}/leaderboard", headers=admin_h)  # assigns positions

    t_obj = db.session.get(Tournament, t.id)
    t_obj.status = "completed"
    db.session.commit()

    st = client.get(f"/api/series/{s['id']}/standings", headers=admin_h).get_json()["data"]
    assert st["standings"][0]["points"] == 100  # winner gets 100


# ── Auth gate ────────────────────────────────────────────────────────────────────

def test_unauthenticated_rejected(client):
    assert client.get("/api/tournaments").status_code == 401
