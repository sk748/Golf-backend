// Junior League FIXTURE DETAIL — shared, read-only across every signed-in role.
// Header: the two teams + aggregate score + status + date + location. Then the
// list of pairings — each a per-player/per-pairing performance row showing our
// side (home_junior_name || home_label, plus partner) vs the opponent, the
// result and the margin. Win/halve/loss is conveyed by row tone. All scoring is
// server-computed; we only display.

import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  Loader2,
  MapPin,
  Swords,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Badge } from '../../components/ui/Badge';
import { GlassCard } from '../../components/ui/GlassCard';
import {
  fixtureDate,
  fixtureStatusLabel,
  fixtureStatusTone,
  pairingFormatLabel,
  type Fixture,
  type FixtureResult,
  type Pairing,
  useFixture,
} from './league.queries';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function BackLink() {
  return (
    <Link
      to="/league"
      className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-slate transition-colors hover:text-azure focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
      data-testid="fixture-back-link"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to league
    </Link>
  );
}

// Combine a player/label with an optional partner into one display string.
function sideLabel(
  main: string | null,
  fallback: string | null,
  partner: string | null,
): string {
  const name = main?.trim() || fallback?.trim() || 'TBC';
  return partner?.trim() ? `${name} & ${partner.trim()}` : name;
}

// Per-pairing result → row accent + chip tone. home_win is "our" win (azure),
// away_win is the opponent's (slate), halved is gold, pending is neutral.
function resultMeta(result: FixtureResult): {
  label: string;
  tone: 'azure' | 'slate' | 'gold' | 'emerald' | 'red' | 'violet';
  border: string;
} {
  switch (result) {
    case 'home_win':
      return { label: 'Home win', tone: 'azure', border: 'border-l-azure' };
    case 'away_win':
      return { label: 'Away win', tone: 'slate', border: 'border-l-slate' };
    case 'halved':
      return { label: 'Halved', tone: 'gold', border: 'border-l-gold' };
    default:
      return { label: 'Pending', tone: 'slate', border: 'border-l-white/10' };
  }
}

function PairingRow({ pairing }: { pairing: Pairing }) {
  const home = sideLabel(
    pairing.home_junior_name,
    pairing.home_label,
    pairing.home_partner_junior_name,
  );
  const away = sideLabel(
    pairing.away_label,
    null,
    pairing.away_partner_label,
  );
  const meta = resultMeta(pairing.result);

  return (
    <div
      className={cn(
        'border-l-2 border-t border-white/5 px-5 py-4',
        meta.border,
      )}
      data-testid={`fixture-pairing-${pairing.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate">
          {pairing.pairing_order != null ? `#${pairing.pairing_order} · ` : ''}
          {pairingFormatLabel(pairing.format)}
        </span>
        <Badge tone={meta.tone} shape="pill">
          {meta.label}
        </Badge>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-silver">
          {home}
        </p>
        <span className="text-xs font-black text-slate">v</span>
        <p className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-silver">
          {away}
        </p>
      </div>

      {pairing.margin ? (
        <p className="mt-2 text-xs text-slate">
          <span className="font-semibold text-silver/80">Margin:</span>{' '}
          {pairing.margin}
        </p>
      ) : null}
    </div>
  );
}

function FixtureHeader({ fixture }: { fixture: Fixture }) {
  const { summary } = fixture;
  const showScore =
    fixture.status === 'completed' || fixture.status === 'in_progress';

  return (
    <GlassCard className="mt-4 p-6 sm:p-7" data-testid="fixture-header">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={fixtureStatusTone(fixture.status)} shape="pill">
          {fixtureStatusLabel(fixture.status)}
        </Badge>
        {fixture.round_number != null ? (
          <Badge tone="slate" shape="pill">
            Round {fixture.round_number}
          </Badge>
        ) : null}
      </div>

      <div className="mt-5 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-base font-bold text-silver sm:text-lg"
            title={summary.home_team_name ?? 'Home'}
          >
            {summary.home_team_name ?? 'Home'}
          </p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate">
            Home
          </p>
        </div>

        {showScore ? (
          <p className="font-mono text-3xl font-black text-silver sm:text-4xl">
            {summary.home_points}
            <span className="mx-1 text-slate">–</span>
            {summary.away_points}
          </p>
        ) : (
          <span className="px-2 pb-1 text-lg font-black text-slate">v</span>
        )}

        <div className="min-w-0 flex-1 text-right">
          <p
            className="truncate text-base font-bold text-silver sm:text-lg"
            title={summary.away_team_name ?? 'Away'}
          >
            {summary.away_team_name ?? 'Away'}
          </p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate">
            Away
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {fixtureDate(fixture.date)}
        </span>
        {fixture.location ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {fixture.location}
          </span>
        ) : null}
      </div>
    </GlassCard>
  );
}

export function FixtureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const fixtureId = Number(id);
  const validId = Number.isFinite(fixtureId) && fixtureId > 0;

  const query = useFixture(validId ? fixtureId : undefined);
  const fixture = query.data;

  const notFound =
    !validId ||
    (query.isError &&
      query.error instanceof ApiError &&
      query.error.status === 404);

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in-up">
        <BackLink />
        <GlassCard
          className="mt-6 px-6 py-16 text-center"
          data-testid="fixture-not-found"
        >
          <Swords className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
          <p className="mt-4 text-base font-bold text-silver">
            Match not found
          </p>
          <p className="mt-1 text-sm text-slate">
            This fixture may have been removed, or the link is incorrect.
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up">
      <BackLink />

      {query.isLoading ? (
        <div className="mt-6 flex items-center gap-3 py-12 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading match…
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="mt-6 rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
          data-testid="fixture-error"
        >
          {errorMessage(query.error)}
        </div>
      ) : fixture ? (
        <>
          <FixtureHeader fixture={fixture} />

          <GlassCard
            className="mt-6 overflow-hidden"
            data-testid="fixture-pairings"
          >
            <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
              <Swords className="h-4 w-4 text-azure" aria-hidden />
              <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
                Pairings
              </h2>
            </div>
            {fixture.pairings.length === 0 ? (
              <p
                className="px-5 py-8 text-sm text-slate"
                data-testid="fixture-pairings-empty"
              >
                Pairings will be listed once they are set for this match.
              </p>
            ) : (
              <div>
                {fixture.pairings.map((p) => (
                  <PairingRow key={p.id} pairing={p} />
                ))}
              </div>
            )}
          </GlassCard>
        </>
      ) : null}
    </div>
  );
}
