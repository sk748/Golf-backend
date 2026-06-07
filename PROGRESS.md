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
| 1 | Role shell + admin foundation (RoleNav, role-routed dashboard, user mgmt, course reference) | ⬜ |
| 2 | Scoring, rounds & handicap (scorecard, /scores/sync, handicap history) | ⬜ |
| 3 | Juniors: profiles, progress, band-conditional evaluations + sign-off | ⬜ |
| 4 | Coaching: attendance, weekly schedule, session requests | ⬜ |
| 5 | Tournaments (depends on backend tournaments domain) | ⬜ |
| 6 | Ship: states, a11y, responsive, prod build | ⬜ |
| 7+ | Deferred (billing/participant groups, series polish, notifications, bulk import) | ⏸️ |

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
