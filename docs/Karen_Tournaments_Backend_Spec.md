# Karen Golf — Tournaments Backend Spec

> **Audience:** the backend developer. This adds a **new `tournaments` domain** to the existing Flask app. It is built fresh for the junior program and has **nothing to do with the old "Rumble 2.0" module** (team match-play + penalties from a separate project). Follow the same conventions as the existing backend build guide.
>
> **Sequencing:** build this before the frontend tournament screens. Ship each phase (Section 11) as working, migrated, documented CRUD before the next.

---

## 1. What this module does

Runs the junior program's competitions end to end and tracks external ones:

- **Internal events** the club runs in full: create → register juniors → enter scores → live leaderboard / bracket → final positions.
- **External events** (Faldo Series, US Kids, JGF, etc.): a lightweight **result log** per junior so they count toward the monthly-report stats ("competitions played", "best gross score").
- **Multiple formats**, chosen when the tournament is set up: **stroke play**, **Stableford**, **match play** (knockout bracket). More (scramble, foursomes, skins, eclectic) are out of scope for v1 — leave the `format` enum extensible.
- **Gross and net** scoring, with optional **divisions/flights** within one event (by age group and/or gender).
- **Per-tournament eligibility** rules (age, level band, handicap range, handicap-required).
- **Handicap integration:** an event flagged *counts toward handicap* writes a normal WHS round per player (so it flows through the existing handicap engine and shows in handicap history); a non-counting event stores tournament results only.

Players are **juniors** (`junior_profiles`). Reuse existing `users`, `junior_profiles`, `courses`, `tee_sets`, `rounds`, `hole_scores`, and the WHS engine (`app/whs`).

---

## 2. Conventions (inherit from the existing app)

PostgreSQL; SQLAlchemy models under `app/tournaments/`; `TimestampMixin` on every table; integer PKs (only `users` use UUID); `str`-`Enum` columns with `values_callable`; standard response shapes `{ "data": … }`, `{ "data": [...], "count": n }`, and errors `{ "error": { "code", "message", "fields" } }`; JWT auth + role decorators; routes under `/api`; OpenAPI generated from routes. Register a new `tournaments_bp` blueprint in `main.py`.

**The backend owns tournament scoring math.** Unlike casual play (where the frontend may compute), competition results must be authoritative and identical for everyone, so **net scores, Stableford points, positions, and brackets are computed server-side** — same principle as the existing aggregate/WHS endpoints.

---

## 3. Migration note — retire the old Rumble module

The new domain reuses clean names (`tournaments`, `matches`). The existing app already has Rumble `tournaments`, `teams`, `matches`, `penalties` tables.

- **Recommended:** remove the unused Rumble module (models, routes, controllers, seed) and its tables, then build this domain with the names below.
- **If you'd rather not touch it:** prefix every table here with `jdp_` (e.g. `jdp_tournaments`) and adjust routes to `/api/jdp-tournaments/...`. Tell the frontend dev which you chose.

This spec assumes the recommended path.

---

## 4. Enums (single source)

```text
tournament.format            : stroke_play | stableford | match_play
tournament.scoring_basis     : gross | net | both          (ignored for match_play)
tournament.status            : draft | registration_open | registration_closed | in_progress | completed | cancelled
tournament_entry.status      : registered | confirmed | withdrawn
tournament_score.status      : pending | submitted | verified
tournament_match.status      : scheduled | completed
division.basis               : age | gender | level | handicap | custom
external_result.event_type   : faldo_series | us_kids | jgf | karen_open | other
```

---

## 5. Data models

> `Column | Type | Constraints | Notes`. All tables get `created_at`; mutable ones `updated_at`.

