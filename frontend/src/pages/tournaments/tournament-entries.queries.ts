// TanStack Query hooks + helpers for the player-RSVP → parent-approval flow on
// tournaments. All reads/writes go through the shared api client (CLAUDE.md §2);
// query keys mirror the resource. The backend SCOPES /api/tournament-entries to
// the caller (player sees own, parent sees their children's) and is the sole
// authority on eligibility + status transitions — the `eligibility()` helper
// below is display/gating only and never blocks on its own.
//
// The canonical TournamentEntry shape is NOT in the locked src/types/api.ts (do
// not modify that file), so the feature-local interface below defines it. It
// mirrors the backend model (app/tournaments/models.py TournamentEntry) as
// serialized by SimpleModelSchema: the status enum dumps as its string value,
// dates dump as ISO strings.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { BadgeTone, Tournament } from './tournaments.queries';

// ── Domain types (feature-local) ──────────────────────────────────────────────

// Lifecycle: a player RSVPs → 'interested'; a parent (or admin) approves →
// 'registered' or declines → 'declined'. Parents register directly →
// 'registered'. 'confirmed' is a later admin step; 'withdrawn' is a removed
// entry the backend keeps for history on some paths.
export type EntryStatus =
  | 'interested'
  | 'registered'
  | 'confirmed'
  | 'withdrawn'
  | 'declined';

export interface TournamentEntry {
  id: number;
  tournament_id: number;
  junior_id: number;
  division_id: number | null;
  registered_by: string;
  status: EntryStatus;
  registered_at: string; // ISO YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

// ── Query hooks ────────────────────────────────────────────────────────────────

// GET /api/tournament-entries — scoped server-side to the caller (player: own;
// parent: their children's). Pass a filter to request only what's needed
// (intent-scoped + precise cache key); call sites that genuinely need the whole
// family-scoped set (e.g. the parent's cross-tournament approvals queue) omit it.
export function useMyEntries(
  filter?: { tournamentId?: number; juniorId?: number },
): UseQueryResult<TournamentEntry[]> {
  const params: Record<string, string> = {};
  if (filter?.tournamentId != null) params.tournament_id = String(filter.tournamentId);
  if (filter?.juniorId != null) params.junior_id = String(filter.juniorId);
  return useQuery({
    queryKey: ['tournament-entries', filter ?? null],
    queryFn: () =>
      api.get<TournamentEntry[]>(
        '/api/tournament-entries',
        Object.keys(params).length ? params : undefined,
      ),
  });
}

// GET /api/tournament-entries?tournament_id= — the FULL role-scoped roster for a
// single tournament, intended for admin/coach screens (e.g. score entry) where
// the caller's token grants visibility into every entry, not just their family's.
// Same query-key shape as useMyEntries(['tournament-entries', { tournamentId }])
// so cache reads and mutation invalidation stay aligned across the two hooks.
export function useTournamentEntries(
  tournamentId: number,
): UseQueryResult<TournamentEntry[]> {
  return useQuery({
    queryKey: ['tournament-entries', { tournamentId }],
    queryFn: () =>
      api.get<TournamentEntry[]>('/api/tournament-entries', {
        tournament_id: String(tournamentId),
      }),
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────────
// All invalidate ['tournament-entries']. The backend derives status from the
// caller's role (player → interested, parent → registered), so we only ever send
// { tournament_id, junior_id }.

export interface CreateEntryInput {
  tournament_id: number;
  junior_id: number;
}

export function useCreateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEntryInput) =>
      api.post<TournamentEntry>('/api/tournament-entries', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament-entries'] });
    },
  });
}

// PUT /api/tournament-entries/:id/approve — parent (own child) / admin:
// interested → registered.
export function useApproveEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.put<TournamentEntry>(`/api/tournament-entries/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament-entries'] });
    },
  });
}

// PUT /api/tournament-entries/:id/decline — parent (own child) / admin:
// interested → declined.
export function useDeclineEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.put<TournamentEntry>(`/api/tournament-entries/${id}/decline`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament-entries'] });
    },
  });
}

// DELETE /api/tournament-entries/:id — parent withdraws their child's entry (any
// status); a player may delete their OWN entry only while still 'interested'
// (else the backend returns 409).
export function useWithdrawEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.del<unknown>(`/api/tournament-entries/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament-entries'] });
    },
  });
}

