// Data layer for the Coach Management section (admin + committee). Analytics
// reads + native .xlsx export, all via the shared api client (CLAUDE.md §2).
// Roster assignment reuses the shared coach-assignment hooks. The backend
// computes every figure and builds every workbook; the frontend only displays
// and downloads. Pure module (no JSX) so HMR fast-refresh stays clean.

import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';

import { api } from '../../lib/api';

// ── Window ────────────────────────────────────────────────────────────────────

export interface AnalyticsWindow {
  date_from: string;
  date_to: string;
}

export interface WindowPreset {
  key: string;
  label: string;
  days: number;
}

export const WINDOW_PRESETS: WindowPreset[] = [
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: '180d', label: 'Last 6 months', days: 180 },
  { key: '365d', label: 'Last 12 months', days: 365 },
];

export const DEFAULT_PRESET_KEY = '90d';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function windowForPreset(key: string): AnalyticsWindow {
  const preset = WINDOW_PRESETS.find((p) => p.key === key) ?? WINDOW_PRESETS[1];
  return { date_from: isoDaysAgo(preset.days), date_to: todayIso() };
}

// ── Display labels / formatters ─────────────────────────────────────────────

export const ASSESSMENT_LABEL: Record<string, string> = {
  below_expectation: 'Below',
  meeting_expectation: 'Meeting',
  exceeding_expectation: 'Exceeding',
};

export const SESSION_TYPE_LABEL: Record<string, string> = {
  group: 'Group',
  one_on_one: '1-on-1',
  evaluation: 'Evaluation',
  tournament_prep: 'Tournament prep',
};

export function attendancePct(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

// ── Analytics types (mirror the backend payload field-for-field) ─────────────

export interface CoachSummary {
  coach_id: string;
  coach_name: string;
  junior_count: number;
  sessions_run: number;
  sessions_by_type: Record<string, number>;
  billable_one_on_one: { count: number; attendees: number };
  attendance: { present: number; total: number; rate: number | null };
  evaluations: {
    total: number;
    below_expectation: number;
    meeting_expectation: number;
    exceeding_expectation: number;
    move_next_level: number;
  };
  avg_current_level: number | null;
  avg_handicap_change: number | null;
  juniors_with_handicap: number;
}

export interface CoachAnalyticsOverview {
  window: AnalyticsWindow;
  coaches: CoachSummary[];
}

export interface CoachSessionRow {
  id: number;
  date: string;
  session_type: string;
  title: string | null;
  billable: boolean;
  present: number;
  total: number;
}

export interface CoachJuniorRow {
  junior_id: number;
  user_id: string;
  full_name: string;
  current_level: number | null;
  band_label: string | null;
  has_handicap: boolean;
  handicap_index: number | null;
  handicap_change: number | null;
  latest_assessment: string | null;
  latest_recommendation: string | null;
  latest_eval_month: string | null;
}

export interface CoachAnalyticsDetail extends CoachSummary {
  window: AnalyticsWindow;
  sessions: CoachSessionRow[];
  juniors: CoachJuniorRow[];
}

// ── Analytics queries ─────────────────────────────────────────────────────────

export function useCoachAnalyticsOverview(
  window: AnalyticsWindow,
): UseQueryResult<CoachAnalyticsOverview> {
  return useQuery({
    queryKey: ['coach-analytics', 'overview', window],
    queryFn: () => api.get<CoachAnalyticsOverview>('/api/coach-analytics', { ...window }),
    staleTime: 60 * 1000,
  });
}

export function useCoachAnalyticsDetail(
  coachId: string | undefined,
  window: AnalyticsWindow,
): UseQueryResult<CoachAnalyticsDetail> {
  return useQuery({
    queryKey: ['coach-analytics', 'detail', coachId, window],
    queryFn: () => api.get<CoachAnalyticsDetail>(`/api/coach-analytics/${coachId}`, { ...window }),
    enabled: !!coachId,
    staleTime: 60 * 1000,
  });
}

// ── .xlsx export (item E — native openpyxl workbook, base64 in the envelope) ──

export interface XlsxFile {
  filename: string;
  mime: string;
  content_base64: string;
}

// Decode the base64 workbook to a Blob and trigger a browser download. The file
// is built server-side; this only carries it (no client-side spreadsheet gen).
export function downloadXlsx(file: XlsxFile): void {
  const binary = atob(file.content_base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// GET /api/coach-analytics/export — all-coaches summary workbook.
export function useExportAllCoaches(): UseMutationResult<XlsxFile, Error, AnalyticsWindow> {
  return useMutation({
    mutationFn: (window: AnalyticsWindow) =>
      api.get<XlsxFile>('/api/coach-analytics/export', { ...window }),
    onSuccess: downloadXlsx,
  });
}

// GET /api/coach-analytics/:coachId/export — per-coach billing workbook.
export function useExportCoach(): UseMutationResult<
  XlsxFile,
  Error,
  { coachId: string; window: AnalyticsWindow }
> {
  return useMutation({
    mutationFn: ({ coachId, window }) =>
      api.get<XlsxFile>(`/api/coach-analytics/${coachId}/export`, { ...window }),
    onSuccess: downloadXlsx,
  });
}
