// TanStack Query hooks for coach↔junior assignment. Admin assigns/unassigns a
// coach per junior (PUT /api/juniors/:id/coach); coaches read their own roster
// (GET /api/coaches/:id/juniors). All server I/O goes through the shared api
// client (CLAUDE.md §2).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { User } from '../../types/api';
import type { JuniorApprovalStatus } from '../parent/parent-children.queries';

// A junior row as served by GET /api/juniors and GET /api/coaches/:id/juniors.
// The backend embeds the child's name as `full_name` (may be absent — callers
// fall back to "Golfer #id"; never fabricate a name). The endpoint serializes
// every JuniorProfile column (SimpleModelSchema), so the full intake fields are
// typed here too for the staff junior browser/profile pages.
export interface AssignableJunior {
  id: number;
  user_id: string;
  parent_id: string | null;
  coach_id: string | null;
  full_name?: string;
  current_level: number;
  band_id: number;
  date_of_birth: string;
  gender: string; // 'male' | 'female'
  curriculum: string | null;
  has_handicap: boolean;
  handicap_index: number | null;
  played_us_kids: boolean | null;
  us_kids_best_score: number | null;
  experience: string;
  availability: string;
  medical_conditions: string | null;
  golf_goals: string | null;
  tournament_ready: boolean;
  // Signup chain (build-phase-2 decisions 5+7): pending_parent → pending_staff
  // → active. Staff surfaces badge non-active rows; admin/committee approve.
  approval_status: JuniorApprovalStatus;
  // Participant type — the three programme entry routes (registered_junior |
  // club_beginner | karen_academy). Staff-editable via PUT /api/juniors/:id;
  // filter via GET /api/juniors?participant_type=. Default registered_junior.
  participant_type: string | null;
}

// GET /api/juniors — every junior in the programme (admin/coach/committee).
// Shares the ['juniors','all'] cache key used by other pages for this resource.
export function useAllJuniors(): UseQueryResult<AssignableJunior[]> {
  return useQuery({
    queryKey: ['juniors', 'all'],
    queryFn: () => api.get<AssignableJunior[]>('/api/juniors'),
    staleTime: 60 * 1000,
  });
}

// GET /api/coaches/:coachId/juniors — the juniors assigned to one coach. A
// coach may only request their own id (the backend 403s otherwise). Disabled
// until the coach id is known.
export function useCoachJuniors(
  coachId?: string,
): UseQueryResult<AssignableJunior[]> {
  return useQuery({
    queryKey: ['coach-juniors', coachId],
    queryFn: () =>
      api.get<AssignableJunior[]>(`/api/coaches/${coachId}/juniors`),
    enabled: !!coachId,
  });
}

// GET /api/users?role=coach — the coaches for the assign dropdown. No shared
// hook exists for this (admin-users.queries hits /api/admin/users), so this is
// feature-local, mirroring the usePlayerUsers pattern. Cached briefly.
export function useCoachUsers(): UseQueryResult<User[]> {
  return useQuery({
    queryKey: ['users', { role: 'coach' }],
    queryFn: () => api.get<User[]>('/api/users', { role: 'coach' }),
    staleTime: 60 * 1000,
  });
}

// ── Assign / unassign ─────────────────────────────────────────────────────────
export interface AssignCoachInput {
  juniorId: number;
  coachId: string | null; // null = unassign
}

// PUT /api/juniors/:juniorId/coach { coach_id } (admin only; null unassigns).
// Invalidates every cached juniors variant AND every coach roster so both the
// admin table and each coach's "My juniors" widget refetch.
export function useAssignCoach(): UseMutationResult<
  AssignableJunior,
  Error,
  AssignCoachInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ juniorId, coachId }: AssignCoachInput) =>
      api.put<AssignableJunior>(`/api/juniors/${juniorId}/coach`, {
        coach_id: coachId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['juniors'] });
      void queryClient.invalidateQueries({ queryKey: ['coach-juniors'] });
    },
  });
}
