// Quarterly timetable view — read-mostly schedule of group sessions organised
// by band (L1-3 / L4-5 / L6-8 / L9+) and age group.
//
// Roles: all authenticated roles may land here. Staff see all sessions in the
// quarter; parents/players are silently scoped by the backend to sessions with
// open_for_booking=true — we render whatever the API returns.
//
// Data: GET /api/sessions?date_from=&date_to= — no new endpoints invented.
// Grouping is client-side: sessions are bucketed by band (derived from
// level_min), then sorted by weekday/time within each band.

import { useMemo, useState } from 'react';
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Loader2,
  Users,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { eligibilityLabel, occupancyLabel } from './group-sessions.queries';
import type { GroupSession } from './group-sessions.queries';
import {
  beginnerCapAdvisory,
  buildQuartersForYear,
  currentQuarterIndex,
  groupSessionsForTimetable,
  useTimetableSessions,
  type BandGroup,
  type Quarter,
  type TimetableRow,
} from './timetable.queries';

// ── Small helpers ─────────────────────────────────────────────────────────────

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// ── Quarter selector ──────────────────────────────────────────────────────────

function QuarterSelector({
  quarters,
  activeIdx,
  onPrev,
  onNext,
}: {
  quarters: Quarter[];
  activeIdx: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const active = quarters[activeIdx];
  const canPrev = activeIdx > 0;
  const canNext = activeIdx < quarters.length - 1;

  return (
    <div className="flex items-center gap-3" data-testid="quarter-selector">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!canPrev}
        onClick={onPrev}
        aria-label="Previous quarter"
        data-testid="quarter-prev"
      >
        <ChevronLeft size={16} aria-hidden />
      </Button>

      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-azure" aria-hidden />
        <span className="text-sm font-bold text-silver" data-testid="quarter-label">
          {active?.label ?? '—'}
        </span>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!canNext}
        onClick={onNext}
        aria-label="Next quarter"
        data-testid="quarter-next"
      >
        <ChevronRight size={16} aria-hidden />
      </Button>
    </div>
  );
}

// ── Band colour accent ────────────────────────────────────────────────────────

const BAND_ACCENT: Record<string, string> = {
  'l1-3': 'bg-emerald-500/15 text-emerald-400',
  'l4-5': 'bg-azure/15 text-azure',
  'l6-8': 'bg-gold/15 text-gold',
  'l9plus': 'bg-violet-500/15 text-violet-400',
  'all': 'bg-slate/15 text-slate',
};

const BAND_BORDER: Record<string, string> = {
  'l1-3': 'border-l-emerald-500/40',
  'l4-5': 'border-l-azure/40',
  'l6-8': 'border-l-gold/40',
  'l9plus': 'border-l-violet-500/40',
  'all': 'border-l-slate/30',
};

// ── Session row card ──────────────────────────────────────────────────────────

