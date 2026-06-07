import { useAuth } from '../auth/useAuth';
import { FullPageMessage } from '../components/FullPageMessage';
import { Dashboard } from './dashboard/Dashboard';
import { Landing } from './landing/Landing';

// Root route. Logged-out visitors see the pre-signup landing page; signed-in
// users get their role-shaped dashboard.
export function Home() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <FullPageMessage>Loading…</FullPageMessage>;
  }
  if (status === 'authenticated' && user) {
    return <Dashboard />;
  }
  return <Landing />;
}
