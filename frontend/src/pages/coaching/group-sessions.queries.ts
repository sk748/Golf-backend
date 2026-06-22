// TanStack Query hooks + display helpers for GROUP training sessions: a coach
// publishes a session (open_for_booking, capacity, level/age bounds); parents
// and players book onto it; a coach/admin approves (one sign-off). The backend
// derives schedule fields from the session and enforces eligibility, capacity
// and duplicates server-side — these hooks fetch, type and submit only.
//
// Privacy: GET /api/sessions is server-scoped (parents/players are FORCED to
// open_for_booking=true) and GET /api/booking-requests returns only the
// caller's own rows for those roles. Staff-only name lookups do NOT live here —
// they stay on the staff-routed page.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import { toISODate } from '../coach/coach-dates';

// ── Types ─────────────────────────────────────────────────────────────────────

export type GroupSessionStatus =
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | string;

export type GroupSessionType =
  | 'group'
  | 'one_on_one'
  | 'evaluation'
  | 'tournament_prep'
  | string;

export type BookingStatus = 'pending' | 'approved' | 'declined' | string;

// A session row as served by GET /api/sessions — base columns plus the
// publishing fields and `approved_count` (live occupancy, embedded by the GET
// routes only; mutations invalidate ['sessions'] so reads always come from GET).
export interface GroupSession {
  id: number;
  class_id: number | null;
  coach_id: string;
  session_type: GroupSessionType;
  date: string | null; // ISO YYYY-MM-DD
  start_time: string | null; // "HH:MM[:SS]"
  end_time: string | null;
  notes: string | null;
  status: GroupSessionStatus;
  title: string | null; // focus, e.g. "Short game + putting"
  open_for_booking: boolean;
  max_attendance: number | null; // null = no cap
  level_min: number | null;
  level_max: number | null;
  age_min: number | null;
  age_max: number | null;
  requirements: string | null; // free text, e.g. "bring a putter"
  approved_count: number;
}