function SessionCard({
  row,
  showCapAdvisory,
}: {
  row: TimetableRow;
  showCapAdvisory: boolean;
}) {
  const { session } = row;
  const advisory = showCapAdvisory ? beginnerCapAdvisory(session) : null;
  const eligibility = eligibilityLabel(session);
  const occupancy = occupancyLabel(session);

  return (
    <li
      className={cn(
        'glass-light flex flex-col gap-2 rounded-xl border-l-4 p-4',
        BAND_BORDER[row.bandKey] ?? 'border-l-slate/30',
      )}
      data-testid={`timetable-session-${session.id}`}
    >
      {/* Title + badges row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-silver">
            {session.title?.trim() || 'Group session'}
          </p>
          <p className="mt-0.5 text-xs text-slate">{row.ageLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {session.open_for_booking ? (
            <Badge tone="emerald" shape="pill">
              Open
            </Badge>
          ) : (
            <Badge tone="slate" shape="pill">
              Closed
            </Badge>
          )}
          {session.status === 'cancelled' ? (
            <Badge tone="red" shape="pill">
              Cancelled
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Day / time */}
      {row.dayTimeLabel ? (
        <p className="flex items-center gap-1.5 text-xs text-slate">
          <Clock size={12} aria-hidden className="shrink-0" />
          {row.dayTimeLabel}
        </p>
      ) : null}

      {/* Eligibility + capacity */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate">
        {eligibility ? (
          <span>{eligibility}</span>
        ) : null}
        <span className="flex items-center gap-1">
          <Users size={12} aria-hidden />
          {occupancy}
        </span>
      </div>

      {/* Requirements */}
      {session.requirements ? (
        <p className="text-xs text-slate italic">{session.requirements}</p>
      ) : null}

      {/* Capacity advisory (L1-3 only) */}
      {advisory ? (
        <p
          className="flex items-center gap-1.5 rounded-lg bg-gold/10 px-2.5 py-1.5 text-xs text-gold"
          role="note"
          data-testid={`cap-advisory-${session.id}`}
        >
          <Info size={12} aria-hidden className="shrink-0" />
          {advisory}
        </p>
      ) : null}
    </li>
  );
}

// ── Band section ──────────────────────────────────────────────────────────────

function BandSection({ group }: { group: BandGroup }) {
  const { meta, rows } = group;

  return (
    <section
      aria-labelledby={`band-heading-${meta.key}`}
      data-testid={`band-section-${meta.key}`}
    >
      {/* Band header */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span
          className={cn(
            'inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-black tracking-wider uppercase',
            BAND_ACCENT[meta.key],
          )}
        >
          {meta.levelRange}
        </span>
        <div className="min-w-0">
          <h2
            id={`band-heading-${meta.key}`}
            className="text-base font-black text-silver"
          >
            {meta.label}
          </h2>
          <p className="text-xs text-slate">{meta.description}</p>
        </div>
        {meta.clinicCapGuidance ? (
          <span className="ml-auto rounded-lg bg-gold/10 px-2.5 py-1 text-xs font-semibold text-gold">
            {meta.clinicCapGuidance}
          </span>
        ) : null}
      </div>

      {/* Session list */}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <SessionCard
            key={row.session.id}
            row={row}
            showCapAdvisory={meta.key === 'l1-3'}
          />
        ))}
      </ul>
    </section>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ quarter }: { quarter: Quarter }) {
  return (
    <GlassCard className="p-10 text-center" data-testid="timetable-empty">
      <CalendarDays size={32} className="mx-auto text-azure/50" aria-hidden />
      <p className="mt-4 text-sm font-bold text-silver">
        No sessions scheduled
      </p>
      <p className="mx-auto mt-1.5 max-w-xs text-xs text-slate">
        No group sessions have been published for {quarter.label}. Sessions
        published by coaches will appear here once they fall within this
        quarter's dates.
      </p>
    </GlassCard>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function SummaryStrip({ sessions }: { sessions: GroupSession[] }) {
  const total = sessions.length;
  const open = sessions.filter((s) => s.open_for_booking).length;
  const bands = new Set(sessions.map((s) => {
    if (s.level_min == null) return 'all';
    if (s.level_min <= 3) return 'l1-3';
    if (s.level_min <= 5) return 'l4-5';
    if (s.level_min <= 8) return 'l6-8';
    return 'l9plus';
  })).size;

  return (
    <div
      className="flex flex-wrap gap-4"
      role="status"
      aria-label="Timetable summary"
      data-testid="timetable-summary"
    >
      {[
        { value: total, label: total === 1 ? 'session' : 'sessions' },
        { value: open, label: 'open for booking' },
        { value: bands, label: bands === 1 ? 'band' : 'bands' },
      ].map(({ value, label }) => (
        <div key={label} className="glass-light rounded-xl px-4 py-2.5">
          <p className="text-lg font-black text-silver">{value}</p>
          <p className="text-xs text-slate">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function TimetablePage() {
  const now = new Date();
  const year = now.getFullYear();
  const quarters = useMemo(() => buildQuartersForYear(year), [year]);
  const defaultIdx = Math.max(0, currentQuarterIndex());
  const [quarterIdx, setQuarterIdx] = useState(defaultIdx);

  const activeQuarter = quarters[quarterIdx];

  const { data, isLoading, isError, error } = useTimetableSessions(
    activeQuarter ?? quarters[0]!,
  );

  const bandGroups = useMemo(
    () => (data ? groupSessionsForTimetable(data) : []),
    [data],
  );

  return (
    <div className="mx-auto max-w-5xl" data-testid="timetable-page">
      {/* Page header */}
      <p className="animate-fade-in-up text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Coaching
      </p>
      <h1 className="animate-fade-in-up stagger-1 mt-1 text-2xl font-black text-silver sm:text-3xl">
        Quarterly timetable
      </h1>
      <p className="animate-fade-in-up stagger-1 mt-2 max-w-2xl text-sm text-slate">
        Group sessions for the term, organised by level band and age group.
        Use the quarter selector to browse the schedule.
      </p>

      {/* Controls row */}
      <div className="animate-fade-in-up stagger-2 mt-6 flex flex-wrap items-center justify-between gap-4">
        <QuarterSelector
          quarters={quarters}
          activeIdx={quarterIdx}
          onPrev={() => setQuarterIdx((i) => Math.max(0, i - 1))}
          onNext={() =>
            setQuarterIdx((i) => Math.min(quarters.length - 1, i + 1))
          }
        />

        {data && !isLoading ? (
          <SummaryStrip sessions={data} />
        ) : null}
      </div>

      {/* Content */}
      <div className="mt-8">
        {isLoading ? (
          <div
            className="flex items-center gap-2.5 text-sm text-slate"
            data-testid="timetable-loading"
            role="status"
            aria-live="polite"
          >
            <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
            Loading sessions…
          </div>
        ) : isError ? (
          <GlassCard className="p-6" data-testid="timetable-error">
            <p className="text-sm text-red-400" role="alert">
              {errorMessage(error, 'Could not load sessions for this quarter.')}
            </p>
          </GlassCard>
        ) : bandGroups.length === 0 ? (
          <EmptyState quarter={activeQuarter ?? quarters[0]!} />
        ) : (
          <div
            className="flex flex-col gap-10"
            data-testid="timetable-bands"
          >
            {bandGroups.map((group) => (
              <BandSection key={group.meta.key} group={group} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
