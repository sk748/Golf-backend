# Karen Golf Management Platform — Backend Build Guide

> **Audience:** This file is the single source of truth for the AI coding agent (Codex) building the **backend**. Read it top to bottom before writing code. Everything the backend needs — data models, enums, endpoints, seed data, and business rules — is defined here. When in doubt, follow this document over assumptions.

---

## 1. How to use this document

- This is the **backend** spec only. A separate frontend (React/Next.js) is built afterward by another developer and consumes the API defined here.
- Build in the **phase order** in Section 12. Ship each phase as working, migrated, documented CRUD before moving on.
- The backend is **deliberately simple**: store data, validate types, enforce the listed constraints, return JSON. Heavy logic (handicap maths, report rendering, sorting UIs) lives in the frontend. The few computed endpoints the backend owns are spelled out in Section 11.
- Every table gets standard CRUD (Section 9). Do not skip any.
- Generate OpenAPI/Swagger docs from the routes so the frontend developer has a live contract.

---

## 2. Project overview

A single platform that digitises Karen Country Club's golf operations, replacing an Excel tournament tracker and Word-based junior reports. Four modules share one user base and one course/scorecard reference.

| Module | Purpose |
|---|---|
| **Rumble 2.0 Tournament** | Team registration, match logging, stroke calculation, leaderboard, head-to-head tie-breakers, knockout bracket |
| **Junior Development & Evaluations** | 9-level pathway, monthly performance evaluations per golfer, level-specific report templates, standardised assessment + recommendation, coach/committee sign-off |
| **Coaching & Classes** | Coach schedules, age-banded group classes, 1-on-1 booking requests, attendance |
| **Scoring & Handicaps** | Score history, gross/adjusted/net scores, WHS handicap data, scorecard reference |

---

## 3. The golden rule

**Backend = dumb pipes.** CRUD + validation + a handful of documented aggregate endpoints. No UI. No frontend-only calculations baked into storage.

**Frontend = everything smart.** It computes course handicaps, stroke allocations, score differentials, renders band-specific evaluation forms, and sorts/filters for display.

For evaluations specifically: the backend stores **one flexible `evaluations` row** with nullable band-specific columns. The frontend decides which fields to show based on the golfer's level band. The backend does **not** branch on band.

---

## 4. Tech stack & conventions

| Concern | Decision |
|---|---|
| Database | PostgreSQL |
| Backend | Node.js (Express) **or** Python (FastAPI/Django) — implementer's choice |
| API style | REST, JSON request/response |
| Auth | JWT or session-based; role-based access control |
| IDs | `users` use UUID; all other tables may use auto-increment integer PKs |
| Timestamps | Every table has `created_at`; mutable tables also `updated_at` (UTC) |
| Naming | snake_case columns, plural table names, `/api/kebab-or-snake` routes |
| Dates | ISO 8601 (`YYYY-MM-DD`); months stored as first-of-month dates |

### Standard response shapes

```jsonc
// Single resource
{ "data": { /* object */ } }

// List
{ "data": [ /* objects */ ], "count": 42 }

// Error
{ "error": { "code": "VALIDATION_ERROR", "message": "human readable", "fields": { "email": "required" } } }
```

### Status codes
`200` OK · `201` Created · `204` No Content (delete) · `400` validation · `401` unauthenticated · `403` forbidden · `404` not found · `409` conflict (e.g. duplicate email).

---

## 5. Enums (single source — reference everywhere)

```text
user.role                  : admin | coach | committee | parent | player
user.membership_type       : full | social | guest | junior

tee_set.name               : white | yellow | blue | red
tee_set.gender             : men | women

tournament.status          : registration | round_robin | knockout | complete
match.tee_played           : white | yellow | blue | red
match.starting_tee         : hole_1 | hole_10
match.result               : team_a_win | team_b_win | tie          (nullable until played)
match.stage                : round_robin | round_of_16 | quarter | semi | final
penalty.penalty_type       : late_cancel | declined_invite

level_band.report_template : skills | practice_scores | competition
junior.gender              : male | female
junior.experience          : beginner | lt_1yr | 1_3yr | 4_6yr | 7_10yr
junior.availability        : twice_weekly | weekends_only | more_than_twice | holidays_only

evaluation.assessment      : below_expectation | meeting_expectation | exceeding_expectation
evaluation.recommendation  : continue_level | move_next_level

class_enrollment.status    : active | dropped
session.session_type       : group | one_on_one | evaluation | tournament_prep
session.status             : scheduled | completed | cancelled
attendance.status          : present | absent | excused
booking_request.status     : pending | approved | declined

round.round_type           : casual | tournament | competition
```

