# Karen Golf Management Platform — Junior Development Frontend

## What this project is

The web frontend for **Karen Country Club's Junior Golf Development Programme** (Nairobi, Kenya). It tracks junior golfers through a structured pathway — score tracking, World Handicap System (WHS) figures, class attendance, coach evaluations, tournament eligibility and results, and parent-requested coaching sessions.

**The backend already exists.** A colleague built and delivered a Flask + PostgreSQL API (JWT auth, WHS engine, all domain logic). This repo is the **frontend only**. We build on top of a fixed API contract; we do not own or change the backend from here.

Every signed-in user lands on a **page configured for their role**, reading from the **same database** through the same API — an admin sees the whole club, a coach sees their juniors and schedule, a parent sees their own child, a player sees themselves. One backend, role-shaped views.

**Stack:**
- Framework: React + Vite + TypeScript
- Routing: React Router
- Server state: TanStack Query (React Query) — *all* server data goes through it, no ad-hoc fetching in components
- Styling: Tailwind CSS
- HTTP: one fetch client at `src/lib/api.ts` (token attach + envelope unwrap + error normalize + 401 handling)
- Backend (already built, not in this repo): Flask 3.1, Flask-SQLAlchemy, Flask-JWT-Extended, PostgreSQL, Swagger UI at `/swagger`

## Collaboration rules

Working agreement (autonomy level, auto-proceed / ask-first / hard-stop lists, working style): see `WORKING_AGREEMENT.md`. This file (`CLAUDE.md`) is the **source of truth** for *what* we are building and the rules it must obey. `WORKING_AGREEMENT.md` governs *how* you work. `PROGRESS.md` tracks *what is done*.

## Repository layout (target state)

```
/
├── CLAUDE.md                  (this file — locked planning artifact)
├── WORKING_AGREEMENT.md
├── PROGRESS.md
├── .claude/                   (committed Claude Code setup — see .claude/README.md)
├── .env.example               (VITE_API_BASE etc.)
├── vite.config.ts             (dev proxy /api -> http://localhost:5000)
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx                (router + providers)
    ├── lib/
    │   ├── api.ts             (THE fetch client — locked once stable)
    │   └── whs.ts             (display helpers only — never recomputes WHS math)
    ├── types/
    │   └── api.ts             (shared response/domain types — locked once stable)
    ├── auth/
    │   ├── AuthProvider.tsx   (token storage, current user, login/logout)
    │   ├── useAuth.ts
    │   └── RequireRole.tsx    (route guard by role)
    ├── components/            (shared UI: AppShell, RoleNav, DataTable, Scorecard, …)
    └── pages/
        ├── auth/              (Login, Register)
        ├── dashboard/         (role-routed landing — one entry, role-shaped)
        ├── admin/             (Phase 1)
        ├── scoring/           (Phase 2 — rounds, scorecards, handicap history)
        ├── juniors/           (Phase 3 — profiles, progress, evaluations)
        ├── coaching/          (Phase 4 — attendance, schedule, sessions)
        └── tournaments/       (Phase 5)
```

## The backend is the source of truth (non-negotiable integration rules)

The API contract below is fixed by the delivered backend. **Do not invent endpoints, fields, or response shapes.** If a screen needs data the API doesn't expose, stop and ask — do not fabricate or mock it.

1. **Base + proxy.** Backend runs at `http://localhost:5000`. Vite proxies `/api/*` to it in dev, so the frontend always uses **relative** paths (`/api/...`) and there is no CORS dance. Never hardcode `http://localhost:5000` in components.

2. **One client, always.** Every request goes through `src/lib/api.ts`. Components never call `fetch` directly. The client: attaches `Authorization: Bearer <token>`, unwraps the response envelope, normalizes errors, and handles 401.

3. **The response envelope — and its exceptions.**
   - Most endpoints return `{ "data": {...} }` or, for lists, `{ "data": [...], "count": n }`. The client unwraps `.data`.
   - **AUTH EXCEPTIONS (do not unwrap):**
     - `POST /api/auth/login` and `POST /api/auth/register` return `{ token, user }` at the **top level** (no `data` wrapper).
     - `GET /api/auth/me` returns the **bare user object** (no wrapper).
   - **Error shapes differ too:** most endpoints return `{ "error": { "code", "message", "fields" } }`; the **auth routes** return a plain string `{ "error": "..." }`. Normalize with: `typeof e === 'string' ? e : e?.message`.

4. **Auth model.**
   - JWT Bearer. The token **identity is the user's email**.
   - Access token lasts **8 hours**. **There is NO refresh endpoint.** On any `401`, the client clears the token and redirects to `/login`. Do not build refresh logic.
   - **Public registration only creates `player` or `parent`.** `coach`, `committee`, and `admin` are created by an admin. The first admin is bootstrapped out-of-band by the backend owner (not our concern here).

