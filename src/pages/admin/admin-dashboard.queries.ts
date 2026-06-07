// TanStack Query hooks for the Admin Dashboard. All server reads go through the
// shared api client; query keys mirror the resource. The "recent activity" feed
// reads the real backend audit log (GET /api/admin/audit-log).

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { AdminStats, AuditEntry } from '../../types/api';

// GET /api/admin/stats — club-wide counters for the hero + secondary cards.
export function useAdminStats(): UseQueryResult<AdminStats> {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<AdminStats>('/api/admin/stats'),
  });
}

// ── Recent activity (from the audit log) ─────────────────────────────────────
export interface ActivityItem {
  id: string;
  category: string; // drives the icon
  description: string; // ready-to-display plain-English sentence from the backend
  at: string; // ISO created_at
}

const ACTIVITY_LIMIT = 8;

export interface RecentActivityResult {
  items: ActivityItem[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

// GET /api/admin/audit-log?limit= — newest-first; the api client unwraps to the
// array. The backend already renders each entry as a human sentence.
export function useRecentActivity(): RecentActivityResult {
  const query = useQuery({
    queryKey: ['admin', 'audit-log', { limit: ACTIVITY_LIMIT }],
    queryFn: () =>
      api.get<AuditEntry[]>('/api/admin/audit-log', { limit: ACTIVITY_LIMIT }),
  });

  const items: ActivityItem[] = (query.data ?? []).map((e) => ({
    id: `audit-${e.id}`,
    category: e.category,
    description: e.description,
    at: e.created_at,
  }));

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
