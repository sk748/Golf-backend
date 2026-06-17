// Junior League OVERVIEW — shared, read-only across every signed-in role. Shows
// the current league name/year, the FULL standings table (P/W/D/L/Pts/Avg, Karen
// highlighted), and the schedule grouped by round (each fixture links to its
// detail). All scoring is computed server-side; we only display it.

import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarRange,
  ChevronRight,
  Loader2,
  PartyPopper,
  Settings,
  Star,
  Trophy,
} from 'lucide-react';

import { useAuth } from '../../auth/useAuth';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { fireGreenConfetti } from '../../features/achievements/confetti';
import {
  fixtureDate,
  fixtureStatusLabel,
  fixtureStatusTone,
  useCurrentLeague,
  useFixtures,
  useStandings,
  type Fixture,
  type League,
  type Standing,
} from './league.queries';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
      {icon}
      <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
        {title}
      </h2>
    </div>
  );
}

// ── Full standings ─────────────────────────────────────────────────────────────

function StandingsTable({ standings }: { standings: Standing[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate">
            <th scope="col" className="px-5 py-2 font-semibold">
              #
            </th>
            <th scope="col" className="py-2 font-semibold">
              Team
            </th>
            <th scope="col" className="px-3 py-2 text-center font-semibold">
              P
            </th>
            <th scope="col" className="px-3 py-2 text-center font-semibold">
              W
            </th>
            <th scope="col" className="px-3 py-2 text-center font-semibold">
              D
            </th>
            <th scope="col" className="px-3 py-2 text-center font-semibold">
              L
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Pts
            </th>
            <th scope="col" className="px-5 py-2 text-right font-semibold">
              Avg
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, i) => (
            <tr
              key={row.team_id}
              className={cn(
                'border-t border-white/5',
                row.is_home_club && 'bg-gold/5',
              )}
              data-testid={`league-standing-${row.team_id}`}
            >
              <td className="px-5 py-3 font-mono text-slate">{i + 1}</td>
              <td
                className={cn(
                  'py-3 font-semibold',
                  row.is_home_club ? 'text-gold' : 'text-silver',
                )}
              >
                {row.is_home_club ? (
                  <Star
                    className="mb-0.5 mr-1.5 inline h-3.5 w-3.5 fill-gold text-gold"
                    aria-hidden
                  />
                ) : null}
                {row.team_name}
              </td>
              <td className="px-3 py-3 text-center font-mono text-slate">
                {row.played}
              </td>
              <td className="px-3 py-3 text-center font-mono text-slate">
                {row.won}
              </td>
              <td className="px-3 py-3 text-center font-mono text-slate">
                {row.drawn}
              </td>
              <td className="px-3 py-3 text-center font-mono text-slate">
                {row.lost}
              </td>
              <td className="px-3 py-3 text-right font-mono font-bold text-silver">
                {row.points}
              </td>
              <td className="px-5 py-3 text-right font-mono text-slate">
                {row.average}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StandingsSection({ leagueId }: { leagueId: number }) {
  const query = useStandings(leagueId);
  const standings = query.data ?? [];

  return (
    <GlassCard className="overflow-hidden" data-testid="league-standings-section">
      <SectionHeader
        icon={<Trophy className="h-4 w-4 text-azure" aria-hidden />}
        title="Standings"
      />
      {query.isLoading ? (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading standings…
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="m-5 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          data-testid="league-standings-error"
        >
          {errorMessage(query.error)}
        </div>
      ) : standings.length === 0 ? (
        <p
          className="px-5 py-8 text-sm text-slate"
          data-testid="league-standings-empty"
        >
          The table fills in as fixtures are completed.
        </p>
      ) : (
        <div className="pb-2">
          <StandingsTable standings={standings} />
        </div>
      )}
    </GlassCard>
  );
}

// ── Schedule (grouped by round) ─────────────────────────────────────────────────

function FixtureRow({ fixture }: { fixture: Fixture }) {
  const { summary } = fixture;
  const showScore =
    fixture.status === 'completed' || fixture.status === 'in_progress';
  return (
    <Link
      to={`/league/fixtures/${fixture.id}`}
      className="flex items-center gap-3 border-t border-white/5 px-5 py-3 transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
      data-testid={`league-fixture-${fixture.id}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-silver">
          {summary.home_team_name ?? 'Home'}{' '}
          <span className="text-slate">v</span>{' '}
          {summary.away_team_name ?? 'Away'}
        </p>
        <p className="mt-0.5 text-xs text-slate">{fixtureDate(fixture.date)}</p>
      </div>

      {showScore ? (
        <span className="font-mono text-sm font-bold text-silver">
          {summary.home_points}–{summary.away_points}
        </span>
      ) : null}

      <Badge tone={fixtureStatusTone(fixture.status)} shape="pill">
        {fixtureStatusLabel(fixture.status)}
      </Badge>
      <ChevronRight className="h-4 w-4 text-slate" aria-hidden />
    </Link>
  );
}

function groupByRound(fixtures: Fixture[]): { round: number | null; items: Fixture[] }[] {
  const map = new Map<number | null, Fixture[]>();
  for (const f of fixtures) {
    const key = f.round_number ?? null;
    const arr = map.get(key);
    if (arr) arr.push(f);
    else map.set(key, [f]);
  }
  return Array.from(map.entries())
    .map(([round, items]) => ({ round, items }))
    .sort((a, b) => {
      // Numbered rounds first (ascending); untitled (null) last.
      if (a.round == null) return 1;
      if (b.round == null) return -1;
      return a.round - b.round;
    });
}

function ScheduleSection({ leagueId }: { leagueId: number }) {
  const query = useFixtures(leagueId);
  const fixtures = query.data ?? [];
  const groups = groupByRound(fixtures);

  return (
    <GlassCard className="overflow-hidden" data-testid="league-schedule-section">
      <SectionHeader
        icon={<CalendarRange className="h-4 w-4 text-azure" aria-hidden />}
        title="Schedule"
      />
      {query.isLoading ? (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading fixtures…
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="m-5 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          data-testid="league-schedule-error"
        >
          {errorMessage(query.error)}
        </div>
      ) : groups.length === 0 ? (
        <p
          className="px-5 py-8 text-sm text-slate"
          data-testid="league-schedule-empty"
        >
          No fixtures have been scheduled yet.
        </p>
      ) : (
        <div className="pb-2">
          {groups.map((g) => (
            <div key={g.round ?? 'other'}>
              <p className="bg-white/[0.02] px-5 py-2 text-[11px] font-bold uppercase tracking-widest text-slate">
                {g.round != null ? `Round ${g.round}` : 'Other fixtures'}
              </p>
              {g.items.map((f) => (
                <FixtureRow key={f.id} fixture={f} />
              ))}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// ── Champions celebration ───────────────────────────────────────────────────────
// When a league has finished (status 'completed') and Karen (the home-club team)
// tops the standings, fire a green confetti burst once on mount and show a
// "Champions" banner.
function ChampionsCelebration({ leagueId }: { leagueId: number }) {
  const standings = useStandings(leagueId).data;
  const fired = useRef(false);
  // Standings are returned in finishing order; rank 1 is the leader.
  const champion = standings?.[0];
  const isKarenChampion = Boolean(champion?.is_home_club);

  useEffect(() => {
    if (!isKarenChampion || fired.current) return;
    fired.current = true;
    fireGreenConfetti();
  }, [isKarenChampion]);

  if (!isKarenChampion || !champion) return null;

  return (
    <GlassCard
      className="mt-6 flex items-center gap-3 border border-emerald-500/30 bg-emerald-500/10 p-5"
      data-testid="league-champions"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
        <PartyPopper className="h-6 w-6" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-base font-black text-emerald-300">
          {champion.team_name} — Junior League Champions
        </p>
        <p className="text-sm text-emerald-200/80">
          Top of the table when the season closed. Congratulations to the team.
        </p>
      </div>
    </GlassCard>
  );
}

// Staff-only entry point to the league management page.
function ManageLeagueButton() {
  const { user } = useAuth();
  const isStaff =
    user?.role === 'admin' ||
    user?.role === 'coach' ||
    user?.role === 'committee';
  if (!isStaff) return null;
  return (
    <Link to="/league/manage" data-testid="league-manage-link">
      <Button variant="ghost" size="sm">
        <Settings className="h-4 w-4" aria-hidden />
        Manage league
      </Button>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LeagueOverviewPage() {
  const query = useCurrentLeague();
  const league: League | null = query.data?.[0] ?? null;
  const showChampions = league?.status === 'completed';

  return (
    <div className="mx-auto max-w-4xl animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold/20 text-gold">
          <Trophy className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
            Junior League
          </p>
          <h1 className="truncate text-2xl font-black text-silver">
            {league ? league.name : 'Junior League'}
            {league?.year != null ? (
              <span className="ml-2 text-base font-bold text-slate">
                {league.year}
              </span>
            ) : null}
          </h1>
        </div>
        <ManageLeagueButton />
      </div>

      {query.isLoading ? (
        <div className="mt-8 flex items-center gap-3 py-12 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading league…
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="mt-8 rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
          data-testid="league-error"
        >
          {errorMessage(query.error)}
        </div>
      ) : !league ? (
        <GlassCard
          className="mt-8 px-6 py-16 text-center"
          data-testid="league-empty"
        >
          <Trophy className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
          <p className="mt-4 text-base font-bold text-silver">
            No active league right now
          </p>
          <p className="mt-1 text-sm text-slate">
            When an inter-club season is running, the table and fixtures will
            appear here.
          </p>
        </GlassCard>
      ) : (
        <>
          {showChampions ? (
            <ChampionsCelebration leagueId={league.id} />
          ) : null}

          {league.description ? (
            <p className="mt-4 max-w-2xl text-sm text-silver/80">
              {league.description}
            </p>
          ) : null}

          <div className="mt-6 space-y-6">
            <StandingsSection leagueId={league.id} />
            <ScheduleSection leagueId={league.id} />
          </div>
        </>
      )}
    </div>
  );
}