---

## 6. Data models

> Format: `Column | Type | Constraints | Notes`. FK = foreign key. All tables get `created_at`; mutable ones get `updated_at`.

### 6.1 Auth & users

**`users`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| email | string | unique, not null | login |
| password_hash | string | not null | |
| first_name | string | not null | |
| last_name | string | not null | |
| phone | string | nullable | |
| role | enum | not null | see Section 5 |
| membership_type | enum | not null | |
| handicap_index | decimal(4,1) | nullable | WHS index |
| cdh_number | string | nullable | handicap DB id |
| is_active | boolean | default true | |

### 6.2 Course & scorecard reference

**`courses`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| name | string | not null | "Karen Country Club" |
| par | int | not null | 72 |
| altitude_ft | int | nullable | ~6000 |
| grass_type | string | nullable | "Kikuyu" |

**`tee_sets`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| course_id | int | FK → courses | |
| name | enum | not null | white/yellow/blue/red |
| gender | enum | not null | men/women |
| course_rating | decimal(4,1) | not null | e.g. 73.0 |
| slope_rating | int | not null | e.g. 137 |
| total_yards | int | not null | |

**`holes`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| course_id | int | FK → courses | |
| hole_number | int | not null, 1–18 | |
| par | int | not null | 3/4/5 |
| stroke_index | int | not null, 1–18 | difficulty rank |
| white_yards | int | not null | |
| yellow_yards | int | not null | |
| blue_yards | int | not null | |
| red_yards | int | not null | |

### 6.3 Rumble 2.0 tournament

**`tournaments`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| name | string | not null | "Karen Rumble 2.0" |
| year | int | not null | |
| format | string | not null | "Four Ball Better Ball" |
| handicap_allowance | decimal(3,2) | not null | 0.90 |
| max_stroke_diff | int | not null | 8 |
| min_games | int | not null | 8 |
| max_games | int | not null | 12 |
| qualify_top_n | int | not null | 16 |
| points_win | int | not null | 3 |
| points_tie | int | not null | 2 |
| points_loss | int | not null | 1 |
| penalty_late_cancel | int | not null | -3 |
| penalty_declined | int | not null | -3 |
| round_robin_start | date | nullable | |
| round_robin_end | date | nullable | |
| status | enum | not null | see Section 5 |

**`teams`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| tournament_id | int | FK → tournaments | |
| name | string | not null | unique within tournament |
| player_1_id | uuid | FK → users | |
| player_1_handicap | decimal(4,1) | not null | course handicap at registration |
| player_2_id | uuid | FK → users | |
| player_2_handicap | decimal(4,1) | not null | |
| is_active | boolean | default true | can be disqualified |

**`matches`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| tournament_id | int | FK → tournaments | |
| match_date | date | nullable | null = scheduled, not played |
| tee_played | enum | not null | |
| starting_tee | enum | not null | |
| team_a_id | int | FK → teams | |
| team_b_id | int | FK → teams | |
| result | enum | nullable | null until played |
| winner_id | int | FK → teams, nullable | null on tie |
| score_description | string | nullable | "3&2", "1UP", "A/S" |
| stage | enum | not null | |

**`penalties`** — one row per penalty event; names the specific team (no positional ambiguity)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| match_id | int | FK → matches, nullable | null = standalone penalty |
| team_id | int | FK → teams | the penalised team |
| penalty_type | enum | not null | late_cancel / declined_invite |
| points_deducted | int | not null | -3 |
| notes | text | nullable | |

### 6.4 Junior development & evaluations