// ── /juniors/me (player's own profile) ───────────────────────────────────────────
// NOTE: an existing useMyJunior() lives in src/pages/player/player-progress.queries.ts
// and is the canonical hook — reuse that one. It is re-exported here so the
// tournament RSVP code has a single import surface for the player's junior_id.
export { useMyJunior } from '../player/player-progress.queries';

// ── Eligibility (DISPLAY / GATING ONLY — backend is authoritative) ────────────────
// Simple range checks against the tournament's per-event rules. No WHS math.
// Any null bound is skipped (no restriction on that dimension). This never
// blocks a submit on its own — the backend re-validates and returns INELIGIBLE.

// The junior fields we read for eligibility. Both JuniorProfile (player) and
// ParentChild (parent) satisfy this shape.
export interface EligibilityJunior {
  date_of_birth: string;
  current_level: number;
  has_handicap: boolean;
  handicap_index: number | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

// Age in whole years on a given ISO date (no time component, local).
function ageOn(dobISO: string, onISO: string): number | null {
  const dob = parseISO(dobISO);
  const on = parseISO(onISO);
  if (!dob || !on) return null;
  let age = on.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    on.getMonth() < dob.getMonth() ||
    (on.getMonth() === dob.getMonth() && on.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function parseISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

// Build the per-tournament eligibility verdict for a junior. `reasons` lists the
// failures (empty when eligible). Display-only.
export function eligibility(
  t: Pick<
    Tournament,
    | 'start_date'
    | 'age_min'
    | 'age_max'
    | 'level_min'
    | 'level_max'
    | 'handicap_min'
    | 'handicap_max'
    | 'handicap_required'
  >,
  junior: EligibilityJunior,
): EligibilityResult {
  const reasons: string[] = [];

  // Age (at the tournament's start date).
  const age = ageOn(junior.date_of_birth, t.start_date);
  if (age != null) {
    if (t.age_min != null && age < t.age_min) {
      reasons.push(`Minimum age is ${t.age_min} (currently ${age}).`);
    }
    if (t.age_max != null && age > t.age_max) {
      reasons.push(`Maximum age is ${t.age_max} (currently ${age}).`);
    }
  }

  // Level band.
  if (t.level_min != null && junior.current_level < t.level_min) {
    reasons.push(`Open from level ${t.level_min} (currently level ${junior.current_level}).`);
  }
  if (t.level_max != null && junior.current_level > t.level_max) {
    reasons.push(`Open up to level ${t.level_max} (currently level ${junior.current_level}).`);
  }

  // Handicap required.
  if (t.handicap_required && !junior.has_handicap) {
    reasons.push('A handicap index is required to enter.');
  }

  // Handicap range (only meaningful when the junior has an index).
  const hi = junior.handicap_index;
  if (hi != null) {
    if (t.handicap_min != null && hi < t.handicap_min) {
      reasons.push(`Handicap index must be at least ${t.handicap_min.toFixed(1)}.`);
    }
    if (t.handicap_max != null && hi > t.handicap_max) {
      reasons.push(`Handicap index must be ${t.handicap_max.toFixed(1)} or lower.`);
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

// ── Status display helpers ────────────────────────────────────────────────────────

const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  interested: 'Awaiting approval',
  registered: 'Registered',
  confirmed: 'Confirmed',
  withdrawn: 'Withdrawn',
  declined: 'Not this time',
};

export function entryStatusLabel(status: string): string {
  return ENTRY_STATUS_LABELS[status as EntryStatus] ?? status;
}

const ENTRY_STATUS_TONES: Record<EntryStatus, BadgeTone> = {
  interested: 'gold',
  registered: 'emerald',
  confirmed: 'emerald',
  withdrawn: 'slate',
  declined: 'red',
};

export function entryStatusTone(status: string): BadgeTone {
  return ENTRY_STATUS_TONES[status as EntryStatus] ?? 'slate';
}
