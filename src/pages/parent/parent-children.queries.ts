// TanStack Query hooks for the PARENT role's view of their own child/children.
// All reads go through the shared api client (CLAUDE.md §2); query keys mirror
// the resource path. The backend scopes every read to the signed-in parent
// (parent_id = current user) — we never request other families' data.
//
// No WHS/handicap math here. These hooks only fetch + type data. Handicap is
// conditional (not every child has one) — gate display on the value, never a
// placeholder number.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { User } from '../../types/api';

// Signup-chain approval state (build-phase-2 decisions 5+7). Every junior row
// carries it: pending_parent (child self-registered, parent must consent) →
// pending_staff (awaiting club activation) → active.
export type JuniorApprovalStatus = 'pending_parent' | 'pending_staff' | 'active';

// ── Child profile ────────────────────────────────────────────────────────────
// GET /api/juniors -> the parent's own child/children. The documented
// JuniorProfile shape (src/types/api.ts) carries ids + level/band but no name.
// The backend may embed the child's user details; we read them defensively and
// fall back to a friendly label when absent (display-only — not fabricated).
export interface ParentChild {
  id: number;
  user_id: string;
  parent_id: string | null;
  date_of_birth: string;
  gender: string;
  current_level: number;
  band_id: number;
  curriculum: string | null;
  has_handicap: boolean;
  handicap_index: number | null;
  tournament_ready: boolean;
  experience: string;
  availability: string;
  medical_conditions?: string | null;
  golf_goals?: string | null;
  // Signup chain: pending_parent → pending_staff → active.
  approval_status: JuniorApprovalStatus;
  created_at: string;
  updated_at: string;
  // Optional, defensively read — the backend may embed the child's identity.
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  user?: {
    id?: string;
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
}

// Best display name for a child, with a warm fallback when no name is exposed.
export function childName(child: ParentChild | undefined): string {
  if (!child) return 'Your child';
  const direct =
    child.full_name?.trim() ||
    [child.first_name, child.last_name].filter(Boolean).join(' ').trim();
  if (direct) return direct;
  const nested =
    child.user?.full_name?.trim() ||
    [child.user?.first_name, child.user?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();
  if (nested) return nested;
  return 'Your child';
}

// GET /api/juniors — scoped by the backend to this parent's children.
export function useMyChildren(): UseQueryResult<ParentChild[]> {
  return useQuery({
    queryKey: ['juniors', 'mine'],
    queryFn: () => api.get<ParentChild[]>('/api/juniors'),
  });
}

// ── Create a child account (parent-initiated signup) ─────────────────────────
// POST /api/parents/me/children — a parent creates their child's player login
// + junior profile in one go. Parent consent is implicit, so the junior starts
// at pending_staff (club activates). STANDARD {data} envelope + structured
// {error:{code,message}} errors (NOT the auth shape) — ApiError.message just
// works. Returns the created child User; the parent stays signed in.
export interface CreateChildInput {
  email: string;
  password: string;
  first_name: string;
  last_name?: string;
  date_of_birth: string; // ISO YYYY-MM-DD — required by the backend
  gender: string; // 'male' | 'female'
  phone?: string;
  // NOTE: participant_type is intentionally NOT here — it's a staff-only
  // programme classification (registered_junior / club_beginner / karen_academy)
  // with downstream reporting/billing meaning. New children default to
  // registered_junior; staff re-classify via PUT /api/juniors/:id.
}

export function useCreateChildAccount(): UseMutationResult<
  User,
  Error,
  CreateChildInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChildInput) =>
      api.post<User>('/api/parents/me/children', input),
    onSuccess: () => {
      // Broad prefix: the new pending_staff child must also reach the staff
      // browser's approval queue cache (['juniors','all']), not just 'mine'.
      void queryClient.invalidateQueries({ queryKey: ['juniors'] });
    },
  });
}

// ── Parent-editable child details ─────────────────────────────────────────────
// PUT /api/juniors/:id — a parent may send ONLY these four family-owned fields
// (availability, experience, medical_conditions, golf_goals); anything else is
// a backend 403. Enums match the backend exactly. Invalidates the parent's
// children query (['juniors', 'mine']) so the page re-reads the saved values.

