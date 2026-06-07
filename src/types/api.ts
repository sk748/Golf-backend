// Shared API response + domain types. These mirror the delivered Flask backend
// exactly, including the auth-envelope exceptions. LOCKED once stable — do not
// loosen to `any` to make a screen compile (see CLAUDE.md).

// ── Roles ────────────────────────────────────────────────────────────────────
export type Role = 'admin' | 'coach' | 'committee' | 'parent' | 'player';

// Roles the public /register endpoint is allowed to create. admin/coach/
// committee are created by an admin (CLAUDE.md §4).
export type RegisterableRole = Extract<Role, 'player' | 'parent'>;

export type MembershipType = 'full' | 'social' | 'guest' | 'junior';

// ── User ─────────────────────────────────────────────────────────────────────
// Serialized by the backend's SimpleModelSchema (enum -> value string,
// Decimal -> number, datetime -> ISO string), excluding password_hash, with
// two computed fields added (full_name, current_hcp_index).
export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: Role;
  membership_type: MembershipType;
  handicap_index: number | null;
  cdh_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Computed by UserSchema:
  full_name: string;
  current_hcp_index: number | null;
}

// ── Auth payloads + responses ────────────────────────────────────────────────
export interface LoginPayload {
  email: string;
  password: string;
}

// Public registration. Optional junior fields auto-create a JuniorProfile when
// a player registers with a date_of_birth (backend register_user).
export interface RegisterPayload {
  email: string;
  password: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  role?: RegisterableRole;
  phone?: string;
  // Junior-profile bootstrap (players only):
  date_of_birth?: string; // ISO YYYY-MM-DD
  gender?: 'male' | 'female';
}

// AUTH EXCEPTION: login + register return { token, user } at the TOP LEVEL
// (no `data` wrapper). /auth/me returns the bare User (also unwrapped).
export interface AuthResponse {
  token: string;
  user: User;
}

// ── Response envelopes ───────────────────────────────────────────────────────
// Most endpoints wrap their payload. The api client unwraps `.data` for these;
// the auth exceptions above are fetched raw.
export interface ApiEnvelope<T> {
  data: T;
}
export interface ApiListEnvelope<T> {
  data: T[];
  count: number;
}

// ── Error shapes ─────────────────────────────────────────────────────────────
// Auth routes return a plain string under `error`; all other routes return a
// structured object. Normalize with: typeof e === 'string' ? e : e?.message.
export interface ApiErrorDetail {
  code?: string;
  message?: string;
  fields?: Record<string, string[]>;
}
export interface ApiErrorBody {
  error: string | ApiErrorDetail;
}

// ── Admin ────────────────────────────────────────────────────────────────────
// GET /api/admin/stats
export interface AdminStats {
  users: {
    total: number;
    players: number;
    coaches: number;
    parents: number;
    admins: number;
    committee: number;
  };
  juniors: number;
  tournaments: { total: number; active: number };
  sessions: number;
  classes: number;
  evaluations: { total: number; unsigned: number };
  rounds: number;
}

// ── Course reference ─────────────────────────────────────────────────────────
// GET /api/courses-with-tees -> CourseWithTees[]
export interface CourseTee {
  id: number;
  color: string;
  name: string;
  gender: string; // "men" | "women"
  course_rating: number;
  slope_rating: number;
  total_yards: number;
}
export interface CourseWithTees {
  id: number;
  name: string;
  par: number;
  altitude_ft: number | null;
  grass_type: string | null;
  tees: CourseTee[];
}
// GET /api/holes?course_id= -> Hole[]
export interface Hole {
  id: number;
  course_id: number;
  hole_number: number;
  par: number;
  stroke_index: number;
  white_yards: number;
  yellow_yards: number;
  blue_yards: number;
  red_yards: number;
}

// ── Player / juniors ─────────────────────────────────────────────────────────
// GET /api/juniors/me
export interface JuniorProfile {
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
  created_at: string;
  updated_at: string;
}

// GET /api/level-bands -> LevelBand[]
export interface LevelBand {
  id: number;
  name: string;
  band_label: string;
  min_level: number;
  max_level: number;
  min_sessions: number;
  report_template: string;
  description: string;
}

// GET /api/level-benchmarks -> LevelBenchmark[]
export interface LevelBenchmark {
  id: number;
  level_number: number;
  full_swing_target: number;
  around_green_target: number;
  putting_target: number;
  nine_hole_target: number;
}

// GET /api/juniors/:id/progress
export interface JuniorProgress {
  junior_id: number;
  current_level: number;
  level_changes: { report_month: string; current_level: number }[];
  evaluations: {
    report_month: string;
    current_level: number;
    assessment: string;
    recommendation: string;
    avg_score_9: number | null;
    avg_score_18: number | null;
    best_gross_score: number | null;
  }[];
  attendance: { present: number; absent: number; excused: number; total: number };
  benchmarks: LevelBenchmark[];
}

// GET /api/juniors/me/feedback -> PlayerFeedback | null (coach identity stripped)
export interface PlayerFeedback {
  report_month: string | null;
  current_level: number;
  assessment: string;
  recommendation: string;
  special_remarks: string | null;
  putting_assessment: string | null;
  chipping_assessment: string | null;
  full_swing_assessment: string | null;
  avg_score_9: number | null;
  avg_score_18: number | null;
  competitions_played: number | null;
  best_gross_score: number | null;
  attendance_count: number;
  attendance_total: number | null;
  fully_signed_off: boolean;
}

// GET /api/rounds, GET /api/users/:id/handicap-history -> Round[]
export interface Round {
  id: number;
  user_id: string;
  course_id: number;
  tee_set_id: number;
  date_played: string;
  round_type: string;
  competition_name: string | null;
  gross_score: number;
  adjusted_gross_score: number | null;
  score_differential: number | null;
  pcc_adjustment: number | null;
  handicap_before: number | null;
  handicap_after: number | null;
  created_at: string;
  updated_at: string;
}

// GET /api/hole-scores?round_id= -> HoleScore[]
export interface HoleScore {
  id: number;
  round_id: number;
  hole_number: number;
  strokes: number;
  putts: number | null;
  fairway_hit: boolean | null;
  gir: boolean | null;
}

// ── Audit log ────────────────────────────────────────────────────────────────
// GET /api/admin/audit-log -> AuditEntry[] (envelope also carries count).
// `description` is a ready-to-display plain-English sentence.
export interface AuditEntry {
  id: number;
  created_at: string;
  actor_user_id: string | null;
  actor_name: string;
  actor_role: string | null;
  category: string; // user | evaluation | tournament | round | junior | ...
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  description: string;
  meta: Record<string, unknown> | null;
  ip_address: string | null;
}

// ── Tournament summary (list shape used by lists) ─────────────────────────────
export interface TournamentSummary {
  id: number;
  name: string;
  status: string;
  format: string;
  start_date: string;
  holes: number;
  created_at: string;
}
