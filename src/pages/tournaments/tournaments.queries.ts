// TanStack Query hooks + display helpers for the SHARED, read-only tournaments
// views (list + detail). All reads go through the shared api client
// (CLAUDE.md §2); query keys mirror the resource path.
//
// The canonical Tournament / TournamentDivision shapes are NOT in the locked
// src/types/api.ts (do not modify that file), so the feature-local interfaces
// below define them. They mirror the backend models (app/tournaments/models.py)
// as serialized by SimpleModelSchema: enums dump as their string value, Decimals
// (handicap_min/max) dump as numbers, Dates dump as ISO strings. We still read
// defensively and never recompute any scoring/handicap math here.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '../../lib/api';

// ── Domain types (feature-local; canonical shape not in src/types/api.ts) ──────

export type TournamentFormat = 'stroke_play' | 'stableford' | 'match_play';
export type ScoringBasis = 'gross' | 'net' | 'both';
export type TournamentStatus =
  | 'draft'
  | 'registration_open'
  | 'registration_closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';
export type DivisionBasis = 'age' | 'gender' | 'level' | 'handicap' | 'custom';

export interface Tournament {
  id: number;
  name: string;
  format: TournamentFormat;
  scoring_basis: ScoringBasis;
  course_id: number | null;
  tee_set_id: number | null;
  holes: number; // 9 | 18
  start_date: string; // ISO YYYY-MM-DD
  end_date: string | null;
  counts_toward_handicap: boolean;
  status: TournamentStatus;
  series_id: number | null;
  max_entrants: number | null;
  description: string | null;
  // Eligibility — all nullable (null = no restriction on that dimension).
  age_min: number | null;
  age_max: number | null;
  level_min: number | null;
  level_max: number | null;
  handicap_min: number | null;
  handicap_max: number | null;
  handicap_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface TournamentDivision {
  id: number;
  tournament_id: number;
  name: string;
  basis: DivisionBasis;
  tee_set_id: number | null;
  age_min: number | null;
  age_max: number | null;
  gender: string | null; // 'male' | 'female'
  level_min: number | null;
  level_max: number | null;
  handicap_min: number | null;
  handicap_max: number | null;
  created_at: string;
  updated_at: string;
}

// ── Query hooks ────────────────────────────────────────────────────────────────

export interface TournamentFilters {
  status?: string;
  format?: string;
}

// GET /api/tournaments — list, with optional status/format filters. Filters are
// part of the query key so each combination caches independently.
export function useTournaments(
  filters?: TournamentFilters,
): UseQueryResult<Tournament[]> {
  return useQuery({
    queryKey: ['tournaments', filters ?? {}],
    queryFn: () =>
      api.get<Tournament[]>('/api/tournaments', {
        status: filters?.status,
        format: filters?.format,
      }),
  });
}

// GET /api/tournaments/:id
export function useTournament(id: number): UseQueryResult<Tournament> {
  return useQuery({
    queryKey: ['tournament', id],
    queryFn: () => api.get<Tournament>(`/api/tournaments/${id}`),
    enabled: Number.isFinite(id),
  });
}

// GET /api/tournament-divisions?tournament_id=:id
export function useTournamentDivisions(
  tournamentId: number,
): UseQueryResult<TournamentDivision[]> {
  return useQuery({
    queryKey: ['tournament', tournamentId, 'divisions'],
    queryFn: () =>
      api.get<TournamentDivision[]>('/api/tournament-divisions', {
        tournament_id: tournamentId,
      }),
    enabled: Number.isFinite(tournamentId),
  });
}

// ── Display helpers (formatting only — no WHS / scoring math) ────────────────────

export type BadgeTone = 'azure' | 'gold' | 'emerald' | 'red' | 'violet' | 'slate';

const FORMAT_LABELS: Record<TournamentFormat, string> = {
  stroke_play: 'Stroke play',
  stableford: 'Stableford',
  match_play: 'Match play',
};

export function formatLabel(format: string): string {
  return FORMAT_LABELS[format as TournamentFormat] ?? prettify(format);
}

const SCORING_LABELS: Record<ScoringBasis, string> = {
  gross: 'Gross',
  net: 'Net',
  both: 'Gross & net',
};

export function scoringBasisLabel(basis: string): string {
  return SCORING_LABELS[basis as ScoringBasis] ?? prettify(basis);
}

const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: 'Draft',
  registration_open: 'Registration open',
  registration_closed: 'Registration closed',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as TournamentStatus] ?? prettify(status);
}

