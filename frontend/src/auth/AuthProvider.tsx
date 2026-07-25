import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { authApi, getToken, setToken } from '../lib/api';
import type { LoginPayload, RegisterPayload, User } from '../types/api';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(
    getToken() ? 'loading' : 'unauthenticated',
  );

  // On boot, if a token is present, hydrate the current user from /auth/me.
  // A failure (e.g. expired token) leaves us unauthenticated; the api client
  // has already cleared the token on 401.
  useEffect(() => {
    if (!getToken()) {
      setStatus('unauthenticated');
      return;
    }
    let active = true;
    authApi
      .me()
      .then((me) => {
        if (!active) return;
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus('unauthenticated');
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const { token, user: me } = await authApi.login(payload);
    setToken(token);
    setUser(me);
    setStatus('authenticated');
    return me;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const { token, user: me } = await authApi.register(payload);
    setToken(token);
    setUser(me);
    setStatus('authenticated');
    return me;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setStatus('unauthenticated');
    // Shared-kiosk safety: drop the previous user's cached server data.
    queryClient.clear();
  }, [queryClient]);

  const updateUser = useCallback((next: User) => setUser(next), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, updateUser }),
    [user, status, login, register, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
