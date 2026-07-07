// Timetable queries — thin wrappers over the existing /api/sessions endpoint
// for the quarterly view. We reuse the GroupSession type from
// group-sessions.queries.ts verbatim; no new types are introduced.
//
// Endpoint used: GET /api/sessions?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
//   - `date_from` and `date_to` are supported by the backend's list_sessions()
//     controller (Session.date >= / <=).
//   - Parents and players are scoped server-side to open_for_booking=true;
//     staff get the full schedule. We let the backend enforce this; the timetable
//     simply passes the date range.
//
// No new endpoints are invented. Term/quarter concept is client-side only —
// the backend has no "term" domain. We compute quarter boundaries locally and
// pass them as date_from / date_to.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { toISODate } from '../coach/coach-dates';
import type { GroupSession } from './group-sessions.queries';

// ── Quarter helpers ───────────────────────────────────────────────────────────

export interface Quarter {
  label: string; // e.g. "Q1 2026 (Jan – Mar)"
  start: string; // ISO YYYY-MM-DD
  end: string; // ISO YYYY-MM-DD
}

// Kenya school terms roughly align with calendar quarters; we use calendar
// quarters as a practical proxy (no term data in the backend).
// Q1 = Jan–Mar  Q2 = Apr–Jun  Q3 = Jul–Sep  Q4 = Oct–Dec
const QUARTER_MONTHS: [number, number, string][] = [
  [1, 3, 'Jan – Mar'],
  [4, 6, 'Apr – Jun'],
  [7, 9, 'Jul – Sep'],
  [10, 12, 'Oct – Dec'],
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function buildQuartersForYear(year: number): Quarter[] {
  return QUARTER_MONTHS.map(([startMonth, endMonth, monthLabel], idx) => ({
    label: `Q${idx + 1} ${year} (${monthLabel})`,
    start: `${year}-${pad(startMonth)}-01`,
    end: `${year}-${pad(endMonth)}-${pad(lastDayOfMonth(year, endMonth))}`,
  }));
}

export function currentQuarterIndex(): number {
  const month = new Date().getMonth() + 1; // 1-based
  return QUARTER_MONTHS.findIndex(
    ([s, e]) => month >= s && month <= e,
  );
}

// ── Band derivation ───────────────────────────────────────────────────────────
// Derive a band key from a session's level_min / level_max. We use the LOWER
// bound to place a session into a band; a session spanning multiple bands
// (e.g. level_min=3, level_max=5) is placed in the band of its minimum level.
// Unrestricted sessions (null bounds) are placed in a catch-all "All levels".

export type BandKey = 'l1-3' | 'l4-5' | 'l6-8' | 'l9plus' | 'all';

export interface BandMeta {
  key: BandKey;
  label: string;
  levelRange: string;
  description: string;
  clinicCapGuidance: string | null; // shown when L1-3
}

export const BANDS: BandMeta[] = [
  {
    key: 'l1-3',
    label: 'Beginners',
    levelRange: 'L1 – L3',
    description: 'Putting · Chipping · Full swing · Etiquette',
    clinicCapGuidance: 'Clinics: max 6 per group',
  },
  {
    key: 'l4-5',
    label: 'Attaining Handicap',
    levelRange: 'L4 – L5',
    description: 'Practice rounds · Scorecard sign-off',
    clinicCapGuidance: null,
  },
  {
    key: 'l6-8',
    label: 'Intermediate & Advanced',
    levelRange: 'L6 – L8',
    description: '2 – 3 competitive rounds/month · Karen Junior Challenge',
    clinicCapGuidance: null,
  },
  {
    key: 'l9plus',
    label: 'Elite',
    levelRange: 'L9+',
    description: 'HI ≤ 15 · Sub-84 rounds · Faldo / US Kids track',
    clinicCapGuidance: null,
  },
  {
    key: 'all',
    label: 'All levels',
    levelRange: 'Unrestricted',
    description: 'No level restriction',
    clinicCapGuidance: null,
  },
];

export function deriveBand(s: Pick<GroupSession, 'level_min' | 'level_max'>): BandKey {
  const min = s.level_min;
  if (min == null) return 'all';
  if (min <= 3) return 'l1-3';
  if (min <= 5) return 'l4-5';
  if (min <= 8) return 'l6-8';
  return 'l9plus';
}

// ── Age group label ───────────────────────────────────────────────────────────

export function ageGroupLabel(
  s: Pick<GroupSession, 'age_min' | 'age_max'>,
): string {
  if (s.age_min != null && s.age_max != null) {
    return `Ages ${s.age_min} – ${s.age_max}`;
  }
  if (s.age_min != null) return `Ages ${s.age_min}+`;
  if (s.age_max != null) return `Ages up to ${s.age_max}`;
  return 'All ages';
}

// ── Grouped timetable shape ───────────────────────────────────────────────────

export interface TimetableRow {
  session: GroupSession;
  bandKey: BandKey;
  ageLabel: string;
  // "Mon 07:00 – 09:00" style — null when date absent
  dayTimeLabel: string | null;
}

export interface BandGroup {
  meta: BandMeta;
  rows: TimetableRow[];
}

// Build the grouped structure from a flat session list.
export function groupSessionsForTimetable(sessions: GroupSession[]): BandGroup[] {
  // Assign each session to a band row
  const rows: TimetableRow[] = sessions.map((s) => {
    const bandKey = deriveBand(s);
    return {
      session: s,
      bandKey,
      ageLabel: ageGroupLabel(s),
      dayTimeLabel: buildDayTimeLabel(s),
    };
  });

  // Build groups in the prescribed band order
  return BANDS.map((meta) => ({
    meta,
    rows: rows
      .filter((r) => r.bandKey === meta.key)
      .sort(compareTimetableRows),
  })).filter((g) => g.rows.length > 0); // omit empty bands
}

function buildDayTimeLabel(s: GroupSession): string | null {
  if (!s.date) return null;
  const d = parseLocalDate(s.date.slice(0, 10));
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
  const startStr = s.start_time ? s.start_time.slice(0, 5) : null;
  const endStr = s.end_time ? s.end_time.slice(0, 5) : null;
  if (startStr && endStr) return `${weekday}  ${startStr} – ${endStr}`;
  if (startStr) return `${weekday}  ${startStr}`;
  return weekday;
}

// Parse YYYY-MM-DD in local time (avoids UTC-offset drift from new Date('...')).
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// Sort rows: weekday first (Mon=1…Sun=7), then by start_time.
function compareTimetableRows(a: TimetableRow, b: TimetableRow): number {
  const dayOfWeek = (s: GroupSession): number => {
    if (!s.date) return 8; // no-date sessions sort last
    const d = parseLocalDate(s.date.slice(0, 10));
    const dow = d.getDay(); // 0=Sun
    return dow === 0 ? 7 : dow; // Mon=1…Sat=6, Sun=7
  };
  const dA = dayOfWeek(a.session);
  const dB = dayOfWeek(b.session);
  if (dA !== dB) return dA - dB;
  const tA = a.session.start_time ?? '';
  const tB = b.session.start_time ?? '';
  return tA < tB ? -1 : tA > tB ? 1 : 0;
}

// ── TanStack Query hook ───────────────────────────────────────────────────────

// Fetch sessions within a quarter's date range. Staff get all sessions; the
// backend silently scopes parents/players to open_for_booking=true sessions.
// No extra filter is added here — we render what the backend returns.
export function useTimetableSessions(
  quarter: Quarter,
): UseQueryResult<GroupSession[]> {
  return useQuery({
    queryKey: ['sessions', 'timetable', quarter.start, quarter.end],
    queryFn: () =>
      api.get<GroupSession[]>('/api/sessions', {
        date_from: quarter.start,
        date_to: quarter.end,
      }),
  });
}

// ── Capacity advisory ─────────────────────────────────────────────────────────

// Returns a string when a Beginners-band session should carry a cap advisory,
// null otherwise.
export function beginnerCapAdvisory(
  s: Pick<GroupSession, 'max_attendance'>,
): string | null {
  if (s.max_attendance == null) return 'No cap set — consider limiting to 6';
  if (s.max_attendance > 6)
    return `Cap is ${s.max_attendance} — guideline is max 6 per clinic`;
  return null;
}

// ── Current ISO date (passed as a date_to / date_from boundary) ───────────────
export { toISODate };
