# Security Review (2026-06-11/12) — DRAFT: Pass 1 of 2 complete

Thorough defensive security audit of our own codebase, run overnight at Sam's
request. **READ-ONLY — nothing has been fixed.** Findings are for joint triage.
Pass 1 = authentication + authorization (below). Pass 2 (injection/ORM, mass
assignment beyond authz, secrets/config, rate limits, CSV import, messaging
safety pack, frontend token/XSS, dependencies) appends after the token-window
reset.

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

*Pass 2 pending: injection/ORM safety, mass assignment sweep beyond authz,
secrets/config (SECRET_KEY/JWT defaults, DATABASE_URI, debug, CORS/headers),
rate-limit coverage, CSV bulk-import parsing, messaging safety pack (banned-words
bypass), frontend (token storage, XSS, api client), dependency quick-scan.*
