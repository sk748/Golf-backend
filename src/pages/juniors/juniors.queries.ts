// TanStack Query hooks for the STAFF junior browser + profile pages (admin,
// coach, committee — build-phase-2 decisions 9+10). All server I/O goes through
// the shared api client (CLAUDE.md §2); query keys mirror the resource. No
// WHS/handicap math here — these hooks fetch + type backend values only.
//
// The junior rows themselves come from the shared useAllJuniors hook
// (['juniors','all'], src/pages/admin/coach-assignment.queries.ts) — this file
// adds the per-junior reads (progress, handicap history, attendance) and the
// staff full-profile edit mutation.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { Round } from '../../types/api';
import type { AssignableJunior } from '../admin/coach-assignment.queries';
import {
  CHILD_AVAILABILITY_OPTIONS,
  CHILD_EXPERIENCE_OPTIONS,
  type JuniorApprovalStatus,
} from '../parent/parent-children.queries';

// ── Signup-chain approval (build-phase-2 decisions 5+7) ──────────────────────
// PUT /api/juniors/:id/approve (no body) advances one step:
//   pending_parent --linked parent--> pending_staff --admin/committee--> active
// Wrong role/step → 403, already active → 409 (backend message surfaces via
// ApiError). Shared hook: the parent approval queue AND the staff browser both
// import from here. Invalidates every juniors variant (['juniors'] prefix
// covers ['juniors','mine'] and ['juniors','all']).
export function useApproveJunior(): UseMutationResult<
  AssignableJunior,
  Error,
  number
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (juniorId: number) =>
      api.put<AssignableJunior>(`/api/juniors/${juniorId}/approve`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['juniors'] });
    },
  });
}

// Staff-facing badge copy/tone for a junior's approval state. Active rows show
// nothing (null label) — only in-flight signups get a badge.
export function approvalStatusLabel(
  status: JuniorApprovalStatus | undefined,
): string | null {
  if (status === 'pending_parent') return 'Awaiting parent';
  if (status === 'pending_staff') return 'Awaiting club';
  return null;
}

export function approvalStatusTone(
  status: JuniorApprovalStatus | undefined,
): 'gold' | 'azure' {
  return status === 'pending_parent' ? 'gold' : 'azure';
}

// ── Progress (staff read of /api/juniors/:id/progress) ───────────────────────
// Mirrors the response shape typed for the parent page (ChildProgress in
// parent-children.queries.ts) — same endpoint, staff-allowed.
export interface StaffJuniorEvaluation {
  report_month: string;
  current_level: number;
  assessment: string;
  recommendation: string;
  avg_score_9: number | null;
  avg_score_18: number | null;
  best_gross_score: number | null;
}

export interface StaffJuniorProgress {
  junior_id: number;
  current_level: number;
  level_changes: { report_month: string; current_level: number }[];
  evaluations: StaffJuniorEvaluation[];
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
}

export function useJuniorProgressStaff(
  juniorId?: number,
): UseQueryResult<StaffJuniorProgress> {
  return useQuery({
    queryKey: ['junior', juniorId, 'progress'],
    queryFn: () =>
      api.get<StaffJuniorProgress>(`/api/juniors/${juniorId}/progress`),
    enabled: Boolean(juniorId),
  });
}

// ── Handicap history ──────────────────────────────────────────────────────────
// GET /api/users/:user_id/handicap-history -> Round[] (standard envelope).
// Staff may read any user's history. The key matches the shape already used by
// the player pages (player-games.queries.ts) so the cache is shared.
export function useJuniorHandicapHistory(
  userId?: string,
): UseQueryResult<Round[]> {
  return useQuery({
    queryKey: ['users', userId, 'handicap-history'],
    queryFn: () => api.get<Round[]>(`/api/users/${userId}/handicap-history`),
    enabled: Boolean(userId),
  });
}

