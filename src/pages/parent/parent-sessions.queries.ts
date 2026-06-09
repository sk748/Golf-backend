// TanStack Query hooks for the PARENT role's coaching-session requests
// (booking requests). All reads/writes go through the shared api client; the
// backend scopes booking-requests to the signed-in parent. Mutations invalidate
// the affected keys so the list refreshes.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';

export type BookingStatus = 'pending' | 'approved' | 'declined' | string;

// GET /api/booking-requests -> the parent's own session requests. Field set is
// not locked in src/types/api.ts; we type the fields we rely on and keep them
// optional/defensive (the POST body shape is the authoritative contract).
export interface BookingRequest {
  id: number;
  junior_id: number;
  parent_id?: string | null;
  coach_id?: number | null;
  preferred_date: string | null;
  preferred_time: string | null;
  status: BookingStatus;
  admin_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

// Display label + tone for a request status (read-only presentation).
export function statusLabel(status: BookingStatus): string {
  const v = String(status).toLowerCase();
  if (v === 'pending') return 'Pending';
  if (v === 'approved') return 'Approved';
  if (v === 'declined') return 'Declined';
  return status ? String(status) : 'Unknown';
}

export function statusTone(
  status: BookingStatus,
): 'gold' | 'emerald' | 'red' | 'slate' {
  const v = String(status).toLowerCase();
  if (v === 'pending') return 'gold';
  if (v === 'approved') return 'emerald';
  if (v === 'declined') return 'red';
  return 'slate';
}

// GET /api/booking-requests?status= — scoped to the parent. Status filter
// optional; when omitted the backend returns all of the parent's requests.
export function useMyBookingRequests(
  status?: BookingStatus,
): UseQueryResult<BookingRequest[]> {
  return useQuery({
    queryKey: ['booking-requests', { status: status ?? null }],
    queryFn: () =>
      api.get<BookingRequest[]>(
        '/api/booking-requests',
        status ? { status } : undefined,
      ),
  });
}

// POST /api/booking-requests — request a coaching session (creates pending).
// coach_id is intentionally optional/unset for parents (they can't reliably
// pick a coach); the club assigns one when scheduling.
export interface CreateBookingRequestInput {
  junior_id: number;
  preferred_date: string; // ISO YYYY-MM-DD
  preferred_time: string; // HH:MM or free text
  coach_id?: number;
  admin_notes?: string;
}

export function useCreateBookingRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingRequestInput) =>
      api.post<BookingRequest>('/api/booking-requests', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking-requests'] });
    },
  });
}

// DELETE /api/booking-requests/:id — cancel the parent's own (pending) request.
export function useCancelBookingRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<unknown>(`/api/booking-requests/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking-requests'] });
    },
  });
}
