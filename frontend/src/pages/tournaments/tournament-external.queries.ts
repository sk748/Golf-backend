// TanStack Query hooks + display helpers for EXTERNAL RESULTS and a junior's
// combined COMPETITION history. All reads/writes go through the shared api client
// (CLAUDE.md §2); query keys mirror the resource path.
//
// External events (Faldo Series, US Kids, JGF, Karen Open, …) are lightweight
// result logs that feed a junior's "competitions played / best gross" stats —
// they are NOT full internal tournaments. The backend is authoritative; we only
// submit raw values and display what it returns (no scoring math here).
//
// The canonical ExternalResult / competitions shapes are NOT in the locked
// src/types/api.ts (do not modify that file), so the feature-local interfaces
// below define them. They mirror the backend serialization (app/tournaments/
// models.py via SimpleModelSchema): enums dump as their string value, dates as
// ISO YYYY-MM-DD strings, unset numerics as null.
//
// Backend contract (FIXED — app/tournaments/{routes,controllers,models}.py):
//   GET    /api/external-results       ?junior_id&event_type&date_from&date_to → ExternalResult[]
//          (backend auto-scopes parent/player to their own juniors)
//   POST   /api/external-results       { junior_id, event_name, event_type, date,
//                                        holes?, gross_score?, position?, field_size?,
//                                        counts_toward_handicap?, notes? } (admin/coach/parent)
//          Verification: staff-logged results are created verified; PARENT-logged
//          results start verified:false and need a staff verify before they count.
//   PUT    /api/external-results/:id    (admin/coach) → updated
//          (ignores verified/verified_by — use the verify endpoint for that)
//   PUT    /api/external-results/:id/verify (admin/coach, idempotent) → verified result
//   DELETE /api/external-results/:id    (admin/coach) → 204
//   GET    /api/juniors/:id/competitions ?date_from&date_to → JuniorCompetitions
//          (lists ALL externals with their `verified` flag, but the
//          competitions_played / best_gross_score stats count ONLY verified ones)

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { BadgeTone } from './tournaments.queries';

// ── Domain types (feature-local; canonical shape not in src/types/api.ts) ──────

export type ExternalEventType =
  | 'faldo_series'
  | 'us_kids'
  | 'jgf'
  | 'karen_open'
  | 'other';

export interface ExternalResult {
  id: number;
  junior_id: number;
  event_name: string;
  event_type: ExternalEventType;
  date: string; // ISO YYYY-MM-DD
  holes: number | null;
  gross_score: number | null;
  position: number | null;
  field_size: number | null;
  counts_toward_handicap: boolean;
  verified: boolean;
  verified_by: string | null;
  round_id: number | null;
  logged_by: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// One row in the `internal` array of /api/juniors/:id/competitions — a summary
// of an internal tournament the junior played (scores computed server-side).
export interface InternalCompetitionRow {
  tournament_id: number;
  tournament_name: string;
  date: string; // ISO YYYY-MM-DD
  format: string;
  gross_score: number | null;
  net_score: number | null;
  stableford_points: number | null;
  position: number | null;
}

export interface JuniorCompetitions {
  junior_id: number;
  competitions_played: number;
  best_gross_score: number | null;
  internal: InternalCompetitionRow[];
  external: ExternalResult[];
}

// POST body. Optionals are omitted (not sent as "") when unset; the form layer
// produces a clean payload.
export interface LogExternalResultInput {
  junior_id: number;
  event_name: string;
  event_type: ExternalEventType;
  date: string; // ISO YYYY-MM-DD
  holes?: number | null;
  gross_score?: number | null;
  position?: number | null;
  field_size?: number | null;
  counts_toward_handicap?: boolean;
  notes?: string | null;
}

// ── Query hooks ────────────────────────────────────────────────────────────────

export interface ExternalResultsFilter {
  juniorId?: number;
  eventType?: string;
  dateFrom?: string;
  dateTo?: string;
}

// GET /api/external-results — list, optionally filtered. The whole filter is part
// of the query key so each combination caches independently. The backend scopes
// parent/player tokens to their own juniors automatically.
export function useExternalResults(
  filter?: ExternalResultsFilter,
): UseQueryResult<ExternalResult[]> {
  return useQuery({
    queryKey: ['external-results', filter ?? null],
    queryFn: () =>
      api.get<ExternalResult[]>('/api/external-results', {
        junior_id: filter?.juniorId,
        event_type: filter?.eventType,
        date_from: filter?.dateFrom,
        date_to: filter?.dateTo,
      }),
  });
}

// GET /api/juniors/:id/competitions — combined internal + external history for a
// single junior. Backend-scoped; safe to call with the signed-in user's own
// junior (player) or their child (parent).
export function useJuniorCompetitions(
  juniorId?: number,
): UseQueryResult<JuniorCompetitions> {
  return useQuery({
    queryKey: ['junior-competitions', juniorId],
    queryFn: () =>
      api.get<JuniorCompetitions>(`/api/juniors/${juniorId}/competitions`),
    enabled: juniorId != null,
  });
}

// ── Mutation hooks ────────────────────────────────────────────────────────────
// All invalidate both the external-results list AND every junior-competitions
// query, since a logged result changes a junior's competitions_played/best_gross.

function invalidateExternal(qc: ReturnType<typeof useQueryClient>): void {
  void qc.invalidateQueries({ queryKey: ['external-results'] });
  void qc.invalidateQueries({ queryKey: ['junior-competitions'] });
}

// POST /api/external-results — log a result (admin/coach/parent; parent
// restricted to own child server-side). Returns the created result.
export function useLogExternalResult(): UseMutationResult<
  ExternalResult,
  unknown,
  LogExternalResultInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LogExternalResultInput) =>
      api.post<ExternalResult>('/api/external-results', body),
    onSuccess: () => invalidateExternal(qc),
  });
}