### 5.1 `tournaments`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| name | string | not null | "Karen Junior Challenge – June" |
| format | enum | not null | stroke_play / stableford / match_play |
| scoring_basis | enum | not null, default `gross` | gross / net / both (n/a for match_play) |
| course_id | int | FK → courses | the Karen course |
| tee_set_id | int | FK → tee_sets, nullable | default tee; divisions may override |
| holes | int | not null, in (9,18) | |
| start_date | date | not null | |
| end_date | date | nullable | multi-day events |
| counts_toward_handicap | bool | not null, default false | drives WHS round creation (§9) |
| status | enum | not null, default `draft` | |
| series_id | int | FK → series, nullable | optional grouping (§5.8) |
| max_entrants | int | nullable | |
| description | text | nullable | |
| **Eligibility (all nullable = no restriction):** | | | |
| age_min / age_max | int | nullable | age at `start_date` |
| level_min / level_max | int | nullable | junior `current_level` 1–9 |
| handicap_min / handicap_max | decimal(4,1) | nullable | handicap index range |
| handicap_required | bool | not null, default false | must have a handicap index |

### 5.2 `tournament_divisions` — optional flights

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| tournament_id | int | FK → tournaments | |
| name | string | not null | "Boys 13–15", "Net", "Girls" |
| basis | enum | not null | age / gender / level / handicap / custom |
| tee_set_id | int | FK → tee_sets, nullable | division may play a different tee |
| **Auto-assign criteria (nullable):** | | | |
| age_min / age_max | int | nullable | |
| gender | string | nullable | male / female |
| level_min / level_max | int | nullable | |
| handicap_min / handicap_max | decimal(4,1) | nullable | |

A tournament with no divisions has one implicit overall standing.

### 5.3 `tournament_entries` — registration

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| tournament_id | int | FK → tournaments | |
| junior_id | int | FK → junior_profiles | |
| division_id | int | FK → tournament_divisions, nullable | |
| registered_by | uuid | FK → users | parent or admin |
| status | enum | not null, default `registered` | registered / confirmed / withdrawn |
| registered_at | date | not null | |

> Unique `(tournament_id, junior_id)`. Reject duplicates `409`. Validate eligibility on create (§9).

### 5.4 `tournament_scores` — stroke / Stableford results

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| entry_id | int | FK → tournament_entries | |
| holes_played | int | not null | 9 or 18 |
| gross_score | int | not null | |
| net_score | int | nullable | computed (§9) |
| stableford_points | int | nullable | computed for stableford |
| position | int | nullable | final placing within division |
| status | enum | not null, default `submitted` | |
| round_id | int | FK → rounds, nullable | set when the event counts toward handicap |

### 5.5 `tournament_hole_scores` — per-hole detail

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| tournament_score_id | int | FK → tournament_scores | |
| hole_number | int | not null, 1–18 | |
| strokes | int | not null | |

> Per-hole capture is what lets the server compute net and Stableford even for non-counting events. Total-gross-only entry is allowed (leave hole rows empty) but then Stableford can't be computed — validate accordingly.

### 5.6 `tournament_matches` — match-play bracket

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| tournament_id | int | FK → tournaments | |
| round_number | int | not null | 1 = first round |
| bracket_position | int | not null | slot order within the round |
| player_a_entry_id | int | FK → tournament_entries, nullable | null = TBD/bye |
| player_b_entry_id | int | FK → tournament_entries, nullable | null = bye |
| winner_entry_id | int | FK → tournament_entries, nullable | |
| result_text | string | nullable | "3&2", "1 up", "A/S" |
| scheduled_date | date | nullable | |
| status | enum | not null, default `scheduled` | scheduled / completed |

### 5.7 `external_results` — logged outside competitions

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| junior_id | int | FK → junior_profiles | |
| event_name | string | not null | "Faldo Series KE Q1" |
| event_type | enum | not null | faldo_series / us_kids / jgf / karen_open / other |
| date | date | not null | |
| holes | int | nullable | |
| gross_score | int | nullable | |
| position | int | nullable | |
| field_size | int | nullable | |
| counts_toward_handicap | bool | not null, default false | if true, also create a round (§9) |
| round_id | int | FK → rounds, nullable | set when counting |
| logged_by | uuid | FK → users | coach/admin/parent |
| notes | text | nullable | |