// ── Attendance for one junior ─────────────────────────────────────────────────
// GET /api/attendance?junior_id= (admin/coach/committee). The backend
// serializes the Attendance table columns only — no session date is embedded,
// so the row's created_at (when the record was marked) is the date we can show.
export type JuniorAttendanceStatus = 'present' | 'absent' | 'excused';

export interface JuniorAttendanceRecord {
  id: number;
  session_id: number;
  junior_id: number;
  status: JuniorAttendanceStatus;
  created_at: string;
  updated_at: string;
}

export function useJuniorAttendance(
  juniorId?: number,
): UseQueryResult<JuniorAttendanceRecord[]> {
  return useQuery({
    queryKey: ['attendance', { juniorId }],
    queryFn: () =>
      api.get<JuniorAttendanceRecord[]>('/api/attendance', {
        junior_id: juniorId,
      }),
    enabled: Boolean(juniorId),
  });
}

// ── Staff full-profile edit ───────────────────────────────────────────────────
// PUT /api/juniors/:id — admin/coach/committee may edit the full intake field
// set (parents are restricted backend-side; staff are not). band_id is NEVER
// sent: the backend recomputes the band from current_level. Validation errors
// surface as a 400 with the backend's message (ValueError → VALIDATION_ERROR).
export interface UpdateJuniorStaffFields {
  date_of_birth?: string;
  gender?: string; // 'male' | 'female'
  current_level?: number; // 1–9; band recomputes server-side
  curriculum?: string | null;
  has_handicap?: boolean;
  handicap_index?: number | null;
  played_us_kids?: boolean | null;
  us_kids_best_score?: number | null;
  experience?: string;
  availability?: string;
  medical_conditions?: string | null;
  golf_goals?: string | null;
  tournament_ready?: boolean;
  // Staff-editable only (parents get 403 on PUT /api/juniors/:id for this field).
  participant_type?: string;
}

export interface UpdateJuniorStaffInput extends UpdateJuniorStaffFields {
  juniorId: number;
}

export function useUpdateJuniorStaff(): UseMutationResult<
  AssignableJunior,
  Error,
  UpdateJuniorStaffInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ juniorId, ...fields }: UpdateJuniorStaffInput) =>
      api.put<AssignableJunior>(`/api/juniors/${juniorId}`, fields),
    onSuccess: () => {
      // Browser table + any roster variant, and the per-junior reads.
      void queryClient.invalidateQueries({ queryKey: ['juniors'] });
      void queryClient.invalidateQueries({ queryKey: ['junior'] });
    },
  });
}

// ── Staff junior creation ─────────────────────────────────────────────────────
// POST /api/juniors — staff (admin/coach/committee) create a junior account
// directly. Returns the created AssignableJunior row (standard {data} envelope).
// Invalidates the shared ['juniors'] prefix so the browser table reloads.
export interface CreateJuniorStaffInput {
  email: string;
  password: string;
  first_name: string;
  last_name?: string;
  date_of_birth: string; // ISO YYYY-MM-DD
  gender: string; // 'male' | 'female'
  participant_type?: string; // default 'registered_junior'
}

export function useCreateJuniorStaff(): UseMutationResult<
  AssignableJunior,
  Error,
  CreateJuniorStaffInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJuniorStaffInput) =>
      api.post<AssignableJunior>('/api/juniors', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['juniors'] });
    },
  });
}

// ── Display helpers (labels only — no domain math) ───────────────────────────
// Enum option lists are shared with the parent edit card; these map a stored
// enum value to its friendly label, falling back to the raw value.
export function experienceLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return (
    CHILD_EXPERIENCE_OPTIONS.find((o) => o.value === value)?.label ?? value
  );
}

export function availabilityLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return (
    CHILD_AVAILABILITY_OPTIONS.find((o) => o.value === value)?.label ?? value
  );
}

export function genderLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Whole-year age from an ISO date of birth (display only).
export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday =
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}
