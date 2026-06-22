// TanStack Query hooks for the coach's weekly schedule. All server reads go
// through the shared api client (CLAUDE.md §2); query keys mirror the resource
// path. WHS / scoring math is never done here — these hooks fetch + type only.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '../../lib/api';

// A coaching session as returned by the schedule + sessions endpoints. Mirrors
// the real backend Session model columns (enum -> string, date/time -> ISO
// string). We type only the fields the coach pages render; unknown extras are
// ignored.
export interface CoachSession {
  id: number;
  coach_id: string;
  class_id: number | null;
  session_type: string | null;
  status: string; // scheduled | completed | cancelled | ...
  date: string | null; // ISO YYYY-MM-DD
  start_time: string | null; // "HH:MM[:SS]"
  end_time: string | null;
  notes: string | null;
}

// GET /api/coaches/:coachId/schedule?week=YYYY-MM-DD — the coach's sessions for
// the week starting on the given Monday. Disabled until the coach id + week are
// known.
export function useCoachSchedule(
  coachId?: string,
  weekStart?: string,
): UseQueryResult<CoachSession[]> {
  return useQuery({
    queryKey: ['coaches', coachId, 'schedule', weekStart],
    queryFn: () =>
      api.get<CoachSession[]>(`/api/coaches/${coachId}/schedule`, {
        week: weekStart,
      }),
    enabled: Boolean(coachId && weekStart),
  });
}

// GET /api/sessions?coach_id=&date_from=&date_to=&status= — flat session list,
// used by the attendance page to let the coach pick a session to mark.
export function useCoachSessions(
  coachId?: string,
  range?: { date_from?: string; date_to?: string; status?: string },
): UseQueryResult<CoachSession[]> {
  return useQuery({
    queryKey: ['sessions', { coach_id: coachId, ...range }],
    queryFn: () =>
      api.get<CoachSession[]>('/api/sessions', {
        coach_id: coachId,
        date_from: range?.date_from,
        date_to: range?.date_to,
        status: range?.status,
      }),
    enabled: Boolean(coachId),
  });
}
