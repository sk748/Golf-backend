import { Award, TrendingDown, UserCircle } from 'lucide-react';

import { useAuth } from '../../auth/useAuth';
import type { Role } from '../../types/api';
import { Badge } from '../../components/ui/Badge';
import { StatCard } from '../../components/ui/StatCard';

// Shared placeholder dashboard content, rendered inside AppShell. Each role's
// real, distinct dashboard is specced with the product owner and built page by
// page; this is the interim landing until a role's page is replaced.
const ROLE_LANDING: Record<Role, { title: string; blurb: string }> = {
  admin: {
    title: 'Club administration',
    blurb: 'Club-wide stats, user management, and reference data arrive next.',
  },
  committee: {
    title: 'Programme oversight',
    blurb: 'Read-across visibility and evaluation counter-signing arrive in Phase 3.',
  },
  coach: {
    title: 'Your juniors',
    blurb: 'Your roster, attendance, evaluations, and weekly schedule arrive in Phases 3–4.',
  },
  parent: {
    title: 'Your child',
    blurb: "Your child's profile, progress, and session requests arrive in Phases 3–4.",
  },
  player: {
    title: 'Your golf',
    blurb: 'Your scores, handicap, and progress against your level arrive in Phase 2.',
  },
};

export function Dashboard() {
  const { user } = useAuth();
  if (!user) return null; // guarded by RequireRole.

  const landing = ROLE_LANDING[user.role];

  return (
    <div className="mx-auto max-w-5xl">
      <p className="animate-fade-in-up text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Welcome back
      </p>
      <h1 className="animate-fade-in-up stagger-1 mt-1 text-2xl font-black text-silver sm:text-3xl">
        {landing.title}
      </h1>
      <p className="animate-fade-in-up stagger-1 mt-2 max-w-2xl text-sm text-slate">
        Signed in as {user.full_name || user.email}. {landing.blurb}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          icon={UserCircle}
          value={<span className="capitalize">{user.role}</span>}
          label="Role"
          className="animate-fade-in-up stagger-1"
          testId="stat-role"
        />
        <StatCard
          icon={Award}
          value={<span className="capitalize">{user.membership_type}</span>}
          label="Membership"
          className="animate-fade-in-up stagger-2"
          testId="stat-membership"
        />
        <StatCard
          icon={TrendingDown}
          value={user.current_hcp_index ?? '—'}
          label="Handicap index"
          className="animate-fade-in-up stagger-3"
          testId="stat-handicap"
        />
      </div>

      <div className="mt-6">
        <Badge tone="azure">Shell live · role-distinct pages coming next</Badge>
      </div>
    </div>
  );
}