**`level_bands`** — reference data, pre-seeded (Section 10)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| name | string | not null | "Levels 1-3" etc. |
| band_label | string | not null | "Beginners" etc. |
| min_level | int | not null | 1, 4, 6, 9 |
| max_level | int | not null | 3, 5, 8, 99 (99 = "9+") |
| min_sessions | int | not null | 12, 24, 24, 24 |
| report_template | enum | not null | skills / practice_scores / competition |
| description | text | not null | curriculum focus |

**`level_benchmarks`** — reference data, pre-seeded

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| level_number | int | not null | 6, 7, 8 |
| full_swing_target | int | not null | |
| around_green_target | int | not null | |
| putting_target | int | not null | |
| nine_hole_target | int | not null | |

**`junior_profiles`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| user_id | uuid | FK → users | the junior |
| parent_id | uuid | FK → users | guardian |
| date_of_birth | date | not null | |
| gender | enum | not null | male/female |
| current_level | int | not null, 1–9 | 9 = "9+" |
| band_id | int | FK → level_bands | derived from current_level |
| curriculum | string | nullable | |
| has_handicap | boolean | default false | |
| handicap_index | decimal(4,1) | nullable | |
| played_us_kids | boolean | nullable | for non-handicapped |
| us_kids_best_score | int | nullable | |
| experience | enum | not null | see Section 5 |
| availability | enum | not null | |
| medical_conditions | text | nullable | |
| golf_goals | text | nullable | multi-select stored as JSON/CSV |
| tournament_ready | boolean | default false | |

**`evaluations`** — ONE row per golfer per month. Common fields apply to all bands; band-specific fields are nullable (frontend shows only the relevant ones).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| junior_id | int | FK → junior_profiles | |
| coach_id | uuid | FK → users | evaluating coach |
| report_month | date | not null | first of month, e.g. 2026-03-01 |
| current_level | int | not null | level at time of report |
| attendance_count | int | not null | classes attended this month |
| attendance_total | int | nullable | out of how many scheduled |
| assessment | enum | not null | below/meeting/exceeding |
| recommendation | enum | not null | continue_level / move_next_level |
| special_remarks | text | nullable | |
| putting_assessment | text | nullable | **band 1-3 only** |
| chipping_assessment | text | nullable | **band 1-3 only** |
| full_swing_assessment | text | nullable | **band 1-3 only** |
| avg_score_9 | decimal(4,1) | nullable | **band 4-5** (target 60–65) |
| avg_score_18 | decimal(4,1) | nullable | **band 4-5** (target 120–130) |
| competitions_played | int | nullable | **band 6-8 & 9+** |
| best_gross_score | int | nullable | **band 6-8 & 9+** (best this month) |
| coach_signed | boolean | default false | |
| coach_signed_date | date | nullable | |
| committee_signed | boolean | default false | |
| committee_signed_date | date | nullable | |
| committee_signed_by | uuid | FK → users, nullable | |

> **Uniqueness:** one evaluation per (`junior_id`, `report_month`). Reject duplicates with `409`.

**`badges`** *(optional / future)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| name | string | not null | "Level 3 Complete" |
| description | text | nullable | |
| level_required | int | nullable | auto-award trigger |

**`junior_badges`** *(join table, optional / future)*

| Column | Type | Constraints | Notes |
|---|---|---|---|
| junior_id | int | FK → junior_profiles | |
| badge_id | int | FK → badges | |
| awarded_date | date | not null | |
| awarded_by | uuid | FK → users | |

### 6.5 Coaching & classes

**`classes`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| name | string | not null | "Beginner Group A" |
| coach_id | uuid | FK → users | |
| band_id | int | FK → level_bands, nullable | |
| age_group | string | nullable | "5-10", "11-18" |
| schedule | string | not null | "Mondays 4:30-5:30pm" |
| max_students | int | not null | clinics cap at 6 |
| is_active | boolean | default true | |

**`class_enrollments`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| class_id | int | FK → classes | |
| junior_id | int | FK → junior_profiles | |
| enrolled_date | date | not null | |
| status | enum | not null | active/dropped |

