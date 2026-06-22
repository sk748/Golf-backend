// Player (student) handicap detail page. Motivating, kid-friendly tone — no
// emoji, lucide icons only. Shows the full handicap history (hero index + trend
// chart) and every round the player has logged. All server data flows through
// the shared TanStack Query hooks (player-games.queries.ts) and the api client.
// We only DISPLAY backend handicap values (current_hcp_index, handicap_after,
// score_differential) — no WHS/handicap recomputation. The only "math" here is
// selecting min/latest values and formatting them for display (explicitly
// allowed), never deriving a handicap index or differential.

import { useMemo } from 'react';
import { Flag, Loader2, Target, TrendingDown } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { GlassCard } from '../../components/ui/GlassCard';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../auth/useAuth';
import type { Round } from '../../types/api';
import { useHandicapHistory, useRounds } from './player-games.queries';
import {
  isPendingRound,
  isPracticeRound,
} from '../scoring/round-entry.queries';

// Small verification/practice badge pair for a round row. Additive display of
// the API's status / counts_toward_handicap fields — renders nothing for a
// normal verified, counting round.
function RoundFlags({ round }: { round: Round }) {
  const pending = isPendingRound(round);
  const practice = isPracticeRound(round);
  if (!pending && !practice) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {pending && (
        <Badge tone="gold" className="px-1.5 py-0.5 text-[10px]">
          Awaiting verification
        </Badge>
      )}
      {practice && (
        <Badge tone="slate" className="px-1.5 py-0.5 text-[10px]">
          Practice
        </Badge>
      )}
    </span>
  );
}

const TOOLTIP_STYLE = {
  backgroundColor: '#012349',
  border: '1px solid rgba(0,130,205,0.3)',
  borderRadius: '12px',
  color: '#F4F4F6',
} as const;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function fullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Round label: prefer the competition name, fall back to the round type.
function roundLabel(r: Round): string {
  return r.competition_name ?? r.round_type;
}

// Handicap progression for one round: "20.2 → 19.1", or just the after value,
// or '—' when nothing is recorded. Pure display formatting of backend values.
function handicapLabel(r: Round): string {
  const before = r.handicap_before;
  const after = r.handicap_after;
  if (before != null && after != null) return `${before} → ${after}`;
  if (after != null) return `${after}`;
  if (before != null) return `${before}`;
  return '—';
}

function ErrorPanel({ message, testId }: { message: string; testId?: string }) {
  return (
    <div
      className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
      role="alert"
      data-testid={testId}
    >
      {message}
    </div>
  );
}

function Loading({ label, testId }: { label: string; testId?: string }) {
  return (
    <div
      className="flex items-center gap-2 text-sm text-slate"
      role="status"
      data-testid={testId}
    >
      <Loader2 size={18} className="animate-spin text-azure" aria-hidden="true" />
      {label}
    </div>
  );
}

interface TrendPoint {
  date: string;
  label: string;
  handicap: number;
}

