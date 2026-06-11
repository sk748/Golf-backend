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
| 3 | Juniors: profiles, progress, band-conditional evaluations + sign-off | ✅ |
| 4 | Coaching: attendance, weekly schedule, session requests | ⬜ |
| 5 | Tournaments (full lifecycle: create→RSVP/approve→scores→leaderboard/bracket→results; external results; series standings) | ✅ |
| 6 | Ship: states, a11y, responsive, prod build | ⬜ |
| 7+ | Deferred (billing/participant groups, series polish, notifications, bulk import) | ⏸️ |

**Roles shipped:** admin ✅ · player ✅ · coach ✅ · committee ✅ · parent ✅.
All five roles are complete end-to-end: coach gained the "My juniors" widget
(`ce8b938`) and the band-conditional evaluation creation form (`3cf9df7`);
admin gained the coach-assignment page; parent/player verified earlier.

Phases 1–2 stay 🟡 only because some cross-role polish from their definitions
(e.g. broader scorecard entry surfaces) is folded into the Phase 6 sweep; the
functional slices every role needs are built. See notes below.

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
- ✅ **Match-play bracket shipped** (`e4b2c8e`): `/tournaments/:id/bracket` (all roles
  view); admin/coach management panel — confirm `registered` entries, seed toggle
  (handicap/random), **generate bracket** (≥2 confirmed), inline **record result**
  (winner + result text, `in_progress` only); winners advance automatically backend-side.
  Rounds labelled Final/Semifinals/…. Privacy: club-wide `/api/juniors` name lookup gated
  to admin/coach; parent/player see `Golfer #id`. Bracket backend (generate → advance →
  record → validation) verified via app-context smoke.
- ✅ **External results shipped** (`8f5fa8a`): `/tournaments/external` (admin/coach) —
  log/edit/delete off-club events (Faldo / US Kids / JGF / Karen Open / other); reusable
  read-only **CompetitionHistory** card (competitions played + best gross + combined
  internal/external list) added to the player progress page and parent child page (reads
  only the backend-scoped `/api/juniors/:id/competitions`). Aggregation (count, best-gross
  min, date window) verified via app-context smoke.
- ✅ **Series / order-of-merit shipped** (`d4cac94`): `/series` + `/series/:id` (all roles
  view standings; admin create/edit/delete + points-scheme editor — `points_scheme`
  travels as the raw JSON string the backend stores); series picker on the tournament
  form; "Series standings" link on the detail page. Standings backend (completed-only
  aggregation, points/events, ranks, 404, null scheme) verified via app-context smoke.
- **Phase 5 mapped passes are all shipped.** Remaining for the phase is polish only
  (Phase 6 states/a11y/responsive sweep covers it).

