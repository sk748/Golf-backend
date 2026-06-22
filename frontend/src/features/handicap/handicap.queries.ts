// TanStack Query hooks for the L4-5 Handicap Journey domain.
// Backend is authoritative on all progress math — this file is read/write only.
// All server I/O goes through the shared api client (CLAUDE.md §2).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';

// ── Domain types ──────────────────────────────────────────────────────────────

export type HandicapJourneyStatus =
  | 'not_started'
  | 'in_progress'
  | 'cards_submitted'
  | 'attained';

export interface HandicapJourneyTargets {
  nine_hole: { min: number; max: number };
  eighteen_hole: { min: number; max: number };
}

export interface HandicapJourneyProgress {
  signed_cards: number;
  target_signed_cards: number;
  cards_remaining: number;
  has_target_cards: boolean;
  avg_9_hole: number | null;
  avg_18_hole: number | null;
  nine_hole_rounds: number;
  eighteen_hole_rounds: number;
  nine_on_target: boolean;
  eighteen_on_target: boolean;
  meets_targets: boolean;
  ready_for_handicap: boolean;
  targets: HandicapJourneyTargets;
}

export interface HandicapJourney {
  id: number;
  junior_id: number;
  status: HandicapJourneyStatus;
  target_signed_cards: number;
  coach_notes: string | null;
  started_at: string | null;
  attained_at: string | null;
  created_at: string;
  updated_at: string;
  progress: HandicapJourneyProgress;
}

// ── Query key factory ─────────────────────────────────────────────────────────

export function handicapJourneyKey(juniorId: number) {
  return ['junior', juniorId, 'handicap-journey'] as const;
}

// ── Queries ───────────────────────────────────────────────────────────────────

// GET /api/juniors/:id/handicap-journey
// Lazily creates a not_started journey on first read — always returns a row.
// Pass juniorId=undefined/0 to disable (e.g. while profile loads).
export function useHandicapJourney(
  juniorId: number | undefined,
): UseQueryResult<HandicapJourney> {
  return useQuery({
    queryKey: handicapJourneyKey(juniorId ?? 0),
    queryFn: () =>
      api.get<HandicapJourney>(`/api/juniors/${juniorId}/handicap-journey`),
    enabled: !!juniorId,
  });
}

// ── Mutations (admin / coach only) ────────────────────────────────────────────

export interface UpdateHandicapJourneyInput {
  status?: HandicapJourneyStatus;
  target_signed_cards?: number;
  coach_notes?: string;
}

// PUT /api/juniors/:id/handicap-journey
export function useUpdateHandicapJourney(
  juniorId: number,
): UseMutationResult<HandicapJourney, Error, UpdateHandicapJourneyInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateHandicapJourneyInput) =>
      api.put<HandicapJourney>(
        `/api/juniors/${juniorId}/handicap-journey`,
        input,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: handicapJourneyKey(juniorId) }),
  });
}
