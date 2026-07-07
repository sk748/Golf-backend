// TanStack Query mutation hook for staff manual handicap entry.
// PUT /api/users/:userId/handicap — allowed roles: admin, coach, committee.
// Invalidates junior list, junior detail, and user handicap-history keys on
// success. Errors surface via ApiError (.status 400 / 403).
//
// DO NOT import from src/types/api.ts for the provenance fields — they are not
// yet in the locked type file. A local interface is used here instead.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { ApiError } from '../../lib/api';

// ── Local types (not in locked src/types/api.ts) ─────────────────────────────

// The four provenance fields that the backend now returns on junior payloads
// and on the mutation response. Callers that read these from AssignableJunior
// must cast to access these extra fields.
export interface HandicapProvenance {
  handicap_source: 'manual' | 'computed' | null;
  handicap_set_by: string | null; // user id string
  handicap_set_at: string | null; // ISO datetime string
}

// Mutation response shape: PUT /api/users/:userId/handicap.
// The api client unwraps the { data: ... } envelope for us.
export interface HandicapSetResponse extends HandicapProvenance {
  id: string;                    // user_id
  handicap_index: number | null;
}

// Mutation input.
export interface SetHandicapInput {
  userId: string;
  handicap_index: number | null; // null = clear the handicap
}

// ── Mutation ─────────────────────────────────────────────────────────────────

export function useSetHandicap(): UseMutationResult<
  HandicapSetResponse,
  ApiError | Error,
  SetHandicapInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, handicap_index }: SetHandicapInput) =>
      api.put<HandicapSetResponse>(`/api/users/${userId}/handicap`, {
        handicap_index,
      }),
    onSuccess: () => {
      // Invalidate every junior-scoped cache: browser list, coach roster,
      // and per-junior detail keys.
      void qc.invalidateQueries({ queryKey: ['juniors'] });
      void qc.invalidateQueries({ queryKey: ['junior'] });
      void qc.invalidateQueries({ queryKey: ['coach-juniors'] });
      // Handicap history is user-scoped — clear so the trend chart refreshes.
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

// ── Display helpers ───────────────────────────────────────────────────────────

// "14 Jun 2026" from an ISO datetime string.
export function formatHandicapSetDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
