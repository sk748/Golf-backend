# Security Review (2026-06-11/12) — COMPLETE (both passes)

Thorough defensive security audit of our own codebase, run overnight at Sam's
request. **READ-ONLY — nothing has been fixed.** Findings are for joint triage.
Pass 1 = authentication + authorization. Pass 2 = injection, input handling,
config, social safety, frontend & dependencies.

## Executive summary

- **The systemic theme is object-level scoping + body trust, not broken auth.**
  Decorators, password hashing, login anti-enumeration, registration role
  allowlisting, messaging multi-tenancy, secrets hygiene, security headers, and
  the frontend's XSS posture are all solid. The gaps are handlers that trust
  `@require_auth` alone (IDOR) and create/update routes that load raw request
  bodies onto models (mass assignment).
- **Top of the triage list (Critical/High):** hole-scores fully unscoped
  (read+write, C-1); `POST /rounds` forging `user_id` AND the WHS engine's own
  output columns (C-2 + MA-1); club-wide round reads for parent/committee (H-1);
  coach-unscoped evaluations incl. forging both sign-off flags (H-2 + MA-2);
  player IDOR on minors' profiles (H-3); `PUT /juniors` staff mass-assignment
  (H-4); sessions-module cross-coach cluster with a null-coach_id bypass (H-5);
  self-update of `handicap_index`/`membership_number` (P-1); aged `Flask-Cors`
  3.0.10 + `gunicorn` 20.1.0 pins (DEP-1/2).
- **Injection: clean.** No raw SQL/template/command injection anywhere; ORM-only
  with parameterized LIKE and static order_by. Frontend has zero HTML sinks.
- **Recurring anti-patterns to fix as classes, not one-offs:** (1) scoping
  written for one role while others fall through; (2) null-foreign-key checks
  that silently pass; (3) `SimpleModelSchema.load(raw_body)` with no allowlist.

---

# Pass 1: Authentication & Authorization

**Scope:** Flask backend, authn/authz only. 189 routes across 14 blueprints
enumerated and checked. Public-by-design confirmed appropriate: `POST
/api/auth/register`, `POST /api/auth/login`, `GET /api/public/announcements`,
`/swagger` (non-prod). `/api/seed` is correctly `@admin_only`.

**Headline:** the guard *decorators* are nearly complete (3 unguarded WHS calc
routes only), but **object-level scoping inside `@require_auth` handlers is the
systemic gap** — broad IDOR across rounds, hole-scores, evaluations, attendance,
enrollments, tournament-scores, and parent/committee read paths. Recurring
anti-pattern: ownership checks written for ONE role (usually parent) leaving
player/coach/committee unscoped, plus a **null-foreign-key bypass** (coach-owner
checks that silently pass when `coach_id IS NULL`).

## Authentication mechanics

- JWT Bearer (flask-jwt-extended), HS256 + `SECRET_KEY`, identity = user email,
  8h expiry, no refresh (matches contract). Guards re-load the user per request
  and re-check `is_active` + live role — deactivation/role changes take effect
  immediately (good).
- Passwords: bcrypt per-user salt (strong). Min length 8, no complexity rule.
- Login is enumeration-safe (uniform "Invalid credentials"). Register is NOT:
  "Email already registered" / "No parent account found with that membership
  number" reveal existence (rate-limited 10/hr, still a surface).
- **A-1 (Medium):** no token revocation/denylist; admin-changing a user's email
  silently kills their live token (identity-by-email). No dangling access.
  Direction: document no server-side logout; `jti` denylist if forced logout
  ever needed.

## Privilege escalation

- Registration role-allowlist is airtight (case tricks collapse to player);
  privileged creation/role-change is admin-only + enum-validated. Solid.
- **P-1 (Medium): `PUT /api/users/<id>` self-update mass-assignment** — strips
  only `role,is_active,email,cdh_number`; **does NOT strip `membership_number`
  or `handicap_index`**. Any user can set their own handicap index (bypassing
  WHS) or squat a parent's membership number (the child-linking key; unique, so
  squatting breaks the real parent's signups). The `PUT /auth/profile` path is
  correctly allowlisted — `/users/<id>` is the leaky one. Direction: allowlist.
- **P-2 (Low):** parent-child linking by guessable membership number + distinct
  error messages; impact bounded by pending_parent→pending_staff approval.

