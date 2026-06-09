// Tournaments list — SHARED across all roles, strictly read-only. Anyone signed
// in can browse the club's events. No register / RSVP / score / edit actions
// here (those belong to later, role-specific passes). Does NOT branch on role.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  ChevronRight,
  Flag,
  Loader2,
  Trophy,
  UserCheck,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { GlassCard } from '../../components/ui/GlassCard';
import {
  eligibilitySummary,
  formatDateRange,
  formatLabel,
  statusLabel,
  statusTone,
  useTournaments,
  type Tournament,
} from './tournaments.queries';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong loading tournaments.';
}

// Filter option lists kept in sync with the backend enums (display-only labels).
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'registration_open', label: 'Registration open' },
  { value: 'registration_closed', label: 'Registration closed' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'draft', label: 'Draft' },
  { value: 'cancelled', label: 'Cancelled' },
];

const FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: 'stroke_play', label: 'Stroke play' },
  { value: 'stableford', label: 'Stableford' },
  { value: 'match_play', label: 'Match play' },
];

// ── Card ───────────────────────────────────────────────────────────────────────

function TournamentCard({ tournament }: { tournament: Tournament }) {
  const eligibility = eligibilitySummary(tournament);
  return (
    <Link
      to={`/tournaments/${tournament.id}`}
      data-testid={`tournament-card-${tournament.id}`}
      className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
    >
      <GlassCard className="h-full p-5 transition-all group-hover:bg-white/[0.06]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold leading-snug text-silver">
            {tournament.name}
          </h2>
          <ChevronRight
            className="mt-0.5 h-5 w-5 shrink-0 text-slate transition-transform group-hover:translate-x-0.5 group-hover:text-azure"
            aria-hidden
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(tournament.status)} shape="pill">
            {statusLabel(tournament.status)}
          </Badge>
          <Badge tone="azure" className="gap-1.5">
            <Flag className="h-3.5 w-3.5" aria-hidden />
            {formatLabel(tournament.format)}
          </Badge>
          <Badge tone="slate">
            <span className="font-mono">{tournament.holes}</span>&nbsp;holes
          </Badge>
          {tournament.counts_toward_handicap && (
            <Badge tone="gold" className="gap-1.5">
              <UserCheck className="h-3.5 w-3.5" aria-hidden />
              Counts toward handicap
            </Badge>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-silver">
          <CalendarDays className="h-4 w-4 shrink-0 text-slate" aria-hidden />
          {formatDateRange(tournament.start_date, tournament.end_date)}
        </div>

        <div className="mt-2 text-sm text-slate">
          {eligibility ?? 'Open to all'}
        </div>
      </GlassCard>
    </Link>
  );
}

// ── States ───────────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <GlassCard key={i} className="p-5" aria-hidden>
          <div className="h-5 w-2/3 animate-pulse rounded bg-white/10" />
          <div className="mt-3 flex gap-2">
            <div className="h-6 w-24 animate-pulse rounded-lg bg-white/10" />
            <div className="h-6 w-20 animate-pulse rounded-lg bg-white/10" />
          </div>
          <div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-white/10" />
          <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-white/10" />
        </GlassCard>
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function TournamentsListPage() {
  const [status, setStatus] = useState('');
  const [format, setFormat] = useState('');

  const query = useTournaments({
    status: status || undefined,
    format: format || undefined,
  });
  const tournaments = query.data;

  const selectClass =
    'rounded-lg bg-white/5 px-3 py-2 text-sm text-silver outline-none ring-1 ring-white/10 focus:ring-azure';

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Junior programme
      </p>
      <div className="mt-1 flex items-center gap-2">
        <Trophy className="h-6 w-6 text-gold" aria-hidden />
        <h1 className="text-2xl font-black text-silver">Tournaments</h1>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        Club competitions for the Junior Development Programme — formats, dates,
        and who's eligible to play. Open an event for the full details.
      </p>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate">
          <span className="sr-only sm:not-sr-only">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectClass}
            data-testid="tournaments-status-filter"
            aria-label="Filter by status"
          >
            <option value="" className="bg-navy">
              All statuses
            </option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-navy">
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-slate">
          <span className="sr-only sm:not-sr-only">Format</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className={selectClass}
            data-testid="tournaments-format-filter"
            aria-label="Filter by format"
          >
            <option value="" className="bg-navy">
              All formats
            </option>
            {FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-navy">
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Body */}
      <div className="mt-6">
        {query.isLoading ? (
          <SkeletonGrid />
        ) : query.isError ? (
          <div
            role="alert"
            className="rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
            data-testid="tournaments-error"
          >
            {errorMessage(query.error)}
          </div>
        ) : !tournaments || tournaments.length === 0 ? (
          <GlassCard className="px-6 py-16 text-center" data-testid="tournaments-empty">
            <Trophy className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
            <p className="mt-4 text-base font-bold text-silver">
              {status || format
                ? 'No tournaments match these filters'
                : 'No tournaments yet'}
            </p>
            <p className="mt-1 text-sm text-slate">
              {status || format
                ? 'Try clearing a filter to see more.'
                : 'Upcoming club competitions will appear here once they are scheduled.'}
            </p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        )}

        {query.isFetching && !query.isLoading && (
          <div className="mt-4 flex items-center gap-2 text-xs text-slate">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-azure" aria-hidden />
            Updating…
          </div>
        )}
      </div>
    </div>
  );
}
