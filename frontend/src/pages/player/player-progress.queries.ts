// TanStack Query hooks for the Player (student) Level & Progress card. All
// server reads go through the shared api client (CLAUDE.md §2); query keys mirror
// the resource. No WHS/handicap math here — these hooks only fetch + type data.
//
// NOTE: /api/juniors/me returns 404 when the signed-in user has no junior
// profile. We let that surface as the query error and handle it in the component
// (friendly "no player profile" state) rather than swallowing it here.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '../../lib/api';
import type {
  JuniorProfile,
  JuniorProgress,
  LevelBand,
  LevelBenchmark,
  PlayerFeedback,
} from '../../types/api';

// GET /api/juniors/me — the signed-in player's junior profile (id, current_level,
// band_id, ...). 404 when no profile exists; surfaced to the component.
export function useMyJunior(): UseQueryResult<JuniorProfile> {
  return useQuery({
    queryKey: ['juniors', 'me'],
    queryFn: () => api.get<JuniorProfile>('/api/juniors/me'),
    // A missing profile (404) is a stable "no profile" answer, not a transient
    // failure — don't hammer the endpoint retrying it.
    retry: false,
  });
}

// GET /api/juniors/:id/progress — level changes, evaluations, attendance and the
// benchmark set for this junior. Disabled until the junior id is known.
export function useJuniorProgress(
  juniorId?: number,
): UseQueryResult<JuniorProgress> {
  return useQuery({
    queryKey: ['juniors', juniorId, 'progress'],
    queryFn: () => api.get<JuniorProgress>(`/api/juniors/${juniorId}/progress`),
    enabled: Boolean(juniorId),
  });
}

// GET /api/level-bands — the level-band reference (name, label, min/max level,
// min_sessions, description). Static-ish reference data; cached generously.
export function useLevelBands(): UseQueryResult<LevelBand[]> {
  return useQuery({
    queryKey: ['level-bands'],
    queryFn: () => api.get<LevelBand[]>('/api/level-bands'),
    staleTime: 5 * 60 * 1000,
  });
}

// GET /api/level-benchmarks — per-level skill targets (full swing, around green,
// putting, nine hole). Static-ish reference data; cached generously.
export function useLevelBenchmarks(): UseQueryResult<LevelBenchmark[]> {
  return useQuery({
    queryKey: ['level-benchmarks'],
    queryFn: () => api.get<LevelBenchmark[]>('/api/level-benchmarks'),
    staleTime: 5 * 60 * 1000,
  });
}

// GET /api/juniors/me/feedback — the latest signed coach feedback for the player,
// with coach identity already stripped by the backend. May be null when nothing
// is signed off yet — that is a valid, expected result (not an error).
export function useMyFeedback(): UseQueryResult<PlayerFeedback | null> {
  return useQuery({
    queryKey: ['juniors', 'me', 'feedback'],
    queryFn: () => api.get<PlayerFeedback | null>('/api/juniors/me/feedback'),
  });
}
