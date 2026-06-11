# Deferred / advanced features — review before UI-UX reorganisation

Compiled 2026-06-11 from a full read-only sweep of the monorepo (code + docs).
Purpose: decide what (if anything) to build before the UI/UX reorganisation.
Every core feature across Phases 0–5 plus the social phase is shipped; the items
below are deferrals, unsurfaced backend capability, basic-vs-intended gaps,
empty systems, and domain rules not yet shown in the UI.

## A. Highest-value / nearly-ready

1. **Badge catalog + awarding UI** — backend `/api/badges` and `/api/junior-badges`
   are full CRUD but have **no admin UI** and the catalog is **empty/unseeded**.
   The featured-badge "staff badge" source (Sam's unify decision) can't be used
   until badges exist + can be awarded. *Needs frontend (admin badge manager +
   award control). Backend ready (award_badge fixed this round).*
2. **Level-benchmark / level-band editing** — `/api/level-benchmarks` (full CRUD)
   and `/api/level-bands/:id` (PUT/DELETE) have read-only UI only. Admin can't
   edit curriculum targets or bands in-app. *Frontend only; backend ready.*
3. **User self-service profile + admin role/active toggle** — `PUT /api/auth/profile`,
   `PUT /api/users/:id/role`, `/activate` `/deactivate` exist with no UI. No
   "edit my profile / change password", no promote/deactivate control. *Frontend
   only.*
4. **Evaluation "already exists this month" UX** — 409 is handled but as a generic
   error; intended: auto-load the existing eval to view/edit. *Small frontend.*
5. **At-risk attendance alert** — band minimums are computed in progress, but no
   "5/12 sessions, N weeks left" nudge on the player/coach view. *Small frontend.*

## B. Backend built, no frontend surface

- `/api/badges`, `/api/junior-badges` (see A1)
- `/api/level-benchmarks` CRUD, `/api/level-bands/:id` PUT/DELETE (see A2)
- `/api/auth/profile` PUT, `/api/users/:id/role|activate|deactivate` (see A3)
- `/api/tee-sets/:id` PUT/DELETE — no course/tee editing UI (read-only reference)
- `/api/whs/*` standalone calculators — utility endpoints, values already reach
  the UI via `/scores/sync` + handicap-history; likely no UI needed.
- `/api/juniors/:id/monthly-report` — per-junior month snapshot unused (progress
  view uses `/progress`). Could feed a printable monthly report.
- `/api/classes` CRUD — legacy roster concept **superseded by group sessions**;
  decide keep-for-future vs retire (dead path today).
- Session attendance summary endpoint — no "8/10 attended" display.
- Per-notification mark-read — only mass "mark all" is wired.

## C. Basic now, richer intended (per CLAUDE.md / PROGRESS.md)

- **Series / order-of-merit** — basic standings table shipped; "polish" (filters
  by year/coach/band, trends, winners wall) is Phase 7+.
- **Per-band evaluation summary** — read-only list; no export, no this-vs-last
  comparison, no "ready to promote" highlight.
- **Scorecard entry surfaces** — per-round entry works; no batch weekend entry,
  no session-linked class scorecard capture.
- **Admin stats** — totals + recent feed; no deep dives (evals pending by week,
  attendance trends by coach, progression by band).
- **Tournament eligibility** — rules shown + enforced; no "why ineligible / your
  path to qualify" messaging.

## D. Domain rules not yet surfaced

- **9-hole vs 18-hole course handicap** — correct in backend, not labelled in UI.
- **Karen Junior Challenge mandatory (L6–8)** — no KJC flag on tournaments or a
  "must play this year" mandate display.
- **Faldo / US Kids / scholarship pathway** — external results log exists; no
  rank / age-group / scholarship-eligibility surfacing.
- **Medical alerts** — visible on profile only; no "⚠ bring inhaler" surfacing on
  the coach attendance screen.
- **Eval field band labels** — fields render correctly but aren't labelled with
  the band focus; minor help-text gap.

## E. Explicitly parked (Phase 7+)

- Billing / participant-type charging (data model is ready; charging parked).
- Bulk junior import from the intake spreadsheet.
- Email notifications / reminders (in-app bell + toast now exist).
- Guided tutorial (slated for finishing touches).
- Route-level code-splitting (~1.16 MB bundle) — Phase 6 ship task.

---

*Read-only audit; nothing here is built yet. Sam to pick what (if any) lands
before the UI/UX reorganisation pass.*
