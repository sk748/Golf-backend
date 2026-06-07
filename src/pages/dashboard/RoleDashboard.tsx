import { useAuth } from '../../auth/useAuth';
import { AdminDashboard } from '../admin/AdminDashboard';
import { PlayerDashboard } from '../player/PlayerDashboard';
import { Dashboard } from './Dashboard';

// Routes /dashboard to the right role-specific page. Each role's dashboard is
// added here as it's built; others fall back to the shared placeholder.
export function RoleDashboard() {
  const { user } = useAuth();
  if (!user) return null;

  if (user.role === 'admin') return <AdminDashboard />;
  if (user.role === 'player') return <PlayerDashboard />;
  return <Dashboard />;
}