// PUT /api/external-results/:id — partial update (admin/coach).
export function useUpdateExternalResult(): UseMutationResult<
  ExternalResult,
  unknown,
  { id: number; body: Partial<LogExternalResultInput> }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      api.put<ExternalResult>(`/api/external-results/${id}`, body),
    onSuccess: () => invalidateExternal(qc),
  });
}

// PUT /api/external-results/:id/verify — staff sign-off on a (parent-logged)
// result (admin/coach, idempotent). Until verified, a result is listed but does
// not count toward competitions_played / best_gross_score.
export function useVerifyExternalResult(): UseMutationResult<
  ExternalResult,
  unknown,
  number
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.put<ExternalResult>(`/api/external-results/${id}/verify`),
    onSuccess: () => invalidateExternal(qc),
  });
}

// DELETE /api/external-results/:id (admin/coach).
export function useDeleteExternalResult(): UseMutationResult<
  void,
  unknown,
  number
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/api/external-results/${id}`),
    onSuccess: () => invalidateExternal(qc),
  });
}

// ── Display helpers (formatting only) ────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<ExternalEventType, string> = {
  faldo_series: 'Faldo Series',
  us_kids: 'US Kids',
  jgf: 'JGF',
  karen_open: 'Karen Open',
  other: 'Other',
};

export function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type as ExternalEventType] ?? prettify(type);
}

// Tone per series, so the table/cards read at a glance. Falls back to slate.
const EVENT_TYPE_TONES: Record<ExternalEventType, BadgeTone> = {
  faldo_series: 'violet',
  us_kids: 'azure',
  jgf: 'emerald',
  karen_open: 'gold',
  other: 'slate',
};

export function eventTypeTone(type: string): BadgeTone {
  return EVENT_TYPE_TONES[type as ExternalEventType] ?? 'slate';
}

// The full set of selectable event types, for form selects/filters.
export const EXTERNAL_EVENT_TYPES: ExternalEventType[] = [
  'faldo_series',
  'us_kids',
  'jgf',
  'karen_open',
  'other',
];

function prettify(value: string): string {
  if (!value) return value;
  return value.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase());
}

// Parse an ISO YYYY-MM-DD as a local date (avoids the UTC-midnight off-by-one
// that `new Date('2026-03-01')` introduces in negative-offset zones).
function parseISODate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export function formatEventDate(iso: string): string {
  const date = parseISODate(iso);
  if (!date) return iso;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Sort key (descending = most recent first). Non-parseable dates sort last.
export function dateSortKey(iso: string): number {
  const date = parseISODate(iso);
  return date ? date.getTime() : -Infinity;
}