export function PlayerHandicapPage() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const rounds = useRounds();
  const history = useHandicapHistory(userId);

  // Handicap trend points (oldest -> newest), only rounds that have a value.
  const trendData = useMemo<TrendPoint[]>(() => {
    return (history.data ?? [])
      .filter((r) => r.handicap_after != null)
      .map((r) => ({
        date: r.date_played,
        label: shortDate(r.date_played),
        handicap: r.handicap_after as number,
      }));
  }, [history.data]);

  // Latest vs previous handicap_after, for the hero trend chip.
  const latestHcp = trendData.length ? trendData[trendData.length - 1].handicap : null;
  const prevHcp = trendData.length > 1 ? trendData[trendData.length - 2].handicap : null;

  // Hero index: prefer the computed current value, fall back to latest history.
  const heroIndex =
    user?.current_hcp_index != null
      ? user.current_hcp_index
      : latestHcp != null
        ? latestHcp
        : null;

  const allRounds = useMemo(() => rounds.data ?? [], [rounds.data]);

  // Best (lowest) handicap on record — min of handicap_after across history.
  const bestHandicap = useMemo<number | null>(() => {
    const values = (history.data ?? [])
      .map((r) => r.handicap_after)
      .filter((v): v is number => v != null);
    return values.length ? Math.min(...values) : null;
  }, [history.data]);

  // Best (lowest) gross score across all rounds.
  const bestGross = useMemo<number | null>(() => {
    const values = allRounds
      .map((r) => r.gross_score)
      .filter((v): v is number => v != null);
    return values.length ? Math.min(...values) : null;
  }, [allRounds]);

  return (
    <div
      className="animate-fade-in-up mx-auto max-w-4xl"
      data-testid="handicap-page"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Your progress
      </p>
      <h1 className="mt-1 text-2xl font-black text-silver sm:text-3xl">
        Your handicap journey
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        Every round teaches you something. Watch your handicap drop as you grow —
        lower is better, and you&apos;ve got this.
      </p>

      {/* ── 1) HERO: current handicap index + trend chip ─────────────────── */}
      <GlassCard className="stagger-1 mt-6 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate">
              Handicap index
            </p>
            <p
              className="mt-1 font-mono text-5xl font-black leading-none text-azure sm:text-6xl"
              data-testid="hero-handicap"
            >
              {heroIndex != null ? heroIndex : '—'}
            </p>
          </div>

          {/* Trend chip — lower is better, so DOWN = improving (encouraging). */}
          {latestHcp != null && prevHcp != null && (
            <div data-testid="hero-trend">
              {latestHcp < prevHcp ? (
                <Badge
                  tone="emerald"
                  className="gap-2 px-3 py-2 text-sm"
                  data-testid="hero-trend-down"
                >
                  <TrendingDown size={18} aria-hidden="true" />
                  Improving — nice work!
                </Badge>
              ) : latestHcp > prevHcp ? (
                <Badge tone="slate" className="gap-2 px-3 py-2 text-sm">
                  Holding steady — keep going
                </Badge>
              ) : (
                <Badge tone="slate" className="gap-2 px-3 py-2 text-sm">
                  Holding steady — keep going
                </Badge>
              )}
            </div>
          )}
        </div>
      </GlassCard>

      {/* ── 2) STAT ROW ──────────────────────────────────────────────────── */}
      <div className="stagger-2 mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={TrendingDown}
          value={
            <span className="font-mono">
              {bestHandicap != null ? bestHandicap : '—'}
            </span>
          }
          label="Best handicap"
          testId="stat-best-handicap"
        />
        <StatCard
          icon={Flag}
          value={<span className="font-mono">{allRounds.length}</span>}
          label="Rounds played"
          testId="stat-rounds-played"
        />
        <StatCard
          icon={Target}
          value={
            <span className="font-mono">{bestGross != null ? bestGross : '—'}</span>
          }
          label="Best gross"
          testId="stat-best-gross"
        />
      </div>

      {/* ── 3) HANDICAP TREND CHART ──────────────────────────────────────── */}
      <GlassCard className="stagger-3 mt-6 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-bold text-silver">Handicap trend</h2>
          <span className="text-xs text-slate">lower is better</span>
        </div>
        <div className="mt-4 h-64">
          {history.isLoading ? (
            <Loading label="Loading your handicap history…" testId="trend-loading" />
          ) : history.isError ? (
            <ErrorPanel
              message={errorMessage(
                history.error,
                'Could not load your handicap history.',
              )}
              testId="trend-error"
            />
          ) : trendData.length === 0 ? (
            <div
              className="flex h-full flex-col items-center justify-center text-center"
              data-testid="trend-empty"
            >
              <TrendingDown size={28} className="text-azure/60" aria-hidden="true" />
              <p className="mt-2 text-sm text-slate">
                Play rounds to build your handicap history.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={trendData}
                margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
              >
                <defs>
                  <linearGradient id="hcpAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0082CD" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0082CD" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(100,116,139,0.12)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: '#64748B' }}
                  formatter={(value) => [value as number, 'Handicap']}
                />
                <Area
                  type="monotone"
                  dataKey="handicap"
                  stroke="#0082CD"
                  strokeWidth={2}
                  fill="url(#hcpAreaGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </GlassCard>

      {/* ── 4) ALL ROUNDS ────────────────────────────────────────────────── */}
      <div className="stagger-4 mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-black text-silver">All your rounds</h2>
          <span className="text-xs text-slate">newest first</span>
        </div>

        <div className="mt-4">
          {rounds.isLoading ? (
            <Loading label="Loading your rounds…" testId="rounds-loading" />
          ) : rounds.isError ? (
            <ErrorPanel
              message={errorMessage(rounds.error, 'Could not load your rounds.')}
              testId="rounds-error"
            />
          ) : allRounds.length === 0 ? (
            <GlassCard className="p-6 text-center" data-testid="rounds-empty">
              <Flag size={28} className="mx-auto text-azure/60" aria-hidden="true" />
              <p className="mt-2 text-sm text-slate">
                No rounds yet — your first one is waiting for you. Go play!
              </p>
            </GlassCard>
          ) : (
            <>
              {/* Mobile (<md): stacked cards */}
              <ul className="flex flex-col gap-3 md:hidden" data-testid="rounds-cards">
                {allRounds.map((round) => (
                  <li key={round.id}>
                    <GlassCard
                      tone="light"
                      className="p-4"
                      data-testid={`round-row-${round.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-silver">
                            {roundLabel(round)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate">
                            {fullDate(round.date_played)}
                          </p>
                          <div className="mt-1">
                            <RoundFlags round={round} />
                          </div>
                        </div>
                        <span className="shrink-0 text-right">
                          <span className="block font-mono text-xl font-black text-silver">
                            {round.gross_score}
                          </span>
                          <span className="block text-[10px] uppercase tracking-wider text-slate">
                            gross
                          </span>
                        </span>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-slate">Differential</dt>
                          <dd className="font-mono text-silver">
                            {round.score_differential ?? '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate">Handicap</dt>
                          <dd className="font-mono text-silver">
                            {handicapLabel(round)}
                          </dd>
                        </div>
                      </dl>
                    </GlassCard>
                  </li>
                ))}
              </ul>

              {/* Desktop (md+): table */}
              <GlassCard className="hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">
                      All rounds with date, type, gross score, differential and
                      handicap.
                    </caption>
                    <thead>
                      <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-slate">
                        <th scope="col" className="px-4 py-3 font-bold">
                          Date
                        </th>
                        <th scope="col" className="px-4 py-3 font-bold">
                          Type
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-bold">
                          Gross
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-bold">
                          Differential
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-bold">
                          Handicap
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {allRounds.map((round) => (
                        <tr
                          key={round.id}
                          data-testid={`round-row-${round.id}`}
                          className={cn(
                            'border-b border-white/5 last:border-0',
                            'transition-colors hover:bg-azure/5',
                          )}
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-silver">
                            {fullDate(round.date_played)}
                          </td>
                          <td className="px-4 py-3 text-silver">
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              {roundLabel(round)}
                              <RoundFlags round={round} />
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold text-silver">
                            {round.gross_score}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-silver">
                            {round.score_differential ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-silver">
                            {handicapLabel(round)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
