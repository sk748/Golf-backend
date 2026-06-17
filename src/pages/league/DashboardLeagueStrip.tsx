// Compact Junior League widget for the DASHBOARD (not the rich landing hero).
//
//  • Default (no live match): a subdued strip, sized like the announcement
//    banner — Karen's current position + the next fixture, linking to /league.
//    The full standings table lives on the /league page, not here.
//  • Live (a fixture is in_progress): a more prominent card focused on the
//    SCORE — head-to-head aggregate + pairing dots — linking to the match.
//
// Self-hides when there is no current league. Owns its bottom margin so a
// hidden widget leaves no gap.

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

// First word of a club name — keeps the live card compact (e.g. "Royal").
function shortTeam(name: string | null): string {
  if (!name) return 'TBD';
  return name.split(' ')[0];
}

// ── Live card: focus on the score ─────────────────────────────────────────────

function LiveCard({ fixture, karenName }: { fixture: Fixture; karenName: string | null }) {
  const { summary } = fixture;
  const homeIsKaren = karenName != null && summary.home_team_name === karenName;
  const awayIsKaren = karenName != null && summary.away_team_name === karenName;

  return (
    <Link
      to={`/league/fixtures/${fixture.id}`}
      data-testid="dashboard-league-live"
      className="mb-4 block animate-fade-in rounded-2xl border border-azure/30 bg-azure/10 p-4 transition-colors hover:bg-azure/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-azure">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-azure opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-azure" />
          </span>
          Live{fixture.round_number != null ? ` · Round ${fixture.round_number}` : ''}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-azure">
          View match <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3 sm:gap-5">
        <span
          className={cn(
            'flex-1 truncate text-right text-sm font-bold sm:text-base',
            homeIsKaren ? 'text-gold' : 'text-silver',
          )}
          title={summary.home_team_name ?? undefined}
        >
          {shortTeam(summary.home_team_name)}
        </span>
        <span className="shrink-0 font-mono text-2xl font-black text-silver sm:text-3xl">
          {summary.home_points}
          <span className="mx-1.5 text-slate">–</span>
          {summary.away_points}
        </span>
        <span
          className={cn(
            'flex-1 truncate text-left text-sm font-bold sm:text-base',
            awayIsKaren ? 'text-gold' : 'text-silver',
          )}
          title={summary.away_team_name ?? undefined}
        >
          {shortTeam(summary.away_team_name)}
        </span>
      </div>

      {fixture.pairings.length > 0 ? (
        <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
          {fixture.pairings.map((p) => (
            <span
              key={p.id}
              className={cn(
                'h-2 w-2 rounded-full',
                DOT_CLASS[p.result] ?? 'border border-white/40',
              )}
            />
          ))}
        </div>
      ) : null}
    </Link>
  );
}

// ── Subdued strip: position + next fixture ────────────────────────────────────

function PositionStrip({ board }: { board: Scoreboard }) {
  const home = board.home_standing;
  const next = board.next_fixture;

  return (
    <Link
      to="/league"
      data-testid="dashboard-league-strip"
      className="mb-4 flex items-center gap-3 rounded-2xl border border-gold/20 bg-gold/10 p-3 transition-colors hover:bg-gold/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-gold">
        <Trophy size={18} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-silver">
          <span className="text-gold">Junior League</span>
          {home ? (
            <>
              {' · '}
              {shortTeam(home.team_name)} {ordinal(home.rank)}
              <span className="font-normal text-slate"> · {home.points} pts</span>
            </>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate">
          {next
            ? `Next: ${shortTeam(next.summary.home_team_name)} v ${shortTeam(next.summary.away_team_name)} · ${fixtureDate(next.date)}`
            : 'Standings & schedule'}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-gold" aria-hidden />
    </Link>
  );
}

export function DashboardLeagueStrip() {
  const board = useScoreboard().data;
  if (!board || !board.league) return null;

  // A live match takes over the strip with a score-focused card.
  const live =
    board.next_fixture?.status === 'in_progress'
      ? board.next_fixture
      : board.recent_fixture?.status === 'in_progress'
        ? board.recent_fixture
        : null;

  const karenName = board.league.teams?.find((t) => t.is_home_club)?.name ?? null;

  return live ? (
    <LiveCard fixture={live} karenName={karenName} />
  ) : (
    <PositionStrip board={board} />
  );
}
