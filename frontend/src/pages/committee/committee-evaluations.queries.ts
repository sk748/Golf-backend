// TanStack Query hooks for the COMMITTEE role (programme oversight + the second
// evaluation sign-off). All server reads/writes go through the shared api client
// (CLAUDE.md §2); query keys mirror the resource path. No domain math here — the
// backend is authoritative for evaluation state and sign-off ordering.
//
// Name resolution: an Evaluation carries junior_id (not a name), and a
// JuniorProfile carries user_id (not a name). To label golfers we join
// /api/juniors (junior_id -> user_id) with /api/users (user_id -> full_name).
// Both endpoints are readable by the committee role on the backend.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { JuniorProfile, LevelBand, User } from '../../types/api';

// ── Domain type: the flat evaluation row ─────────────────────────────────────
// Mirrors the backend Evaluation model: common fields + nullable band-specific
// fields (Numeric -> number, Date -> ISO string). One row per golfer per month.
export type EvaluationAssessment =
  | 'below_expectation'
  | 'meeting_expectation'
  | 'exceeding_expectation';
export type EvaluationRecommendation = 'continue_level' | 'move_next_level';

export interface Evaluation {
  id: number;
  junior_id: number;
  coach_id: string;
  report_month: string; // ISO YYYY-MM-DD (first of month)
  current_level: number;
  attendance_count: number;
  attendance_total: number | null;
  assessment: EvaluationAssessment;
  recommendation: EvaluationRecommendation;
  special_remarks: string | null;
  // L1–3 (Beginners)
  putting_assessment: string | null;
  chipping_assessment: string | null;
  full_swing_assessment: string | null;
  // L4–5 (Attaining Handicap)
  avg_score_9: number | null;
  avg_score_18: number | null;
  // L6–8 / L9+ (Intermediate / Advanced / Enhanced / Elite)
  competitions_played: number | null;
  best_gross_score: number | null;
  // Sign-off
  coach_signed: boolean;
  coach_signed_date: string | null;
  committee_signed: boolean;
  committee_signed_date: string | null;
  committee_signed_by: string | null;
  created_at: string;
  updated_at: string;
}

// Filters for the evaluations list. undefined = param omitted ("All").
export interface EvaluationFilters {
  report_month?: string; // ISO first-of-month
  junior_id?: number;
  coach_id?: string;
  coach_signed?: boolean;
  committee_signed?: boolean;
}

// GET /api/evaluations?coach_signed=&committee_signed=&report_month=&junior_id=
// The api client unwraps the { data, count } envelope to the array.
export function useEvaluations(
  filters: EvaluationFilters,
): UseQueryResult<Evaluation[]> {
  return useQuery({
    queryKey: ['evaluations', filters],
    queryFn: () =>
      api.get<Evaluation[]>('/api/evaluations', {
        report_month: filters.report_month,
        junior_id: filters.junior_id,
        coach_id: filters.coach_id,
        coach_signed: filters.coach_signed,
        committee_signed: filters.committee_signed,
      }),
  });
}

// GET /api/evaluations/:id — one flat row.
export function useEvaluation(
  id: number | undefined,
): UseQueryResult<Evaluation> {
  return useQuery({
    queryKey: ['evaluations', id],
    queryFn: () => api.get<Evaluation>(`/api/evaluations/${id}`),
    enabled: Boolean(id),
  });
}

// ── Per-band summary ──────────────────────────────────────────────────────────
// GET /api/evaluations/summary?band_id=&month= — one row per golfer in the band
// with their sign-off status for that month (evaluation null if none yet).
export interface EvaluationSummaryRow {
  junior_id: number;
  user_id: string;
  current_level: number;
  evaluation: Evaluation | null;
  coach_signed: boolean;
  committee_signed: boolean;
}

