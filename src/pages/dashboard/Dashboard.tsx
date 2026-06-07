import { useNavigate } from 'react-router-dom';
import { Award, LogOut, TrendingDown, UserCircle } from 'lucide-react';

import { useAuth } from '../../auth/useAuth';
import type { Role } from '../../types/api';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, RoleBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';

// Phase 0 placeholder. Each role's real dashboard is built in Phase 1 (and its
// design is reviewed with the product owner first, per WORKING_AGREEMENT). For
// now this just proves a signed-in user is routed to a role-shaped landing.
const ROLE_LANDING: Record<Role, { title: string; blurb: string }> = {
  admin: {
    title: 'Club administration',
    blurb: 'Club-wide stats, user management, and reference data arrive in Phase 1.',
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
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null; // guarded upstream; satisfies the type checker.

  const landing = ROLE_LANDING[user.role];

  function onLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-navy">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-navy/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <img src="/kcc-logo.png" alt="Karen Country Club" className="h-9 w-auto" />
          <div className="flex items-center gap-3">
            <RoleBadge role={user.role} />
            <Avatar name={user.full_name || user.email} />
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              data-testid="sign-out-btn"
            >
              <LogOut size={16} /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
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
          <Badge tone="azure">Phase 0 · role routing live</Badge>
        </div>
      </main>
    </div>
  );
}
