import { useAuth } from '../../auth/useAuth';
import { DashboardAnnouncementBanner } from '../announcements/DashboardAnnouncementBanner';
import { DashboardLeagueStrip } from '../league/DashboardLeagueStrip';
import { AdminDashboard } from '../admin/AdminDashboard';
import { PlayerDashboard } from '../player/PlayerDashboard';
import { CoachDashboard } from '../coach/CoachDashboard';
import { CommitteeDashboard } from '../committee/CommitteeDashboard';
import { ParentDashboard } from '../parent/ParentDashboard';
import { Dashboard } from './Dashboard';

function RoleDashboardBody() {
  const { user } = useAuth();
  if (!user) return null;

  if (user.role === 'admin') return <AdminDashboard />;
  if (user.role === 'player') return <PlayerDashboard />;
  if (user.role === 'coach') return <CoachDashboard />;
  if (user.role === 'committee') return <CommitteeDashboard />;
  if (user.role === 'parent') return <ParentDashboard />;
  return <Dashboard />;
}

// Routes /dashboard to the right role-specific page. Each role's dashboard is
// added in RoleDashboardBody as it's built; the announcement banner is shared
// across every role and pinned to the top.
export function RoleDashboard() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <>
      <DashboardAnnouncementBanner />
      {/* Compact Junior League widget — announcement-bar weight, sits right
          under it. Shows Karen's position + next fixture, or a score-focused
          card when a match is live. Full table lives on /league. Self-hides
          when there's no current league (owns its own bottom margin). */}
      <DashboardLeagueStrip />
      <RoleDashboardBody />
    </>
  );
}
