import { useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { Badge } from '../../components/ui/Badge';
import { useCoachSchedule, type CoachSession } from './coach-schedule.queries';
import {
  currentWeekStart,
  dayLabel,
  sessionISODate,
  sessionTimeLabel,
  shiftWeek,
  toISODate,
  weekDays,
  weekRangeLabel,
} from './coach-dates';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// Group sessions by their ISO date; sessions without a resolvable date fall into
// a separate "unscheduled" bucket so they are never silently dropped.
function groupByDay(
  sessions: CoachSession[],
): { byDate: Map<string, CoachSession[]>; undated: CoachSession[] } {
  const byDate = new Map<string, CoachSession[]>();
  const undated: CoachSession[] = [];
  for (const s of sessions) {
    const iso = sessionISODate(s);
    if (!iso) {
      undated.push(s);
      continue;
    }
    const list = byDate.get(iso) ?? [];
    list.push(s);
    byDate.set(iso, list);
  }
  return { byDate, undated };
}

function SessionRow({ s }: { s: CoachSession }) {
  const time = sessionTimeLabel(s);
  const cancelled = s.status?.toLowerCase() === 'cancelled';
  return (
    <li
      className="glass-light flex items-start gap-3 rounded-xl p-3"
      data-testid={`schedule-session-${s.id}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-azure/15">
        <CalendarDays size={16} className="text-azure" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-silver">
            {s.session_type ?? 'Session'}
          </p>
          {cancelled && (
            <Badge tone="red" className="px-1.5 py-0.5">
              Cancelled
            </Badge>
          )}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate">
          {time && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} />
              {time}
            </span>
          )}
        </p>
        {s.notes && (
          <p className="mt-1 text-xs text-slate" data-testid={`schedule-notes-${s.id}`}>
            {s.notes}
          </p>
        )}
      </div>
    </li>
  );
}

export function CoachSchedulePage() {
  const { user } = useAuth();
  const coachId = user?.id;
  const [week, setWeek] = useState<string>(() => currentWeekStart());

  const schedule = useCoachSchedule(coachId, week);
  const sessions: CoachSession[] = schedule.data ?? [];
  const { byDate, undated } = groupByDay(sessions);
  const days = weekDays(week);
  const isCurrentWeek = week === currentWeekStart();

  return (
    <div className="mx-auto max-w-4xl">
      <p className="animate-fade-in-up text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Coaching
      </p>
      <h1 className="animate-fade-in-up stagger-1 mt-1 text-2xl font-black text-silver sm:text-3xl">
        Weekly schedule
      </h1>

      {/* ── Week navigation ─────────────────────────────────────────────── */}
      <GlassCard className="animate-fade-in-up stagger-1 mt-6 flex items-center justify-between gap-2 p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeek((w) => shiftWeek(w, -1))}
          data-testid="schedule-prev-week"
          aria-label="Previous week"
        >
          <ChevronLeft size={18} />
          <span className="hidden sm:inline">Prev</span>
        </Button>

        <div className="min-w-0 text-center">
          <p className="text-sm font-bold text-silver" data-testid="schedule-week-label">
            {weekRangeLabel(week)}
          </p>
          {!isCurrentWeek && (
            <button
              type="button"
              className="mt-0.5 text-xs font-medium text-azure hover:underline"
              onClick={() => setWeek(currentWeekStart())}
              data-testid="schedule-this-week"
            >
              Jump to this week
            </button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeek((w) => shiftWeek(w, 1))}
          data-testid="schedule-next-week"
          aria-label="Next week"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={18} />
        </Button>
      </GlassCard>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="mt-6">
        {schedule.isLoading ? (
          <div
            className="flex items-center gap-2 text-sm text-slate"
            data-testid="schedule-loading"
          >
            <Loader2 size={18} className="animate-spin text-azure" />
            Loading your week…
          </div>
        ) : schedule.isError ? (
          <div
            className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            role="alert"
            data-testid="schedule-error"
          >
            {errorMessage(schedule.error, 'Could not load your schedule.')}
          </div>
        ) : sessions.length === 0 ? (
          <GlassCard className="p-8 text-center" data-testid="schedule-empty">
            <CalendarDays size={28} className="mx-auto text-slate" />
            <p className="mt-3 text-sm font-semibold text-silver">
              No sessions this week
            </p>
            <p className="mt-1 text-xs text-slate">
              Nothing is scheduled for {weekRangeLabel(week)}.
            </p>
          </GlassCard>
        ) : (
          <div className="flex flex-col gap-4">
            {days.map((d) => {
              const iso = toISODate(d);
              const daySessions = byDate.get(iso) ?? [];
              if (daySessions.length === 0) return null;
              return (
                <section key={iso} data-testid={`schedule-day-${iso}`}>
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate">
                    {dayLabel(d)}
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {daySessions.map((s) => (
                      <SessionRow key={s.id} s={s} />
                    ))}
                  </ul>
                </section>
              );
            })}

            {undated.length > 0 && (
              <section data-testid="schedule-undated">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate">
                  Unscheduled
                </h2>
                <ul className="flex flex-col gap-2">
                  {undated.map((s) => (
                    <SessionRow key={s.id} s={s} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
