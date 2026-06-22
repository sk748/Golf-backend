import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { AuditEntry } from '../../types/api';

// GET /api/admin/audit-log?limit=&category= — newest-first. The api client
// unwraps the {data} envelope to the array; we paginate by growing `limit`.
export function useAuditLog(
  limit: number,
  category?: string,
): UseQueryResult<AuditEntry[]> {
  return useQuery({
    queryKey: ['admin', 'audit-log', 'page', { limit, category: category || null }],
    queryFn: () =>
      api.get<AuditEntry[]>('/api/admin/audit-log', {
        limit,
        category: category || undefined,
      }),
  });
}
