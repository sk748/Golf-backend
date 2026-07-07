# Workstream 5 — Ease of Adjustment / Maintainability

Production-readiness audit, Karen Golf Management Platform. Findings only — no
application code was changed. Every claim cites `file:line` or a file path.
Audit date: 2026-07-07.

Scope: backend Flask modules under `backend/app/<domain>/`, frontend
React/TS under `frontend/src/`, config, tests, typing, dead code, and the
`.claude/` developer tooling.

---

## 1. Module consistency

### The house pattern

The intended per-module shape is `routes.py` + `controllers.py` + `models.py`,
with routes as thin HTTP adapters that import business functions from
`controllers.py`, and a shared schema helper `SimpleModelSchema` from
`backend/app/utils/schemas.py:8`. Blueprints are all registered centrally in
`backend/app/main.py:23-40` (imports) and `backend/app/main.py:74-91`
(`register_blueprint` calls). The wiring is clean and consistent: e.g.
`backend/app/rounds/routes.py:4-10` imports named controller functions, and
`backend/app/rounds/controllers.py:15-52` holds the DB logic.

18 domain modules exist under `backend/app/`: admin, announcements, attendance,
audit, auth, coach_analytics, courses, evaluations, events, handicap, juniors,
league, messaging, notifications, rounds, sessions, tournaments, whs. All 18
import `SimpleModelSchema` (grep: 18 files).

### Conformance of the sampled modules

| Module | routes | controllers | models | Notes |
|---|---|---|---|---|
| admin | ✅ | ✅ (`admin/controllers.py`) | ✅ | conforms |
| auth | ✅ | ✅ | ✅ | conforms; best-documented |
| rounds | ✅ | ✅ | ✅ | conforms |
| evaluations | ✅ | ✅ | ✅ | conforms |
| juniors | ✅ | ✅ | ✅ | conforms; large (see §3) |
| tournaments | ✅ | ✅ | ✅ + `scoring.py` | extra `scoring.py` (backend-authoritative scoring, 225 lines) — acceptable |
| whs | ✅ | ✅ | ✅ | conforms; `controllers.py` is the WHS math engine |
| sessions | ✅ | ✅ | ✅ | conforms |
| courses | ✅ | ✅ | ✅ | conforms |

### Outliers (flagged)

- **`announcements/` has NO `controllers.py`.** Files are only `__init__.py`,
  `models.py`, `routes.py`. All logic lives inline in the route module
  (`backend/app/announcements/routes.py` is 336 lines and contains SQL audience
  resolution, e.g. `_roles_contains` at `announcements/routes.py:51` and
  `_audience_user_ids` at `announcements/routes.py:57`). This is the single
  clearest "logic in routes" violation of the house pattern.
- **`notifications/` has NO `controllers.py`.** It uses a `service.py`
  (`backend/app/notifications/service.py`, 18 lines) plus `routes.py` (68
  lines). Different naming convention (`service` vs `controllers`) for the same
  role.
- **`audit/` has BOTH `controllers.py` and `service.py`**
  (`backend/app/audit/service.py`, 100 lines) — a third pattern again
  (service layer alongside controllers).
