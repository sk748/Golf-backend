// TanStack Query hook for the competition-requirements endpoint.
// GET /api/juniors/:id/competition-requirements?season=YYYY
//
// Role-scoped by the backend:
//   admin / coach / committee — any junior
//   parent — own child only
//   player — self
//
// Never recomputes any requirement logic here — all derived values come from
// the API (met/not-met, on_track, evidence). Display only.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../../lib/api';

// ── Response shapes (mirror backend serialisation exactly) ───────────────────

export interface CompetitionEvidence {
  source: string;
  tournament_id?: number | null;
  tournament_name?: string | null;
  date?: string | null; // ISO YYYY-MM-DD
}

export interface MandatoryRequirement {
  competition_type: string;
  met: boolean;
  evidence: CompetitionEvidence[];
}

export interface EncouragedRequirement {
  competition_type: string;
  met: boolean;
}

export interface CompetitiveRoundsStatus {
  this_month: number;
  target_min: number;
  target_max: number;
  expected: boolean; // true when this band expects competitive rounds
  on_track: boolean;
}

export interface CompetitionRequirements {
  junior_id: number;
  season: number;
  level: number;
  band: string;
  mandatory: MandatoryRequirement[];
  encouraged: EncouragedRequirement[];
  competitive_rounds: CompetitiveRoundsStatus;
}

// ── Query hook ────────────────────────────────────────────────────────────────

// season defaults to the current calendar year when omitted. Query is disabled
// when juniorId is falsy / NaN so callers can pass the id directly from a
// parent query result without extra guards.
export function useCompetitionRequirements(
  juniorId: number | null | undefined,
  season?: number,
): UseQueryResult<CompetitionRequirements> {
  const enabled =
    juniorId != null && Number.isFinite(juniorId) && juniorId > 0;

  return useQuery({
    queryKey: ['junior', juniorId, 'competition-requirements', season ?? null],
    queryFn: () =>
      api.get<CompetitionRequirements>(
        `/api/juniors/${juniorId}/competition-requirements`,
        season != null ? { season } : undefined,
      ),
    enabled,
  });
}