5. **Dates + params.** All dates are ISO `YYYY-MM-DD`. Monthly endpoints take the **first of the month**, e.g. `?month=2026-03-01`. Weekly schedule endpoints take a week-start date `?week=YYYY-MM-DD`.

6. **Rate limits exist** (login 20/hr, register 10/hr). Surface a friendly "too many attempts, try again later" on `429`; don't retry-loop.

## Roles and role-based pages (non-negotiable)

There are five roles: **admin, coach, committee, parent, player.** A single signed-in entry point (`/`) routes each user to a page built for *their* needs, all reading the same DB through the same API. Route access is enforced by `RequireRole`; a user who deep-links to a page outside their role is redirected to their own dashboard, not shown an error they can't act on.

- **admin** — the whole club. Club-wide dashboard (`/api/admin/stats`), user management (create coach/committee accounts, assign roles), course/scorecard reference, and read access to every module. The only role that can create privileged users.
- **committee** — programme oversight. Read-across visibility into juniors, evaluations, and tournaments; **counter-signs evaluations** (the second sign-off, only after the coach has signed). No user-management powers.
- **coach** — their juniors and their work. Sees the juniors assigned to them, records **attendance**, writes **monthly evaluations** (first sign-off), runs **sessions**, and views their **weekly schedule** (`/api/coaches/:id/schedule?week=`). Enters tournament scores.
- **parent** — their own child only. Sees their child's profile, progress, handicap, evaluations (read-only), and can **request coaching sessions** and **register the child for tournaments**. Must never see other families' data.
- **player** — themselves. Their scores, handicap index + history, progress against their level band, upcoming classes/tournaments. Juniors may be young — keep their page simple and encouraging.

**The page is shaped on the frontend; the data is scoped on the backend.** Build each role's dashboard as its own composition under `src/pages/dashboard/`, selecting the right widgets and queries for that role. Do not assume the frontend filtering is the security boundary — the backend scopes what each token can read. But also never *request* data a role has no business seeing.

## Domain rules (non-negotiable)

These come from the Junior Development Plan and the WHS. They are baked into the backend; the frontend must present them correctly and **never reimplement the math**.

1. **WHS is computed by the backend. The frontend never recomputes it.** Score Differential, Handicap Index, Course Handicap, PCC, net double bogey — all come from the API (`/api/whs/*`, `/api/scores/sync`, `/api/users/:id/handicap-history`). `src/lib/whs.ts` may hold *display* helpers (formatting to one decimal, labelling bands) but must contain **no scoring formulas**. If a value looks wrong, it's a backend conversation, not a frontend fix.

2. **The junior pathway is 4 bands across 9 levels.** Each band has a minimum session count and a curriculum focus:
   - **L1–3 — Beginners** (min 12 sessions): skills focus (putting / chipping / full-swing / etiquette), clinic groups max 6, no scoring yet.
   - **L4–5 — Attaining Handicap** (min 24): practice scores, get scorecards signed; targets 9-hole 60–65, 18-hole 120–130.
   - **L6–8 — Intermediate & Advanced** (min 24): 2–3 competitive rounds/month; Karen Junior Challenge mandatory.
   - **L9+ — Enhanced / Elite** (min 24): HI ≤ 15, sub-84 rounds; Faldo / US Kids / scholarship track.

3. **Evaluations are one row per golfer per month.** A second evaluation for the same golfer + month is a **409** — handle it as "already exists this month," not a generic error. The backend stores **one flat row** with common fields plus nullable **band-specific** fields; the frontend's job is to **render the right fields for the golfer's band** (this is the most "intelligent" piece of frontend work in the app):
   - Common: attendance (count/total), assessment (below / meeting / exceeding expectation), recommendation (continue_level / move_next_level), special_remarks.
   - L1–3: putting / chipping / full_swing (text).
   - L4–5: avg_score_9 / avg_score_18.
   - L6–8 and L9+: competitions_played / best_gross_score.
4. **Evaluation sign-off is sequential: coach signs first, then committee counter-signs.** The committee sign-off control is disabled until `coach_signed` is true. Never let the UI submit a committee signature on an unsigned evaluation.

## The course (seeded reference data)

Karen Country Club, par 72 (front 9 = 36, back 9 = 36), ~6000 ft, four tee sets. This is **reference data fetched from the API** (`/api/courses-with-tees`), not hardcoded. Used to render scorecards, compute strokes-received display (by Stroke Index), and pick a tee.