- **`coach_analytics/` has NO `models.py`.** Files are `controllers.py`,
  `export.py`, `routes.py` (it reads other modules' models). The extra
  `export.py` (205 lines) is an unusual sibling.
- **`messaging/`** carries data files in the module dir: `banned_words_en.txt`,
  `banned_words_local.txt`, and `wordlist.py` alongside the standard three.
  Reasonable (profanity filter) but worth noting as a shape deviation.

Net: three different names for "the layer below routes" (`controllers`,
`service`, both) and two modules with logic pushed into `routes.py`. Not
broken, but a new contributor cannot rely on one convention.

### Tests per module (see §6 for the risk mapping)

`backend/tests/` contains 11 test files + `conftest.py`. Mapping module imports
inside the tests (`grep 'from app.<module>'`):

- **Have direct test coverage:** auth (7 refs), tournaments (4), notifications
  (4), juniors (4), courses (2), audit (2), rounds (1), evaluations (1),
  announcements (`test_announcements_api.py`), plus cross-cutting suites
  `test_access_scoping.py`, `test_player_self.py`, `test_scoring.py`,
  `test_achievements_sync.py`, `test_badges_api.py`.
- **ZERO tests:** admin, attendance, coach_analytics, events, handicap, league,
  messaging, sessions, and whs (no `from app.whs` import in any test — the WHS
  engine is only exercised indirectly, if at all, via `test_scoring.py`).

---

## 2. Config centralization

- Config is centralized in **`backend/config.py`** with `TestingConfig`,
  `DevelopmentConfig`, `ProductionConfig` (`backend/config.py:15,25,37`).
  Good practices present: secrets read from env
  (`backend/config.py:39-40`), a production `validate()` that fails fast on
  missing `SECRET_KEY`/`DATABASE_URI` (`backend/config.py:44-52`), and a
  rate-limit flag that env cannot weaken below the production default
  (`backend/config.py:42`).
- Runtime knobs that live in `main.py` rather than `config.py`: JWT expiry
  (`backend/app/main.py:41-42`), CORS allowed origins from `FRONTEND_URL`
  (`backend/app/main.py:45`), and security headers
  (`backend/app/main.py:60-68`). These are hardcoded/inline rather than in the
  config classes — minor centralization gap.
- **WHS constants are correctly localized to the WHS engine**, honoring the
  CLAUDE.md rule that WHS math lives only in the backend. The `113` slope
  baseline and the formulae appear only in
  `backend/app/whs/controllers.py:18` (Course Handicap) and
  `backend/app/whs/controllers.py:46` (Score Differential), documented in
  `backend/app/whs/routes.py:85`. No scoring formula leaked into the frontend
  (`frontend/src/lib/` has no `whs.ts` — see §7; and no WHS constant grep hit in
  frontend source).
- **Band minimums are NOT hardcoded** — `min_sessions` is a DB column on the
  level band model (`backend/app/juniors/models.py:70`), i.e. seeded reference
  data, which is the correct approach.

Verdict: config posture is good. The only cleanup is moving JWT expiry / CORS /
headers into the config classes so all environment-varying knobs sit together.

---

## 3. Dead code / TODO / FIXME / oversized files

### TODO/FIXME/XXX/HACK

Effectively **zero** developer markers in application code. A full grep of
`backend/app` and `frontend/src` returned only one hit, and it is a false
positive: the literal word `xxx` inside the profanity wordlist
(`backend/app/messaging/banned_words_en.txt:405`). This is a positive signal —
no abandoned TODO debt.

### Dead code (flagged)

- **`backend/app/schemas/` is dead code.** `app/schemas/user.py:2` does
  `from app.schemas.golf import SimpleModelSchema`, and
  `app/schemas/golf.py:7` does `from app.golf.models import MODEL_REGISTRY` —
  but **there is no `app/golf/` module** (it was the pre-split monolith; note
  the repo root artifact `Golf-backend-restructure-split-apps-phase0.zip`).
  Importing `app/schemas/` would raise `ImportError`, and nothing imports it
  (grep for `from app.schemas` finds only the internal cross-import). The live
  schema helper is the duplicate `backend/app/utils/schemas.py`, used by all 18
  modules. **Recommend deleting `backend/app/schemas/`** (`__init__.py`,
  `golf.py`, `user.py`) — it is a leftover from the restructure and will
  mislead new contributors into editing the wrong file.

### Oversized files (>~400 lines — review candidates)

Backend (excluding `venv/` and `migrations/`), largest first:

| Lines | File |
|---|---|
| 1343 | `backend/scripts/seed_demo.py` (seed script — acceptable) |
| 1136 | `backend/app/tournaments/controllers.py` |
| 999 | `backend/app/juniors/controllers.py` |
| 663 | `backend/app/juniors/routes.py` |
| 608 | `backend/app/messaging/controllers.py` |
| 574 | `backend/app/tournaments/routes.py` |
| 480 | `backend/app/league/controllers.py` |
| 475 | `backend/app/messaging/routes.py` |
| 403 | `backend/app/sessions/routes.py` |

`tournaments/controllers.py` (1136) and `juniors/controllers.py` (999) are the
two backend hotspots to consider splitting.

Frontend (`frontend/src`), largest first — many single-page components far
exceed a comfortable review size:

| Lines | File |
|---|---|
| 1709 | `frontend/src/pages/league/LeagueManagePage.tsx` |
| 1381 | `frontend/src/pages/tournaments/TournamentFormPage.tsx` |
| 1274 | `frontend/src/pages/coach/CoachWriteEvaluationPage.tsx` |
| 1173 | `frontend/src/pages/coaching/CoachSessionsPage.tsx` |
| 1168 | `frontend/src/pages/juniors/JuniorProfilePage.tsx` |
| 1157 | `frontend/src/pages/tournaments/TournamentDetailPage.tsx` |
| 1056 | `frontend/src/pages/parent/ParentChildPage.tsx` |
| 963 | `frontend/src/pages/tournaments/TournamentExternalResultsPage.tsx` |
| 849 | `frontend/src/pages/tournaments/TournamentBracketPage.tsx` |
| 814 | `frontend/src/pages/announcements/AnnouncementsPage.tsx` |

`LeagueManagePage.tsx` at 1709 lines is the single biggest maintainability
liability in the frontend and the top candidate for decomposition into
sub-components + colocated `.queries.ts`.

---

## 4. Typing posture

### Backend

- **`mypy==0.991` is pinned in `backend/requirements.txt:56`** — but there is
  **no mypy config** anywhere (`mypy.ini`, `setup.cfg`, `pyproject.toml`,
  `tox.ini` all absent), so no `strict`/`disallow-untyped-defs` policy is set,
  and mypy is **not installed in the active venv** (running
  `./venv/bin/python -m mypy` returns *"No module named mypy"*). So it is
  pinned-but-dormant: not part of CI or the verify loop.
- Type hints on public functions are **partial and inconsistent**. Some
  controllers annotate (`get_round(round_id: int)`, `create_round(data: dict)`
  at `backend/app/rounds/controllers.py:31,34`), but siblings in the same file
  do not (`list_rounds(user_id=None, ...)` at
  `backend/app/rounds/controllers.py:15` — no hints, no return type). No
  controller function carries a return-type annotation in the sampled files.
- **Recommended command** (venv exists, so install first):
  ```bash
  cd backend
  ./venv/bin/pip install mypy==0.991
  ./venv/bin/python -m mypy app --ignore-missing-imports
  ```
  Then add a `[mypy]` section (start lenient: `ignore_missing_imports = true`,
  `check_untyped_defs = true`; ratchet toward `disallow_untyped_defs` per
  module) and wire it into the pre-commit/verify flow so the pin earns its keep.

### Frontend

- **TypeScript strict mode is ON** and then some. `frontend/tsconfig.app.json`
  sets `"strict": true` plus `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`
  (`frontend/tsconfig.app.json:16-21`). This is a strong typing posture.
- Type-check is a real script: `"type-check": "tsc -b --noEmit"` and
  `"build": "tsc -b && vite build"` (`frontend/package.json:9,8`), so type
  errors block the build. Good.

---

## 5. Docstrings (controller spot-check)

Density is uneven. Counting docstring lines vs `def` count per controller:

- Well documented: `auth/controllers.py` (12 docstring lines / 14 defs),
  `tournaments/controllers.py` (30 / 55), `juniors/controllers.py` (26 / 50),
  `whs/controllers.py` (8 / 4). Example of a good one:
  `backend/app/evaluations/controllers.py:12-19` (`latest_player_feedback`
  explains the anonymization intent).
- Thin or missing: **`courses/controllers.py` has ZERO docstrings across 17
  functions**; `admin/controllers.py` (1 / 4), `evaluations/controllers.py`
  (2 / 12), `sessions/controllers.py` (6 / 26), `rounds/controllers.py`
  (6 / 14). Public functions like `create_round` /`update_round`
  (`backend/app/rounds/controllers.py:34,40`) are undocumented.

Verdict: the "smart" domains (WHS, tournaments, juniors, auth) are documented;
the CRUD-ish ones (courses, admin, sessions) are not. Acceptable but worth a
docstring pass on the public controller surface.

---

## 6. Test-coverage gaps mapped to risk

High-risk = auth / PII / WHS-or-scoring / money-adjacent(handicap-writing).

| Module | Risk driver | Tests? |
|---|---|---|
| auth | credentials, JWT, PII | ✅ `test_auth_api.py`, `test_access_scoping.py`, `test_player_self.py` |
| tournaments | scoring, handicap writes | ✅ `test_tournaments_api.py` |
| evaluations | sign-off gating (coach→committee) | ✅ `test_evaluations_signoff.py` |
| rounds | score sync → handicap engine | ✅ `test_scoring.py` (partial) |
| **whs** | **the handicap math engine itself** | ❌ **ZERO** direct tests (`whs/controllers.py:18,46` untested except indirectly) |
| **handicap** | writes/derives handicap journey | ❌ **ZERO** tests |
| **juniors** | **PII** (DOB, gender, medical, goals) | ⚠️ only `test_badges_api.py` touches it; core profile CRUD untested |
| **admin** | privileged user creation / role assignment | ❌ **ZERO** tests |
| **messaging** | moderation, banned-words, PII in DMs | ❌ **ZERO** tests |
| attendance | feeds band-minimum progress | ❌ ZERO tests |
| sessions | booking / scheduling | ❌ ZERO tests |
| league | standings/scoring | ❌ ZERO tests |
| coach_analytics | data export | ❌ ZERO tests |
| events | RSVP | ❌ ZERO tests |

**Top-priority gaps:** (1) **`whs`** — the handicap engine is the app's crown
jewel and has no dedicated unit tests over its formulae; a regression here
silently corrupts every player's index. (2) **`admin`** — the only path that
mints privileged (coach/committee/admin) accounts, untested. (3) **`juniors`**
— holds the most PII and only its badge sub-feature is tested. (4)
**`messaging`** — moderation surface, untested.

---

## 7. Frontend structure vs the CLAUDE.md target layout

The target layout (CLAUDE.md "Repository layout") is `src/{lib,types,auth,
components,pages/<feature>}`. Reality:

- **Matches:** `frontend/src/lib/api.ts` (the single client, no direct `fetch`
  anywhere else — grep for `fetch(` outside `lib/api.ts` returns nothing),
  `frontend/src/types/`, `frontend/src/auth/` (`RequireRole.tsx`,
  `AuthProvider.tsx`, `useAuth.ts` all present as specified, plus a sensible
  `PublicOnly.tsx`), `frontend/src/components/`, and `pages/<feature>/` folders
  by feature with colocated `*.queries.ts` (40 query files — a clean,
  consistent TanStack convention).

### Drift (flagged)

- **`src/lib/whs.ts` is MISSING.** CLAUDE.md's target layout explicitly lists
  `src/lib/whs.ts` for display helpers; `frontend/src/lib/` contains only
  `api.ts`, `cn.ts`, `time.ts`. WHS display formatting must currently be inline
  in pages. Not a correctness problem (no math is being recomputed), but it is
  documented-vs-actual drift.
- **`src/features/` is an undocumented top-level dir** (achievements, badges,
  benchmarks, competition, easter-egg, handicap, participant, tour). Not in the
  CLAUDE.md layout. It is a reasonable "cross-page feature" bucket, but it
  overlaps conceptually with `pages/` and `components/`, so the boundary
  ("when does something live in `features/` vs `pages/` vs `components/`?") is
  undefined — a source of future inconsistency.
- **`src/hooks/`** (`useBreakpoint.ts`) is also outside the documented layout
  (minor).
- Page count has grown well beyond the CLAUDE.md phase plan (league, messaging,
  calendar, announcements, easter-egg, profile, coaches, coaching all exist) —
  the app is further along than the layout doc reflects. The doc, not the code,
  is stale; worth reconciling CLAUDE.md's layout section.

Overall the frontend is **more disciplined than the backend** on convention
(one client, colocated queries, strict TS), with the main drift being the
missing `whs.ts` and the undocumented `features/` layer.

---

## Guide A — How to add a new backend module / endpoint

Based on the observed pattern (e.g. `rounds`).

1. **Create the module dir** `backend/app/<domain>/` with:
   - `__init__.py`
   - `models.py` — SQLAlchemy models. Register them so `register_all` picks
     them up (`backend/app/models.py` / `backend/app/main.py:19` calls
     `register_all()`).
   - `controllers.py` — the business logic. Instantiate schemas at the top with
     `SimpleModelSchema` from `app.utils.schemas` (NOT the dead
     `app/schemas/` — see §3), e.g.
     `round_schema = SimpleModelSchema(Round)`
     (`backend/app/rounds/controllers.py:8`). Write plain functions
     (`create_x(data: dict)`, `list_x(...)`) that own the DB session and
     commit. **Add type hints and a docstring** — the codebase is inconsistent
     here, so hold the higher bar.
   - `routes.py` — define the Blueprint with `url_prefix="/api"`
     (`backend/app/rounds/routes.py:13`), import named functions from
     `controllers`, and keep handlers thin: parse request, call controller,
     wrap in the `{ "data": ... }` envelope via the local `_data`/`_err`
     helpers (`backend/app/rounds/routes.py:16-30`). Guard with the decorators
     from `app.utils.decorators` (`require_roles`, `require_auth`,
     `admin_only`, `get_current_user`, `has_role`). **Do not put SQL/logic in
     routes** (the mistake `announcements/` made).
2. **Register the blueprint in `main.py`** — add the import beside the others
   (`backend/app/main.py:23-40`) and the `app.register_blueprint(...)` call
   (`backend/app/main.py:74-91`), with the URL-prefix comment.
3. **Create a migration:** `cd backend && ./venv/bin/flask db migrate -m
   "add <domain>"` then `flask db upgrade` (schema is managed only by
   Flask-Migrate — `create_all` was retired, see `backend/app/main.py:50-55`).
4. **Write a test** in `backend/tests/test_<domain>_api.py` using the fixtures
   in `backend/tests/conftest.py`. **This is the step most often skipped** —
   9 of 18 modules have none (§6). At minimum cover role scoping and the happy
   path.

## Guide B — How to add a new role-guarded frontend page

Based on the observed pattern and the committed `/new-page` tooling.

1. **Run the `/new-page` skill first** (`.claude/commands/new-page.md`). It
   forces a Plan-Mode proposal — role(s) + guard, endpoints (must already exist
   in CLAUDE.md), TanStack keys + invalidations, component breakdown, and
   empty/loading/error states — before any code. This is a *help*, not a
   hindrance: it encodes exactly the review this workstream would otherwise ask
   for by hand.
2. **Create the page** under `frontend/src/pages/<feature>/<Name>Page.tsx`, and
   colocate its data hooks in `frontend/src/pages/<feature>/<feature>.queries.ts`
   (the established 40-file convention). All server data via TanStack Query with
   resource-mirrored keys; mutations invalidate the keys they touch.
3. **Fetch only through `frontend/src/lib/api.ts`** — never a raw `fetch`, never
   a hardcoded backend URL. The `guard-mock-data.sh` PreToolUse hook physically
   blocks direct `fetch`/mock arrays in `src/`
   (`.claude/hooks/guard-mock-data.sh`).
4. **Register the route in `frontend/src/App.tsx`** inside the correct
   access-tier wrapper — the app already defines `AdminOnly`, `StaffOnly`,
   `CoachAdminOnly`, `AdminCommitteeOnly`, `PlayerOnly`, `ParentOnly` as
   `<Outlet/>` guards (`frontend/src/App.tsx:59-104`), each backed by
   `RequireRole` (`frontend/src/auth/RequireRole.tsx:17`). Prefer nesting the
   route under an existing tier over repeating `RequireRole` per leaf.
5. **For parent/player pages, request only that user's own data** (CLAUDE.md
   role rules). Guards redirect out-of-role deep-links to `/`, they do not error
   (`frontend/src/auth/RequireRole.tsx:29-31`).
