# Achievements system — issue audit (2026-06-11)

Read-only audit; **nothing fixed** (Sam wants to fix these together with product calls).
Ordered by severity. File refs are in the worktree.

## Critical
1. **9-hole rounds falsely unlock 18-hole scoring badges.** The backend computes
   the WHS differential from `holes_played` but never stores it on the round
   (`app/rounds/controllers.py` ~128 discards it; `Round` model has no holes
   column). The wall's `bestGross = min(gross)` has no holes filter
   (`src/features/achievements/use-achievements.ts` ~78). Repro: a 9-hole gross
   of 45 unlocks every scoring badge up to "Breaking 50 — legendary." Direction:
   persist `holes_played` on the round; gate scoring achievements to 18-hole
   (or normalise).

## High
2. **Batch-unlock spam.** One good round crosses several thresholds at once;
   `sync_achievements` emits one notification per key to BOTH player and parent
   (`app/juniors/controllers.py` ~420-428), and the celebration queue shows one
   popup each ("Next (N)"). Worst case (with #1) ~9 popups + 9 player + 9 parent
   notifications from a single entry. Direction: group a sync's new unlocks into
   one "You unlocked N" notification + one popup.
3. **`competitions_played` is the latest month's evaluation value, not a career
   total** (`app/evaluations/models.py` per-month row; `latest_player_feedback`
   returns the most recent). So cmp-3/5/10/20 rarely fire and the count
   oscillates month to month. Direction: decide the field's contract; sum across
   evaluations (or add a cumulative field) before driving cmp-*.
4. **Two contradictory truths.** Player wall = live `evaluateAchievements`
   (re-locks on any stat regression); parent view + "recent" glow = append-only
   recorded unlocks. After a deleted/un-verified round, a level correction, or a
   competitions drop, the child sees a badge LOCKED while the parent still sees
   it EARNED. Direction: one source of truth — make the wall monotonic
   (once-earned-stays) or let the backend retract unlocks.

## Medium
5. **Player gets a bell notification for their OWN achievement** — the red bell
   badge counts their own unlocks (clutter; `controllers.py` ~422). Direction:
   drop the self-notification (or don't count it) — the popup already celebrates.
6. **"Most recent" glow is arbitrary** on simultaneous unlocks (all share one
   `unlocked_at`; tiebreak is insertion id). Direction: glow the whole most-recent
   batch, or accept arbitrary-but-stable.
7. **Partial-baseline race.** `PlayerAchievementSync` fires as soon as
   `earned.length > 0`, before `rounds`/`history`/`feedback` settle, so a genuine
   first-time unlock can get folded into the silent baseline and never celebrate.
   Direction: gate the first sync on `!isLoading` (all sources settled).
8. **hc-trend flickers.** `handicapImproving = last < previous` (single-step) makes
   "On the Up" toggle earned/locked on a 0.1 change. Direction: monotonic-once-
   earned, or compare against best-ever / smoothed.

## Low
9. `bestHandicap` folds the live index into the historical min (live-vs-recorded
   inconsistency, same family as #4).
10. Locked-type drift is load-bearing: the verified-rounds filter relies on a
    local `Round & {status?}` cast because `src/types/api.ts` omits `status`
    (and `holes_played`). See `locked-type-drift` memory.
11. Confetti popup is `aria-modal` with a non-dimming click-anywhere backdrop —
    minor a11y inconsistency; revisit in the accessibility pass.

## Bottom line
Earned-state needs ONE source of truth; scoring needs the hole count; a batch of
unlocks needs to be ONE event. Those three decisions (plus the `competitions_played`
contract) are the product calls to make before fixing.
