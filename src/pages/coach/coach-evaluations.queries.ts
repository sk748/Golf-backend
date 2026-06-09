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
