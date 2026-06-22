import { Link } from 'react-router-dom';
import {
  ClipboardCheck,
  Flag,
  GraduationCap,
  Layers,
  Loader2,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { StatCard } from '../../components/ui/StatCard';
import { FeatureCard } from '../../components/ui/FeatureCard';
import type { Role } from '../../types/api';
import { AnnouncementsWidget } from '../announcements/AnnouncementsWidget';
import { useAdminStats, useRecentActivity } from './admin-dashboard.queries';

// Normalize any thrown value into a user-facing message.
function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// Compact stat for a FeatureCard: a quiet placeholder while loading, an em dash
// on error, otherwise the value.
function statValue(
  loading: boolean,
  error: boolean,
  value: number | string,
): string | number {
  if (loading) return '·';
  if (error) return '—';
  return value;
}

function ErrorPanel({ message, testId }: { message: string; testId?: string }) {
  return (
    <div
      className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
      role="alert"
      data-testid={testId}
    >
      {message}
    </div>
  );
}

// Small inline relative-time formatter (interim feed; no date lib pulled in).
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Icon by audit category, with a sensible fallback for any new categories.
const ACTIVITY_ICON: Record<string, LucideIcon> = {
  user: UserPlus,
  tournament: Trophy,
  evaluation: ClipboardCheck,
  junior: GraduationCap,
  round: Flag,
};

function iconFor(category: string): LucideIcon {
  return ACTIVITY_ICON[category] ?? Layers;
}

// Role breakdown rows for section B, in display order.
const ROLE_ROWS: { role: Role; label: string; key: 'admins' | 'coaches' | 'committee' | 'parents' | 'players' }[] = [
  { role: 'admin', label: 'Admins', key: 'admins' },
  { role: 'coach', label: 'Coaches', key: 'coaches' },
  { role: 'committee', label: 'Junior Golf Committee', key: 'committee' },
  { role: 'parent', label: 'Parents', key: 'parents' },
  { role: 'player', label: 'Players', key: 'players' },
];

export function AdminDashboard() {
  const stats = useAdminStats();
  const activity = useRecentActivity();

  return (
    <div className="mx-auto max-w-6xl">
      <p className="animate-fade-in-up text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Club administration
      </p>
      <h1 className="animate-fade-in-up stagger-1 mt-1 text-2xl font-black text-silver sm:text-3xl">
        Overview
      </h1>
      <p className="animate-fade-in-up stagger-1 mt-2 max-w-2xl text-sm text-slate">
        Club-wide activity at a glance.
      </p>

      {/* ── A) Navigation hub: primary counters that navigate ──────────── */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <FeatureCard
          label="Users"
          icon={Users}
          stat={statValue(stats.isLoading, stats.isError, stats.data?.users.total ?? 0)}
          headline="manage accounts & roles"
          to="/users"
          testId="feature-users"
        />
        <FeatureCard
          label="Juniors"
          icon={GraduationCap}
          tone="azure"
          stat={statValue(stats.isLoading, stats.isError, stats.data?.juniors ?? 0)}
          headline="in the development programme"
          to="/juniors"
          testId="feature-juniors"
        />
        <FeatureCard
          label="Tournaments"
          icon={Trophy}
          stat={statValue(stats.isLoading, stats.isError, stats.data?.tournaments.active ?? 0)}
          headline="active events"
          to="/tournaments"
          testId="feature-tournaments"
        />
        <FeatureCard
          label="Evaluations"
          icon={ClipboardCheck}
          tone={(stats.data?.evaluations.unsigned ?? 0) > 0 ? 'gold' : 'default'}
          stat={statValue(stats.isLoading, stats.isError, stats.data?.evaluations.unsigned ?? 0)}
          headline="awaiting sign-off"
          to="/evaluations"
          testId="feature-evaluations"
        />
      </div>

      {stats.isError ? (
        <div className="mt-6">
          <ErrorPanel
            message={errorMessage(stats.error, 'Could not load club stats.')}
            testId="stats-error"
          />
        </div>
      ) : stats.isLoading ? (
        <div
          className="mt-6 flex items-center gap-2 text-sm text-slate"
          data-testid="stats-loading"
        >
          <Loader2 size={18} className="animate-spin text-azure" />
          Loading club stats…
        </div>
      ) : stats.data ? (
        <>
          {/* ── B) Users by role ────────────────────────────────────────── */}
          <GlassCard className="animate-fade-in-up stagger-2 mt-6 p-5">
            <h2 className="text-sm font-bold text-silver">Users by role</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {ROLE_ROWS.map(({ role, label, key }) => (
                <div
                  key={role}
                  className="glass-light rounded-xl p-3"
                  data-testid={`role-count-${role}`}
                >
                  <p className="text-xl font-black text-silver">
                    {stats.data.users[key]}
                  </p>
                  <p className="mt-1 text-xs text-slate">{label}</p>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* ── C) Secondary stats ──────────────────────────────────────── */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              icon={Flag}
              value={stats.data.rounds}
              label="Rounds logged"
              className="animate-fade-in-up stagger-1"
              testId="stat-rounds"
            />
            <StatCard
              icon={GraduationCap}
              value={stats.data.sessions}
              label="Sessions"
              className="animate-fade-in-up stagger-2"
              testId="stat-sessions"
            />
            <StatCard
              icon={Layers}
              value={stats.data.classes}
              label="Classes"
              className="animate-fade-in-up stagger-3"
              testId="stat-classes"
            />
            <StatCard
              icon={Trophy}
              value={stats.data.tournaments.total}
              label="Total tournaments"
              className="animate-fade-in-up stagger-4"
              testId="stat-total-tournaments"
            />
          </div>
        </>
      ) : null}

      {/* ── D) Recent activity + E) Quick actions & announcements ──────── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <GlassCard className="animate-fade-in-up stagger-2 p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-silver">Recent activity</h2>
            <Link
              to="/audit-log"
              className="text-xs font-medium text-azure hover:underline"
              data-testid="activity-view-all"
            >
              View all
            </Link>
          </div>
          <p className="mt-1 text-xs text-slate">
            The latest actions across the club.
          </p>

          <div className="mt-4">
            {activity.isLoading ? (
              <div
                className="flex items-center gap-2 text-sm text-slate"
                data-testid="activity-loading"
              >
                <Loader2 size={18} className="animate-spin text-azure" />
                Loading recent activity…
              </div>
            ) : activity.isError ? (
              <ErrorPanel
                message={errorMessage(
                  activity.error,
                  'Could not load recent activity.',
                )}
                testId="activity-error"
              />
            ) : activity.items.length === 0 ? (
              <p className="text-sm text-slate" data-testid="activity-empty">
                No recent activity yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-3" data-testid="activity-list">
                {activity.items.map((item) => {
                  const Icon = iconFor(item.category);
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3"
                      data-testid={`activity-item-${item.id}`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-azure/15">
                        <Icon size={16} className="text-azure" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-silver">
                        {item.description}
                      </span>
                      <span className="shrink-0 text-xs text-slate">
                        {relativeTime(item.at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </GlassCard>

        {/* Right column: quick actions stacked over announcements — no gap. */}
        <div className="flex flex-col gap-4 lg:col-span-1">
          <GlassCard className="animate-fade-in-up stagger-1 p-5">
            <h2 className="text-sm font-bold text-silver">Quick actions</h2>
            <div className="mt-4 flex flex-col gap-3">
              <Link to="/users" data-testid="action-manage-users">
                <Button variant="secondary" fullWidth>
                  <Users size={18} />
                  Manage users
                </Button>
              </Link>
              <Link to="/courses" data-testid="action-courses">
                <Button variant="ghost" fullWidth>
                  <Flag size={18} />
                  Course reference
                </Button>
              </Link>
            </div>
            <p className="mt-3 text-xs text-slate">
              Create coach / committee accounts from the Users page.
            </p>
          </GlassCard>

          <AnnouncementsWidget className="animate-fade-in-up stagger-3 h-full p-5" />
        </div>
      </div>
    </div>
  );
}