**`sessions`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| class_id | int | FK → classes, nullable | null if 1-on-1 |
| coach_id | uuid | FK → users | |
| session_type | enum | not null | |
| date | date | not null | |
| start_time | time | not null | |
| end_time | time | not null | |
| notes | text | nullable | |
| status | enum | not null | scheduled/completed/cancelled |

**`attendance`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| session_id | int | FK → sessions | |
| junior_id | int | FK → junior_profiles | |
| status | enum | not null | present/absent/excused |

**`booking_requests`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| parent_id | uuid | FK → users | |
| junior_id | int | FK → junior_profiles | |
| coach_id | uuid | FK → users, nullable | preferred coach |
| preferred_date | date | not null | |
| preferred_time | time | not null | |
| status | enum | not null | pending/approved/declined |
| session_id | int | FK → sessions, nullable | set once approved |
| admin_notes | text | nullable | |

### 6.6 Scoring & handicap history

**`rounds`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| user_id | uuid | FK → users | |
| course_id | int | FK → courses | |
| tee_set_id | int | FK → tee_sets | |
| date_played | date | not null | |
| round_type | enum | not null | casual/tournament/competition |
| competition_name | string | nullable | |
| gross_score | int | not null | |
| adjusted_gross_score | int | nullable | |
| score_differential | decimal(4,1) | nullable | |
| pcc_adjustment | decimal(3,1) | nullable | |
| handicap_before | decimal(4,1) | nullable | snapshot |
| handicap_after | decimal(4,1) | nullable | snapshot |

**`hole_scores`**

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | int | PK | |
| round_id | int | FK → rounds | |
| hole_number | int | not null, 1–18 | |
| strokes | int | not null | |
| putts | int | nullable | |
| fairway_hit | boolean | nullable | |
| gir | boolean | nullable | green in regulation |

---

## 7. Relationships (textual ERD)

```text
users 1───* teams              (player_1_id, player_2_id)
users 1───1 junior_profiles    (user_id; parent_id also → users)
users 1───* evaluations        (coach_id; committee_signed_by also → users)
users 1───* classes            (coach_id)
users 1───* sessions           (coach_id)
users 1───* rounds             (user_id)

courses 1───* tee_sets
courses 1───* holes
courses 1───* rounds

tournaments 1───* teams
tournaments 1───* matches
teams 1───* matches            (team_a_id, team_b_id, winner_id)
teams 1───* penalties
matches 1───* penalties        (nullable)

level_bands 1───* junior_profiles
level_bands 1───* classes
junior_profiles 1───* evaluations
junior_profiles 1───* class_enrollments
junior_profiles 1───* attendance
junior_profiles 1───* booking_requests
junior_profiles 1───* junior_badges

classes 1───* class_enrollments
classes 1───* sessions
sessions 1───* attendance
sessions 1───1 booking_requests (optional link once approved)

rounds 1───* hole_scores
```

---

## 8. Roles & permissions

| Role | Can | Cannot |
|---|---|---|
| **admin** | Everything | — |
| **coach** | View assigned juniors; create/sign own evaluations; mark attendance; manage own sessions & notes | Create tournaments; manage other coaches; committee sign-off |
| **committee** | Review & sign off evaluations and summary reports; view all juniors; approve promotions | Create evaluations; manage classes/tournaments |
| **parent** | View own child's profile/progress/reports; create booking requests; view class schedule & attendance | Evaluate; access other children; admin panel |
| **player** | View own profile; enter own scores; view own handicap history; view standings | Access junior profiles; manage classes; create evaluations |

Enforce at the route layer. `403` when a role acts outside its scope. Parents are scoped to juniors where `junior_profiles.parent_id = user.id`. Coaches are scoped to juniors they are linked to via classes/sessions.

---

## 9. CRUD API — the repeating pattern

Every table in Section 6 gets these five routes. `{resource}` is the kebab/snake route name (Section 10 table).

```text
POST    /api/{resource}        → 201 { data }      create one
GET     /api/{resource}        → 200 { data[], count }   list (supports filters)
GET     /api/{resource}/:id    → 200 { data }      read one
PUT     /api/{resource}/:id    → 200 { data }      update one
DELETE  /api/{resource}/:id    → 204               delete one
```