### 5.8 `series` *(optional / fast-follow)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| name | string | not null | "Karen Junior Challenge 2026" |
| year | int | not null | |
| points_scheme | text | nullable | JSON: position → points |
| status | string | nullable | |

Standings are computed across the tournaments linked via `tournaments.series_id` (§8.4).

---

## 6. Relationships

```text
users 1───* tournament_entries     (registered_by)
users 1───* external_results       (logged_by)
junior_profiles 1───* tournament_entries
junior_profiles 1───* external_results
courses 1───* tournaments
tee_sets 1───* tournaments / tournament_divisions
series 1───* tournaments
tournaments 1───* tournament_divisions
tournaments 1───* tournament_entries
tournaments 1───* tournament_matches
tournament_divisions 1───* tournament_entries
tournament_entries 1───1 tournament_scores
tournament_entries 1───* tournament_matches  (as player_a / player_b / winner)
tournament_scores 1───* tournament_hole_scores
tournament_scores 0..1───1 rounds            (round_id, when counting toward handicap)
external_results 0..1───1 rounds             (round_id, when counting toward handicap)
```

---

## 7. Roles & permissions

| Action | admin | coach | committee | parent | player |
|---|---|---|---|---|---|
| Create/edit/cancel tournaments, divisions, generate brackets | ✓ | ✓ | — | — | — |
| Register a junior into a tournament | ✓ | ✓ | — | ✓ (own child) | — |
| Withdraw an entry | ✓ | ✓ | — | ✓ (own child) | — |
| Enter / verify scores, set match results | ✓ | ✓ | — | — | — |
| Log external results | ✓ | ✓ | — | ✓ (own child) | — |
| View tournaments, leaderboards, brackets, own competition history | ✓ | ✓ | ✓ | ✓ (own child) | ✓ (self) |

Parents are scoped to their own children for registration, external logs, and viewing; coaches to juniors they're linked to. `403` outside scope.

---

## 8. Endpoints

Standard CRUD (Section conventions) for: `tournaments`, `tournament-divisions`, `tournament-entries`, `tournament-scores`, `tournament-matches`, `external-results`, `series`.

List filters:

| Resource | Route base | Filters |
|---|---|---|
| Tournaments | `/api/tournaments` | `status`, `format`, `series_id`, `date_from`, `date_to` |
| Divisions | `/api/tournament-divisions` | `tournament_id` |
| Entries | `/api/tournament-entries` | `tournament_id`, `junior_id`, `division_id`, `status` |
| Scores | `/api/tournament-scores` | `tournament_id` (via entry), `entry_id` |
| Matches | `/api/tournament-matches` | `tournament_id`, `round_number`, `status` |
| External results | `/api/external-results` | `junior_id`, `event_type`, `date_from`, `date_to` |
| Series | `/api/series` | `year` |

### Computed / action endpoints (backend owns the logic)

**8.1 `POST /api/tournaments/:id/scores`** — submit one junior's score
Body: `{ entry_id, holes_played, hole_scores?: [{hole_number, strokes}], gross_score? }`.
- Compute course handicap for the junior on the event's tee (WHS engine; 9-hole CH = `round(18-hole CH / 2)`).
- Compute `net_score` (`gross − course handicap`) and, for stableford, `stableford_points` per §9.
- Upsert `tournament_scores` (+ `tournament_hole_scores`).
- **If `tournament.counts_toward_handicap`:** create a `round` (`round_type = tournament`, with `hole_scores` if provided), link `tournament_scores.round_id`, and recompute the player's handicap index via the existing scoring/WHS path. Otherwise store results only.
- Return the saved score with computed fields.

**8.2 `GET /api/tournaments/:id/leaderboard`** — stroke / Stableford
Group entries by division; rank by `scoring_basis` (`gross` → lowest gross; `net` → lowest net; `stableford` → highest points; `both` → return both, rank by net). Ties share a position (mark `T`). Return ranked rows per division: `{ division, rows: [{ rank, junior_id, name, gross, net, stableford_points, holes_played, position }] }`.

