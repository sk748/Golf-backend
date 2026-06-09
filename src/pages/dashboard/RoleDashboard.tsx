import { useAuth } from '../../auth/useAuth';
import { AdminDashboard } from '../admin/AdminDashboard';
import { PlayerDashboard } from '../player/PlayerDashboard';
import { CoachDashboard } from '../coach/CoachDashboard';
import { CommitteeDashboard } from '../committee/CommitteeDashboard';
import { ParentDashboard } from '../parent/ParentDashboard';
import { Dashboard } from './Dashboard';

// Routes /dashboard to the right role-specific page. Each role's dashboard is
// added here as it's built; others fall back to the shared placeholder.
export function RoleDashboard() {
  const { user } = useAuth();
  if (!user) return null;

  if (user.role === 'admin') return <AdminDashboard />;
  if (user.role === 'player') return <PlayerDashboard />;
  if (user.role === 'coach') return <CoachDashboard />;
  if (user.role === 'committee') return <CommitteeDashboard />;
  if (user.role === 'parent') return <ParentDashboard />;
  return <Dashboard />;
}
