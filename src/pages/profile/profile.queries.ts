import { useMutation } from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { User } from '../../types/api';

// Self-service profile fields a user may change (PUT /api/auth/profile — the
// backend allowlists exactly these and strips anything privileged).
export interface ProfileUpdate {
  first_name: string;
  last_name: string;
  phone: string | null;
}

// Auth routes return the payload at the top level (no { data } envelope), like
// /auth/me — so request raw and hand the updated user back to the caller, which
// syncs it into the auth context.
export function useUpdateProfile() {
  return useMutation({
    mutationFn: (body: ProfileUpdate) =>
      api.put<User>('/api/auth/profile', body, { raw: true }),
  });
}
