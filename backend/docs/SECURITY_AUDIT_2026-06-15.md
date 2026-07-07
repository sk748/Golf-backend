# Security Audit — Karen Golf Management Platform

**Date:** 2026-06-15
**Scope:** Full-stack, high-intensity. Backend (`app/`, `main.py`, `config.py`), frontend (`src/`), config/secrets. Conducted by five parallel read-only specialists (access-control/IDOR, mass-assignment/injection, auth/JWT/secrets/config, frontend, multi-tenant scoping), then findings were de-duplicated and the serious ones adversarially verified against the running server.

**Headline:** the frontend is clean; the backend has a uniform **mass-assignment / missing-ownership** weakness (every `update_*` does a blanket `setattr` over request JSON, and several routes check role but not resource ownership). The four clearest, surgical, high-impact issues are **fixed and verified live** in this branch; the rest are documented below with exact fixes (left for review because they carry product-decision or scoring-flow regression risk, or are deployment-config concerns).

---

## ✅ FIXED & VERIFIED (this branch)

| # | Sev | Issue | Fix | Verified |
|---|-----|-------|-----|----------|
| 1 | **CRITICAL** | **Evaluation signature forgery.** `PUT /api/evaluations/:id` → `update_evaluation` blanket `setattr`; `_validate` only checks ordering. A coach could PUT their own eval with `committee_signed:true` + `committee_signed_by:<id>` and forge the committee counter-signature, defeating the sequential coach→committee sign-off (CLAUDE.md domain rule 4) and unlocking `promote_junior`. | `update_evaluation` now strips all sign-off columns (`coach_signed*`, `committee_signed*`) before the setattr; sign-off only happens via the role-guarded `coach_sign`/`committee_sign` routes. (`app/evaluations/controllers.py`) | Coach PUT with sentinel `committee_signed_by` + `committee_signed:false` + `coach_signed:false` → all sign-off fields **unchanged**, content edit applied. |
| 2 | **HIGH** | **Player → any junior PII IDOR.** `GET /api/juniors/:id` and `/:id/progress` only special-cased `parent`; a `player` token fell through and could read any family's child (DOB, medical, goals, evaluations, attendance) by guessing ids. | Added player self-check (`junior.user_id == caller.id`) to both routes. (`app/juniors/routes.py`) | Player → real other junior (id 43) `/juniors/43` and `/progress` now **403**. |
| 3 | **HIGH** | **Junior privileged-field mass-assignment.** Coach/committee `PUT /api/juniors/:id` hit an unrestricted setattr loop — could set `coach_id` (self-assign a junior), `parent_id`, `approval_status` (skip the approval chain), `user_id`. | Coach/committee updates now strip `STAFF_PROTECTED_FIELDS = {coach_id, parent_id, approval_status, user_id, id}` (these have dedicated admin/approval endpoints; the staff edit UI never sends them). (`app/juniors/routes.py`) | Logic mirrors the verified parent allowlist; staff UI fields unaffected. |
| 4 | MEDIUM | **WHS calculators unauthenticated.** `POST /api/whs/{score-differential,handicap-index,course-handicap}` had no auth decorator — an open, unthrottled compute surface. | Added `@require_auth` to all three. (`app/whs/routes.py`) | No-auth POST now **401**. |
| 5 | **HIGH** (product decision → enforced) | **Coach saw the whole club, not just their roster.** `GET /api/juniors`, `/api/juniors/:id`(+`/progress`,`/monthly-report`), `POST /:id/promote`, `PUT /juniors/:id`, `GET /api/evaluations`(+`/:id`,`/summary`), `POST /api/evaluations`, `GET/POST/PUT/DELETE /api/attendance`(+`/bulk`,`/session/:id/summary`), `GET /api/junior-badges` all treated *any* coach as in-scope; frontend `useCoachJuniors` was UX-only. **Sam's directive 2026-06-16: a coach sees ONLY their own students, no exceptions.** | New `coach_owns_junior(caller, junior)` helper (`app/utils/decorators.py`). List endpoints **force** the coach's own `coach_id` (ignoring any override param); item endpoints **403** when `junior.coach_id`/`ev.coach_id`/`session.coach_id` ≠ caller; band-summary, attendance-list and junior-badges joins filter to the coach's roster. Admin & committee retain full cross-roster oversight. | Live: coach sees own 5 juniors / 6 evals / 10 attendance / 1 badge only; `?coach_id=<other>` ignored; `/juniors/43`,`/progress`,`/monthly-report`,`/promote`,`PUT`, `/evaluations/43-owner`, `/junior-badges?junior_id=43` → **403**; admin (28 attendance, junior 43) + committee (24 evals, junior 43) → **200**. |