## Critical / High IDOR findings

- **C-1 (CRITICAL): hole-scores completely unscoped (read+write).**
  `GET /hole-scores` (no params → entire club's per-hole data), `GET/POST/PUT
  /hole-scores[/<id>]` have zero ownership checks (`rounds/routes.py:152-181`).
  A player can overwrite another player's verified scorecard. Direction:
  staff-or-owner; require round ownership for non-admin.
- **C-2 (CRITICAL): `POST /rounds` accepts arbitrary `user_id`** from a player —
  attribute rounds to anyone, manipulate their handicap (`rounds/routes.py:
  101-105`). `/scores/sync` does it right (token-stamped); mirror that.
- **H-1: rounds + handicap-history club-wide readable by parent/committee** —
  only the player role is scoped (`rounds/routes.py:90-91,115-116,144-145`).
- **H-2: evaluations unscoped for coaches** (read all; write for juniors not
  assigned to them; `evaluations/routes.py:36-89`). `coach_id` is token-stamped
  (no forgery), but junior/band are unverified.
- **H-3: junior profile/progress IDOR for the PLAYER role** — parent is scoped,
  player isn't: any player can read any junior's DOB/medical/goals
  (`juniors/routes.py:159-167,290-302,66-85`). Sensitive data on minors.
- **H-4: `PUT /juniors/<id>` mass-assignment for coach/committee** — the
  allowlist guards parents only; coach/committee get full setattr incl.
  `approval_status`, `current_level`, `coach_id`, `parent_id`
  (`juniors/routes.py:176-197`).
- **H-5: sessions module cross-coach access cluster** (`sessions/routes.py`):
  `PUT /booking-requests/<id>` totally unscoped (371-376); create session/class
  with arbitrary `coach_id`; any coach enrolls/drops any junior; coach reads all
  bookings; **approve/decline null-coach_id bypass** (327-332,348-352).

## Medium

- **M-1:** tournament-scores readable by all authed users (no `_junior_in_scope`).
- **M-2:** tournament entry status-jump via generic POST/PUT (bypasses /approve
  workflow; own-child scoped so no cross-family harm).
- **M-3:** tournament score submission not scoped to the coach's juniors
  (triggers handicap writes).
- **M-4:** attendance unscoped for coaches (any coach edits any session's rows).
- **M-5:** handicap-journey PUT null-coach bypass (unassigned juniors editable
  by any coach; `handicap/routes.py:82-84`).
- **M-6:** promote + junior-badge award/revoke not scoped to the coach's juniors.
- **M-7:** `DELETE /announcements/<id>` uses `@require_auth` (in-handler
  author/admin check saves it; fragile pattern).
- **M-8:** committee + any coach can verify any round (recomputes WHS) — role
  mismatch vs the domain.

## Low / Info

- **L-1:** WHS calculator routes have NO auth at all (`whs/routes.py:29,55,77`)
  — pure math, no data, but inconsistent + unthrottled. Add `@require_auth`.
- **L-2:** coach can hard-DELETE a tournament (+cascade). Likely admin-only.
- **L-3:** `PUT /external-results/<id>`: any coach can rewrite any result's
  junior/score (`logged_by`/`verified` protected).
- **L-4:** cosmetic guard-width notes (`GET /classes`, `me/feedback`).
- **L-5:** admin cannot coach-sign evaluations (availability bug — stuck evals
  have no unblock path).
- **Info:** messaging docstring still claims immutability; edit/delete exist
  (sender-scoped). Fix comment.

## Solid practices observed

Guard primitives re-check live user/role per request; login enumeration-safe;
registration role-allowlist airtight; bcrypt; **messaging multi-tenancy is
genuinely well done** (membership enforced on every route, DM matrix enforced
server-side against the actual assigned coach, parent oversight derived from own
JuniorProfile rows, moderation admin-only); notifications mark-read IDOR-proof;
public announcements minimal-field; booking-request create is the model handler;
committee counter-sign sequencing enforced server-side; `/scores/sync` +
evaluations stamp authorship from the token.

## Fix priority (for triage with Sam)

1. **C-1, C-2** — unauthenticated-grade tampering with minors' scores/handicaps.
2. **H-1…H-5** — family isolation + coach scoping + minors' PII.
3. **P-1** — self-update mass assignment (handicap/membership squat).
4. **M-1…M-8**, then L/Info.

---

# Pass 2: Injection, Input Handling, Config, Social Safety, Frontend & Dependencies

## 1. Injection / ORM safety — clean
No raw SQL (`text(`/`execute(`/f-string SQL), no template injection (JSON-only
app), no command injection (no subprocess/os.system/eval). All 30+ `order_by`
call sites are static columns. LIKE/ILIKE patterns (user search, audit search,
`_roles_contains`) are parameterized bindings, not SQL text. *Info:* LIKE
wildcards (`%`/`_`) in search terms aren't escaped — functional nit, not
injection.

## 2. Mass assignment / input validation — the systemic pass-2 problem
`SimpleModelSchema.load(data)` copies every model column found in the body; no
schema uses a load-exclude, so safety depends on each handler stripping keys —
several don't:
- **MA-1 (HIGH): `POST /rounds` lets the body set the WHS engine's outputs** —
  `score_differential`, `adjusted_gross_score`, `handicap_before/after`,
  `pcc_adjustment`, `status:"verified"`, `counts_toward_handicap`,
  `verified_by/date` (`rounds/controllers.py:33-37`). Fabricated values go
  straight into the handicap engine. Extends pass-1 C-2; fix together by
  allowlisting genuine inputs and stamping the rest server-side (mirror
  `/scores/sync`). `create_hole_score` has the same raw-load shape (see C-1).
- **MA-2 (HIGH): generic evaluation create/update can forge BOTH sign-offs** —
  body controls `coach_signed`/`committee_signed`(+`_by`,`_date`)
  (`evaluations/controllers.py:73-86`); a coach can self-counter-sign,
  defeating the sequential flow the dedicated sign endpoints enforce.
  Orthogonal to pass-1 H-2. Strip sign-off columns from create/update.
- **MA-3 (MEDIUM):** `award_badge` raw-loads `awarded_by`/`awarded_date`/
  `junior_id` from the body (`juniors/controllers.py:360-363`). (Route stamps
  awarded_by — controller path exposed if reached otherwise; complements M-6.)
- **MA-4 (LOW):** tournament `submit_score` lets the body set `status`
  ("verified") (`tournaments/controllers.py:499`).
- **MA-5 (LOW):** `create_external_result` raw-loads junior/score fields
  (create-side sibling of pass-1 L-3; `logged_by`/`verified` ARE overridden).
- **IV-1 (MEDIUM):** no global error handler + unvalidated `int()`/date casts →
  uncaught exceptions become bare 500s (no trace leak in prod, but wrong status
  + no normalized envelope; WHS routes are the good counter-example).
- **IV-2 (MEDIUM):** no `MAX_CONTENT_LENGTH` — unbounded request bodies.
- **IV-3 (LOW):** announcement body has no length cap (messages cap at 2000).
- **IV-4 (Info):** no server-side range checks on levels/scores/handicaps in
  direct create paths (CSV import DOES bound level 1–9).

## 3. Secrets & config — strong
`.env` untracked + strong random key; `.env.example` placeholders only; prod
config requires+validates env secrets, DEBUG off, rate limits forced on;
security headers present (nosniff, X-Frame-Options DENY, Referrer-Policy, HSTS
non-debug); Swagger gated out of prod; CORS allowlisted to FRONTEND_URL (no
wildcard). Issues:
- **SEC-1 (MEDIUM):** flask-limiter uses in-memory storage → multi-worker prod
  multiplies limits Nx and resets on restart. Use Redis `storage_uri`.
- **SEC-2 (LOW):** `APP_SETTINGS=config.TestingConfig` reachable on a prod host
  (weak key, limits off) with no startup guard.
- **SEC-3 (LOW):** `python main.py` runs debug=True (gunicorn is the prod path).

## 4. Rate limiting
- **RL-1 (MEDIUM):** only login/register are throttled. Unthrottled abuse
  surfaces: message send, announcement create, achievements sync, tournament
  registration, WHS calc endpoints (also unauthenticated, pass-1 L-1), CSV bulk
  import (bcrypt-per-row). Compounded by SEC-1.

## 5. CSV bulk import — architecturally careful, two gaps
Good: preview never writes; commit re-parses server-side; per-row savepoints;
deterministic non-routable synthesized emails + duplicate detection; staff-only.
- **CSV-1 (MEDIUM):** no row cap / size cap → multi-MB CSV = thousands of
  bcrypt hashes + inserts in one synchronous request (DoS by insider/stolen
  staff token).
- **CSV-2 (LOW):** cells stored verbatim incl. leading `= + - @` → formula
  injection on any future export to Excel/Sheets (web UI is safe — React
  escapes). Escape on export or sanitize on import.

## 6. Messaging safety pack — strong, one accepted limitation
Length caps + banned-word check on create AND edit (can't edit a slur back in);
block-and-flag (held → sender+admin visibility, auto-flag + admin notify);
first-contact parent notice; correct held/hidden visibility clauses.
- **MSG-1 (LOW, accepted):** the banned-word regex is trivially bypassable
  (spacing, leetspeak, homoglyphs, non-English). It's a flag-for-review aid,
  not a security control — document that expectation for staff.
- **MSG-2 (Info):** bodies stored raw; safe ONLY because the frontend renders
  escaped plain text. Any future rich-text/markdown rendering re-opens
  stored-XSS — gate that change on a sanitizer.

## 7. Frontend — clean XSS posture, three mediums
No `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere; all user content
(messages, announcements, names, the PUBLIC landing feed) rendered React-escaped;
single hardened api client (error strings become objects, 429 surfaced without
retry-looping, 401 → token clear + login); no open redirects; no `target=_blank`.
- **FE-1 (MEDIUM, accepted-risk):** JWT in localStorage — any XSS = 8h token
  theft. httpOnly cookies would need a backend CSRF model (contract change);
  document as accepted risk if it stays.
- **FE-2 (MEDIUM):** React Query cache not cleared on logout → on a shared
  club kiosk, user A's cached data can flash for user B. Add
  `queryClient.clear()` on logout/401.
- **FE-3 (MEDIUM):** no Content-Security-Policy anywhere — a prod CSP header
  would shrink the token-theft blast radius materially.
- **FE-4 (LOW, dev-only):** vite `allowedHosts: true` disables DNS-rebinding
  protection on the DEV server only.

## 8. Dependencies (recency heuristics — run pip-audit/npm audit for CVE IDs)
Python fully ==-pinned, JS locked (no floating-dep gap); JS stack current
(React 19.2, Vite 6.4, TS 5.7…); Flask 3.1.3/Werkzeug/SQLAlchemy/bcrypt healthy.
- **DEP-1 (HIGH):** `Flask-Cors==3.0.10` — predates 4.x/5.x CORS-bypass fixes.
- **DEP-2 (HIGH):** `gunicorn==20.1.0` — predates request-smuggling fixes
  (prod WSGI server).
- **DEP-3/4 (MEDIUM):** `cryptography==39.0.1`, `requests==2.26.0`,
  `urllib3==1.26.12`, `Jinja2==3.1.2`, stale `certifi`.

## Solid practices observed (pass 2)
No injection surface; `/scores/sync` + `submit_score` compute scoring math
server-side with token-stamped authorship; secrets hygiene; headers + CORS
allowlist + Swagger gating; transactionally careful CSV import; messaging
safety pack; zero frontend HTML sinks; full dependency pinning.

## Combined fix-priority (both passes, for triage with Sam)
1. **C-1, C-2+MA-1** — hole-scores unscoped; rounds body forging user_id + WHS
   outputs (tampering with minors' scores/handicaps).
2. **H-1…H-5, MA-2** — family isolation, coach scoping (+null-coach_id bypass
   class), minors' PII, sign-off forgery.
3. **P-1** — self-update of handicap_index/membership_number.
4. **DEP-1, DEP-2** — Flask-Cors + gunicorn bumps (then cryptography/requests/
   urllib3/Jinja2/certifi).
5. **IV-1, IV-2, RL-1, SEC-1, CSV-1** — global error handler, body-size cap,
   broader rate limits on Redis storage, import row cap.
6. **FE-2, FE-3, FE-1, M-1…M-8** — cache clear on logout, CSP, localStorage
   note, remaining mediums.
7. **Lows/Infos** — incl. L-5 (admin can't unblock a stuck evaluation —
   availability bug worth fixing alongside MA-2).
