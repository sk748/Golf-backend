// TanStack Query hooks + types for the Events / Calendar feature. All server
// reads/writes go through the shared api client (CLAUDE.md §2); query keys
// mirror the resource path. The canonical Event shape is NOT in the locked
// src/types/api.ts (do not modify that file), so the feature-local interfaces
// below define it, mirroring the verified backend contract. We read defensively
// (display names are best-effort and may be absent).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';

// ── Domain types (feature-local) ─────────────────────────────────────────────

export type EventAudience = 'everyone' | 'band' | 'coach_group' | 'individual';
export type EventStatus = 'scheduled' | 'cancelled';
export type RsvpStatus = 'going' | 'not_going';

export interface Event {
  id: number;
  owner_id: string;
  title: string;
  description: string | null;
  location: string | null;
  date: string; // ISO YYYY-MM-DD
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null; // "HH:MM:SS"
  audience: EventAudience;
  band_id: number | null;
  coach_id: string | null;
  junior_id: number | null;
  rsvp_required: boolean;
  mandatory: boolean;
  status: EventStatus;
  created_at: string;
  updated_at: string;
  // Caller-relative + aggregate fields the backend computes per request.
  my_rsvp: RsvpStatus | null;
  is_owner: boolean;
  going_count: number;
  // Best-effort display names (may be absent — always guard).
  owner_name?: string;
  band_name?: string;
  coach_name?: string;
  junior_name?: string;
}

// One responder row from GET /api/events/:id/rsvps (owner or admin/committee).
export interface EventRsvpRow {
  user_id: string;
  name: string;
  role: string;
  status: RsvpStatus;
  responded_at: string;
}

// ── Mutation payloads ────────────────────────────────────────────────────────

export interface EventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  date: string; // ISO YYYY-MM-DD
  start_time?: string | null;
  end_time?: string | null;
  audience: EventAudience;
  band_id?: number | null;
  coach_id?: string | null;
  junior_id?: number | null;
  rsvp_required?: boolean;
  mandatory?: boolean;
}

// ── Query hooks ──────────────────────────────────────────────────────────────

// GET /api/events?date_from=&date_to= — the events visible to the caller in the
// window. Disabled until both bounds are known. Each window caches separately.
export function useEvents(
  dateFrom?: string,
  dateTo?: string,
): UseQueryResult<Event[]> {
  return useQuery({
    queryKey: ['events', dateFrom, dateTo],
    queryFn: () =>
      api.get<Event[]>('/api/events', {
        date_from: dateFrom,
        date_to: dateTo,
      }),
    enabled: Boolean(dateFrom && dateTo),
  });
}

// GET /api/events/:id
export function useEvent(id: number | undefined): UseQueryResult<Event> {
  return useQuery({
    queryKey: ['event', id],
    queryFn: () => api.get<Event>(`/api/events/${id}`),
    enabled: Boolean(id),
  });
}

// GET /api/events/:id/rsvps — responders (owner or admin/committee). Loaded on
// demand (the detail modal toggles `enabled`).
export function useEventRsvps(
  eventId: number | undefined,
  enabled: boolean,
): UseQueryResult<EventRsvpRow[]> {
  return useQuery({
    queryKey: ['event', eventId, 'rsvps'],
    queryFn: () => api.get<EventRsvpRow[]>(`/api/events/${eventId}/rsvps`),
    enabled: Boolean(eventId) && enabled,
  });
}

// ── Mutation hooks ───────────────────────────────────────────────────────────

// POST /api/events — create (admin/coach/committee). Returns the created event.
export function useCreateEvent(): UseMutationResult<Event, unknown, EventInput> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EventInput) => api.post<Event>('/api/events', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

// POST /api/events/:id/rsvp { status } — returns the updated event (my_rsvp,
// going_count). Invalidates the list and the single event.
export function useRsvp(): UseMutationResult<
  Event,
  unknown,
  { id: number; status: RsvpStatus }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) =>
      api.post<Event>(`/api/events/${id}/rsvp`, { status }),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: ['events'] });
      void qc.invalidateQueries({ queryKey: ['event', id] });
    },
  });
}

// PUT /api/events/:id — partial update (owner or admin).
export function useUpdateEvent(): UseMutationResult<
  Event,
  unknown,
  { id: number; body: Partial<EventInput> & { status?: EventStatus } }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => api.put<Event>(`/api/events/${id}`, body),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: ['events'] });
      void qc.invalidateQueries({ queryKey: ['event', id] });
    },
  });
}

// DELETE /api/events/:id (owner or admin).
export function useDeleteEvent(): UseMutationResult<void, unknown, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/api/events/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

// ── Display helpers (formatting only) ────────────────────────────────────────

const AUDIENCE_LABELS: Record<EventAudience, string> = {
  everyone: 'Everyone',
  band: 'Band',
  coach_group: 'Coaching group',
  individual: 'Individual',
};

// A human label for an event's audience, preferring the embedded display name
// when the backend provides one (band/coach/junior). Never fabricates a name.
export function audienceLabel(event: Event): string {
  switch (event.audience) {
    case 'band':
      return event.band_name ? `Band — ${event.band_name}` : 'A band';
    case 'coach_group':
      return event.coach_name
        ? `${event.coach_name}'s group`
        : 'A coaching group';
    case 'individual':
      return event.junior_name ? `For ${event.junior_name}` : 'An individual';
    case 'everyone':
    default:
      return AUDIENCE_LABELS.everyone;
  }
}

// "HH:MM – HH:MM" / "HH:MM" / "All day" from an event's time columns.
export function eventTimeLabel(event: Event): string {
  const trim = (t: string | null) => (t ? t.slice(0, 5) : null);
  const start = trim(event.start_time);
  const end = trim(event.end_time);
  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  return 'All day';
}