---

## 🔶 OPEN — backend code (recommended; not applied)

These are real but were left for review: they touch scoring flows (regression risk without deeper tracing) or are product decisions about how much a *coach*/*committee* is trusted.

### HIGH
- **Hole-scores IDOR.** `GET/POST/PUT /api/hole-scores` (+ `?round_id=`) have no round-owner check (`app/rounds/routes.py:152-191`). Any player can read **or tamper** another player's hole-by-hole scorecard by guessing ids — `GET /api/rounds/:id` is scoped but hole-scores bypass it. **Fix:** resolve the parent `Round` and apply the same player-owns-or-staff check; scope the `?round_id` list by owner for non-staff.
- **Forgeable `POST /api/rounds`.** Unlike `/scores/sync` (which restricts cross-user submit to staff), the raw `POST /rounds` passes the body straight to `create_round` — a player can set `user_id` to a victim, or self-set `status:"verified"` / `counts_toward_handicap` to manipulate their handicap, bypassing the pending→staff-verify flow (`app/rounds/routes.py:101-105`). **Fix:** force `user_id=caller.id` and `status="pending"` for non-staff (or retire the raw route in favour of `/scores/sync`).

### MEDIUM (staff-only integrity / least-privilege — no cross-role escalation)
- ~~**Coach can read/edit/promote any junior, not just their roster.**~~ **RESOLVED 2026-06-16** (FIXED #5 above) — Sam confirmed coaches are roster-scoped with no exceptions; enforced server-side across juniors / evaluations / attendance / junior-badges.
- **Coach can reassign sessions/classes** by setting `coach_id` via the unrestricted `update_session`/`update_class` setattr loops (`app/sessions/controllers.py`). **Fix:** allowlist editable fields; never accept `coach_id` from a non-admin. *(Coaches already only see their own sessions/classes; this remaining item is the mutation-side mass-assignment, not roster visibility.)*
- **`PUT /api/enrollments/:id` and `/api/booking-requests/:id`** lack the per-coach ownership check their sibling `approve`/`decline` routes have (`app/sessions/routes.py`). **Fix:** mirror the `target_coach == caller.id` check.
- **Tournament mass-assignment.** `POST/PUT /api/tournaments` and `PUT /api/tournament-scores/:id` let admin/**coach** set `counts_toward_handicap`/`status`/`position` directly (the last overrides the computed leaderboard). **Fix:** allowlist; let `leaderboard()` own `position`.
- **Unscoped reads:** `GET /api/tournament-scores(/:id)`, `/api/tournament-divisions` (`@require_auth`, no junior scope) expose any junior's net/handicap-derived scores; `GET /api/users` gives coach/committee the full directory (email/phone). Likely acceptable (semi-public leaderboards / trusted staff) — confirm intent.

### LOW
- Parent/player can self-set tournament-entry `status` to `confirmed` (junior ownership IS enforced; only skips the `registered` state).
- `PUT /api/attendance/:id` setattr loop with no denylist (staff-only, trivial table).
- No "last admin" guard — an admin can demote/deactivate themselves and brick privileged access (`app/admin/routes.py`).

### Injection — NONE
Full sweep: no raw SQL (`text()` never imported), no f-string/`%`/`.format` SQL, no user-controlled `order_by`, no `os.system`/`subprocess`/`eval`/`exec`/`pickle`/`yaml.load`, no path-traversal/file-serving surface. `.ilike`/`.like` use bound parameters. CSV bulk import re-parses server-side with per-row savepoints. **Clean.**

---

## 🔶 OPEN — deployment / config hardening (backend-owner)

- **CRITICAL-if-misconfigured: hardcoded secret fallback.** `config.py` ships `"dev-only-key-not-for-production"` / `"test-only-key-change-in-ci"`. If a deploy ever runs with the default `DevelopmentConfig` and no `SECRET_KEY`, JWTs are signed with a public key → **anyone can forge an admin token**. `ProductionConfig.validate()` raises on missing secret **but I found no call site** — confirm it's invoked at startup. Also **rotate** the live `SECRET_KEY` currently in the on-disk `.env` (gitignored & not committed — good — but present in a shared worktree).
- **`main.py` `__main__` runs `debug=True`** unconditionally → Werkzeug RCE console if launched directly in a non-dev env. Use `debug=app.debug` or drop the runner for prod images.
- **No catch-all 500 handler** → with DEBUG on, uncaught exceptions leak full tracebacks. Add an error handler returning the normalized `{"error":{...}}` envelope.
- **Rate limiter is in-memory** (`app/utils/limiter.py`, no `storage_uri`) → under N gunicorn workers the login limit is effectively `20/hr × N` and resets on restart. Set a shared store (Redis) for prod.
- **No `ProxyFix`** → behind a load balancer the limiter keys off the proxy IP (global bucket / bypass). Add `werkzeug.middleware.proxy_fix.ProxyFix`.
- **No CSP header** (acceptable for a JSON API; other headers — nosniff/DENY/Referrer-Policy/HSTS-when-not-debug — are correctly set).
- **No password-reset endpoint** exists yet though bulk-import/registration assume one; when added, throttle it + single-use expiring tokens.
- **`DevQuickLogin`** (seeded `password123` accounts) — dev-gated via `import.meta.env.DEV` (null in prod) but **delete before staging** per its own header.

---

## ✅ Frontend — clean

No `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`; all user content (announcements, messages, event title/description/location, junior names, goals, remarks) rendered through React's auto-escaping JSX. Token in `localStorage` is the standard tradeoff but never logged (no `console.*`), never in DOM/URL; 401 clears + redirects correctly. The calendar `window.location.assign(\`/tournaments/${t.id}\`)` is a same-origin relative path with a backend id — not an open redirect. `RequireRole`/`PublicOnly` are correctly UX-only with the backend as the real boundary. No hardcoded `localhost:5000` in components; prod source maps off; no `VITE_` secret exposed.

---

## ✅ Confirmed correct server-side (spot-checks)

Public registration hard-restricted to player/parent; self-update strips role/is_active/email; admin surface fully `@admin_only`; messaging DM-matrix + conversation membership enforced; the **new events module** (audience resolution, owner/admin-only mutate, invitee-only RSVP, owner/staff-only RSVP list, coach-targeting limits) is well-scoped; the **new `/api/sessions/mine`** correctly resolves player→own junior / parent→own children with no cross-tenant leak; parent isolation is consistent across juniors/badges/bookings/tournaments; bcrypt password hashing with `password_hash` excluded from all serialization; uniform "Invalid credentials" (no user enumeration); Swagger off in prod; events `update_event` and `JuniorBadge.awarded_by` already use explicit allowlists / JWT-stamped fields.

---

## Remediation priority

1. **Done** — eval-forgery, player-IDOR, junior priv-field strip, WHS auth (this branch).
2. **Done 2026-06-16** — coach roster-scoping enforced server-side (Sam's directive: no exceptions). Decision #3 below is now resolved.
3. **Next (HIGH):** hole-scores IDOR + `POST /rounds` ownership (score/handicap tampering by any player).
4. **Before staging:** enforce `ProductionConfig` + rotate `SECRET_KEY`; remove `debug=True` runner; add 500 handler; shared rate-limit store + `ProxyFix`; remove `DevQuickLogin`.

*Fixes in this report were applied to the running (worktree) backend copy; mirror them to the main-repo copy at merge.*