### Coach assignment — done
- ✅ **Admin assign UI + coach "My juniors" widget** (`ce8b938`): `/coach-assignments`
  (admin) — all-juniors table with per-row coach select (assign/unassign inline),
  summary strip, coach filter; CoachDashboard "My juniors" card via
  `useCoachJuniors(user.id)`. Live-verified incl. the 403 (other coach's roster)
  and 400 (assigning a non-coach) guards.

### Phase 3 — coach evaluation creation (core smart-frontend piece) — done
- ✅ **Band-conditional evaluation form** (`3cf9df7`): `/evaluations/new` (admin+coach) —
  golfer+month picker, duplicate guard (existing row → status + coach-sign, not the
  form), exactly one band section by `report_template` (skills / practice scores /
  competition incl. backend-computed month-stats prefill), Save draft / Save & sign,
  specific 409 "already exists this month" handling. Backend hardening in the same
  commit: POST `/api/evaluations` derives `coach_id` from the JWT for coach callers.
  **Phase 3 remaining:** nothing structural — the coach slice (create+sign), committee
  slice (counter-sign, summary), and parent read-only view all exist.

### Pre-staging
- ✅ **Dev `create_all` retired** (`d25d6c4`): `flask db upgrade` is the single schema
  path everywhere; the restart script applies migrations before serving. Verified by
  rebuilding a clean DB from the chain and diffing schemas.
- Still open for staging: production env vars (DATABASE_URI / APP_SETTINGS / JWT
  secret / FRONTEND_URL), rate-limiter storage backend, `VITE_API_BASE` build config.

### Build phase 2 decisions (Sam, 2026-06-10) — the UX-completion build
Answers to the 14 decisions raised by the per-role UX gap evaluation:

1. **Round entry:** player AND coach can enter practice rounds.
2. **Verification:** player-entered rounds must be **verified by coach, admin, or
   committee** before counting toward the handicap (coach-verifies-first model).
3. **Counting:** per-round `counts` flag (practice-only vs counting).
4. **Sessions:** coach OR admin approve (one sign-off). Sessions are **group
   training sessions**: coach publishes a session with **max attendance, level/age
   requirements, session type (e.g. short game + putting)** and other reasonable
   requirements; multiple students can book the same slot if allowed.
5. **Junior profiles:** parent is the primary creator at signup; admin AND
   committee can also do in-person intake (committee acts for admin). **Parent
   consent always required.** A student may self-register by entering the
   **parent's club membership number**, which maps them to the parent → parent
   approves → then admin/committee approve.
6. **Promotion:** acts on a counter-signed `move_next_level` evaluation
   ("Promote to L{n+1}" action), traceable to the evaluation.
7. **Parent↔child linking:** at registration via the **club membership number**
   as the common code (see #5 flow).
8. **Series nav:** player, parent, coach, committee all get it (everyone).
9. **Committee junior browser:** FULL profile visibility (incl. medical/goals).
10. **Admin oversight:** evaluations list + coach schedules + attendance reports
    + session-requests queue; clicking a player profile shows **that player's
    dashboard view**. (Social features phase is scoped AFTER this build — keep
    profile views social-ready.)
11. **External results:** parents log for their own child; **staff verify**
    (verified flag, backend change).
12. **Account self-service:** none now.
13. **Code-splitting:** at ship (Phase 6).
14. **Guided tutorial:** finishing touches.

### Build phase 2 — ✅ ALL SHIPPED (2026-06-10)
Every pass: backend smoke-tested live via the proxy (self-cleaning), migration
verified up/down/up on a clean DB, tsc+lint+build green, api-contract-auditor
run (findings fixed pre-commit), both branches converged per commit.

1. **Series nav for all roles** (`0b53e84`).
2. **Rounds verification + counting** (`3fc7560` backend + `ef0740b` frontend):
   player/coach round logging (/log-round, per-hole or total), player-entered
   rounds pending until coach/admin/committee verify (/verify-rounds), per-round
   counts flag; index recomputes from verified+counting rounds only; pending/
   practice badges on player views. Migration `c4roundverify`.
3. **Group sessions** (`998ec10` + `5c07a25`): coach publishes bookable sessions
   (capacity, level/age bounds, focus, requirements) at /coach-sessions;
   players/parents book at /book-session; coach-or-admin one-sign-off approval;
   occupancy + eligibility enforced server-side. Migration `d5groupsession`.
4. **External-result verification** (`6404b76` + `023984b`): parents log on the
   child page, staff verify (/tournaments/external); unverified results listed
   but excluded from stats. Migration `e6extverify`.
5. **Promotion + profile editing** (`ba24d12` + `aa37c63`): 'Promote to L{n+1}'
   off a counter-signed move_next_level evaluation (stale/reuse-guarded);
   committee full profile edit; parents edit availability/medical/goals/
   experience on their child.
6. **Staff junior browser + oversight** (`d30993b`): /juniors (+ /juniors/:id
   full-profile 'player dashboard view' incl. medical for committee, staff edit
   for admin/committee); admin gets Evaluations + Schedules (coach picker);
   committee gets Juniors + Schedules.
7. **Membership-number signup chain** (`fb663ea` + `bdd6c4a`): parents record
   their club number; juniors self-register with it (pending_parent), parent
   approves (pending_staff), admin/committee activate; parents create child
   accounts directly (pending_staff); staff intake stays active-on-create;
   approval queues on the parent dashboard + staff browser. Migration
   `f7signupchain`.

### Social features phase decisions (Sam, 2026-06-11) — locked
1. **DM matrix:** admin↔everyone; coach↔everyone; parent↔staff
   (coach/admin/committee); player may *initiate* only to own assigned coach +
   admin (staff can always initiate to a player). NO player↔player, NO
   parent↔parent; committee cannot DM players.
2. **Oversight:** parent has full read visibility into their child's DMs and
   groups; admin sees ALL chats (dedicated oversight surface).
3. **Groups:** each coach roster auto-creates TWO chats — coach+players and
   coach+parents. Staff (admin/coach) can create ad-hoc groups. No per-session
   threads in v1.
4. **Messages are immutable.** No user edit/delete; admin can hide (original
   retained for audit).
5. **Safety pack:** flag button → admin review queue; TEXT-ONLY v1; banned-words
   filter (matches are *held* for admin review, not posted); first-contact
   notice to the parent when staff first DM their child; subtle persistent
   disclaimer in every chat (visible to parents/admin; abuse → disciplinary
   action; kid-simple wording, neither loud nor hidden).
6. **Internal announcements:** role + group/band targeting; admin + committee
   post, live immediately.
7. **External announcements:** committee drafts, admin publishes → public
   landing page.
8. **Notifications:** nav unread badges + bell feed (messages, flags for admin,
   first-contact notices, approval items). In-app only — no email.
9. **Transport:** polling via TanStack `refetchInterval` (~10s open thread,
   ~60s counts); SSE is the later upgrade path.

### Social features phase — ✅ SHIPPED (2026-06-11)
Backend (`9a5c373` + contacts `3ce697b`): app/messaging + app/announcements +
app/notifications; DM matrix, roster groups ×2 per coach, immutable messages
(held/hidden moderation, banned-word holds, flags), first-contact parent
notices, targeted announcements (committee external → draft → admin publish;
public landing endpoint), in-app notifications. Migration `g8social` verified
up/down/up; 31/31 app-context smoke checks + live HTTP smoke, DB pristine.
`GET /api/messaging/contacts` added for matrix-scoped DM target discovery
(players/parents can never list club users).

Frontend (this commit): `/messages` (all roles — list/thread/composer,
10s/30s polling, subtle conduct disclaimer, flagging, parent oversight
read-only threads, staff group creation), `/moderation` (admin — review queue
+ all-conversations browser, hide/release/resolve), `/announcements` (all
roles — scoped feed; staff composer with everyone/roles/band/coach-group
targeting; admin publish queue), public "Club News" on the landing page,
notification bell + Messages nav unread badge (60s poll). Built by three
parallel subagents; api-contract-auditor PASS (no CRITICAL/HIGH; oversight
mark-read 403 fixed pre-commit); tsc + lint + vite build green.

### Social phase round 2 — refinements (Sam, 2026-06-11)
Backend (each migration verified up/down/up on clean DB; live smoke; DB pristine):
- **Rate-limit dev toggle** (`86c4f7e`): RATELIMIT_ENABLED off in dev/test, on in
  prod (env-overridable). Auth throttle was locking developers out.
- **Message edit/delete** (`dee1111`): sender edits (keeps original_body, re-runs
  word filter, 'edited' marker to all) / soft-deletes (tombstone for all, body
  retained for admins). Reverses v1 immutability but keeps the audit trail —
  nothing scrubbed from admin view. Confirm step on both (Sam). Migration h9social2.
- **Featured award** (`dee1111`+`57139e6`): a player shows off ONE award in chat —
  an auto-unlocked achievement (catalog key) OR a staff badge; sender.featured_badge
  is a tagged union; hover card shows details. Picker on the Achievements page.
  Fixed award_badge (awarded_by NOT NULL was always failing). Migrations h9social2
  (featured_badge_id) + i10featured (featured_achievement_key).
- **Bell + toast** (`dee1111`): /api/notifications returns recent_messages; bell
  badge = unread messages + events; dropdown has a Messages section; top-right
  toast on new incoming messages (60s poll).
- **Announcement edit** (`ba712bd`): PUT /api/announcements/:id (author/admin),
  edited_at marker; confirm steps on post/publish/delete + edit. Migration j11annedit.
- **Cleanup**: removed 4 leftover test users + 2 junk announcements; dev DB now =
  5 seed users (one per role), zero social rows. Stray run_server.py/start-karen.sh
  deleted. (Sam will seed fuller demo data later.)
- Deferred/advanced-feature audit saved to `docs/DEFERRED_AND_ADVANCED_FEATURES.md`
  — input for the pre-reorg planning decision.

### Genuine-gaps build (plan fidelity, 2026-06-11) — ✅ SHIPPED
Closed the divergences vs the Junior Development Plan (ref/ docs). Charging
stays parked (type only). Backend `33f9020`, frontend `52fdb81`; migrations
k12participant → l13compreq → m14handicap verified up/down/up; live smoke per
wave; dev DB pristine (5 seed users, junior 1, 2 tournaments).
- **A participant type**: junior_profiles.participant_type (registered_junior /
  club_beginner / karen_academy); intake + STAFF-only edit (parents can't set)
  + browser filter.
- **C competition requirements**: tournament competition_type tag; per-band
  mandatory/encouraged (KJC L6–8, Faldo L9+) + 2–3 rounds/month;
  /api/juniors/:id/competition-requirements compliance card on player/coach/
  committee/parent.
- **B benchmark targets**: admin CRUD (/admin/benchmarks) + targets-vs-actuals
  on player progress (plan's L6/7/8 numbers).
- **D bulk intake import**: /import preview→confirm→commit (admin/committee);
  CSV → parent-linked juniors at pending_staff; DOB required (sheet = age groups).
- **E quarterly timetable**: /timetable groups clinics by band + age group;
  L1–3 max-6 guidance.
- **F L4–5 handicap journey**: app/handicap domain; coach plan editor + progress
  (signed cards + avg vs 9h 60–65 / 18h 120–130; "meeting" = at-or-below max).
- Tiered models (Haiku/Sonnet/Opus, no Fable); contract audit PASS; audit fixes
  applied pre-commit (parent participant_type removed, import invalidates
  ['juniors'], CompetitionType deduped).

### Attention notifications (2026-06-11) — ✅ SHIPPED
Extended the bell beyond messaging/moderation so users are notified of anything
needing their attention. Reuses the notifications table (free-form type + JSON
payload — no migration). Commit `32bebc7`; live-smoked (announcement → all
targeted users minus author; tournament_open → eligible junior + parent); DB
pristine after.
- **tournament_open**: on transition into registration_open (create/edit), pings
  every ELIGIBLE active junior (player) + parent — players/parents only.
  Eligibility uses the tournament's own age/level/handicap rules.
- **announcement**: a published INTERNAL announcement pings every targeted user
  (everyone / roles / band players+parents / coach group), excluding the author.
  External announcements stay landing-page only.
- Unread counter bubbles (bell + Messages nav) are now **red**.
- Deferred to the UI/UX rework (Sam): modal/popup backdrops should not dim the
  page — see `ui-ux-rework-notes` memory.

### Next up (other)
- **UI/UX reorganisation pass** (Sam: current nav/IA "hard to use" — admin nav is
  now ~18 items; design the IA once now that all surfaces exist). Inspo pending
  from Sam → split mobile vs desktop → optimisation cycle.
- Pre-staging (Part 1) still parked: prod env/WSGI, rate-limit storage,
  code-splitting (~1.3 MB bundle), tests, demo seed script.
- Phase 6 ship pass: states/a11y/responsive sweep, code-splitting (~1.16 MB
  bundle advisory), guided tutorial (parked for finishing touches), walk every
  role through once.