// Lifecycle colour: open is the live/actionable state (azure), in-progress is
// the hero (gold), completed is settled (emerald), cancelled/draft are muted.
const STATUS_TONES: Record<TournamentStatus, BadgeTone> = {
  draft: 'slate',
  registration_open: 'azure',
  registration_closed: 'violet',
  in_progress: 'gold',
  completed: 'emerald',
  cancelled: 'red',
};

export function statusTone(status: string): BadgeTone {
  return STATUS_TONES[status as TournamentStatus] ?? 'slate';
}

const DIVISION_BASIS_LABELS: Record<DivisionBasis, string> = {
  age: 'Age group',
  gender: 'Gender',
  level: 'Level',
  handicap: 'Handicap',
  custom: 'Custom',
};

export function divisionBasisLabel(basis: string): string {
  return DIVISION_BASIS_LABELS[basis as DivisionBasis] ?? prettify(basis);
}

function prettify(value: string): string {
  if (!value) return value;
  return value
    .replace(/_/g, ' ')
    .replace(/^\w/, (ch) => ch.toUpperCase());
}

// ── Dates ───────────────────────────────────────────────────────────────────────

// Parse an ISO YYYY-MM-DD as a local date (avoid the UTC-midnight off-by-one
// that `new Date('2026-03-01')` introduces in negative-offset zones).
function parseISODate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function formatOne(iso: string): string {
  const date = parseISODate(iso);
  if (!date) return iso;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Single day when there's no end date or start === end; otherwise a range.
export function formatDateRange(
  startISO: string,
  endISO: string | null,
): string {
  if (!endISO || endISO === startISO) return formatOne(startISO);
  return `${formatOne(startISO)} – ${formatOne(endISO)}`;
}

// ── Eligibility summary ───────────────────────────────────────────────────────

// One-decimal display for handicap figures (a display-only formatting choice,
// not a recomputation — the value comes straight from the API).
function fmtHi(value: number): string {
  return value.toFixed(1);
}

// A human one-liner summarising the per-tournament eligibility rules. Returns
// null when there are no restrictions at all (caller renders "Open to all").
// Examples:
//   "Levels 6–9 · Ages 5–12 · HI ≤ 15 · handicap required"
//   "Ages 5+ · handicap required"
export function eligibilitySummary(t: {
  age_min: number | null;
  age_max: number | null;
  level_min: number | null;
  level_max: number | null;
  handicap_min: number | null;
  handicap_max: number | null;
  handicap_required: boolean;
}): string | null {
  const parts: string[] = [];

  const levels = rangePart('Levels', t.level_min, t.level_max);
  if (levels) parts.push(levels);

  const ages = rangePart('Ages', t.age_min, t.age_max);
  if (ages) parts.push(ages);

  const hi = handicapPart(t.handicap_min, t.handicap_max);
  if (hi) parts.push(hi);

  if (t.handicap_required) parts.push('handicap required');

  return parts.length ? parts.join(' · ') : null;
}

function rangePart(
  label: string,
  min: number | null,
  max: number | null,
): string | null {
  if (min != null && max != null) {
    return min === max ? `${label} ${min}` : `${label} ${min}–${max}`;
  }
  if (min != null) return `${label} ${min}+`;
  if (max != null) return `${label} up to ${max}`;
  return null;
}

function handicapPart(
  min: number | null,
  max: number | null,
): string | null {
  if (min != null && max != null) return `HI ${fmtHi(min)}–${fmtHi(max)}`;
  if (max != null) return `HI ≤ ${fmtHi(max)}`;
  if (min != null) return `HI ≥ ${fmtHi(min)}`;
  return null;
}
