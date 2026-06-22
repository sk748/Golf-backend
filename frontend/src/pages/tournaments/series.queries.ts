// TanStack Query hooks + display helpers for SERIES / ORDER-OF-MERIT standings.
// All reads/writes go through the shared api client (CLAUDE.md §2); query keys
// mirror the resource path. Standings are computed server-side and authoritative
// (CLAUDE.md tournaments rules) — we only display them.
//
// CONTRACT (backend: app/tournaments/{routes,controllers,models}.py; the
// SimpleModelSchema dumps Text columns as raw strings, enums as their value,
// dates as ISO):
//   Series:
//     { id, name, year, points_scheme, status, created_at, updated_at }
//   ── points_scheme IS A JSON *STRING* ──────────────────────────────────────
//   The backend stores/returns points_scheme as a JSON string mapping a
//   finishing position to points, e.g. '{"1":100,"2":80,"3":60}'. It is NOT an
//   object on the wire. When CREATING/UPDATING a series, points_scheme must be
//   sent as a JSON string too (use stringifyPointsScheme below). Read it back
//   with parsePointsScheme.
//
//   Endpoints:
//     GET    /api/series                 ?year                 → Series[]
//     GET    /api/series/:id                                   → Series
//     POST   /api/series      (ADMIN)    { name, year, points_scheme?, status? }
//     PUT    /api/series/:id  (ADMIN)    partial
//     DELETE /api/series/:id  (ADMIN)                          → 204
//     GET    /api/series/:id/standings                         → SeriesStandings
//   Standings (all signed-in roles) are computed from COMPLETED tournaments in
//   the series, awarding points_scheme[position] to each entry's finish.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';

// ── Domain types (feature-local; not in the locked src/types/api.ts) ──────────

export interface Series {
  id: number;
  name: string;
  year: number;
  // JSON STRING (see header), e.g. '{"1":100,"2":80}'. null when unset.
  points_scheme: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeriesStanding {
  junior_id: number;
  name: string;
  points: number;
  events: number;
  rank: number;
}

export interface SeriesStandings {
  series_id: number;
  name: string;
  standings: SeriesStanding[];
}

// ── Mutation payloads ─────────────────────────────────────────────────────────
// points_scheme is the serialized JSON string (or null/omitted), never an object.

export interface CreateSeriesInput {
  name: string;
  year: number;
  points_scheme?: string | null;
  status?: string | null;
}

export type UpdateSeriesInput = Partial<CreateSeriesInput>;

// ── Points-scheme helpers (string ⇄ rows) ─────────────────────────────────────

export interface PointsRow {
  position: number;
  points: number;
}

// Safely parse the JSON-string points_scheme into sorted (position, points)
// rows. Returns [] for null / invalid JSON / non-object payloads so callers
// never have to guard. Ignores entries whose position or points isn't a finite
// number.
export function parsePointsScheme(raw: string | null): PointsRow[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  const rows: PointsRow[] = [];
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const position = Number(key);
    const points = Number(value);
    if (Number.isFinite(position) && Number.isFinite(points)) {
      rows.push({ position, points });
    }
  }
  rows.sort((a, b) => a.position - b.position);
  return rows;
}

// Build the JSON-string points_scheme from editor rows. Skips blank/invalid
// rows; later rows win on a duplicate position. Returns a stringified object
// like '{"1":100,"2":80}' (or '{}' when there are no valid rows).
export function stringifyPointsScheme(rows: PointsRow[]): string {
  const scheme: Record<string, number> = {};
  for (const row of rows) {
    if (!Number.isFinite(row.position) || !Number.isFinite(row.points)) continue;
    scheme[String(Math.trunc(row.position))] = row.points;
  }
  return JSON.stringify(scheme);
}

// ── Query hooks ────────────────────────────────────────────────────────────────

// GET /api/series — optionally filtered by year. The year is part of the key so
// each filter caches independently.
export function useSeriesList(year?: number): UseQueryResult<Series[]> {
  return useQuery({
    queryKey: ['series', { year: year ?? null }],
    queryFn: () => api.get<Series[]>('/api/series', { year }),
  });
}

// GET /api/series/:id
export function useSeries(id?: number): UseQueryResult<Series> {
  return useQuery({
    queryKey: ['series', id],
    queryFn: () => api.get<Series>(`/api/series/${id}`),
    enabled: id != null,
  });
}

// GET /api/series/:id/standings — readable by all signed-in roles.
export function useSeriesStandings(
  id?: number,
): UseQueryResult<SeriesStandings> {
  return useQuery({
    queryKey: ['series', id, 'standings'],
    queryFn: () => api.get<SeriesStandings>(`/api/series/${id}/standings`),
    enabled: id != null,
  });
}

// ── Mutation hooks (admin only — route/UI gated) ──────────────────────────────

// POST /api/series — create. Returns the created series (with id).
export function useCreateSeries(): UseMutationResult<
  Series,
  unknown,
  CreateSeriesInput
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSeriesInput) => api.post<Series>('/api/series', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['series'] });
    },
  });
}

// PUT /api/series/:id — partial update.
export function useUpdateSeries(): UseMutationResult<
  Series,
  unknown,
  { id: number; body: UpdateSeriesInput }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => api.put<Series>(`/api/series/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['series'] });
    },
  });
}

// DELETE /api/series/:id.
export function useDeleteSeries(): UseMutationResult<void, unknown, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/api/series/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['series'] });
    },
  });
}

// ── Display helpers (formatting only) ─────────────────────────────────────────

// A short peek at the top of the points scheme, e.g. "Top: 100 / 80 / 60".
// Returns null when no scheme is configured (caller renders a muted hint).
export function pointsSchemePeek(raw: string | null, count = 3): string | null {
  const rows = parsePointsScheme(raw);
  if (rows.length === 0) return null;
  const top = rows.slice(0, count).map((r) => r.points);
  const suffix = rows.length > count ? ' …' : '';
  return `Top: ${top.join(' / ')}${suffix}`;
}

export type SeriesStatusTone = 'azure' | 'gold' | 'emerald' | 'red' | 'violet' | 'slate';

// Friendly label + tone for a free-text status (the backend doesn't constrain
// the enum, so we map the common values and fall back gracefully).
export function seriesStatusTone(status: string | null): SeriesStatusTone {
  switch ((status ?? '').toLowerCase()) {
    case 'active':
    case 'in_progress':
    case 'open':
      return 'azure';
    case 'completed':
    case 'closed':
    case 'finished':
      return 'emerald';
    case 'cancelled':
    case 'canceled':
      return 'red';
    case 'draft':
      return 'slate';
    default:
      return 'slate';
  }
}

export function seriesStatusLabel(status: string | null): string {
  if (!status || !status.trim()) return 'No status';
  return status
    .replace(/_/g, ' ')
    .replace(/^\w/, (ch) => ch.toUpperCase());
}
