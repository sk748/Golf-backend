# Karen Golf Frontend — Progress Tracker

Single source of truth for **what's done** and **what's left**, mapped to the
phased build plan in [`CLAUDE.md`](CLAUDE.md). Update this file as work lands —
not `CLAUDE.md`, which stays locked.

**Legend:** ✅ done · 🟡 in progress · ⬜ not started · ⏸️ deferred

---

## At a glance

| Phase | Area | Status |
|------|------|--------|
| 0 | Project scaffold + auth foundation (api client, RequireRole, login/register) | ✅ |
| 1 | Role shell + admin foundation (RoleNav, role-routed dashboard, user mgmt, course reference) | 🟡 |
| 2 | Scoring, rounds & handicap (scorecard, /scores/sync, handicap history) | 🟡 |
| 3 | Juniors: profiles, progress, band-conditional evaluations + sign-off | 🟡 |
| 4 | Coaching: attendance, weekly schedule, session requests | ⬜ |
| 5 | Tournaments (backend live; shared read-only list+detail shipped) | 🟡 |
| 6 | Ship: states, a11y, responsive, prod build | ⬜ |
| 7+ | Deferred (billing/participant groups, series polish, notifications, bulk import) | ⏸️ |

**Roles shipped:** admin ✅ · player ✅ · coach 🟡 · committee ✅ · parent ✅.
admin and player are done end-to-end; committee is complete; parent is now
complete end-to-end (session-request submit + child-name display verified
against the merged backend — the two backend fixes landed in merge `7454e09`);
coach is complete except the "my juniors" widget, whose backend
(admin→coach assignment) now exists but has no UI yet.

Phases 1–3 are 🟡 because the work done so far is **role-sliced, not
phase-complete**: the admin slice of Phase 1 and the player-facing slices of
Phases 2–3 are built; the coach/committee/parent slices of those same phases
are not. See notes below for exactly what's in and what's out.

---

## Notes / decisions log

_Record here any decision Claude Code surfaces at end-of-phase that you want to
remember (e.g. a UX choice for a role's page, an empty-state pattern, a place
the API contract was ambiguous and how it was resolved)._

- _(kickoff)_ Backend is fixed and owned separately; frontend builds against the
  contract documented in `CLAUDE.md`.

### Phase 0 — done (branch `feat/frontend-phase0`)
- **Repo structure:** frontend lives at the **repo root** (monorepo alongside the
  Flask backend), matching CLAUDE.md's locked layout (`src/`, `index.html`,
  `vite.config.ts`, `package.json` at `/`). The locked-file/mock-data/build hooks
  match absolute paths, so root-level `src/lib/api.ts` & `src/types/api.ts` stay
  protected.
- **Tooling:** CLAUDE.md, the agreements, and `.claude/` tooling were committed to
  `main` (commit `70febe5`); this branch is cut from there. `.gitignore` now covers
  `node_modules/`, `dist/`, `__pycache__/`, and `.claude/worktrees/`.
- **`.env.example`:** appended a frontend (Vite) section; backend Flask vars left
  intact. Dev uses relative `/api` paths via the Vite proxy → `http://localhost:5000`.
- **api client (`src/lib/api.ts`, locked):** token attach, query builder, envelope
  unwrap (`.data`) **with the auth exceptions** (login/register `{token,user}`,
  `/auth/me` bare user fetched raw), error normalize (plain-string vs
  `{code,message,fields}`, friendly 429), and 401 → clear token + redirect `/login`
  (no refresh logic). `authApi.login/register/me` centralize the raw calls.
- **Auth/guards:** `AuthProvider` (+ split `auth-context`), `useAuth`, `RequireRole`
  (unauth → `/login`; wrong role → own `/`), `PublicOnly` (authed away from auth pages).
- **Pages:** Login, Register (player/parent only; players add DOB+gender to bootstrap
  a junior profile), and a minimal **role-routed Dashboard stub** — real per-role
  dashboards are Phase 1 and will be shown for review first (WORKING_AGREEMENT).
- **Verified:** `tsc` ✓, `eslint` ✓, `vite build` ✓. Live smoke vs the running
  backend confirmed the full auth contract (register → `/auth/me` → login → bad-login
  401 → garbage-token 401) and that the Vite dev proxy forwards `/api` → :5000.
- **Decision deferred:** TS pinned to ~5.7 so `erasableSyntaxOnly` was dropped from
  tsconfig; proxy target hardcoded to `http://localhost:5000` per CLAUDE.md (no
  `@types/node` needed).
