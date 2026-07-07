// TanStack Query hooks + admin mutations for Level Benchmark targets.
// All server I/O goes through the shared api client (CLAUDE.md §2).
// The backend owns all benchmark math — this file is read/write only.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { LevelBenchmark } from '../../types/api';

// Root cache key.  All mutations invalidate this prefix so derived selectors
// (useBenchmarkForLevel) also receive fresh data.
const QK = ['level-benchmarks'] as const;

// ── Queries ──────────────────────────────────────────────────────────────────

// GET /api/level-benchmarks → LevelBenchmark[]
export function useLevelBenchmarks(): UseQueryResult<LevelBenchmark[]> {
  return useQuery({
    queryKey: QK,
    queryFn: () => api.get<LevelBenchmark[]>('/api/level-benchmarks'),
  });
}

// Derived: returns the single benchmark row for a specific level, or undefined
// if no benchmark exists (not all levels have one).
export function useBenchmarkForLevel(
  level: number | undefined,
): LevelBenchmark | undefined {
  // Re-use the already-cached list; no extra network round-trip.
  const { data } = useLevelBenchmarks();
  if (!data || level === undefined) return undefined;
  return data.find((b) => b.level_number === level);
}

// ── Shared invalidation ───────────────────────────────────────────────────────

function useInvalidateBenchmarks(): () => Promise<void> {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: QK });
}

// ── Mutations (admin only) ────────────────────────────────────────────────────

export interface CreateBenchmarkInput {
  level_number: number;
  full_swing_target: number;
  around_green_target: number;
  putting_target: number;
  nine_hole_target: number;
}

// POST /api/level-benchmarks
export function useCreateBenchmark(): UseMutationResult<
  LevelBenchmark,
  Error,
  CreateBenchmarkInput
> {
  const invalidate = useInvalidateBenchmarks();
  return useMutation({
    mutationFn: (input: CreateBenchmarkInput) =>
      api.post<LevelBenchmark>('/api/level-benchmarks', input),
    onSuccess: () => invalidate(),
  });
}

export interface UpdateBenchmarkInput {
  id: number;
  level_number?: number;
  full_swing_target?: number;
  around_green_target?: number;
  putting_target?: number;
  nine_hole_target?: number;
}

// PUT /api/level-benchmarks/:id
export function useUpdateBenchmark(): UseMutationResult<
  LevelBenchmark,
  Error,
  UpdateBenchmarkInput
> {
  const invalidate = useInvalidateBenchmarks();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateBenchmarkInput) =>
      api.put<LevelBenchmark>(`/api/level-benchmarks/${id}`, body),
    onSuccess: () => invalidate(),
  });
}

// DELETE /api/level-benchmarks/:id
export function useDeleteBenchmark(): UseMutationResult<void, Error, number> {
  const invalidate = useInvalidateBenchmarks();
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/api/level-benchmarks/${id}`),
    onSuccess: () => invalidate(),
  });
}