### Resource routes & supported list filters

| Resource | Route base | Query filters to support |
|---|---|---|
| Users | `/api/users` | `role`, `membership_type`, `search` (name/email) |
| Courses | `/api/courses` | — |
| Tee sets | `/api/tee-sets` | `course_id` |
| Holes | `/api/holes` | `course_id` |
| Tournaments | `/api/tournaments` | `year`, `status` |
| Teams | `/api/teams` | `tournament_id`, `search` |
| Matches | `/api/matches` | `tournament_id`, `team_id`, `stage`, `date_from`, `date_to`, `result` |
| Penalties | `/api/penalties` | `team_id`, `match_id`, `penalty_type` |
| Level bands | `/api/level-bands` | — |
| Level benchmarks | `/api/level-benchmarks` | `level_number` |
| Junior profiles | `/api/juniors` | `parent_id`, `band_id`, `current_level`, `age_min`, `age_max` |
| Evaluations | `/api/evaluations` | `junior_id`, `coach_id`, `report_month`, `committee_signed`, `coach_signed` |
| Badges | `/api/badges` | — |
| Junior badges | `/api/junior-badges` | `junior_id` |
| Classes | `/api/classes` | `coach_id`, `band_id`, `age_group`, `is_active` |
| Enrollments | `/api/enrollments` | `class_id`, `junior_id`, `status` |
| Sessions | `/api/sessions` | `coach_id`, `class_id`, `date_from`, `date_to`, `session_type`, `status` |
| Attendance | `/api/attendance` | `session_id`, `junior_id` |
| Booking requests | `/api/booking-requests` | `parent_id`, `status`, `coach_id` |
| Rounds | `/api/rounds` | `user_id`, `course_id`, `round_type` |
| Hole scores | `/api/hole-scores` | `round_id` |

---

## 10. Seed data (load via migration/seeder)

### 10.1 Course
```text
courses: { name: "Karen Country Club", par: 72, altitude_ft: 6000, grass_type: "Kikuyu" }
```

### 10.2 Tee sets (CR / Slope / total yards)
```text
MEN    White  : course_rating 73.0, slope 137, total_yards 6961
MEN    Yellow : course_rating 71.6, slope 135, total_yards 6639
MEN    Blue   : course_rating 68.7, slope 123, total_yards 6035
MEN    Red    : course_rating 66.7, slope 121, total_yards 5647
WOMEN  White  : course_rating 79.9, slope 144, total_yards 6961
WOMEN  Yellow : course_rating 78.2, slope 141, total_yards 6639
WOMEN  Blue   : course_rating 74.2, slope 134, total_yards 6035
WOMEN  Red    : course_rating 72.3, slope 129, total_yards 5647
```

### 10.3 Holes (Par 72; SI 1 = hardest)
```text
hole | par | stroke_index | white | yellow | blue | red
  1  |  4  |     15       |  347  |  335   | 312  | 302
  2  |  5  |      7       |  567  |  540   | 472  | 460
  3  |  5  |      9       |  524  |  510   | 460  | 427
  4  |  4  |      3       |  433  |  419   | 403  | 365
  5  |  3  |     13       |  210  |  184   | 160  | 130
  6  |  4  |      1       |  472  |  460   | 414  | 384
  7  |  3  |     17       |  175  |  155   | 143  | 133
  8  |  4  |     11       |  374  |  359   | 327  | 314
  9  |  4  |      5       |  442  |  427   | 379  | 353
 10  |  4  |     14       |  343  |  328   | 307  | 292
 11  |  4  |      6       |  393  |  375   | 347  | 332
 12  |  4  |     18       |  332  |  295   | 294  | 258
 13  |  4  |      2       |  452  |  439   | 405  | 379
 14  |  3  |     16       |  147  |  139   | 120  | 115
 15  |  5  |      8       |  554  |  521   | 461  | 437
 16  |  3  |     12       |  195  |  183   | 171  | 156
 17  |  4  |      4       |  449  |  437   | 370  | 360
 18  |  5  |     10       |  552  |  533   | 490  | 450
```
Front nine par = 36, back nine par = 36, total = 72. Stroke indexes 1–18 each used once.

