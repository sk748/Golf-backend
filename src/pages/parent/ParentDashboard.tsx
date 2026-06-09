// Parent dashboard — the role-routed landing for a parent following their own
// child's golf journey. Warm, reassuring, never a data terminal. Shows a card
// per child (level/band + handicap snapshot — handicap gated on presence), a
// progress snapshot (attendance vs band minimum + latest evaluation assessment,
// read-only), and a "My session requests" summary with a request CTA.
//
// All server data flows through TanStack Query hooks + the shared api client.
// No mock data, no WHS recomputation, no other families' data.

import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarPlus,
  ClipboardCheck,
  Loader2,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { GlassCard } from '../../components/ui/GlassCard';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../auth/useAuth';
import {
  bandForLevel,
  childName,
  useChildProgress,
  useLevelBands,
  useMyChildren,
  type ParentChild,
  type ParentLevelBand,
} from './parent-children.queries';
import {
  statusLabel,
  statusTone,
  useMyBookingRequests,
  type BookingRequest,
} from './parent-sessions.queries';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function firstName(full?: string | null): string {
  if (!full) return 'there';
  const trimmed = full.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : 'there';
}

// Friendly assessment wording for the latest evaluation (read-only display).
function assessmentLabel(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'exceeding' || v === 'exceeding_expectation')
    return 'Exceeding expectations';
  if (v === 'meeting' || v === 'meeting_expectation') return 'Meeting expectations';
  if (v === 'below' || v === 'below_expectation') return 'Working towards expectations';
  return raw;
}

function assessmentTone(
  raw: string | undefined | null,
): 'emerald' | 'azure' | 'gold' | 'slate' {
  if (!raw) return 'slate';
  const v = raw.trim().toLowerCase();
  if (v.startsWith('exceed')) return 'emerald';
  if (v.startsWith('meet')) return 'azure';
  if (v.startsWith('below')) return 'gold';
  return 'slate';
}

function latestEvaluation(evals: { report_month: string; assessment: string }[] | undefined) {
  if (!evals?.length) return undefined;
  return [...evals].sort((a, b) =>
    (b.report_month ?? '').localeCompare(a.report_month ?? ''),
  )[0];
}

// ── A single child card (its own progress query) ─────────────────────────────

