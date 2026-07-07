import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { WeekCalendar, type CalendarItem } from '../../components/schedule/WeekCalendar';
import { fieldClass, labelClass } from '../auth/AuthShell';
import { useCoachUsers } from '../admin/coach-assignment.queries';
import { useCoachSchedule, type CoachSession } from './coach-schedule.queries';
import { currentWeekStart, shiftWeek, weekDays, weekRangeLabel } from './coach-dates';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// Staff (admin/committee) coach picker. Mounted ONLY for those roles so the
// coach-list fetch never fires for a coach viewing their own schedule.
function StaffCoachPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (coachId: string) => void;
}) {
  const coaches = useCoachUsers();
  return (
    <GlassCard className="animate-fade-in-up stagger-1 mt-6 p-4">
      <label htmlFor="schedule-coach-picker" className={labelClass}>
        Coach
      </label>
      <select
        id="schedule-coach-picker"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass}
        disabled={coaches.isLoading}
        data-testid="schedule-coach-picker"
      >
        <option value="">
          {coaches.isLoading ? 'Loading coaches…' : 'Choose a coach…'}
        </option>
        {(coaches.data ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name || c.email}
          </option>
        ))}
      </select>
      {coaches.isError && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {errorMessage(coaches.error, 'Could not load the coach list.')}
        </p>
      )}
    </GlassCard>
  );
}

export function CoachSchedulePage() {
  const { user } = useAuth();
  // Admin + committee browse any coach's week via the picker; coaches keep
  // exactly their own schedule (no picker, no extra fetches).
  const isStaffViewer = user?.role === 'admin' || user?.role === 'committee';
  const [pickedCoachId, setPickedCoachId] = useState<string>('');
  const coachId = isStaffViewer ? pickedCoachId || undefined : user?.id;
  const [week, setWeek] = useState<string>(() => currentWeekStart());

  const schedule = useCoachSchedule(coachId, week);
  const sessions: CoachSession[] = schedule.data ?? [];
  const items: CalendarItem[] = sessions.map((s) => ({
    id: `session-${s.id}`,
    date: s.date ?? '',
    start_time: s.start_time,
    end_time: s.end_time,
    title: s.session_type ?? 'Session',
    kind: 'session',
    status: s.status,
    subtitle: s.notes ?? undefined,
  }));
  const days = weekDays(week);
  const isCurrentWeek = week === currentWeekStart();

  return (
    <div className="mx-auto max-w-6xl">
      <p className="animate-fade-in-up text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Coaching
      </p>
      <h1 className="animate-fade-in-up stagger-1 mt-1 text-2xl font-black text-silver sm:text-3xl">
        Weekly schedule
      </h1>

      {/* ── Coach picker (admin/committee only — mount-gated fetch) ──────── */}
      {isStaffViewer && (
        <StaffCoachPicker value={pickedCoachId} onChange={setPickedCoachId} />
      )}

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
        {isStaffViewer && !coachId ? (
          <GlassCard
            className="p-8 text-center"
            data-testid="schedule-pick-coach"
          >
            <CalendarDays size={28} className="mx-auto text-slate" />
            <p className="mt-3 text-sm font-semibold text-silver">
              Choose a coach
            </p>
            <p className="mt-1 text-xs text-slate">
              Pick a coach above to see their week.
            </p>
          </GlassCard>
        ) : schedule.isLoading ? (
          <div
            className="flex items-center gap-2 text-sm text-slate"
            data-testid="schedule-loading"
          >
            <Loader2 size={18} className="animate-spin text-azure" />
            {isStaffViewer ? 'Loading the week…' : 'Loading your week…'}
          </div>
        ) : schedule.isError ? (
          <div
            className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            role="alert"
            data-testid="schedule-error"
          >
            {errorMessage(
              schedule.error,
              isStaffViewer
                ? 'Could not load this schedule.'
                : 'Could not load your schedule.',
            )}
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
          <GlassCard className="animate-fade-in-up p-3 sm:p-4">
            <WeekCalendar days={days} items={items} />
          </GlassCard>
        )}
      </div>
    </div>
  );
}