### 10.4 Level bands
```text
name        | band_label                 | min_level | max_level | min_sessions | report_template
Levels 1-3  | Beginners                  |    1      |     3     |     12       | skills
Levels 4-5  | Attaining Handicap         |    4      |     5     |     24       | practice_scores
Levels 6-8  | Intermediate & Advanced    |    6      |     8     |     24       | competition
Level 9+    | Enhanced / Elite           |    9      |    99     |     24       | competition
```
Band descriptions:
- **Levels 1-3:** Putting, chipping, full-swing basics, etiquette, safety. Clinics of max 6 golfers. No scoring yet.
- **Levels 4-5:** Course lessons in groups of ~4. Get scorecards signed for a handicap. Targets: 9-hole 60–65, 18-hole 120–130.
- **Levels 6-8:** Competitive play, green reading, game management. 2–3 competitive rounds/month. Karen Junior Challenge mandatory.
- **Level 9+:** Handicap index 15 and below; sub-84 rounds consistently. Scholarship/pro track; Faldo Series, US Kids, Strokeplay.

### 10.5 Level benchmarks
```text
level_number | full_swing_target | around_green_target | putting_target | nine_hole_target
     6        |        21         |          8          |       19       |        48
     7        |        20         |          7          |       18       |        45
     8        |        19         |          6          |       17       |        42
```

### 10.6 Tournament defaults (Rumble 2.0)
```text
name "Karen Rumble 2.0", year 2026, format "Four Ball Better Ball",
handicap_allowance 0.90, max_stroke_diff 8, min_games 8, max_games 12,
qualify_top_n 16, points_win 3, points_tie 2, points_loss 1,
penalty_late_cancel -3, penalty_declined -3, status "registration"
```

---

## 11. Computed endpoints (backend owns the logic)

These go beyond CRUD. Implement each exactly as described; the frontend depends on these shapes.

### 11.1 `GET /api/tournaments/:id/leaderboard`
Aggregate every active team in the tournament from `matches` and `penalties`.

For each team:
- `played` = count of matches where the team is team_a or team_b **and** `result` is not null.
- `wins` = count of matches where `winner_id` = team.
- `ties` = count of matches involving the team where `result = tie`.
- `losses` = `played - wins - ties`.
- `match_points` = `wins*3 + ties*2 + losses*1`.
- `late_cancel_penalty` = count of `penalties` for team where `penalty_type = late_cancel`, × `-3`.
- `declined_penalty` = count of `penalties` for team where `penalty_type = declined_invite`, × `-3`.
- `total_points` = `match_points + late_cancel_penalty + declined_penalty`.
- `qualified` = `true` if `played >= min_games` AND `played <= max_games` AND rank ≤ `qualify_top_n`.

**Sort by `total_points` descending.** Return ranked array (rank = 1-based index after sort). On a points tie, order tied teams by head-to-head (Section 11.3); if still tied, leave stable.

```jsonc
{ "data": [
  { "rank":1, "team_id":5, "team_name":"...", "played":10, "wins":7, "ties":2,
    "losses":1, "match_points":27, "late_cancel_penalty":0, "declined_penalty":0,
    "total_points":27, "qualified":true }
], "count": 44 }
```

### 11.2 `GET /api/matches/:id/stroke-calc`
Returns stroke allocation for one match (frontend may also compute this; provide it server-side too).
- Look up both teams' two handicaps; each team's **best-ball** = `min(player_1_handicap, player_2_handicap)`.
- `raw_diff` = `abs(teamA_best - teamB_best)`.
- `ninety` = `round(raw_diff * tournament.handicap_allowance)`.
- `strokes` = `min(ninety, tournament.max_stroke_diff)`  (cap 8).
- `receiving_team` = team with the **higher** best-ball handicap (none if equal).
- `holes` = array of 18 booleans; hole receives a stroke when its `stroke_index <= strokes`.

