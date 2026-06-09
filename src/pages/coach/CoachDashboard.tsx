import { Link } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Loader2,
  PenLine,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { useCoachSchedule, type CoachSession } from './coach-schedule.queries';
import {
  useUnsignedEvaluations,
  useCoachSign,
  useGolferNames,
} from './coach-evaluations.queries';
import {
  currentWeekStart,
  dayLabel,
  parseISODate,
  sessionISODate,
  sessionTimeLabel,
} from './coach-dates';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
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

function monthLabel(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function CoachDashboard() {
  const { user } = useAuth();
  const coachId = user?.id;
  const week = currentWeekStart();

  const schedule = useCoachSchedule(coachId, week);
  const evals = useUnsignedEvaluations(coachId);
  const coachSign = useCoachSign();
  const { nameFor } = useGolferNames();

  const sessions: CoachSession[] = schedule.data ?? [];
  const pending = evals.data ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <p className="animate-fade-in-up text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Coaching
      </p>
      <h1 className="animate-fade-in-up stagger-1 mt-1 text-2xl font-black text-silver sm:text-3xl">
        {user ? `Welcome, ${user.first_name}` : 'Welcome'}
      </h1>
      <p className="animate-fade-in-up stagger-1 mt-2 max-w-2xl text-sm text-slate">
        Your week and the evaluations waiting on your sign-off.
      </p>

      {/* ── Hero stats ──────────────────────────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard
          icon={CalendarDays}
          value={
            schedule.isLoading ? (
              <Loader2 size={18} className="animate-spin text-azure" />
            ) : schedule.isError ? (
              '—'
            ) : (
              sessions.length
            )
          }
          label="Sessions this week"
          className="animate-fade-in-up stagger-1"
          testId="stat-week-sessions"
        />
        <StatCard
          icon={ClipboardCheck}
          value={
            evals.isLoading ? (
              <Loader2 size={18} className="animate-spin text-azure" />
            ) : evals.isError ? (
              '—'
            ) : (
              <span className={pending.length > 0 ? 'text-gold' : undefined}>
                {pending.length}
              </span>
            )
          }
          label="Awaiting my sign-off"
          className="animate-fade-in-up stagger-2"
          testId="stat-awaiting-signoff"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* ── This week's schedule ──────────────────────────────────────── */}
        <GlassCard className="animate-fade-in-up stagger-1 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-silver">This week</h2>
            <Link
              to="/schedule"
              className="text-xs font-medium text-azure hover:underline"
              data-testid="dashboard-view-schedule"
            >
              Full schedule
            </Link>
          </div>

          <div className="mt-4">
            {schedule.isLoading ? (
              <div
                className="flex items-center gap-2 text-sm text-slate"
                data-testid="week-loading"
              >
                <Loader2 size={18} className="animate-spin text-azure" />
                Loading this week…
              </div>
            ) : schedule.isError ? (
              <ErrorPanel
                message={errorMessage(
                  schedule.error,
                  'Could not load your schedule.',
                )}
                testId="week-error"
              />
            ) : sessions.length === 0 ? (
              <p className="text-sm text-slate" data-testid="week-empty">
                No sessions scheduled this week.
              </p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="week-list">
                {sessions.map((s) => {
                  const iso = sessionISODate(s);
                  const time = sessionTimeLabel(s);
                  return (
                    <li
                      key={s.id}
                      className="glass-light flex items-center gap-3 rounded-xl p-3"
                      data-testid={`week-session-${s.id}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-azure/15">
                        <CalendarDays size={16} className="text-azure" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-silver">
                          {s.session_type ?? 'Session'}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate">
                          {iso && (
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays size={12} />
                              {dayLabel(parseISODate(iso))}
                            </span>
                          )}
                          {time && (
                            <span className="inline-flex items-center gap-1">
                              <Clock size={12} />
                              {time}
                            </span>
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </GlassCard>

        {/* ── Awaiting my sign-off ──────────────────────────────────────── */}
        <GlassCard className="animate-fade-in-up stagger-2 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-silver">
              Awaiting my sign-off
            </h2>
            <Link
              to="/attendance"
              className="text-xs font-medium text-azure hover:underline"
              data-testid="dashboard-take-attendance"
            >
              Take attendance
            </Link>
          </div>
          <p className="mt-1 text-xs text-slate">
            Coach signs first; the committee then counter-signs.
          </p>

          <div className="mt-4">
            {evals.isLoading ? (
              <div
                className="flex items-center gap-2 text-sm text-slate"
                data-testid="evals-loading"
              >
                <Loader2 size={18} className="animate-spin text-azure" />
                Loading evaluations…
              </div>
            ) : evals.isError ? (
              <ErrorPanel
                message={errorMessage(
                  evals.error,
                  'Could not load evaluations.',
                )}
                testId="evals-error"
              />
            ) : pending.length === 0 ? (
              <p
                className="flex items-center gap-2 text-sm text-slate"
                data-testid="evals-empty"
              >
                <CheckCircle2 size={16} className="text-emerald-400" />
                Nothing awaiting your sign-off.
              </p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="evals-list">
                {pending.map((e) => (
                  <li
                    key={e.id}
                    className="glass-light flex items-center gap-3 rounded-xl p-3"
                    data-testid={`eval-${e.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-silver">
                        {nameFor(e.junior_id)}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate">
                        <span>{monthLabel(e.report_month)}</span>
                        <Badge tone="slate" className="px-1.5 py-0.5">
                          L{e.current_level}
                        </Badge>
                      </p>
                    </div>
                    <Button
                      variant="gold"
                      size="sm"
                      disabled={
                        coachSign.isPending &&
                        coachSign.variables === e.id
                      }
                      onClick={() => coachSign.mutate(e.id)}
                      data-testid={`eval-sign-${e.id}`}
                    >
                      {coachSign.isPending && coachSign.variables === e.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <PenLine size={16} />
                      )}
                      Sign
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {coachSign.isError && (
              <div className="mt-3">
                <ErrorPanel
                  message={errorMessage(
                    coachSign.error,
                    'Could not sign that evaluation.',
                  )}
                  testId="eval-sign-error"
                />
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