// A booking-request row (GET /api/booking-requests). Shared by freeform
// requests (session_id null) and group-session bookings (session_id set).
export interface BookingRow {
  id: number;
  parent_id: string; // the requester's user id, whichever role made it
  junior_id: number;
  coach_id: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  status: BookingStatus;
  session_id: number | null;
  admin_notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

// POST /api/sessions — the publish form's payload. The backend is permissive;
// status has no DB default so callers always send 'scheduled'.
export interface PublishSessionInput {
  coach_id: string;
  session_type: GroupSessionType;
  date: string; // ISO YYYY-MM-DD
  start_time: string; // "HH:MM"
  end_time: string;
  status: GroupSessionStatus;
  title?: string | null;
  open_for_booking?: boolean;
  max_attendance?: number | null;
  level_min?: number | null;
  level_max?: number | null;
  age_min?: number | null;
  age_max?: number | null;
  requirements?: string | null;
  notes?: string | null;
  class_id?: number | null;
}

// POST /api/booking-requests (group shape). A parent sends junior_id (their own
// child); a player sends ONLY session_id — the backend resolves their junior.
export interface BookSessionInput {
  session_id: number;
  junior_id?: number;
}

// ── Session reads ─────────────────────────────────────────────────────────────

// GET /api/sessions?open_for_booking=true&status=scheduled&date_from=<today> —
// the bookable upcoming sessions. Safe for every role (the backend forces the
// open_for_booking scope for parents/players anyway).
export function useBookableSessions(): UseQueryResult<GroupSession[]> {
  return useQuery({
    queryKey: ['sessions', { open: true }],
    queryFn: () =>
      api.get<GroupSession[]>('/api/sessions', {
        open_for_booking: true,
        status: 'scheduled',
        date_from: toISODate(new Date()),
      }),
  });
}

// GET /api/sessions[?coach_id=] — the staff schedule including unpublished
// sessions. Pass no coachId (admin) for the club-wide list. `enabled` lets the
// page wait for the signed-in user before fetching a coach-scoped list.
export function useCoachSessions(
  coachId?: string,
  enabled = true,
): UseQueryResult<GroupSession[]> {
  return useQuery({
    queryKey: ['sessions', { coachId: coachId ?? null }],
    queryFn: () =>
      api.get<GroupSession[]>('/api/sessions', { coach_id: coachId }),
    enabled,
  });
}

// ── Session writes (admin/coach) ──────────────────────────────────────────────

export function useCreateSession(): UseMutationResult<
  GroupSession,
  Error,
  PublishSessionInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PublishSessionInput) =>
      api.post<GroupSession>('/api/sessions', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useUpdateSession(): UseMutationResult<
  GroupSession,
  Error,
  { id: number; body: Partial<PublishSessionInput> }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      api.put<GroupSession>(`/api/sessions/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

// ── Booking reads ─────────────────────────────────────────────────────────────

// GET /api/booking-requests — no params; the backend scopes parents/players to
// their own requests.
export function useMyBookings(): UseQueryResult<BookingRow[]> {
  return useQuery({
    queryKey: ['booking-requests', 'mine'],
    queryFn: () => api.get<BookingRow[]>('/api/booking-requests'),
  });
}

// GET /api/booking-requests?session_id= — one session's bookings (staff).
export function useSessionBookings(
  sessionId?: number,
): UseQueryResult<BookingRow[]> {
  return useQuery({
    queryKey: ['booking-requests', { sessionId }],
    queryFn: () =>
      api.get<BookingRow[]>('/api/booking-requests', {
        session_id: sessionId,
      }),
    enabled: Boolean(sessionId),
  });
}

// GET /api/booking-requests?status=pending — the staff approvals queue.
export function usePendingBookings(): UseQueryResult<BookingRow[]> {
  return useQuery({
    queryKey: ['booking-requests', { status: 'pending' }],
    queryFn: () =>
      api.get<BookingRow[]>('/api/booking-requests', { status: 'pending' }),
  });
}

// ── Booking writes ────────────────────────────────────────────────────────────
// Every write invalidates both booking-requests AND sessions — approvals and
// cancellations change a session's occupancy (approved_count).

function useBookingInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['booking-requests'] });
    void qc.invalidateQueries({ queryKey: ['sessions'] });
  };
}

// POST /api/booking-requests — book onto a published session. Errors: 400
// INELIGIBLE (message explains full/level/age/closed/past) and 409 CONFLICT
// (already booked); both surface via the normalized ApiError message.
export function useBookSession(): UseMutationResult<
  BookingRow,
  Error,
  BookSessionInput
> {
  const invalidate = useBookingInvalidation();
  return useMutation({
    mutationFn: (input: BookSessionInput) =>
      api.post<BookingRow>('/api/booking-requests', input),
    onSuccess: invalidate,
  });
}

// PUT /api/booking-requests/:id/approve — one sign-off; 409 when the session is
// already full. Coaches may only approve their own sessions' bookings (403).
export function useApproveBooking(): UseMutationResult<
  BookingRow,
  Error,
  { id: number; admin_notes?: string }
> {
  const invalidate = useBookingInvalidation();
  return useMutation({
    mutationFn: ({ id, admin_notes }) =>
      api.put<BookingRow>(
        `/api/booking-requests/${id}/approve`,
        admin_notes ? { admin_notes } : undefined,
      ),
    onSuccess: invalidate,
  });
}

// PUT /api/booking-requests/:id/decline
export function useDeclineBooking(): UseMutationResult<
  BookingRow,
  Error,
  { id: number; admin_notes?: string }
> {
  const invalidate = useBookingInvalidation();
  return useMutation({
    mutationFn: ({ id, admin_notes }) =>
      api.put<BookingRow>(
        `/api/booking-requests/${id}/decline`,
        admin_notes ? { admin_notes } : undefined,
      ),
    onSuccess: invalidate,
  });
}

// DELETE /api/booking-requests/:id — parent/player cancel their own request.
export function useCancelBooking(): UseMutationResult<unknown, Error, number> {
  const invalidate = useBookingInvalidation();
  return useMutation({
    mutationFn: (id: number) => api.del<unknown>(`/api/booking-requests/${id}`),
    onSuccess: invalidate,
  });
}

// ── Display helpers (presentation only — no rules re-implemented) ─────────────

const TYPE_LABELS: Record<string, string> = {
  group: 'Group session',
  one_on_one: 'One-on-one',
  evaluation: 'Evaluation',
  tournament_prep: 'Tournament prep',
};

export function sessionTypeLabel(type: GroupSessionType | null): string {
  if (!type) return 'Session';
  return TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
}

// "3 of 8 places taken" / "Session full" / "Open spots" (no cap).
export function occupancyLabel(
  s: Pick<GroupSession, 'approved_count' | 'max_attendance'>,
): string {
  if (s.max_attendance == null) {
    return s.approved_count > 0
      ? `${s.approved_count} booked · open spots`
      : 'Open spots';
  }
  if (s.approved_count >= s.max_attendance) return 'Session full';
  return `${s.approved_count} of ${s.max_attendance} places taken`;
}

// A full session is shown but not bookable. Capacity is ultimately enforced by
// the backend at booking + approval time; this only drives the disabled state.
export function isSessionFull(
  s: Pick<GroupSession, 'approved_count' | 'max_attendance'>,
): boolean {
  return s.max_attendance != null && s.approved_count >= s.max_attendance;
}

// "Levels 4–6 · Ages 8–12" eligibility summary; empty string when unrestricted.
export function eligibilityLabel(
  s: Pick<GroupSession, 'level_min' | 'level_max' | 'age_min' | 'age_max'>,
): string {
  const range = (
    label: string,
    min: number | null,
    max: number | null,
  ): string | null => {
    if (min != null && max != null)
      return `${label} ${min === max ? min : `${min}–${max}`}`;
    if (min != null) return `${label} ${min}+`;
    if (max != null) return `${label} up to ${max}`;
    return null;
  };
  return [
    range(s.level_min === s.level_max ? 'Level' : 'Levels', s.level_min, s.level_max),
    range(s.age_min === s.age_max ? 'Age' : 'Ages', s.age_min, s.age_max),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function bookingStatusLabel(status: BookingStatus): string {
  const v = String(status).toLowerCase();
  if (v === 'pending') return 'Pending';
  if (v === 'approved') return 'Approved';
  if (v === 'declined') return 'Declined';
  return status ? String(status) : 'Unknown';
}

export function bookingStatusTone(
  status: BookingStatus,
): 'gold' | 'emerald' | 'red' | 'slate' {
  const v = String(status).toLowerCase();
  if (v === 'pending') return 'gold';
  if (v === 'approved') return 'emerald';
  if (v === 'declined') return 'red';
  return 'slate';
}
