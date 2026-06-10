// CompetitionHistory — a READ-ONLY, reusable card showing a single junior's
// combined competition record (internal tournaments + external result logs) plus
// two hero stats (competitions played, best gross). Reads ONLY
// /api/juniors/:id/competitions, which the backend scopes — so it's safe to drop
// into the player progress page (own juniorId) and the parent child page (their
// child) without leaking other families' data. No logging/edit controls live
// here; logging is the admin/coach screen's job.

import { ApiError } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { GlassCard } from '../../components/ui/GlassCard';
import { Loader2, Trophy } from 'lucide-react';
import {
  dateSortKey,
  eventTypeLabel,
  eventTypeTone,
  formatEventDate,
  useJuniorCompetitions,
  type ExternalResult,
  type InternalCompetitionRow,
} from './tournament-external.queries';
import { formatLabel } from './tournaments.queries';

// A normalized row so internal + external entries sort and render together.
interface CombinedRow {
  key: string;
  source: 'internal' | 'external';
  name: string;
  date: string;
  sortKey: number;
  meta: string; // format (internal) or event type label (external)
  externalEventType: ExternalResult['event_type'] | null; // raw enum, for tone
  gross: number | null;
  net: number | null;
  stableford: number | null;
  position: number | null;
  fieldSize: number | null;
  countsTowardHandicap: boolean;
}

function fromInternal(r: InternalCompetitionRow): CombinedRow {
  return {
    key: `internal-${r.tournament_id}-${r.date}`,
    source: 'internal',
    name: r.tournament_name,
    date: r.date,
    sortKey: dateSortKey(r.date),
    meta: formatLabel(r.format),
    externalEventType: null,
    gross: r.gross_score,
    net: r.net_score,
    stableford: r.stableford_points,
    position: r.position,
    fieldSize: null,
    countsTowardHandicap: false,
  };
}

function fromExternal(r: ExternalResult): CombinedRow {
  return {
    key: `external-${r.id}`,
    source: 'external',
    name: r.event_name,
    date: r.date,
    sortKey: dateSortKey(r.date),
    meta: eventTypeLabel(r.event_type),
    externalEventType: r.event_type,
    gross: r.gross_score,
    net: null,
    stableford: null,
    position: r.position,
    fieldSize: r.field_size,
    countsTowardHandicap: r.counts_toward_handicap,
  };
}

function fmt(value: number | null): string {
  return value == null ? '—' : String(value);
}

function positionText(position: number | null, fieldSize: number | null): string {
  if (position == null) return '—';
  return fieldSize != null ? `#${position} / ${fieldSize}` : `#${position}`;
}

function Hero({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate">
        {label}
      </p>
      <p className="mt-1 font-mono text-3xl font-black text-silver">{value}</p>
    </div>
  );
}

export function CompetitionHistory({
  juniorId,
  title = 'Competition history',
}: {
  juniorId: number;
  title?: string;
}) {
  const query = useJuniorCompetitions(juniorId);

  return (
    <GlassCard className="overflow-hidden" data-testid="competition-history">
      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
        <Trophy className="h-4 w-4 text-azure" aria-hidden />
        <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
          {title}
        </h2>
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-3 px-5 py-10 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading competitions…
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="m-5 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          data-testid="competition-history-error"
        >
          {query.error instanceof ApiError
            ? query.error.message
            : 'Could not load competition history.'}
        </div>
      ) : query.data ? (
        <CompetitionBody data={query.data} />
      ) : null}
    </GlassCard>
  );
}

function CompetitionBody({
  data,
}: {
  data: ReturnType<typeof useJuniorCompetitions>['data'] & object;
}) {
  const rows: CombinedRow[] = [
    ...data.internal.map(fromInternal),
    ...data.external.map(fromExternal),
  ].sort((a, b) => b.sortKey - a.sortKey);

  return (
    <div className="px-5 py-5">
      {/* Hero stats */}
      <div className="grid grid-cols-2 gap-3" data-testid="competition-stats">
        <Hero label="Competitions played" value={String(data.competitions_played)} />
        <Hero
          label="Best gross"
          value={data.best_gross_score == null ? '—' : String(data.best_gross_score)}
        />
      </div>

      {/* Combined, date-sorted list */}
      {rows.length === 0 ? (
        <p
          className="mt-5 rounded-xl bg-white/5 px-4 py-6 text-center text-sm text-slate"
          data-testid="competition-history-empty"
        >
          No competitions recorded yet.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Event
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Date
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Gross
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Net
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Points
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Position
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className="border-t border-white/5 align-top"
                  data-testid={`competition-row-${row.key}`}
                >
                  <td className="py-3 pr-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-silver">{row.name}</span>
                      {row.source === 'internal' ? (
                        <Badge tone="azure" shape="pill">
                          Internal
                        </Badge>
                      ) : (
                        <Badge tone={eventTypeTone(row.externalEventType ?? '')} shape="pill">
                          External
                        </Badge>
                      )}
                      {row.countsTowardHandicap ? (
                        <Badge tone="gold" shape="pill">
                          Counts to HCP
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-slate">{row.meta}</p>
                  </td>
                  <td className="px-3 py-3 text-slate">{formatEventDate(row.date)}</td>
                  <td className="px-3 py-3 text-right font-mono text-silver">
                    {fmt(row.gross)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-silver">
                    {fmt(row.net)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-silver">
                    {fmt(row.stableford)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-silver">
                    {positionText(row.position, row.fieldSize)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
