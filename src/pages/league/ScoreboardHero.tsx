// The Junior League SPLIT HERO (locked design). Two halves in one GlassCard:
//
//  LEFT  — the live/most-relevant match: a big home-vs-away head-to-head with
//          the aggregate score, a row of pairing dots coloured by each pairing's
//          result, a status chip (Live / Final / Upcoming) and a "View match"
//          link. The Karen (is_home_club) side is highlighted.
//  RIGHT — a mini standings table (top 5) with the Karen row starred, a
//          "Next: <home> v <away> · <date>" chip, and a "Full table" link.
//
// `source` chooses the scoreboard hook: 'auth' (in-app dashboards, scoped) or
// 'public' (logged-out landing). Renders NOTHING when there is no current
// league, so it can be dropped onto any dashboard and self-hide.

import { Link } from 'react-router-dom';
import { ArrowRight, Star, Trophy } from 'lucide-react';

import { cn } from '../../lib/cn';
import { GlassCard } from '../../components/ui/GlassCard';
import {
  fixtureDate,
  fixtureStatusLabel,
  type Fixture,
  type Scoreboard,
  type Standing,
  useScoreboard,
  usePublicScoreboard,
} from './league.queries';

// Pick the match to feature on the left: a live (in_progress) next fixture wins;
// otherwise the most recent completed fixture.
function featuredMatch(board: Scoreboard): Fixture | null {
  if (board.next_fixture && board.next_fixture.status === 'in_progress') {
    return board.next_fixture;
  }
  return board.recent_fixture ?? board.next_fixture ?? null;
}

// Pairing dot colour by result (home_win=azure, away_win=slate, halved=gold,
// pending=hollow outline).
const DOT_CLASS: Record<string, string> = {
  home_win: 'bg-azure',
  away_win: 'bg-slate',
  halved: 'bg-gold',
};

function PairingDots({ fixture }: { fixture: Fixture }) {
  if (fixture.pairings.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-hidden>
      {fixture.pairings.map((p) => (
        <span
          key={p.id}
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            DOT_CLASS[p.result] ?? 'border border-white/40',
          )}
          title={p.result}
        />
      ))}
    </div>
  );
}

function StatusChip({ fixture }: { fixture: Fixture }) {
  const live = fixture.status === 'in_progress';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest',
        live
          ? 'bg-azure/20 text-azure'
          : fixture.status === 'completed'
            ? 'bg-emerald-500/15 text-emerald-400'
            : 'bg-gold/15 text-gold',
      )}
      data-testid="league-hero-status"
    >
      {live ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-azure opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-azure" />
        </span>
      ) : null}
      {fixtureStatusLabel(fixture.status)}
    </span>
  );
}

// One side of the head-to-head; the Karen side is brighter and bolder.
function MatchSide({
  name,
  points,
  isHome,
  highlight,
  align,
}: {
  name: string;
  points: number;
  isHome: boolean;
  highlight: boolean;
  align: 'left' | 'right';
}) {
  return (
    <div className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
      <p
        className={cn(
          'truncate text-sm font-bold sm:text-base',
          highlight ? 'text-gold' : 'text-silver',
        )}
        title={name}
      >
        {highlight ? (
          <Star
            className="mb-0.5 mr-1 inline h-3.5 w-3.5 fill-gold text-gold"
            aria-hidden
          />
        ) : null}
        {name}
      </p>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-slate">
        {isHome ? 'Home' : 'Away'}
      </p>
      <p
        className={cn(
          'mt-2 font-mono text-4xl font-black sm:text-5xl',
          highlight ? 'text-gold' : 'text-silver',
        )}
      >
        {points}
      </p>
    </div>
  );
}

