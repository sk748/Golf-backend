import { Navigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { FullPageMessage } from '../components/FullPageMessage';
import { Landing } from './landing/Landing';

// Root route. Logged-out visitors see the pre-signup landing page; signed-in
// users are sent into the app shell at /dashboard.
export function Home() {
  const { status } = useAuth();

  if (status === 'loading') {
    return <FullPageMessage>Loading…</FullPageMessage>;
  }
  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }
  return <Landing />;
}
