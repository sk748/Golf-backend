// TanStack Query mutations for bulk junior import. All I/O via the shared api
// client (CLAUDE.md §2). Two endpoints:
//   POST /api/juniors/import/preview — dry-run, no writes, returns row analysis
//   POST /api/juniors/import/commit  — creates juniors, returns created/skipped/errors
//
// Both accept JSON { csv: string } which the standard api.post() handles
// cleanly without any custom Content-Type gymnastics.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';

import { api } from '../../lib/api';

// ── Shared shapes ─────────────────────────────────────────────────────────────

export type ImportRowStatus = 'ok' | 'warning' | 'error';

export interface ImportParsedRow {
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string | null;
  email: string;
  synthesized_email: boolean;
  parent_email: string | null;
  membership_number: string | null;
  current_level: number;
  [key: string]: unknown;
}

export interface ImportParentMatch {
  user_id: string;
  name: string;
  matched_by: string;
}

export interface ImportPreviewRow {
  row_number: number;
  parsed: ImportParsedRow;
  parent_match: ImportParentMatch | null;
  status: ImportRowStatus;
  messages: string[];
}

export interface ImportPreviewSummary {
  ok: number;
  warning: number;
  error: number;
  total: number;
}

export interface ImportPreviewResult {
  rows: ImportPreviewRow[];
  summary: ImportPreviewSummary;
}

export interface ImportCommitError {
  row_number: number;
  message: string;
}

export interface ImportCommitResult {
  created: number;
  skipped: number;
  errors: ImportCommitError[];
}

// ── Mutations ─────────────────────────────────────────────────────────────────

// POST /api/juniors/import/preview — no writes, returns per-row analysis.
export function useImportPreview(): UseMutationResult<
  ImportPreviewResult,
  Error,
  string
> {
  return useMutation({
    mutationFn: (csv: string) =>
      api.post<ImportPreviewResult>('/api/juniors/import/preview', { csv }),
  });
}

// POST /api/juniors/import/commit — creates juniors. Caller must confirm first.
// Invalidates the juniors cache so the browser/approval queue reflect the new
// pending_staff rows immediately.
export function useImportCommit(): UseMutationResult<
  ImportCommitResult,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (csv: string) =>
      api.post<ImportCommitResult>('/api/juniors/import/commit', { csv }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['juniors'] });
    },
  });
}