function FeaturedMatch({ fixture }: { fixture: Fixture }) {
  const { summary } = fixture;
  const homeName = summary.home_team_name ?? 'Home';
  const awayName = summary.away_team_name ?? 'Away';

  return (
    <div className="flex h-full flex-col" data-testid="league-hero-match">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
          {fixture.round_number != null
            ? `Round ${fixture.round_number}`
            : 'Match'}
        </p>
        <StatusChip fixture={fixture} />
      </div>

      <div className="mt-5 flex items-end gap-3">
        <MatchSide
          name={homeName}
          points={summary.home_points}
          isHome
          highlight={false}
          align="left"
        />
        <span className="pb-3 text-lg font-black text-slate">v</span>
        <MatchSide
          name={awayName}
          points={summary.away_points}
          isHome={false}
          highlight={false}
          align="right"
        />
      </div>

      <PairingDots fixture={fixture} />

      <p className="mt-3 text-xs text-slate">{fixtureDate(fixture.date)}</p>

      <div className="mt-auto pt-5">
        <Link
          to={`/league/fixtures/${fixture.id}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-azure transition-all hover:gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 rounded"
          data-testid="league-hero-view-match"
        >
          View match
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function MiniStandings({
  standings,
  nextFixture,
}: {
  standings: Standing[];
  nextFixture: Fixture | null;
}) {
  const top = standings.slice(0, 5);
  return (
    <div className="flex h-full flex-col" data-testid="league-hero-standings">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Standings
      </p>

      {top.length === 0 ? (
        <p className="mt-5 text-sm text-slate" data-testid="league-hero-standings-empty">
          No results yet — the table fills in as matches are played.
        </p>
      ) : (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate">
              <th scope="col" className="py-1.5 font-semibold">
                #
              </th>
              <th scope="col" className="py-1.5 font-semibold">
                Team
              </th>
              <th scope="col" className="py-1.5 text-center font-semibold">
                P
              </th>
              <th scope="col" className="py-1.5 text-center font-semibold">
                W
              </th>
              <th scope="col" className="py-1.5 text-center font-semibold">
                D
              </th>
              <th scope="col" className="py-1.5 text-center font-semibold">
                L
              </th>
              <th scope="col" className="py-1.5 text-right font-semibold">
                Pts
              </th>
            </tr>
          </thead>
          <tbody>
            {top.map((row, i) => (
              <tr
                key={row.team_id}
                className={cn(
                  'border-t border-white/5',
                  row.is_home_club && 'bg-gold/5',
                )}
                data-testid={`league-hero-standing-${row.team_id}`}
              >
                <td className="py-2 font-mono text-slate">{i + 1}</td>
                <td
                  className={cn(
                    'max-w-[8rem] truncate py-2 font-semibold',
                    row.is_home_club ? 'text-gold' : 'text-silver',
                  )}
                  title={row.team_name}
                >
                  {row.is_home_club ? (
                    <Star
                      className="mb-0.5 mr-1 inline h-3 w-3 fill-gold text-gold"
                      aria-hidden
                    />
                  ) : null}
                  {row.team_name}
                </td>
                <td className="py-2 text-center font-mono text-slate">
                  {row.played}
                </td>
                <td className="py-2 text-center font-mono text-slate">
                  {row.won}
                </td>
                <td className="py-2 text-center font-mono text-slate">
                  {row.drawn}
                </td>
                <td className="py-2 text-center font-mono text-slate">
                  {row.lost}
                </td>
                <td className="py-2 text-right font-mono font-bold text-silver">
                  {row.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {nextFixture ? (
        <p
          className="mt-4 rounded-xl bg-white/5 px-3 py-2 text-xs text-silver/80"
          data-testid="league-hero-next"
        >
          <span className="font-semibold text-azure">Next: </span>
          {nextFixture.summary.home_team_name ?? 'Home'} v{' '}
          {nextFixture.summary.away_team_name ?? 'Away'} ·{' '}
          {fixtureDate(nextFixture.date)}
        </p>
      ) : null}

      <div className="mt-auto pt-5">
        <Link
          to="/league"
          className="inline-flex items-center gap-1 text-sm font-semibold text-azure transition-all hover:gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 rounded"
          data-testid="league-hero-full-table"
        >
          Full table
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

export function ScoreboardHero({ source }: { source: 'auth' | 'public' }) {
  // Both hooks are called unconditionally (Rules of Hooks); `enabled` toggles
  // which one actually fetches, so the unused one stays idle.
  const authBoard = useScoreboard();
  const publicBoard = usePublicScoreboard();
  const query = source === 'auth' ? authBoard : publicBoard;

  const board = query.data;
  // Self-hide until there is a current league to show.
  if (!board || !board.league) return null;

  const match = featuredMatch(board);

  return (
    <GlassCard
      className="animate-fade-in-up mb-6 overflow-hidden p-6 sm:p-7"
      data-testid="league-scoreboard-hero"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/20 text-gold">
          <Trophy size={18} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
            Junior League
          </p>
          <h2 className="truncate text-lg font-black text-silver" title={board.league.name}>
            {board.league.name}
            {board.league.year != null ? (
              <span className="ml-2 text-sm font-bold text-slate">
                {board.league.year}
              </span>
            ) : null}
          </h2>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:gap-8">
        {/* LEFT — featured match */}
        <div className="lg:border-r lg:border-white/5 lg:pr-8">
          {match ? (
            <FeaturedMatch fixture={match} />
          ) : (
            <div
              className="flex h-full min-h-[10rem] flex-col items-center justify-center gap-2 text-center"
              data-testid="league-hero-no-match"
            >
              <Trophy className="h-8 w-8 text-slate/50" aria-hidden />
              <p className="text-sm font-medium text-silver">No matches yet</p>
              <p className="max-w-xs text-xs text-slate">
                Fixtures will appear here once the season gets under way.
              </p>
            </div>
          )}
        </div>

        {/* RIGHT — mini standings */}
        <MiniStandings standings={board.standings} nextFixture={board.next_fixture} />
      </div>
    </GlassCard>
  );
}
