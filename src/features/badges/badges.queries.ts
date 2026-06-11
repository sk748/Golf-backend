// TanStack Query hooks for staff-granted Badges: the badge CATALOG (admin CRUD)
// and AWARDING a badge to a junior (admin / coach / committee). All server I/O
// via the shared api client (CLAUDE.md §2).
//
// Awarding fires the achievement celebration (confetti + player/parent
// notification) on the backend, so award/revoke mutations also invalidate the
// notifications bell.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';

// ── Shapes (match the backend column dumps; no nested relations) ──────────────

// GET /api/badges — the catalog of grantable badges.
export interface Badge {
  id: number;
  name: string;
  description: string | null;
  level_required: number | null;
}

// GET /api/junior-badges?junior_id= — which badges a junior holds. The dump is
// columns only (no nested badge), so join to the catalog by badge_id for names.
export interface JuniorBadge {
  junior_id: number;
  badge_id: number;
  awarded_date: string;
  awarded_by: string;
}

const CATALOG_QK = ['badges'] as const;
const juniorBadgesQK = (juniorId: number | undefined) =>
  ['junior-badges', juniorId] as const;

// ── Catalog: read + admin CRUD ────────────────────────────────────────────────

export function useBadges(): UseQueryResult<Badge[]> {
  return useQuery({
    queryKey: CATALOG_QK,
    queryFn: () => api.get<Badge[]>('/api/badges'),
    staleTime: 5 * 60 * 1000,
  });
}

export interface BadgeInput {
  name: string;
  description?: string | null;
  level_required?: number | null;
}

// POST /api/badges (admin)
export function useCreateBadge(): UseMutationResult<Badge, Error, BadgeInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BadgeInput) => api.post<Badge>('/api/badges', input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CATALOG_QK }),
  });
}

// PUT /api/badges/:id (admin)
export function useUpdateBadge(): UseMutationResult<
  Badge,
  Error,
  { id: number } & BadgeInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & BadgeInput) =>
      api.put<Badge>(`/api/badges/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CATALOG_QK }),
  });
}

// DELETE /api/badges/:id (admin)
export function useDeleteBadge(): UseMutationResult<void, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/api/badges/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: CATALOG_QK }),
  });
}

// ── A junior's held badges + award/revoke (admin / coach / committee) ─────────

export function useJuniorBadges(
  juniorId: number | undefined,
): UseQueryResult<JuniorBadge[]> {
  return useQuery({
    queryKey: juniorBadgesQK(juniorId),
    queryFn: () =>
      api.get<JuniorBadge[]>('/api/junior-badges', { junior_id: juniorId }),
    enabled: juniorId != null,
  });
}

// POST /api/junior-badges — award. awarded_by/awarded_date are stamped server
// side. Invalidates the junior's badges and the bell (award → celebration).
export function useAwardBadge(
  juniorId: number,
): UseMutationResult<JuniorBadge, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (badgeId: number) =>
      api.post<JuniorBadge>('/api/junior-badges', {
        junior_id: juniorId,
        badge_id: badgeId,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: juniorBadgesQK(juniorId) });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// DELETE /api/junior-badges/:juniorId/:badgeId — revoke.
export function useRevokeBadge(
  juniorId: number,
): UseMutationResult<void, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (badgeId: number) =>
      api.del<void>(`/api/junior-badges/${juniorId}/${badgeId}`),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: juniorBadgesQK(juniorId) }),
  });
}
