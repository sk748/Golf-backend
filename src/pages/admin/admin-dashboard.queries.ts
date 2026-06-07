// TanStack Query hooks for the Admin Dashboard. All server reads go through the
// shared api client; query keys mirror the resource. The "recent activity" feed
// is an INTERIM client-side merge of the users + tournaments lists until a real
// audit log endpoint exists.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { AdminStats, TournamentSummary, User } from '../../types/api';

// GET /api/admin/stats — club-wide counters for the hero + secondary cards.
export function useAdminStats(): UseQueryResult<AdminStats> {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => api.get<AdminStats>('/api/admin/stats'),
  });
}

// GET /api/admin/users — full user list (also feeds the activity merge).
export function useAdminUsers(): UseQueryResult<User[]> {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<User[]>('/api/admin/users'),
  });
}

// GET /api/tournaments — summaries (also feeds the activity merge).
export function useTournaments(): UseQueryResult<TournamentSummary[]> {
  return useQuery({
    queryKey: ['tournaments'],
    queryFn: () => api.get<TournamentSummary[]>('/api/tournaments'),
  });
}

// ── Recent activity (interim) ────────────────────────────────────────────────
export interface ActivityItem {
  id: string;
  kind: 'user' | 'tournament';
  description: string;
  at: string; // ISO created_at
}

const ACTIVITY_LIMIT = 8;

// Merge users + tournaments into a unified, time-sorted feed. Exported so the
// merge logic is testable and the component stays declarative.
export function mergeActivity(
  users: User[],
  tournaments: TournamentSummary[],
): ActivityItem[] {
  const userItems: ActivityItem[] = users.map((u) => ({
    id: `user-${u.id}`,
    kind: 'user',
    description: `New ${u.role} account: ${u.full_name || u.email}`,
    at: u.created_at,
  }));

  const tournamentItems: ActivityItem[] = tournaments.map((t) => ({
    id: `tournament-${t.id}`,
    kind: 'tournament',
    description: `Tournament created: ${t.name}`,
    at: t.created_at,
  }));

  return [...userItems, ...tournamentItems]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, ACTIVITY_LIMIT);
}

export interface RecentActivityResult {
  items: ActivityItem[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

// Composes the two list queries into the merged feed, exposing a single set of
// loading/error flags for the activity card.
export function useRecentActivity(): RecentActivityResult {
  const usersQuery = useAdminUsers();
  const tournamentsQuery = useTournaments();

  const items =
    usersQuery.data && tournamentsQuery.data
      ? mergeActivity(usersQuery.data, tournamentsQuery.data)
      : [];

  return {
    items,
    isLoading: usersQuery.isLoading || tournamentsQuery.isLoading,
    isError: usersQuery.isError || tournamentsQuery.isError,
    error: usersQuery.error ?? tournamentsQuery.error,
  };
}
