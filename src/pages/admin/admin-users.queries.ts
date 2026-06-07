// TanStack Query hooks + mutations for Admin User Management. All server I/O
// goes through the shared api client (CLAUDE.md §2). The list query key is
// scoped by its filters; every mutation invalidates the ['admin','users'] prefix
// so all filtered variants refetch.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { Role, User } from '../../types/api';

// ── List ─────────────────────────────────────────────────────────────────────
export interface UserFilters {
  // undefined = "All" (param omitted).
  role?: Role;
  is_active?: boolean;
}

// GET /api/admin/users?role=&is_active= — omits params when "All".
export function useUsers(filters: UserFilters): UseQueryResult<User[]> {
  return useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: () =>
      api.get<User[]>('/api/admin/users', {
        role: filters.role,
        is_active: filters.is_active,
      }),
  });
}

// Shared invalidation: refetch every cached variant of the user list.
function useInvalidateUsers(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
}

// ── Create (admin-created coach/committee accounts) ──────────────────────────
export interface CreateUserInput {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: Extract<Role, 'coach' | 'committee'>;
}

// POST /api/users — membership_type fixed to 'full' for staff accounts.
export function useCreateUser(): UseMutationResult<User, Error, CreateUserInput> {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      api.post<User>('/api/users', { ...input, membership_type: 'full' }),
    onSuccess: () => invalidate(),
  });
}

// ── Change role ──────────────────────────────────────────────────────────────
export interface ChangeRoleInput {
  id: string;
  role: Role;
}

// PUT /api/admin/users/:id/role
export function useChangeRole(): UseMutationResult<User, Error, ChangeRoleInput> {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, role }: ChangeRoleInput) =>
      api.put<User>(`/api/admin/users/${id}/role`, { role }),
    onSuccess: () => invalidate(),
  });
}

// ── Activate / deactivate ────────────────────────────────────────────────────
export interface SetActiveInput {
  id: string;
  is_active: boolean;
}

// POST /api/admin/users/:id/activate | /deactivate (no body).
export function useSetActive(): UseMutationResult<User, Error, SetActiveInput> {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, is_active }: SetActiveInput) =>
      api.post<User>(
        `/api/admin/users/${id}/${is_active ? 'activate' : 'deactivate'}`,
      ),
    onSuccess: () => invalidate(),
  });
}
