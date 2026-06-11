// TanStack Query hooks + display helpers for ANNOUNCEMENTS: admin/committee
// post club news; everyone reads a role-scoped feed. Internal posts go live
// immediately; EXTERNAL posts (public website) publish directly for an admin
// but land as a DRAFT for committee, which an admin then publishes. The
// backend scopes the feed (admin/committee see everything incl. drafts;
// other roles only published internal posts targeting them) — these hooks
// fetch, type and submit only.
//
// GET /api/public/announcements is deliberately UNAUTHENTICATED — it powers
// the logged-out landing page's "Club News" section.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnnouncementAudience = 'everyone' | 'roles' | 'band' | 'coach_group';
export type AnnouncementStatus = 'draft' | 'published';

// A row as served by GET /api/announcements (all columns + author_name).
export interface Announcement {
  id: number;
  title: string;
  body: string;
  author_id: string;
  author_name: string | null;
  audience: AnnouncementAudience;
  roles: string | null; // csv when audience === 'roles'
  band_id: number | null;
  coach_id: string | null;
  is_external: boolean;
  status: AnnouncementStatus;
  published_by: string | null;
  published_at: string | null; // ISO timestamp
  created_at: string; // ISO timestamp
}

// GET /api/public/announcements — minimal public shape (published external only).
export interface PublicAnnouncement {
  id: number;
  title: string;
  body: string;
  published_at: string | null;
}

// POST /api/announcements. External posts always go to the public site, so the
// composer sends audience 'everyone' for them (no targeting applies).
export interface CreateAnnouncementInput {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  roles?: string[];
  band_id?: number;
  coach_id?: string;
  is_external: boolean;
}

// GET /api/messaging/contacts row — the coach picker's source (works for both
// admin AND committee; players/parents never mount it).
export interface MessagingContact {
  user_id: string;
  full_name: string;
  role: string;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

// GET /api/announcements — the role-scoped feed, newest first (server-ordered,
// cap 50). Polled every 60s so new club news appears without a reload.
export function useAnnouncements(): UseQueryResult<Announcement[]> {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: () => api.get<Announcement[]>('/api/announcements'),
    refetchInterval: 60_000,
  });
}

// GET /api/public/announcements — NO auth required (the api client simply has
// no token to attach when logged out). Published external posts only, cap 20.
export function usePublicAnnouncements(): UseQueryResult<PublicAnnouncement[]> {
  return useQuery({
    queryKey: ['announcements', 'public'],
    queryFn: () => api.get<PublicAnnouncement[]>('/api/public/announcements'),
    staleTime: 60 * 1000,
  });
}

// GET /api/messaging/contacts filtered to coaches — the "coaching group"
// audience picker. NEVER /api/users (committee can't read it; contacts can).
export function useCoachContacts(enabled = true): UseQueryResult<MessagingContact[]> {
  return useQuery({
    queryKey: ['messaging-contacts'],
    queryFn: () => api.get<MessagingContact[]>('/api/messaging/contacts'),
    select: (contacts) => contacts.filter((c) => c.role === 'coach'),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

// ── Writes ────────────────────────────────────────────────────────────────────

function useAnnouncementInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['announcements'] });
  };
}

// POST /api/announcements (admin/committee). The response's `status` tells the
// composer what happened: 'published' = live now; 'draft' = a committee
// external post awaiting admin approval.
export function useCreateAnnouncement(): UseMutationResult<
  Announcement,
  Error,
  CreateAnnouncementInput
> {
  const invalidate = useAnnouncementInvalidation();
  return useMutation({
    mutationFn: (input: CreateAnnouncementInput) =>
      api.post<Announcement>('/api/announcements', input),
    onSuccess: invalidate,
  });
}

// PUT /api/announcements/:id/publish (admin, drafts only — 409 otherwise).
export function usePublishAnnouncement(): UseMutationResult<
  Announcement,
  Error,
  number
> {
  const invalidate = useAnnouncementInvalidation();
  return useMutation({
    mutationFn: (id: number) =>
      api.put<Announcement>(`/api/announcements/${id}/publish`),
    onSuccess: invalidate,
  });
}

// DELETE /api/announcements/:id (author or admin) → 204.
export function useDeleteAnnouncement(): UseMutationResult<
  unknown,
  Error,
  number
> {
  const invalidate = useAnnouncementInvalidation();
  return useMutation({
    mutationFn: (id: number) => api.del<unknown>(`/api/announcements/${id}`),
    onSuccess: invalidate,
  });
}

// ── Display helpers (presentation only) ───────────────────────────────────────

// "11 June 2026" from an ISO timestamp; empty string when absent.
export function announcementDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Staff-facing audience summary, e.g. "Everyone" / "Coaches, Parents" /
// "Beginners band" / "Kofi Coach's group". Band/coach names are resolved by
// the caller (page-level lookups); falls back to the raw id when unknown.
export function audienceLabel(
  a: Pick<Announcement, 'audience' | 'roles' | 'band_id' | 'coach_id'>,
  lookups: {
    bandName?: (bandId: number) => string | undefined;
    coachName?: (coachId: string) => string | undefined;
  } = {},
): string {
  switch (a.audience) {
    case 'everyone':
      return 'Everyone';
    case 'roles': {
      const names = (a.roles ?? '')
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => ROLE_PLURALS[r] ?? r);
      return names.length > 0 ? names.join(', ') : 'Selected roles';
    }
    case 'band': {
      if (a.band_id == null) return 'Level band';
      const name = lookups.bandName?.(a.band_id);
      return name ? `${name} band` : `Band #${a.band_id}`;
    }
    case 'coach_group': {
      if (!a.coach_id) return 'Coaching group';
      const name = lookups.coachName?.(a.coach_id);
      return name ? `${name}'s group` : 'Coaching group';
    }
    default:
      return String(a.audience);
  }
}

const ROLE_PLURALS: Record<string, string> = {
  admin: 'Admins',
  coach: 'Coaches',
  committee: 'Committee',
  parent: 'Parents',
  player: 'Players',
};
