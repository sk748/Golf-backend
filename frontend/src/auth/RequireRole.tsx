import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import type { Role } from '../types/api';
import { FullPageMessage } from '../components/FullPageMessage';
import { useAuth } from './useAuth';

interface RequireRoleProps {
  // Omit to allow any authenticated user; pass a list to restrict.
  roles?: Role[];
  children: ReactNode;
}

// Route guard. Unauthenticated users go to /login; authenticated users who
// deep-link outside their role are redirected to their own dashboard (/),
// never shown an error they can't act on (CLAUDE.md §"Roles").
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <FullPageMessage>Loading…</FullPageMessage>;
  }

  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
