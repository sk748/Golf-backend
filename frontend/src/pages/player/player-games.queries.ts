// TanStack Query hooks for the Player (student) dashboard. All server reads go
// through the shared api client (CLAUDE.md §2); query keys mirror the resource.
// No computation of WHS/handicap here — these hooks only fetch + type the data.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { Hole, HoleScore, Round } from '../../types/api';

// GET /api/rounds — player auto-scoped, newest first. Used for the recent-games
// list and the recent-scores chart.
export function useRounds(): UseQueryResult<Round[]> {
  return useQuery({
    queryKey: ['rounds'],
    queryFn: () => api.get<Round[]>('/api/rounds'),
  });
}

// GET /api/users/:id/handicap-history — time series, oldest -> newest. Drives the
// handicap-index hero fallback and the trend chart.
export function useHandicapHistory(userId: string): UseQueryResult<Round[]> {
  return useQuery({
    queryKey: ['users', userId, 'handicap-history'],
    queryFn: () => api.get<Round[]>(`/api/users/${userId}/handicap-history`),
    enabled: Boolean(userId),
  });
}

// GET /api/hole-scores?round_id= — per-hole scores for one round (scorecard
// modal). Disabled until a round id is known.
export function useHoleScores(roundId: number): UseQueryResult<HoleScore[]> {
  return useQuery({
    queryKey: ['hole-scores', roundId],
    queryFn: () => api.get<HoleScore[]>('/api/hole-scores', { round_id: roundId }),
    enabled: Boolean(roundId),
  });
}

// GET /api/holes?course_id= — par + stroke index per hole, to merge against the
// player's per-hole scores. Disabled until a course id is known.
export function useHoles(courseId: number): UseQueryResult<Hole[]> {
  return useQuery({
    queryKey: ['holes', courseId],
    queryFn: () => api.get<Hole[]>('/api/holes', { course_id: courseId }),
    enabled: Boolean(courseId),
  });
}