- **Note for Phase 5:** the backend **tournaments domain is already live** (this
  monorepo's backend was built/migrated earlier), so Phase 5 is no longer blocked on
  backend availability.

### Design foundation — done (branch `feat/frontend-phase0`)
- Adopted the **KCC design system** (`docs/KCC_DESIGN_SYSTEM.md`) as the visual base:
  dark navy / azure / gold / silver / slate, glassmorphism, DM Sans + JetBrains Mono.
  Where the doc conflicted with the build it was overridden — kept the **real 5 roles**
  (committee added; player uses the "student" azure treatment, committee = violet).
- **Tailwind v4 `@theme` tokens** + global CSS (fonts via Google Fonts link, `.glass`/
  `.glass-light`, fade/slide/stagger animations w/ reduced-motion, scrollbar, selection).
- **Primitives** (`src/components/ui/`): Button, GlassCard, Badge + RoleBadge, Avatar,
  StatCard — all with `data-testid`s. `cn()` helper. (SidebarItem/AppShell deferred to
  Phase 1.)
- **Pre-signup landing page** (`/` when logged out): full-bleed **photo slideshow**
  (auto-collects from `src/assets/landing/` via `import.meta.glob` — drop a file to add
  one), navy scrim, hero + auth CTAs. Logo at `public/kcc-logo.png`.
- **Routing:** `/` now switches via `Home` — Landing when logged out, role Dashboard when
  logged in; `/login`+`/register` still `PublicOnly`. Auth flow / locked api.ts untouched.
- Restyled Login, Register, Dashboard, FullPageMessage to the system.
- Added approved deps **lucide-react** + **recharts** (recharts unused until charts land).
- Verified: tsc ✓, eslint ✓, vite build ✓; api-contract-auditor PASS (locked files
  untouched, no mock data, 5 roles intact, no WHS math).
- _Known follow-up:_ hero JPGs are full-res (~2 MB total) — fine for now; can add image
  optimization later if landing load matters. Logo is azure-on-transparent (doc said
  "white"); placed over scrim/navy where it reads — a white/mono version would be nicer.

### App shell + admin experience — done (branch `feat/frontend-phase0`)
- **App shell + protected layout** (`2963df3`): `AppShell` + role-aware nav, protected
  layout routing. This is the Phase 1 shell that all role dashboards plug into.
- **Admin pages** (`src/pages/admin/`): Dashboard (`/api/admin/stats`), User management
  (list + create coach/committee, assign roles), Course reference (`/api/courses-with-tees`),
  and a dedicated **Audit log** page wired to the real backend audit log.
- **Backend additions** (landed on the app branch, merged from `tournaments-domain`):
  descriptive **audit log** (model + service + endpoint), and **player self-service
  endpoints** for the student dashboard. Tournaments domain (replacing legacy Rumble)
  + Alembic baseline + refreshed Swagger are also in the backend.
- **Dev quick-login** (`4e7f37f`): click a role to sign in — dev-only convenience.
- _Phase 1 status:_ 🟡 — **admin slice complete**; coach/committee/parent still land on
  routing stubs. RoleNav + role-routed `/` entry exist.

### Player (student) experience — done (branch `feat/frontend-phase0`, last pipeline)
- **Player dashboard** (`PlayerDashboard.tsx`): charts, level progress, recent games.
- **Achievements** (`AchievementsPage.tsx` + `src/features/achievements/`): wall of badges,
  level meter, expanded achievement ladders + level-card hover preview.
- **Progress + handicap** (`PlayerProgressPage.tsx`, `PlayerHandicapPage.tsx`): progress
  against band, handicap history, dashboard drill-downs, `RoundScorecardModal` for viewing
  a round's scorecard. All WHS/handicap figures **read from the API** — no recompute.
- _Verified:_ `tsc` ✓, `eslint` ✓, `vite build` ✓ (2026-06-09).
- _Build advisory:_ main JS bundle ~793 kB (232 kB gzip) trips Vite's 500 kB soft warning.
  Not a failure — flag for **route-level code-splitting** before Phase 6 ship.
- _Scope note:_ Phases 2–3 are 🟡 because these are the **player-facing read views** of
  scoring/handicap/progress. Still outstanding for those phases: the **scorecard entry**
  component + `/api/scores/sync` submission (Phase 2), and junior **profiles** + the
  **band-conditional evaluation form** with coach→committee sign-off (Phase 3).

### Coach / Committee / Parent role pages — done (branch `feat/frontend-phase0`)
Built one role per subagent, on **supported endpoints only** (full feature scope deferred —
Sam's call). Main thread owned the shared wiring (App.tsx routes, nav-config, RoleDashboard
dispatch); subagents built each `src/pages/<role>/` folder. Build green (tsc + lint + vite),
api-contract-auditor run.

- **Committee** (`src/pages/committee/`): `CommitteeDashboard` + `CommitteeEvaluationsPage`
  (`/evaluations`). Counter-sign queue (`coach_signed=true & committee_signed=false`),
  read-only band-specific evaluation detail, **counter-sign disabled until `coach_signed`**
  (sequential sign-off enforced), per-band summary (`/api/evaluations/summary`). Golfer names
  resolved via `/api/juniors` + `/api/users?role=player` join. **No gaps.**
- **Coach** (`src/pages/coach/`): `CoachDashboard` + `CoachSchedulePage` (`/schedule`) +
  `CoachAttendancePage` (`/attendance`). Weekly schedule (`/api/coaches/:id/schedule?week=`),
  evals awaiting my sign-off + coach-sign, bulk attendance against a session's class roster.
  Names resolved via the same join; session/enrollment types trimmed to the real backend
  shape after audit. **Deferred:** "my juniors" widget (needs admin→coach assignment backend).
- **Parent** (`src/pages/parent/`): `ParentDashboard` + `ParentChildPage` (`/my-child`) +
  `ParentSessionsPage` (`/sessions`). Child progress/handicap (handicap gated on presence),
  read-only evaluations via `/api/juniors/:id/progress` (NOT `/api/evaluations`), session
  requests list. Multi-child supported.
  - ✅ **Backend fixes landed (merge `7454e09`) — parent now complete end-to-end:**
    1. `POST /api/booking-requests` derives `parent_id` from the JWT (+ defaults status) →
       "Request a session" submit returns 201. Verified via the Vite proxy path.
    2. `/api/juniors` embeds `full_name` → `childName()` renders the real name (the pages were
       already written to read it; no frontend change needed). Verified.
  - **Still deferred:** parent tournaments UI (RSVP/approve-decline) — backend exists, UI not built.

### Phase 5 — Tournaments (in progress)
Backend domain is fully live and the two branches are unified (merge `7454e09`).
- ✅ **Shared foundation shipped** (`98867f6`): read-only tournament **list + detail**
  for every signed-in role (`/tournaments`, `/tournaments/:id`) — cards w/ format/status/
  eligibility, detail w/ eligibility panel + divisions. `src/pages/tournaments/`. tsc+lint+
  build green; contract-audit PASS; live proxy smoke green.
- ✅ **RSVP → parent-approval flow shipped** (`edf871e`, + backend self-cancel `475b545`):
  player "I'm interested" → `interested`; parent **Register / Approve / Decline / Withdraw**
  per child on the detail page; **"Tournament approvals"** queue on BOTH the parent dashboard
  and `/my-child`; player can self-cancel an RSVP while still interested. Display-only
  eligibility gating (backend authoritative). tsc+lint+build green; contract-audit PASS;
  full lifecycle verified via proxy.
- ✅ **Score entry + leaderboard shipped** (`a09c291`): read-only **leaderboard** section on
  the detail page (all roles; division tables, ties marked); admin/coach **score-entry** screen
  at `/tournaments/:id/enter-scores` — per-hole scorecard (par/SI display, running total) +
  total-gross fallback (hidden for Stableford), gated on `in_progress`, edit-safe (per-hole
  submit requires all holes). Backend owns all math; verified live end-to-end (per-hole
  Stableford → net/points/course-handicap + handicap-index update → leaderboard rank).
- ✅ **Create/edit + status control + divisions shipped** (`b158c0f`): admin/coach
  `/tournaments/new` + `/tournaments/:id/edit` form (format, scoring basis, course→tee,
  holes, dates, counts-toward-handicap, eligibility), a **divisions manager** (add/edit/delete)
  in edit mode, and a **status lifecycle control** on the detail page (Open/Close/Start/
  Complete + Cancel) — closes the score-entry seam (advancing to `in_progress` is now
  self-service). Client-side validation (backend is permissive). Verified live end-to-end.
- **Next tournament passes (not built):** match-play **bracket** (generate-bracket / bracket
  view / advance winners); **external results** (log + feed junior stats); **series standings**.

### Next up (other)
- Coach **"my juniors"** widget + admin **assign-coach** UI (backend live, no UI yet).
- _(Later)_ Per-role **additional scope**, and the coach band-conditional **evaluation
  creation form** + coach sign-off (Phase 3 core). Pre-staging: retire dev `create_all`
  in favour of `flask db upgrade` (migrations baseline now exists).