```jsonc
{ "data": { "team_a_best":7, "team_b_best":15, "raw_diff":8, "ninety":7,
  "strokes":7, "receiving_team_id":9,
  "holes":[{"hole":1,"stroke_index":15,"stroke":false}, /* ...18 */] } }
```

### 11.3 `GET /api/tournaments/:id/head-to-head?team_a=X&team_b=Y`
Direct record between two teams (tie-breaker per tournament rules).
- `times_played`, `team_a_wins`, `team_b_wins`, `ties` from completed matches between exactly these two teams.
- `winner` = team with more wins; `"not_played"` if none; `"tied"` if equal.

### 11.4 `GET /api/juniors/:id/progress`
Timeline for one junior: ordered list of evaluations (level, assessment, recommendation, scores), level changes over time, attendance totals, and — if level 6–8 — comparison of `best_gross_score` / averages against `level_benchmarks`.

### 11.5 `GET /api/evaluations/summary?band_id=&month=YYYY-MM-01`
Band summary report for a month: all juniors in the band with that month's evaluation, including sign-off status. Columns the frontend renders differ by band (`skills` / `practice_scores` / `competition`), so include all relevant fields and let the frontend pick.

### 11.6 `GET /api/juniors/:id/monthly-report?month=YYYY-MM-01`
One golfer's full monthly report: profile basics + that month's evaluation (band-aware fields) + attendance summary derived from `attendance`.

### 11.7 `GET /api/coaches/:id/schedule?week=YYYY-MM-DD`
All `sessions` for the coach in the week containing the given date.

### 11.8 `GET /api/users/:id/handicap-history`
All `rounds` for the user ordered by `date_played`, with `score_differential` and `handicap_before`/`handicap_after` snapshots.

---

## 12. Build order

Ship each phase fully (models + migrations + CRUD + filters + seed + tests + OpenAPI) before the next.

1. **Phase 1 — Foundation:** auth, `users`, roles/permissions, `courses`, `tee_sets`, `holes`. Seed course data (10.1–10.3).
2. **Phase 2 — Tournament:** `tournaments`, `teams`, `matches`, `penalties`. Seed tournament defaults (10.6). Implement `/leaderboard`, `/stroke-calc`, `/head-to-head`.
3. **Phase 3 — Junior development:** `level_bands`, `level_benchmarks`, `junior_profiles`, `evaluations`, (optional `badges`). Seed bands & benchmarks (10.4–10.5). Implement `/progress`, `/evaluations/summary`, `/monthly-report`. Enforce one evaluation per (junior, month).
4. **Phase 4 — Coaching:** `classes`, `class_enrollments`, `sessions`, `attendance`, `booking_requests`. Implement `/coaches/:id/schedule`.
5. **Phase 5 — Scoring:** `rounds`, `hole_scores`. Implement `/handicap-history`.
6. **Phase 6 — Hardening:** validation coverage, permission tests, OpenAPI complete, data-migration scripts from the existing Excel/Word sources.

---

## 13. Validation & business rules the backend must enforce

- **Enums:** reject any value outside Section 5 with `400`.
- **FKs:** reject references to non-existent rows with `400`/`404`.
- **Unique:** `users.email`; `teams.name` within a tournament; one `evaluations` row per (`junior_id`, `report_month`).
- **Matches:** `winner_id` must equal `team_a_id` or `team_b_id`; `winner_id` must be null when `result = tie`; `team_a_id` ≠ `team_b_id`.
- **Penalties:** `team_id` must be one of the match's teams when `match_id` is set.
- **Junior level:** `current_level` 1–9; set `band_id` to the band whose `[min_level, max_level]` contains it.
- **Holes:** exactly 18 per course; `stroke_index` unique 1–18; `hole_number` unique 1–18.
- **Sign-off order:** `committee_signed` may only be true if `coach_signed` is true.
- The backend does **not** compute handicaps, score differentials, or stroke allocation for storage — those are frontend/aggregate concerns. It only stores values and serves the aggregate endpoints in Section 11.

---

*End of backend build guide. This document is the contract: if a model, field, enum, route, seed value, or rule is here, build it as written.*
