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
