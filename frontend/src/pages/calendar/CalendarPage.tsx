import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import {
  WeekCalendar,
  type CalendarItem,
} from '../../components/schedule/WeekCalendar';
import {
  currentWeekStart,
  shiftWeek,
  toISODate,
  weekDays,
  weekRangeLabel,
} from '../coach/coach-dates';
import { useMySessions } from '../coach/coach-schedule.queries';
import { useTournaments } from '../tournaments/tournaments.queries';
import { useEvents } from './events.queries';
import { CreateEventModal } from './CreateEventModal';
import { EventDetailModal } from './EventDetailModal';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// A colour key chip for the legend.
function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

export function CalendarPage() {
  const { user } = useAuth();
  const role = user?.role;
  const canCreate = role === 'admin' || role === 'coach' || role === 'committee';

  const [week, setWeek] = useState<string>(() => currentWeekStart());
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const days = weekDays(week);
  const weekStart = toISODate(days[0]);
  const weekEnd = toISODate(days[6]);
  const isCurrentWeek = week === currentWeekStart();

  const events = useEvents(weekStart, weekEnd);
  const sessions = useMySessions(weekStart, weekEnd);
  const tournaments = useTournaments();

  const items = useMemo<CalendarItem[]>(() => {
    const out: CalendarItem[] = [];

    // Events — clickable, open the detail modal.
    for (const e of events.data ?? []) {
      out.push({
        id: `event-${e.id}`,
        date: e.date,
        start_time: e.start_time,
        end_time: e.end_time,
        title: e.title,
        kind: 'event',
        status: e.status,
        mandatory: e.mandatory,
        subtitle: e.location ?? undefined,
        onClick: () => setSelectedId(e.id),
      });
    }

    // Coaching sessions the caller is part of (role-scoped server-side); read-only.
    for (const s of sessions.data ?? []) {
      out.push({
        id: `session-${s.id}`,
        date: s.date ?? '',
        start_time: s.start_time,
        end_time: s.end_time,
        title: s.session_type ?? 'Session',
        kind: 'session',
        status: s.status,
        subtitle: s.notes ?? undefined,
      });
    }

    // Tournaments — those whose start date falls in the visible week; all-day.
    for (const t of tournaments.data ?? []) {
      if (t.start_date >= weekStart && t.start_date <= weekEnd) {
        out.push({
          id: `tournament-${t.id}`,
          date: t.start_date,
          start_time: null,
          end_time: null,
          title: t.name,
          kind: 'tournament',
          status: t.status === 'cancelled' ? 'cancelled' : undefined,
          onClick: () => {
            window.location.assign(`/tournaments/${t.id}`);
          },
        });
      }
    }

    return out;
  }, [events.data, sessions.data, tournaments.data, weekStart, weekEnd]);

  // Resolve the open event from the live list so an RSVP (which invalidates the
  // list) reflects in the modal without re-clicking.
  const selectedEvent =
    selectedId == null
      ? null
      : (events.data ?? []).find((e) => e.id === selectedId) ?? null;

  const isLoading =
    events.isLoading || tournaments.isLoading || sessions.isLoading;
  const isError = events.isError;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="animate-fade-in-up text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
            Programme
          </p>
          <h1 className="animate-fade-in-up stagger-1 mt-1 text-2xl font-black text-silver sm:text-3xl">
            Calendar
          </h1>
          <p className="animate-fade-in-up stagger-1 mt-1 text-sm text-slate">
            Events, sessions and tournaments for your week.
          </p>
        </div>
        {canCreate && (
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            data-testid="calendar-new-event"
          >
            <Plus size={16} /> New event
          </Button>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <LegendChip color="bg-azure" label="Event" />
        <LegendChip color="bg-emerald-500" label="Session" />
        <LegendChip color="bg-gold" label="Tournament" />
      </div>

      {/* Week navigation */}
      <GlassCard className="animate-fade-in-up stagger-1 mt-4 flex items-center justify-between gap-2 p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeek((w) => shiftWeek(w, -1))}
          data-testid="calendar-prev-week"
          aria-label="Previous week"
        >
          <ChevronLeft size={18} />
          <span className="hidden sm:inline">Prev</span>
        </Button>

        <div className="min-w-0 text-center">
          <p className="text-sm font-bold text-silver" data-testid="calendar-week-label">
            {weekRangeLabel(week)}
          </p>
          {!isCurrentWeek && (
            <button
              type="button"
              className="mt-0.5 text-xs font-medium text-azure hover:underline"
              onClick={() => setWeek(currentWeekStart())}
              data-testid="calendar-this-week"
            >
              Jump to this week
            </button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeek((w) => shiftWeek(w, 1))}
          data-testid="calendar-next-week"
          aria-label="Next week"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight size={18} />
        </Button>
      </GlassCard>

      {/* Body */}
      <div className="mt-6">
        {isLoading ? (
          <div
            className="flex items-center gap-2 text-sm text-slate"
            data-testid="calendar-loading"
          >
            <Loader2 size={18} className="animate-spin text-azure" />
            Loading the week…
          </div>
        ) : isError ? (
          <div
            className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            role="alert"
            data-testid="calendar-error"
          >
            {errorMessage(events.error, 'Could not load the calendar.')}
          </div>
        ) : items.length === 0 ? (
          <GlassCard className="p-8 text-center" data-testid="calendar-empty">
            <CalendarDays size={28} className="mx-auto text-slate" />
            <p className="mt-3 text-sm font-semibold text-silver">
              Nothing on the calendar this week
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

      {creating && (
        <CreateEventModal
          defaultDate={weekStart}
          onClose={() => setCreating(false)}
        />
      )}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
