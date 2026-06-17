// Compact Junior League widget for the DASHBOARD (not the rich landing hero).
//
// A single horizontal bar (announcement-bar weight) that fills the width on
// desktop and wraps on mobile:
//   [🏆 Junior League] · [Karen position] · [live score OR next fixture] · [CTA]
//
// When a fixture is in_progress the middle shows the live SCORE (the dashboard
// never shows the full standings table — that lives on /league). Self-hides
// when there is no current league; owns its bottom margin.

import { Link } from 'react-router-dom';
import { ArrowRight, Trophy } from 'lucide-react';

import { cn } from '../../lib/cn';
import {
  fixtureDate,
  ordinal,
  type Fixture,
  type Scoreboard,
  useScoreboard,
} from './league.queries';

const DOT_CLASS: Record<string, string> = {
  home_win: 'bg-azure',
  away_win: 'bg-slate',
  halved: 'bg-gold',
};

// First word of a club name — keeps the bar compact (e.g. "Royal").
function shortTeam(name: string | null): string {
  if (!name) return 'TBD';
  return name.split(' ')[0];
}

function Divider() {
  return <span className="hidden h-6 w-px bg-white/10 sm:block" aria-hidden />;
}

function LiveScore({ fixture, karenName }: { fixture: Fixture; karenName: string | null }) {
  const { summary } = fixture;
  const homeIsKaren = karenName != null && summary.home_team_name === karenName;
  const awayIsKaren = karenName != null && summary.away_team_name === karenName;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-azure">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-azure opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-azure" />
        </span>
        Live
      </span>
      <span className="flex items-center gap-1.5 truncate text-sm font-bold">
        <span className={cn('truncate', homeIsKaren ? 'text-gold' : 'text-silver')}>
          {shortTeam(summary.home_team_name)}
        </span>
        <span className="font-mono text-base font-black text-silver">
          {summary.home_points}<span className="mx-1 text-slate">–</span>{summary.away_points}
        </span>
        <span className={cn('truncate', awayIsKaren ? 'text-gold' : 'text-silver')}>
          {shortTeam(summary.away_team_name)}
        </span>
      </span>
      {fixture.pairings.length > 0 ? (
        <span className="hidden items-center gap-1 md:flex" aria-hidden>
          {fixture.pairings.map((p) => (
            <span
              key={p.id}
              className={cn('h-2 w-2 rounded-full', DOT_CLASS[p.result] ?? 'border border-white/40')}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}

export function DashboardLeagueStrip() {
  const board: Scoreboard | undefined = useScoreboard().data;
  if (!board || !board.league) return null;

  const live =
    board.next_fixture?.status === 'in_progress'
      ? board.next_fixture
      : board.recent_fixture?.status === 'in_progress'
        ? board.recent_fixture
        : null;
  const karenName = board.league.teams?.find((t) => t.is_home_club)?.name ?? null;
  const home = board.home_standing;
  const next = board.next_fixture;

  // The CTA targets the live match when there is one, else the league page.
  const ctaTo = live ? `/league/fixtures/${live.id}` : '/league';
  const ctaLabel = live ? 'View match' : 'View league';

  return (
    <div
      data-testid="dashboard-league-strip"
      className={cn(
        'mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border p-3 sm:px-4',
        live ? 'border-azure/30 bg-azure/10' : 'border-gold/20 bg-gold/10',
      )}
    >
      {/* Brand */}
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/20 text-gold">
          <Trophy size={16} aria-hidden />
        </span>
        <span className="text-sm font-bold text-gold">Junior League</span>
      </div>

      {/* Position */}
      {home ? (
        <>
          <Divider />
          <span className="shrink-0 text-sm font-semibold text-silver">
            {shortTeam(home.team_name)}{' '}
            <span className="text-gold">{ordinal(home.rank)}</span>
            <span className="font-normal text-slate"> · {home.points} pts</span>
          </span>
        </>
      ) : null}

      {/* Live score, or next fixture */}
      <Divider />
      {live ? (
        <LiveScore fixture={live} karenName={karenName} />
      ) : (
        <span className="min-w-0 truncate text-sm text-slate">
          {next ? (
            <>
              <span className="font-semibold text-azure">Next: </span>
              {shortTeam(next.summary.home_team_name)} v {shortTeam(next.summary.away_team_name)}
              {' · '}
              {fixtureDate(next.date)}
            </>
          ) : (
            'Standings & schedule'
          )}
        </span>
      )}

      {/* CTA — pushed to the right on desktop */}
      <Link
        to={ctaTo}
        data-testid="dashboard-league-cta"
        className="ml-auto inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-azure transition-all hover:gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 rounded"
      >
        {ctaLabel}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