**8.3 Match play**
- `POST /api/tournaments/:id/generate-bracket` — seed a single-elimination bracket from `confirmed` entries; seeding by handicap (best handicap = top seed) or random (`?seed=handicap|random`); create `tournament_matches` for round 1 (byes for non-power-of-two fields).
- `GET /api/tournaments/:id/bracket` — the full bracket grouped by `round_number`.
- `PUT /api/tournament-matches/:id` — set `winner_entry_id` + `result_text`; on completion, advance the winner into the next round's slot.
- Strokes-given per match = difference in course handicaps, allocated by stroke index (lower-handicap player gives strokes). Return the allocation in the match detail.

**8.4 `GET /api/series/:id/standings`** *(fast-follow)* — order of merit: sum each junior's points across the series' completed tournaments using `points_scheme`.

**8.5 `GET /api/juniors/:id/competitions?from=&to=`** — combined internal entries (with scores/positions) **and** external results for the junior in the window. This is what feeds the monthly evaluation's "competitions played" count and "best gross score". (Junior-scoped: parents/players see only their own.)

---

## 9. Business rules the backend enforces

- **Eligibility on entry:** reject (`400`) if the junior's age at `start_date` is outside `[age_min, age_max]`, `current_level` outside `[level_min, level_max]`, handicap index outside `[handicap_min, handicap_max]`, or `handicap_required` is true and the junior has no handicap index. Skip any rule whose bounds are null.
- **Course handicap:** `CH = round( index × (slope/113) + (course_rating − par) )` from the WHS engine; **9-hole CH = `round(18-hole CH / 2)`**.
- **Net score:** `gross − CH`.
- **Stableford points (per hole):** strokes received on a hole = `floor(CH/18) + (1 if SI ≤ CH mod 18 else 0)`; `net_strokes = gross_strokes − strokes_received`; `points = max(0, 2 + par − net_strokes)`. Sum across played holes. Requires per-hole scores.
- **Handicap integration:** only `counts_toward_handicap` events create a `round` and move the index; never both create a round *and* skip the index, or vice-versa. Non-counting events never touch `users.handicap_index`.
- **Status flow:** `draft → registration_open → registration_closed → in_progress → completed` (or `cancelled` from any). Block new entries unless status is `registration_open`. Block score entry until `in_progress`.
- **Divisions:** an entry's division may be auto-assigned from division criteria at registration or set manually; leaderboards are grouped by division.
- **Match play:** `scoring_basis` is ignored; `winner_entry_id` must be one of the match's two entries; advancing requires `status = completed`.
- **Uniqueness:** one entry per `(tournament_id, junior_id)`; one `tournament_scores` per entry.

---

## 10. Seed data

Seed a small reference set (extend the existing `/api/seed`):
- Two example internal tournaments tied to the Karen course: **"Karen Junior Challenge"** (stableford, net, counts toward handicap, levels 6–9 eligibility) and **"Karen Junior Open – Beginners"** (stroke play, gross, does not count, levels 1–5, ages 5–12).
- Leave `external_results` empty; `event_type` enum already lists Faldo / US Kids / JGF.

---

## 11. Build order

1. **Core:** `tournaments`, `tournament_divisions`, `tournament_entries` + CRUD + eligibility validation + status flow + seed.
2. **Stroke & Stableford:** `tournament_scores`, `tournament_hole_scores`, `POST /scores` (with course-handicap/net/Stableford math), `/leaderboard`, and the **handicap integration** (round creation + index recompute).
3. **Match play:** `tournament_matches`, `/generate-bracket`, `/bracket`, match-result + advancement.
4. **External results:** `external_results` CRUD + `/juniors/:id/competitions` combined history (wire it into the existing monthly-report aggregate).
5. **Series** *(fast-follow):* `series` + `/series/:id/standings`.

---

*End of tournaments backend spec. Build it as written; where a model, enum, route, or rule is here, it is the contract.*
