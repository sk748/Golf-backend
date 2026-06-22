// At-risk attendance selector for the coach dashboard. Surfaces the coach's
// juniors whose attended-session count is BELOW their level band's minimum, so a
// coach can nudge them before the month closes. No new endpoints: it joins the
// coach's roster (useCoachJuniors) with each junior's progress
// (/api/juniors/:id/progress -> attendance.present) and the band reference
// (useLevelBands -> min_sessions). All reads go through the shared api client.

import { useQueries } from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { LevelBand } from '../../types/api';
import {
  useCoachJuniors,
  type AssignableJunior,
} from '../admin/coach-assignment.queries';
import { useLevelBands } from '../committee/committee-evaluations.queries';
import type { StaffJuniorProgress } from '../juniors/juniors.queries';

// One junior flagged as below their band's session minimum.
export interface AtRiskJunior {
  junior: AssignableJunior;
  present: number; // sessions attended (attendance.present)
  min: number; // band min_sessions
  shortfall: number; // min - present (> 0)
}

export interface AtRiskResult {
  atRisk: AtRiskJunior[];
  // True while the roster, bands, or ANY junior-progress query is still loading
  // and we don't yet have a complete picture. We surface ONE quiet loading state
  // rather than N spinners.
  isLoading: boolean;
  // True if the roster or bands failed (we can't compute at all), or every
  // progress query errored. Partial progress errors are tolerated — those
  // juniors are simply skipped (we never fabricate an at-risk flag).
  isError: boolean;
  // How many juniors we successfully evaluated (roster minus progress failures).
  evaluatedCount: number;
  rosterCount: number;
}

// Resolve a junior's band min_sessions: prefer band_id, fall back to the band
// whose [min_level, max_level] contains current_level (mirrors the evaluation
// page's resolution). Returns undefined if no band matches.
function minSessionsFor(
  junior: AssignableJunior,
  bands: LevelBand[],
): number | undefined {
  const band =
    bands.find((b) => b.id === junior.band_id) ??
    bands.find(
      (b) =>
        junior.current_level >= b.min_level &&
        junior.current_level <= b.max_level,
    );
  return band?.min_sessions;
}

export function useAtRiskJuniors(coachId?: string): AtRiskResult {
  const juniorsQuery = useCoachJuniors(coachId);
  const bandsQuery = useLevelBands();

  const juniors = juniorsQuery.data ?? [];
  const bands = bandsQuery.data ?? [];

  // One progress query per junior, sharing the ['junior', id, 'progress'] key
  // with useJuniorProgressStaff so the cache is reused across the app.
  const progressQueries = useQueries({
    queries: juniors.map((j) => ({
      queryKey: ['junior', j.id, 'progress'],
      queryFn: () =>
        api.get<StaffJuniorProgress>(`/api/juniors/${j.id}/progress`),
      enabled: Boolean(coachId),
      staleTime: 60 * 1000,
    })),
  });

  const rosterCount = juniors.length;
  const baseLoading =
    juniorsQuery.isLoading || (rosterCount > 0 && bandsQuery.isLoading);
  const progressLoading = progressQueries.some((q) => q.isLoading);
  const isLoading = baseLoading || (rosterCount > 0 && progressLoading);

  const atRisk: AtRiskJunior[] = [];
  let evaluatedCount = 0;

  juniors.forEach((junior, i) => {
    const progress = progressQueries[i]?.data;
    if (!progress) return; // still loading or errored — skip (don't fabricate)
    const min = minSessionsFor(junior, bands);
    if (min == null) return; // band unknown — can't judge, skip
    evaluatedCount += 1;
    const present = progress.attendance?.present ?? 0;
    if (present < min) {
      atRisk.push({ junior, present, min, shortfall: min - present });
    }
  });

  // Sort by largest shortfall first — the most-at-risk float to the top.
  atRisk.sort((a, b) => b.shortfall - a.shortfall);

  const allProgressErrored =
    rosterCount > 0 && progressQueries.every((q) => q.isError);
  const isError =
    juniorsQuery.isError || bandsQuery.isError || allProgressErrored;

  return {
    atRisk,
    isLoading,
    isError,
    evaluatedCount,
    rosterCount,
  };
}