Tee sets (Men CR/Slope · Women CR/Slope · total yds): **White** 73.0/137 · 79.9/144 · 6961 — **Yellow** 71.6/135 · 78.2/141 · 6639 — **Blue** 68.7/123 · 74.2/134 · 6035 — **Red** 66.7/121 · 72.3/129 · 5647.

Each hole carries par, Stroke Index (SI), and per-tee yardage; SI drives where handicap strokes fall. The frontend reads these from the API and must not assume a fixed tee — a junior may play any of the four.

## Tournaments (Phase 5 — fresh design)

Tournaments are a **fresh module**, designed from scratch (an unrelated legacy "Rumble" module is being retired backend-side — ignore it). **The backend computes all scoring** (net, Stableford points, positions, brackets) and is authoritative — this is a deliberate exception to "frontend does the smart stuff." The frontend submits scores and renders leaderboards/brackets.

- **Internal events** get the full lifecycle (create → register → enter scores → leaderboard / bracket → results). **External events** (Faldo Series, US Kids, JGF) are lightweight result logs that feed a junior's "competitions played / best gross" stats.
- **Formats v1:** stroke play, Stableford, match play (bracket). Enum is extensible (scramble / foursomes / skins later).
- **Scoring:** gross + net; optional divisions by age group and gender. Net = gross − course handicap; Stableford points per hole = `max(0, 2 + par − net_strokes)`; strokes received are allocated by SI. **The frontend displays these; the backend calculates them.**
- **Eligibility** is per-tournament: age range, level band, handicap range, handicap_required. The frontend filters the register-able juniors by the tournament's rules.
- **Handicap integration:** a `counts_toward_handicap` event writes a normal WHS round per player (so it flows through the handicap engine and history); non-counting events store results only.
- **9-hole course handicap** = `round(18-hole CH / 2)` — backend handles it, no special frontend math.

> Phase 5 depends on the backend tournaments domain existing. If those endpoints aren't live yet when we reach Phase 5, stop and confirm availability before building against them. The detailed backend contract for this module lives in the hand-off doc `Karen_Tournaments_Backend_Spec.md` (for the backend owner; not part of this repo).

## Conventions

- **All server data via TanStack Query.** Query keys mirror the resource (`['junior', id, 'progress']`). Mutations invalidate the keys they affect. No `useEffect`-fetch, no data in component state that belongs to the server.
- **All requests via `src/lib/api.ts`.** It is the only place that knows about tokens, the envelope, and 401s.
- **Types live in `src/types/api.ts`** and match the backend shapes (including the auth exceptions). Keep them honest; don't loosen to `any` to make a screen compile.
- **No mock data.** Every screen shows real API data or a genuine empty state. A hardcoded array of fake juniors is never an acceptable placeholder — build the empty state instead.
- **Folders by feature** under `src/pages/<feature>/`; shared pieces in `src/components/`.
- **Do not apply any external brand styling.** This is the Karen club's own product. (If you've seen AIB-AXYS or other house styles elsewhere, they do not apply here.)

## Phased build plan

Build in order. Each phase is shippable. Statuses: ✅ done · 🟡 in progress · ⬜ not started. (All ⬜ at kickoff; update `PROGRESS.md` as you go, not this file.)

- **Phase 0 — Project + auth foundation. ⬜**
  Vite + TS + Tailwind + Router + React Query scaffold. `src/lib/api.ts` (token, envelope unwrap *with* the auth exceptions, error normalize, 401 → `/login`). `AuthProvider` + `useAuth` + `RequireRole`. Login and Register pages (register offers player/parent only). `.env.example`, vite proxy. **Exit:** a user can register, log in, hit `/api/auth/me`, and be routed by role; 401 cleanly bounces to login.

- **Phase 1 — Role shell + admin foundation. ⬜**
  `AppShell` + `RoleNav` (nav items vary by role). The role-routed `/` dashboard entry. Admin dashboard from `/api/admin/stats`. Admin **user management** (list users, create coach/committee accounts, assign roles). Course/scorecard **reference screen** from `/api/courses-with-tees`. **Exit:** every role lands on a correct (even if sparse) dashboard; admin can create a coach.

- **Phase 2 — Scoring, rounds & handicap. ⬜**
  Scorecard entry component (per-hole, any of the four tees, SI-aware display). Submit rounds via `/api/scores/sync` (recomputes index). Handicap history view (`/api/users/:id/handicap-history`). Player dashboard shows current Handicap Index + recent differentials. **WHS values come from the API only.** **Exit:** a player/coach can enter a round and see the updated index and history.

