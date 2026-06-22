// TanStack Query hooks + mutation for coach attendance capture. All server I/O
// goes through the shared api client (CLAUDE.md §2). A session's roster is
// derived: session -> class_id -> enrollments -> juniors. Marking attendance is
// a bulk POST that invalidates the affected attendance queries.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';

export type AttendanceStatus = 'present' | 'absent' | 'excused';

// GET /api/sessions/:id — one session, used to discover its class_id. Mirrors the
// real backend Session columns we read here.
export interface SessionDetail {
  id: number;
  class_id: number | null;
  coach_id: string;
  session_type: string | null;
  status: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
}

export function useSession(
  sessionId?: number,
): UseQueryResult<SessionDetail> {
  return useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: () => api.get<SessionDetail>(`/api/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
  });
}

// GET /api/enrollments?class_id= — an enrollment links a junior to a class. The
// backend serializes table columns only, so the enrollment gives us junior_id;
// the display name + level are resolved via useGolferNames (juniors + users).
export interface Enrollment {
  id: number;
  class_id: number;
  junior_id: number;
}

export function useClassEnrollments(
  classId?: number | null,
): UseQueryResult<Enrollment[]> {
  return useQuery({
    queryKey: ['enrollments', { class_id: classId }],
    queryFn: () =>
      api.get<Enrollment[]>('/api/enrollments', { class_id: classId }),
    enabled: Boolean(classId),
  });
}

// GET /api/attendance/session/:id/summary — existing attendance for a session,
// so the form can pre-fill what was already marked. Per-junior status records.
export interface AttendanceRecord {
  junior_id: number;
  status: AttendanceStatus;
}

export interface AttendanceSummary {
  session_id: number;
  present: number;
  absent: number;
  excused: number;
  total: number;
  records: AttendanceRecord[];
}

export function useAttendanceSummary(
  sessionId?: number,
): UseQueryResult<AttendanceSummary> {
  return useQuery({
    queryKey: ['attendance', 'session', sessionId, 'summary'],
    queryFn: () =>
      api.get<AttendanceSummary>(`/api/attendance/session/${sessionId}/summary`),
    enabled: Boolean(sessionId),
  });
}

// ── Bulk mark attendance ──────────────────────────────────────────────────────
export interface BulkAttendanceInput {
  session_id: number;
  records: { junior_id: number; status: AttendanceStatus }[];
}

// POST /api/attendance/bulk — invalidates this session's summary + raw list so
// the form reflects the saved state.
export function useBulkAttendance(): UseMutationResult<
  unknown,
  Error,
  BulkAttendanceInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkAttendanceInput) =>
      api.post<unknown>('/api/attendance/bulk', input),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({
        queryKey: ['attendance', 'session', input.session_id, 'summary'],
      });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}
