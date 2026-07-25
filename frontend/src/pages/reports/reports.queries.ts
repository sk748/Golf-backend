// Data layer for the cross-role Reports page. The backend builds every report
// file (xlsx or pdf) and returns it base64 in the standard envelope, scoped to
// the caller's role; these hooks fetch the payload and hand it to the shared
// browser-download trigger. Pure module (no JSX) so HMR fast-refresh stays clean.

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { api } from '../../lib/api';
import { downloadXlsx, type XlsxFile } from '../coaches/coach-management.queries';

export type ReportFormat = 'xlsx' | 'pdf';

// GET /api/reports/junior/:juniorId — one junior's report (admin/committee: any
// junior; coach: own roster; parent: own child; player: self — enforced server-side).
export function useExportJuniorReport(): UseMutationResult<
  XlsxFile,
  Error,
  { juniorId: number; format: ReportFormat; dateFrom?: string; dateTo?: string }
> {
  return useMutation({
    mutationFn: ({ juniorId, format, dateFrom, dateTo }) =>
      api.get<XlsxFile>(`/api/reports/junior/${juniorId}`, {
        format,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    onSuccess: downloadXlsx,
  });
}

// GET /api/reports/programme — the programme-wide report (admin/committee only).
export function useExportProgrammeReport(): UseMutationResult<
  XlsxFile,
  Error,
  { format: ReportFormat; dateFrom?: string; dateTo?: string }
> {
  return useMutation({
    mutationFn: ({ format, dateFrom, dateTo }) =>
      api.get<XlsxFile>('/api/reports/programme', {
        format,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    onSuccess: downloadXlsx,
  });
}
