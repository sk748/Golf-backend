// TanStack Query hooks + mutation for the coach's evaluation sign-off queue.
// Sign-off is sequential: coach signs first, committee counter-signs (CLAUDE.md
// domain rule 4). This file only handles the coach's first sign-off. All server
// I/O goes through the shared api client.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { JuniorProfile, User } from '../../types/api';
import type {
  Evaluation,
  EvaluationAssessment,
  EvaluationRecommendation,
} from '../committee/committee-evaluations.queries';
import type { JuniorCompetitions } from '../tournaments/tournament-external.queries';

// An evaluation row awaiting the coach's first sign-off. The backend stores one
// flat row per golfer per month; we type the fields the queue renders. The row
// carries junior_id only (no name) — names are resolved via useGolferNames.
export interface CoachEvaluation {
  id: number;
  junior_id: number;
  report_month: string; // ISO YYYY-MM-DD (first of month)
  current_level: number;
  assessment: string;
  recommendation: string;
  coach_signed: boolean;
  committee_signed: boolean;
}

// GET /api/evaluations?coach_id=&coach_signed=false — evaluations this coach has
// not yet signed. Disabled until the coach id is known.
export function useUnsignedEvaluations(
  coachId?: string,
): UseQueryResult<CoachEvaluation[]> {
  return useQuery({
    queryKey: ['evaluations', { coach_id: coachId, coach_signed: false }],
    queryFn: () =>
      api.get<CoachEvaluation[]>('/api/evaluations', {
        coach_id: coachId,
        coach_signed: false,
      }),
    enabled: Boolean(coachId),
  });
}

// POST /api/evaluations/:id/coach-sign — the coach's first sign-off. Invalidates
// every cached evaluations variant so the queue (and any counts) refetch.
export function useCoachSign(): UseMutationResult<unknown, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (evaluationId: number) =>
      api.post<unknown>(`/api/evaluations/${evaluationId}/coach-sign`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluations'] });
    },
  });
}

// ── Promotion (level up, traceable to a counter-signed evaluation) ────────────
// POST /api/juniors/:id/promote body {evaluation_id} (admin/coach). The backend
// enforces the full rule — coach-signed AND committee-signed AND recommends
// move_next_level AND belongs to that junior AND level < 9 — and returns a 400
// VALIDATION_ERROR with a precise message otherwise. Success returns the junior
// with the NEW current_level + band_id. Invalidates the juniors + evaluations
// prefixes so rosters, guards and queues all refetch.
export interface PromoteJuniorInput {
  juniorId: number;
  evaluationId: number;
}

export function usePromoteJunior(): UseMutationResult<
  JuniorProfile,
  Error,
  PromoteJuniorInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ juniorId, evaluationId }: PromoteJuniorInput) =>
      api.post<JuniorProfile>(`/api/juniors/${juniorId}/promote`, {
        evaluation_id: evaluationId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['juniors'] });
      void queryClient.invalidateQueries({ queryKey: ['evaluations'] });
    },
  });
}

// ── Golfer name resolution ────────────────────────────────────────────────────
// Evaluations and enrollments carry junior_id only (the backend serializes table
// columns, no joined name). To label golfers we join /api/juniors (junior_id ->
// user_id) with /api/users?role=player (user_id -> full_name). Both endpoints are
// readable by the coach role on the backend. Reference-ish lookups, so cached.

// GET /api/juniors — used to resolve junior_id -> user_id.
export function useJuniors(): UseQueryResult<JuniorProfile[]> {
  return useQuery({
    queryKey: ['juniors', 'all'],
    queryFn: () => api.get<JuniorProfile[]>('/api/juniors'),
    staleTime: 60 * 1000,
  });
}

// GET /api/users?role=player — supplies full_name for the user_id behind each
// junior. Cached; only names are used.
export function usePlayerUsers(): UseQueryResult<User[]> {
  return useQuery({
    queryKey: ['users', { role: 'player' }],
    queryFn: () => api.get<User[]>('/api/users', { role: 'player' }),
    staleTime: 60 * 1000,
  });
}

// Builds junior_id -> display name from the juniors + player-users joins. Falls
// back to a stable "Golfer #<id>" label when a name can't be resolved (never
// fabricates a name). Also exposes junior_id -> current_level for the roster.
export function useGolferNames(): {
  nameFor: (juniorId: number) => string;
  levelFor: (juniorId: number) => number | null;
  isLoading: boolean;
} {
  const juniors = useJuniors();
  const users = usePlayerUsers();

  const userById = new Map((users.data ?? []).map((u) => [u.id, u]));
  const nameByJunior = new Map<number, string>();
  const levelByJunior = new Map<number, number>();
  for (const j of juniors.data ?? []) {
    const u = userById.get(j.user_id);
    if (u?.full_name?.trim()) nameByJunior.set(j.id, u.full_name.trim());
    if (typeof j.current_level === 'number') {
      levelByJunior.set(j.id, j.current_level);
    }
  }

  return {
    nameFor: (juniorId: number) =>
      nameByJunior.get(juniorId) ?? `Golfer #${juniorId}`,
    levelFor: (juniorId: number) => levelByJunior.get(juniorId) ?? null,
    isLoading: juniors.isLoading || users.isLoading,
  };
}