6. **After implementing, run the two subagents** (`/new-page` invokes them):
   `api-contract-auditor` (contract + role-access review,
   `.claude/agents/api-contract-auditor.md`) and `build-runner` (tsc + lint +
   `vite build`, `.claude/agents/build-runner.md`). The `run-build.sh`
   PostToolUse hook also type-checks after edits to `src/*.ts(x)`.

**Tooling verdict:** the `.claude/` setup (2 agents, `/new-page` command, 4
hooks incl. `protect-locked-files.sh` guarding `api.ts`/`types/api.ts`/CLAUDE.md)
clearly *helps* — it operationalizes the very rules this audit checks. One
friction point: per `.claude/README.md`, `settings.json` is git-ignored, so
after a fresh clone the hooks are **inert until** you
`cp .claude/settings.example.json .claude/settings.json` and
`chmod +x .claude/hooks/*.sh`. A new dev who skips that step gets none of the
guardrails silently — worth surfacing in onboarding (below).

---

## Developer onboarding (clone → run both)

```bash
# 0. Clone
git clone <repo> && cd "KCC- JDPP"

# 1. Activate the Claude Code guardrails (else hooks are inert — see Guide B)
cp .claude/settings.example.json .claude/settings.json
chmod +x .claude/hooks/*.sh

# 2. Backend: venv + deps + DB
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt        # note: installs mypy 0.991 (pinned)
cp .env.example .env                    # set SECRET_KEY, DATABASE_URI, FRONTEND_URL
createdb karen_db                       # PostgreSQL must be running
flask db upgrade                        # apply migrations (no create_all)
python scripts/seed_demo.py             # optional demo/reference data
flask run --port 5000                   # or: python main.py  (see backend/RUNNING.md)

# 3. Frontend: npm + dev server (new terminal)
cd ../frontend
npm ci
cp .env.example .env                    # VITE_API_BASE empty in dev (proxy handles /api)
npm run dev                             # Vite proxies /api -> http://localhost:5000

# 4. Verify
#   backend:  http://localhost:5000/swagger  (non-prod only)
#   frontend: http://localhost:5173
cd backend && pytest                    # run the test suite
cd frontend && npm run type-check && npm run lint && npm run build
```

Reference docs already in-repo: `backend/RUNNING.md`,
`.claude/scripts/restart-servers.sh` (one-shot stack restart), `README.md`.

---

## Summary of concrete follow-ups (priority order)

1. Add unit tests for **`whs`** (the handicap engine), **`admin`** (privileged
   account creation), **`juniors`** (PII CRUD), **`messaging`** (moderation).
2. Delete the dead **`backend/app/schemas/`** package (imports a non-existent
   `app.golf` module).
3. Install + configure **mypy** (pinned but absent from the venv; no config)
   and wire it into CI/verify.
4. Normalize the below-routes layer name (**`controllers` vs `service`**) and
   move `announcements`/`notifications` logic out of `routes.py`.
5. Decompose the giant components (**`LeagueManagePage.tsx` 1709 lines**,
   `TournamentFormPage.tsx`, `CoachWriteEvaluationPage.tsx`) and the
   `tournaments`/`juniors` backend controllers (1136 / 999 lines).
6. Add the missing **`frontend/src/lib/whs.ts`** (or update CLAUDE.md) and
   reconcile the stale layout section against the real `features/` + expanded
   `pages/` tree.