- **Phase 3 — Juniors: profiles, progress, evaluations. ⬜**
  Junior profile (intake fields: DOB, gender, current_level, band, curriculum, handicap status, US-Kids history, availability, medical, goals, tournament_ready). Progress view (`/api/juniors/:id/progress`, `/monthly-report?month=`) against band minimums and benchmarks. **Monthly evaluation form that renders band-specific fields** off the one flat row (the core smart-frontend piece), with the **coach-then-committee** sign-off flow and 409 "already exists this month" handling. Per-band **summary report** (all golfers in a band) from `/api/evaluations/summary?band_id=&month=`. **Exit:** a coach can write and sign a band-correct evaluation; committee can counter-sign; a parent sees it read-only.

- **Phase 4 — Coaching: attendance, schedule, sessions. ⬜**
  Attendance capture against class rosters (counts toward band minimums). Coach **weekly schedule** (`/api/coaches/:id/schedule?week=`). Parent-requested **coaching sessions** (parent requests → coach/admin sees and schedules). **Exit:** a coach can take attendance and view their week; a parent can request a session and see its status.

- **Phase 5 — Tournaments. ⬜** *(depends on backend tournaments domain being live)*
  Tournament list + detail; create/edit (admin/coach). Eligibility-filtered registration (parents register their child). Score entry (per-hole + total-gross fallback). Leaderboard (gross/net, by division). Match-play bracket view + `/generate-bracket`. External result log feeding junior stats. Optional series/order-of-merit standings (`/series/:id/standings`). **Exit:** an internal stroke-play event can run end-to-end and a counting event updates handicaps.

- **Phase 6 — Ship. ⬜**
  Empty/loading/error states everywhere, accessibility pass, responsive check (coaches use phones on the range), production build + env config, basic smoke run against the real backend. **Exit:** clean `tsc` + lint + `vite build`, every role walked through once.

## Deferred features (Phase 7+)

Out of scope for the current build; keep them in mind so the architecture doesn't paint them into a corner.

- **Billing / participant groups.** Three participant types exist (registered juniors — no charge; club beginners; Karen Academy school juniors), but **charging is parked** by request. Don't build billing UI now; just don't model the data in a way that blocks it later.
- **Series / order-of-merit polish** beyond a basic standings table.
- **Coach assignment management UI** (which juniors belong to which coach) if the backend later exposes it.
- **Notifications / reminders** (session requests, evaluation due dates).
- **Bulk import** of juniors from the intake spreadsheet.

## Skills available in this repo

Use skills under `.claude/skills/` when their triggers match.

### frontend-design (`.claude/skills/frontend-design/SKILL.md`)

**When to use:** any Phase 1+ work that builds or restyles UI — dashboards, the scorecard, evaluation forms, tables, the role nav, leaderboards.

**Why:** the default would be generic AI-dashboard aesthetics. We want something intentional and production-grade.

**Karen-specific direction:**
- This is a **junior golf club programme in Kenya**, used by club admins, coaches, committee members, parents, and kids. Tone: warm, clean, encouraging, trustworthy — **not** a finance terminal, not a toy.
- The **player/junior pages** lean simpler and more motivating (kids may use them). The **admin/committee pages** can be denser and more table-driven.
- Numeric/scorecard data benefits from a tabular, legible treatment; handicap figures are the hero numbers on player pages.
- Accessibility matters (mixed ages, phones on the range): WCAG AA, large touch targets for score entry, works one-handed on mobile.
- Avoid generic purple-gradient SaaS slop and emoji-as-icons.

## Working style for Claude Code

- **Plan Mode on the first pass of any new page or the api client.** Show the approach — which endpoints, which queries, which role guards, the component breakdown — before writing code. Wait for approval.
- **Use Extended Thinking for the tricky logic:** the band-conditional evaluation form, role-routing/guards, the scorecard's SI-based strokes-received *display*, and the auth-envelope exceptions. These are where "looks right" and "is right" diverge.
- **Fetch through `src/lib/api.ts`, always.** No direct `fetch` in components, no second client.
- **Do not create mock data.** Real API data or a real empty state.
- **The API contract is fixed.** Stop and ask if a screen would need an endpoint/field/shape the backend doesn't provide — that's a conversation with the backend owner, not something to invent or stub.
- **Ask before:** changing the API contract assumptions in this file, adding a dependency, or making a notable UX decision for a role's page. One extra question beats one bad decision. (Sam wants to be consulted on per-role page design.)
- **Never modify `CLAUDE.md`, `src/lib/api.ts`, or `src/types/api.ts` without explicit instruction** once they're stable — they're the locked contract. A hook blocks edits to `CLAUDE.md`.
- **Use the subagents:** run the `api-contract-auditor` before any commit that touches auth, the api client, role guards, or a new data screen; run the `build-runner` after changes to confirm `tsc` + lint + build are green. Keep their output out of the main thread.
