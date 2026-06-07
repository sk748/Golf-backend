import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { FullPageMessage } from '../components/FullPageMessage';
import { useAuth } from './useAuth';

// Wraps /login and /register: an already-authenticated user is sent to their
// dashboard instead of seeing the auth forms again.
export function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') {
    return <FullPageMessage>Loading…</FullPageMessage>;
  }
  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