export const CHILD_AVAILABILITY_OPTIONS = [
  { value: 'twice_weekly', label: 'Twice a week' },
  { value: 'weekends_only', label: 'Weekends only' },
  { value: 'more_than_twice', label: 'More than twice a week' },
  { value: 'holidays_only', label: 'School holidays only' },
] as const;

export const CHILD_EXPERIENCE_OPTIONS = [
  { value: 'beginner', label: 'New to golf' },
  { value: 'lt_1yr', label: 'Less than a year' },
  { value: '1_3yr', label: '1–3 years' },
  { value: '4_6yr', label: '4–6 years' },
  { value: '7_10yr', label: '7–10 years' },
] as const;

export interface UpdateChildDetailsInput {
  juniorId: number;
  availability: string;
  experience: string;
  medical_conditions: string | null;
  golf_goals: string | null;
}

export function useUpdateChildDetails(): UseMutationResult<
  ParentChild,
  Error,
  UpdateChildDetailsInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ juniorId, ...fields }: UpdateChildDetailsInput) =>
      api.put<ParentChild>(`/api/juniors/${juniorId}`, fields),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['juniors', 'mine'] });
    },
  });
}

// ── Progress (handicap, band, attendance, embedded evaluations) ───────────────
// GET /api/juniors/:id/progress. Parents read evaluation info from HERE — they
// do NOT have access to /api/evaluations. Disabled until a child id is known.
export interface ChildEvaluation {
  report_month: string;
  current_level: number;
  assessment: string;
  recommendation: string;
  avg_score_9: number | null;
  avg_score_18: number | null;
  best_gross_score: number | null;
}

export interface ChildProgress {
  junior_id: number;
  current_level: number;
  level_changes: { report_month: string; current_level: number }[];
  evaluations: ChildEvaluation[];
  attendance: {
    present: number;
    absent: number;
    excused: number;
    total: number;
  };
  benchmarks: {
    id: number;
    level_number: number;
    full_swing_target: number;
    around_green_target: number;
    putting_target: number;
    nine_hole_target: number;
  }[];
  // Earned recognitions (catalog achievement titles/icons resolved on the FE
  // from the key). Present so a parent sees their child's celebrations too.
  achievements?: { key: string; unlocked_at: string | null }[];
  badges?: {
    badge_id: number;
    name: string | null;
    description: string | null;
    awarded_date: string | null;
  }[];
}

export function useChildProgress(
  juniorId?: number,
): UseQueryResult<ChildProgress> {
  return useQuery({
    queryKey: ['juniors', juniorId, 'progress'],
    queryFn: () => api.get<ChildProgress>(`/api/juniors/${juniorId}/progress`),
    enabled: Boolean(juniorId),
  });
}

// ── Monthly report ────────────────────────────────────────────────────────────
// GET /api/juniors/:id/monthly-report?month=YYYY-MM-01. The exact body shape
// isn't locked in src/types/api.ts; treat it as a loose record for read-only
// display (we render known keys defensively and never recompute anything).
export type ChildMonthlyReport = Record<string, unknown>;

export function useChildMonthlyReport(
  juniorId: number | undefined,
  month: string | undefined,
): UseQueryResult<ChildMonthlyReport> {
  return useQuery({
    queryKey: ['juniors', juniorId, 'monthly-report', month],
    queryFn: () =>
      api.get<ChildMonthlyReport>(`/api/juniors/${juniorId}/monthly-report`, {
        month,
      }),
    enabled: Boolean(juniorId) && Boolean(month),
  });
}

// ── Level bands (reference) ───────────────────────────────────────────────────
// GET /api/level-bands — name/label, min/max level, min_sessions, description.
export interface ParentLevelBand {
  id: number;
  name: string;
  band_label: string;
  min_level: number;
  max_level: number;
  min_sessions: number;
  report_template: string;
  description: string;
}

export function useLevelBands(): UseQueryResult<ParentLevelBand[]> {
  return useQuery({
    queryKey: ['level-bands'],
    queryFn: () => api.get<ParentLevelBand[]>('/api/level-bands'),
    staleTime: 5 * 60 * 1000,
  });
}

// Find the band whose [min_level, max_level] window contains a level.
export function bandForLevel(
  bands: ParentLevelBand[] | undefined,
  level: number,
): ParentLevelBand | undefined {
  return bands?.find((b) => level >= b.min_level && level <= b.max_level);
}