// ── Writing a new evaluation (coach monthly-evaluation form) ──────────────────
// One flat row per golfer per month (CLAUDE.md domain rule 3). The band-specific
// fields are all nullable — the form sends only the section that matches the
// golfer's band template; the rest stay unset.

// POST /api/evaluations body. Required by the model: junior_id, coach_id,
// report_month (first-of-month ISO), current_level, attendance_count,
// assessment, recommendation. Everything else is nullable/optional.
export interface CreateEvaluationInput {
  junior_id: number;
  coach_id: string;
  report_month: string; // ISO YYYY-MM-DD, first of month
  current_level: number;
  attendance_count: number;
  attendance_total?: number | null;
  assessment: EvaluationAssessment;
  recommendation: EvaluationRecommendation;
  special_remarks?: string | null;
  // L1–3 (Beginners — skills template)
  putting_assessment?: string | null;
  chipping_assessment?: string | null;
  full_swing_assessment?: string | null;
  // L4–5 (Attaining Handicap — practice_scores template)
  avg_score_9?: number | null;
  avg_score_18?: number | null;
  // L6–8 / L9+ (competition template)
  competitions_played?: number | null;
  best_gross_score?: number | null;
}

// GET /api/evaluations?junior_id=&report_month= — the existing row(s) for a
// golfer + month, used as the duplicate guard before showing the form. The
// backend route reads exactly: junior_id, coach_id, report_month, coach_signed,
// committee_signed (app/evaluations/routes.py get_evaluations) — `report_month`
// is the month param, NOT `month`.
export function useEvaluationsFor(
  juniorId?: number,
  month?: string,
): UseQueryResult<Evaluation[]> {
  return useQuery({
    queryKey: ['evaluations', { junior_id: juniorId, report_month: month }],
    queryFn: () =>
      api.get<Evaluation[]>('/api/evaluations', {
        junior_id: juniorId,
        report_month: month,
      }),
    enabled: Boolean(juniorId && month),
  });
}

// POST /api/evaluations — create the month's row. 400 VALIDATION_ERROR and
// 409 CONFLICT (duplicate junior+month) surface as ApiError to the form.
// Invalidates every cached evaluations variant (queue, guard, lists).
export function useCreateEvaluation(): UseMutationResult<
  Evaluation,
  Error,
  CreateEvaluationInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEvaluationInput) =>
      api.post<Evaluation>('/api/evaluations', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['evaluations'] });
    },
  });
}

// PUT /api/evaluations/:id — update the month's existing row (admin/coach; a
// coach may only edit their OWN evaluation, else the backend 403s). Body carries
// the band-conditional evaluation fields (same shape as create, minus the
// immutable junior_id/coach_id/report_month identity — those select the row).
// Invalidates every cached evaluations variant so the guard, queue and lists
// refetch with the edited values.
export type UpdateEvaluationInput = Omit<
  CreateEvaluationInput,
  'junior_id' | 'coach_id' | 'report_month'
>;

export function useUpdateEvaluation(): UseMutationResult<
  Evaluation,
  Error,
  { id: number; body: UpdateEvaluationInput }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateEvaluationInput }) =>
      api.put<Evaluation>(`/api/evaluations/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['evaluations'] });
    },
  });
}

// ── Month-scoped competition stats (prefill for the competition template) ─────
// GET /api/juniors/:id/competitions?from=&to= — backend-computed
// competitions_played / best_gross_score within a date window. NOTE: the route
// reads `from`/`to` (app/tournaments/routes.py get_junior_competitions), unlike
// the external-results list which uses date_from/date_to. The existing
// useJuniorCompetitions (tournament-external.queries) is unfiltered; this is
// the month-windowed variant for evaluation prefill.

// Last day of the month for a first-of-month ISO date ("2026-06-01" -> "2026-06-30").
export function monthEndISO(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

export function useJuniorCompetitionsForMonth(
  juniorId?: number,
  month?: string, // ISO first-of-month
): UseQueryResult<JuniorCompetitions> {
  return useQuery({
    queryKey: ['junior-competitions', juniorId, { month }],
    queryFn: () =>
      api.get<JuniorCompetitions>(`/api/juniors/${juniorId}/competitions`, {
        from: month,
        to: month ? monthEndISO(month) : undefined,
      }),
    enabled: Boolean(juniorId && month),
  });
}
