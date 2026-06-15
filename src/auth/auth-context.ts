import { createContext } from 'react';
import type { LoginPayload, RegisterPayload, User } from '../types/api';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (payload: LoginPayload) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => void;
  // Sync the in-context user after a self-service profile edit (auth state is
  // held here, not in a TanStack query, so there's no key to invalidate).
  updateUser: (user: User) => void;
}

// Context lives in its own module so AuthProvider.tsx and useAuth.ts can each
// export exactly one thing (keeps react-refresh happy).
export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