function ChildCard({
  child,
  bands,
  staggerClass,
}: {
  child: ParentChild;
  bands: ParentLevelBand[] | undefined;
  staggerClass?: string;
}) {
  const progress = useChildProgress(child.id);
  const name = childName(child);

  const currentLevel = progress.data?.current_level ?? child.current_level;
  const band = bandForLevel(bands, currentLevel);
  const minSessions = band?.min_sessions ?? 0;
  const present = progress.data?.attendance?.present ?? 0;
  const pct =
    minSessions > 0 ? Math.min(100, Math.round((present / minSessions) * 100)) : 0;
  const sessionsDone = minSessions > 0 && present >= minSessions;

  const latestEval = latestEvaluation(progress.data?.evaluations);
  const assessment = assessmentLabel(latestEval?.assessment);

  const hasHandicap = child.has_handicap && child.handicap_index != null;

  return (
    <GlassCard
      className={cn('animate-fade-in-up p-5 sm:p-6', staggerClass)}
      data-testid={`child-card-${child.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={name} className="h-11 w-11 text-base" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-silver">{name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone="azure" shape="pill">
                Level {currentLevel}
              </Badge>
              {band ? (
                <Badge tone="slate" shape="pill">
                  {band.name}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        <Link
          to="/my-child"
          state={{ childId: child.id }}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-azure transition hover:gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        >
          View
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>

      {/* Handicap snapshot — only when the child actually has one. */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="glass-light rounded-xl p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate">
            Handicap index
          </p>
          {hasHandicap ? (
            <p
              className="mt-1 font-mono text-2xl font-black text-azure"
              data-testid={`child-handicap-${child.id}`}
            >
              {child.handicap_index}
            </p>
          ) : (
            <p className="mt-1 text-sm font-semibold text-slate">
              Not yet established
            </p>
          )}
        </div>
        <div className="glass-light rounded-xl p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate">
            Latest assessment
          </p>
          {progress.isLoading ? (
            <p className="mt-1 text-sm text-slate">Loading…</p>
          ) : assessment ? (
            <div className="mt-1.5">
              <Badge tone={assessmentTone(latestEval?.assessment)}>
                {assessment}
              </Badge>
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate">No report yet</p>
          )}
        </div>
      </div>

      {/* Attendance vs band minimum */}
      <div className="mt-4" data-testid={`child-attendance-${child.id}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate">
            Sessions attended
          </span>
          <span className="font-mono text-sm font-bold">
            <span className={cn(sessionsDone ? 'text-emerald-400' : 'text-azure')}>
              {present}
            </span>
            <span className="text-slate"> / {minSessions || '—'}</span>
          </span>
        </div>
        <div
          className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={present}
          aria-valuemin={0}
          aria-valuemax={minSessions || undefined}
          aria-label={`${present} of ${minSessions} sessions attended`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all',
              sessionsDone ? 'bg-emerald-400' : 'bg-azure',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate">
          {minSessions <= 0
            ? 'Every session helps your child progress.'
            : sessionsDone
              ? 'Session target for this band reached — wonderful!'
              : `${Math.max(0, minSessions - present)} more sessions toward this band's minimum.`}
        </p>
      </div>

      {progress.isError ? (
        <p className="mt-3 text-xs text-red-400" role="alert">
          {errorMessage(progress.error, "Could not load this child's progress.")}
        </p>
      ) : null}
    </GlassCard>
  );
}

// ── Session requests summary ──────────────────────────────────────────────────

function RequestsSummary({
  requests,
  isLoading,
  isError,
  error,
}: {
  requests: BookingRequest[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  const recent = [...requests]
    .sort((a, b) =>
      (b.preferred_date ?? b.created_at ?? '').localeCompare(
        a.preferred_date ?? a.created_at ?? '',
      ),
    )
    .slice(0, 4);

  return (
    <GlassCard className="animate-fade-in-up stagger-3 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-azure/15">
            <CalendarPlus size={16} className="text-azure" aria-hidden />
          </span>
          <h2 className="text-sm font-bold text-silver">My session requests</h2>
        </div>
        <Link to="/sessions">
          <Button variant="primary" size="sm" data-testid="request-session-cta">
            <CalendarPlus size={16} aria-hidden />
            Request a session
          </Button>
        </Link>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate">
            <Loader2 size={16} className="animate-spin text-azure" aria-hidden />
            Loading your requests…
          </div>
        ) : isError ? (
          <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400" role="alert">
            {errorMessage(error, 'Could not load your session requests.')}
          </p>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <Sparkles size={24} className="text-azure/70" aria-hidden />
            <p className="text-sm font-semibold text-silver">
              No coaching sessions requested yet
            </p>
            <p className="max-w-sm text-xs text-slate">
              When you&apos;d like extra one-to-one time with a coach, send a
              request and the club will arrange a time.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5" data-testid="requests-summary-list">
            {recent.map((req) => (
              <li
                key={req.id}
                className="glass-light flex items-center justify-between gap-3 rounded-xl p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-silver">
                    {req.preferred_date ?? 'Date to confirm'}
                    {req.preferred_time ? (
                      <span className="text-slate"> · {req.preferred_time}</span>
                    ) : null}
                  </p>
                </div>
                <Badge tone={statusTone(req.status)} shape="pill">
                  {statusLabel(req.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {recent.length > 0 ? (
        <Link
          to="/sessions"
          className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-azure transition hover:gap-2"
        >
          Manage all requests
          <ArrowRight size={14} aria-hidden />
        </Link>
      ) : null}
    </GlassCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ParentDashboard() {
  const { user } = useAuth();
  const children = useMyChildren();
  const bands = useLevelBands();
  const requests = useMyBookingRequests();

  const kids = children.data ?? [];

  return (
    <div className="animate-fade-in-up mx-auto max-w-4xl" data-testid="parent-dashboard">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">
        Your family
      </p>
      <h1 className="mt-1 text-2xl font-black text-silver sm:text-3xl">
        Hi {firstName(user?.full_name)} — following along
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        Here&apos;s how your {kids.length > 1 ? 'children are' : 'child is'} getting
        on in the junior programme — progress, handicap, and your coaching
        requests, all in one place.
      </p>

      {/* Children */}
      <div className="mt-6">
        {children.isLoading || bands.isLoading ? (
          <div
            className="flex items-center gap-2 py-12 text-sm text-slate"
            data-testid="children-loading"
          >
            <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
            Loading your family…
          </div>
        ) : children.isError ? (
          <GlassCard className="p-4" data-testid="children-error">
            <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400" role="alert">
              {errorMessage(children.error, "Could not load your child's details.")}
            </p>
          </GlassCard>
        ) : kids.length === 0 ? (
          <GlassCard className="p-8 text-center" data-testid="children-empty">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15">
              <Users size={24} className="text-emerald-400" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-black text-silver">
              No child linked yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate">
              Once your child is enrolled in the junior programme and linked to
              your account, their progress will appear here. Please check with the
              club office to get them set up.
            </p>
          </GlassCard>
        ) : (
          <div
            className={cn(
              'grid gap-4',
              kids.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1',
            )}
            data-testid="children-grid"
          >
            {kids.map((child, i) => (
              <ChildCard
                key={child.id}
                child={child}
                bands={bands.data}
                staggerClass={`stagger-${Math.min(i + 1, 4)}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick links to the deeper child view */}
      {kids.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            to="/my-child"
            className={cn(
              'group glass-light flex items-center justify-between gap-3 rounded-2xl p-5 transition-all',
              'hover:-translate-y-0.5 hover:border hover:border-azure/40',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50',
            )}
            data-testid="link-my-child"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-azure/15">
                <TrendingUp size={20} className="text-azure" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-bold text-silver">
                  Progress &amp; reports
                </span>
                <span className="block text-xs text-slate">
                  Handicap, bands, evaluations
                </span>
              </span>
            </span>
            <ArrowRight
              size={18}
              className="text-slate transition group-hover:translate-x-0.5 group-hover:text-azure"
              aria-hidden
            />
          </Link>

          <Link
            to="/sessions"
            className={cn(
              'group glass-light flex items-center justify-between gap-3 rounded-2xl p-5 transition-all',
              'hover:-translate-y-0.5 hover:border hover:border-azure/40',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50',
            )}
            data-testid="link-sessions"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-azure/15">
                <ClipboardCheck size={20} className="text-azure" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-bold text-silver">
                  Coaching sessions
                </span>
                <span className="block text-xs text-slate">
                  Request &amp; track one-to-one time
                </span>
              </span>
            </span>
            <ArrowRight
              size={18}
              className="text-slate transition group-hover:translate-x-0.5 group-hover:text-azure"
              aria-hidden
            />
          </Link>
        </div>
      ) : null}

      {/* Session requests summary */}
      <div className="mt-6">
        <RequestsSummary
          requests={requests.data ?? []}
          isLoading={requests.isLoading}
          isError={requests.isError}
          error={requests.error}
        />
      </div>
    </div>
  );
}
