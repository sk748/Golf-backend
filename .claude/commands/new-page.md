---
description: Start a new page/screen the Karen way (plan first, role-guarded, real data, audit after).
argument-hint: <role + feature, e.g. "coach — weekly schedule" or "parent — request a session">
---

We are building a new page: **$ARGUMENTS**

Follow the project's working style exactly:

1. **Plan Mode first.** Before writing any code, enter Plan Mode and propose:
   - which **role(s)** this page is for and the `RequireRole` guard;
   - which **API endpoints** it uses (must already be documented in `CLAUDE.md` —
     if it needs one that isn't, STOP and ask, don't invent it);
   - the **TanStack Query** keys and any mutations + what they invalidate;
   - the component breakdown and the **empty / loading / error** states;
   - for a parent/player page, confirm it only requests that user's own data.
   Stop and wait for my approval of the plan — especially the layout/UX — before
   implementing.

2. **Use Extended Thinking** for band-conditional rendering, role routing, or any
   scorecard/handicap display logic, where "looks right" and "is right" diverge.

3. **Fetch through `src/lib/api.ts` only.** No direct `fetch`, no second client,
   no hardcoded backend URL.

4. **Do not create mock data.** Real API data or a real empty state. A fake array
   of juniors/scores is never an acceptable placeholder.

5. **Do not recompute WHS math.** Handicap/differential/Stableford/net come from
   the API. Display helpers only.

6. **Do not modify `CLAUDE.md`, `src/lib/api.ts`, or `src/types/api.ts`** without
   explicit instruction. If the work seems to need a contract change, stop and ask.

7. **After implementation:**
   - hand the diff to the `api-contract-auditor` subagent and address its findings
     (always, since a new page touches data/role access);
   - run the `build-runner` subagent and confirm tsc + lint + build are green.