export function useEvaluationSummary(
  bandId: number | undefined,
  month: string,
): UseQueryResult<EvaluationSummaryRow[]> {
  return useQuery({
    queryKey: ['evaluations', 'summary', { band_id: bandId, month }],
    queryFn: () =>
      api.get<EvaluationSummaryRow[]>('/api/evaluations/summary', {
        band_id: bandId,
        month,
      }),
    enabled: Boolean(bandId && month),
  });
}

// ── Counter-sign mutation ─────────────────────────────────────────────────────
// POST /api/evaluations/:id/committee-sign — valid only once coach_signed is
// true (the backend rejects an unsigned evaluation; the UI also guards the
// control). Invalidates every cached evaluation query so the queue + detail
// refresh.
export function useCommitteeSign(): UseMutationResult<Evaluation, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<Evaluation>(`/api/evaluations/${id}/committee-sign`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['evaluations'] });
    },
  });
}

// ── Reference / oversight reads ───────────────────────────────────────────────
// GET /api/level-bands — band reference (labels, level ranges). Cached.
export function useLevelBands(): UseQueryResult<LevelBand[]> {
  return useQuery({
    queryKey: ['level-bands'],
    queryFn: () => api.get<LevelBand[]>('/api/level-bands'),
    staleTime: 5 * 60 * 1000,
  });
}

// GET /api/juniors — read-across (committee). Used for the overview count and to
// resolve junior_id -> user_id for golfer names.
export function useJuniors(): UseQueryResult<JuniorProfile[]> {
  return useQuery({
    queryKey: ['juniors', 'all'],
    queryFn: () => api.get<JuniorProfile[]>('/api/juniors'),
    staleTime: 60 * 1000,
  });
}

// GET /api/users?role=player — committee-readable; supplies full_name for the
// user_id behind each junior. Cached; only names are used.
export function usePlayerUsers(): UseQueryResult<User[]> {
  return useQuery({
    queryKey: ['users', { role: 'player' }],
    queryFn: () => api.get<User[]>('/api/users', { role: 'player' }),
    staleTime: 60 * 1000,
  });
}

// GET /api/tournaments — read-only overview count. The backend has no
// "active" status (only draft/registration_open/registration_closed/
// in_progress/completed/cancelled — see Tournament.status), so "active" is
// computed client-side as registration_open + in_progress, matching the
// same definition already used server-side for the admin dashboard's
// tournaments.active stat (backend/app/admin/controllers.py).
export interface TournamentRow {
  id: number;
  name: string;
  status: string;
  format: string;
  start_date: string;
}

const ACTIVE_TOURNAMENT_STATUSES = new Set(['registration_open', 'in_progress']);

export function useActiveTournaments(): UseQueryResult<TournamentRow[]> {
  return useQuery({
    queryKey: ['tournaments'],
    queryFn: () => api.get<TournamentRow[]>('/api/tournaments'),
    staleTime: 60 * 1000,
    select: (rows) => rows.filter((t) => ACTIVE_TOURNAMENT_STATUSES.has(t.status)),
  });
}

// ── Name lookup helper ────────────────────────────────────────────────────────
// Builds junior_id -> display name from the juniors + player-users joins. Falls
// back to a stable "Golfer #<id>" label when a name can't be resolved (never
// fabricates a name).
export function useGolferNames(): {
  nameFor: (juniorId: number) => string;
  isLoading: boolean;
} {
  const juniors = useJuniors();
  const users = usePlayerUsers();

  const userById = new Map((users.data ?? []).map((u) => [u.id, u]));
  const nameByJunior = new Map<number, string>();
  for (const j of juniors.data ?? []) {
    const u = userById.get(j.user_id);
    if (u?.full_name?.trim()) nameByJunior.set(j.id, u.full_name.trim());
  }

  return {
    nameFor: (juniorId: number) =>
      nameByJunior.get(juniorId) ?? `Golfer #${juniorId}`,
    isLoading: juniors.isLoading || users.isLoading,
  };
}
