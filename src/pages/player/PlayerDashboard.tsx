// Student (player) dashboard. Encouraging tone for juniors, no emoji — lucide
// icons only. Charts via recharts; recent games with a hover preview panel and
// click-to-open full scorecard. All server data flows through TanStack Query
// hooks (player-games.queries.ts) and the shared api client. We only DISPLAY
// backend handicap values; the one bit of math here is gross-minus-par for
// friendly to-par labels/colours (explicitly allowed — not WHS/handicap math).

import { useMemo, useState } from 'react';
import {
  Activity,
  ChevronRight,
  Flag,
  Loader2,
  Minus,
  TrendingDown,
  Trophy,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { GlassCard } from '../../components/ui/GlassCard';
import { useAuth } from '../../auth/useAuth';
import type { Round } from '../../types/api';
import { LevelProgressCard } from './LevelProgressCard';
import { RoundScorecardModal } from './RoundScorecardModal';
import { useHandicapHistory, useRounds } from './player-games.queries';

const COURSE_PAR = 72;
const RECENT_LIMIT = 6;

const TOOLTIP_STYLE = {
  backgroundColor: '#012349',
  border: '1px solid rgba(0,130,205,0.3)',
  borderRadius: '12px',
  color: '#F4F4F6',
} as const;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// gross - 72 as E / +n / -n (display scoring, not handicap math).
function toParLabel(gross: number): string {
  const diff = gross - COURSE_PAR;
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

function toParTone(gross: number): string {
  const diff = gross - COURSE_PAR;
  if (diff <= 0) return 'text-emerald-400';
  if (diff <= 3) return 'text-gold';
  return 'text-red-400';
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function firstName(full?: string | null): string {
  if (!full) return 'there';
  const trimmed = full.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : 'there';
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
    <div className="flex items-center gap-2 text-sm text-slate" data-testid={testId}>
      <Loader2 size={18} className="animate-spin text-azure" />
      {label}
    </div>
  );
}

interface TrendPoint {
  date: string;
  label: string;
  handicap: number;
}

interface ScorePoint {
  date: string;
  label: string;
  gross: number;
}

export function PlayerDashboard() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const rounds = useRounds();
  const history = useHandicapHistory(userId);

  const [activeRound, setActiveRound] = useState<Round | null>(null);
  const [previewRound, setPreviewRound] = useState<Round | null>(null);

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

  // Latest vs previous handicap, for the hero trend chip.
  const latestHcp = trendData.length ? trendData[trendData.length - 1].handicap : null;
  const prevHcp = trendData.length > 1 ? trendData[trendData.length - 2].handicap : null;

  // Hero index: prefer the computed current value, fall back to latest history.
  const heroIndex =
    user?.current_hcp_index != null
      ? user.current_hcp_index
      : latestHcp != null
        ? latestHcp
        : null;

  // Recent scores (oldest -> newest for a left-to-right progression chart).
  const scoreData = useMemo<ScorePoint[]>(() => {
    const recent = (rounds.data ?? []).slice(0, RECENT_LIMIT);
    return [...recent].reverse().map((r) => ({
      date: r.date_played,
      label: shortDate(r.date_played),
      gross: r.gross_score,
    }));
  }, [rounds.data]);

  const recentGames = useMemo(
    () => (rounds.data ?? []).slice(0, RECENT_LIMIT),
    [rounds.data],
  );

  // The card shown in the desktop side preview: hovered game, else the newest.
  const shownPreview = previewRound ?? recentGames[0] ?? null;

  return (
    <div className="animate-fade-in-up mx-auto max-w-5xl">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Your golf
      </p>
      <h1 className="mt-1 text-2xl font-black text-silver sm:text-3xl">
        Hi, {firstName(user?.full_name)} — here&apos;s your golf
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        Every round is progress. Keep playing and watch your game grow.
      </p>

      {/* ── 1) HERO: handicap index + trend chip ─────────────────────────── */}
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

          {/* Trend chip — lower is better in golf, so DOWN = good (encouraging). */}
          {latestHcp != null && prevHcp != null && (
            <div data-testid="hero-trend">
              {latestHcp < prevHcp ? (
                <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-400">
                  <TrendingDown size={18} />
                  Improving — nice work!
                </span>
              ) : latestHcp > prevHcp ? (
                <span className="inline-flex items-center gap-2 rounded-xl bg-slate/15 px-3 py-2 text-sm font-bold text-slate">
                  <Minus size={18} />
                  Steady — keep at it
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-xl bg-slate/15 px-3 py-2 text-sm font-bold text-slate">
                  <Minus size={18} />
                  Holding steady
                </span>
              )}
            </div>
          )}
        </div>
      </GlassCard>

      {/* ── 2 + 3) Charts ────────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Handicap trend */}
        <GlassCard className="stagger-2 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-silver">Handicap trend</h2>
            <span className="text-xs text-slate">lower is better</span>
          </div>
          <div className="mt-4 h-56">
            {history.isLoading ? (
              <Loading label="Loading your trend…" testId="trend-loading" />
            ) : history.isError ? (
              <ErrorPanel
                message={errorMessage(history.error, 'Could not load your handicap trend.')}
                testId="trend-error"
              />
            ) : trendData.length === 0 ? (
              <div
                className="flex h-full flex-col items-center justify-center text-center"
                data-testid="trend-empty"
              >
                <Activity size={28} className="text-azure/60" />
                <p className="mt-2 text-sm text-slate">
                  Play a round to start tracking.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="hcpGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0082CD" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#0082CD" stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                    fill="url(#hcpGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </GlassCard>

        {/* Recent scores */}
        <GlassCard className="stagger-3 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-silver">Recent scores</h2>
            <span className="text-xs text-slate">gross per round</span>
          </div>
          <div className="mt-4 h-56">
            {rounds.isLoading ? (
              <Loading label="Loading your scores…" testId="scores-loading" />
            ) : rounds.isError ? (
              <ErrorPanel
                message={errorMessage(rounds.error, 'Could not load your scores.')}
                testId="scores-error"
              />
            ) : scoreData.length === 0 ? (
              <div
                className="flex h-full flex-col items-center justify-center text-center"
                data-testid="scores-empty"
              >
                <Flag size={28} className="text-azure/60" />
                <p className="mt-2 text-sm text-slate">
                  Your scores will show up here after your first round.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
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
                    domain={['dataMin - 2', 'dataMax + 2']}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,130,205,0.08)' }}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: '#64748B' }}
                    formatter={(value) => [value as number, 'Gross']}
                  />
                  <Bar dataKey="gross" fill="#0082CD" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </GlassCard>
      </div>

      {/* ── 4) Level & progress ──────────────────────────────────────────── */}
      <div className="stagger-4 mt-6">
        <LevelProgressCard />
      </div>

      {/* ── 5) Recent games: list + hover preview, click opens scorecard ─── */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-black text-silver">Recent games</h2>
          <span className="text-xs text-slate">Tap a game to see every hole</span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {/* Games list (2 cols on desktop) */}
          <div className="lg:col-span-2">
            {rounds.isLoading ? (
              <Loading label="Loading your games…" testId="games-loading" />
            ) : rounds.isError ? (
              <ErrorPanel
                message={errorMessage(rounds.error, 'Could not load your games.')}
                testId="games-error"
              />
            ) : recentGames.length === 0 ? (
              <GlassCard className="p-6 text-center" data-testid="games-empty">
                <Flag size={28} className="mx-auto text-azure/60" />
                <p className="mt-2 text-sm text-slate">
                  No games yet — your first round is waiting for you.
                </p>
              </GlassCard>
            ) : (
              <ul className="flex flex-col gap-3" data-testid="games-list">
                {recentGames.map((round) => (
                  <li key={round.id}>
                    <button
                      type="button"
                      onClick={() => setActiveRound(round)}
                      onMouseEnter={() => setPreviewRound(round)}
                      onMouseLeave={() => setPreviewRound(null)}
                      onFocus={() => setPreviewRound(round)}
                      onBlur={() => setPreviewRound(null)}
                      data-testid={`game-row-${round.id}`}
                      className={cn(
                        'glass-light flex w-full items-center gap-4 rounded-xl p-4 text-left transition-all',
                        'hover:-translate-y-0.5 hover:border hover:border-azure/40',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50',
                      )}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-azure/15">
                        {round.competition_name ? (
                          <Trophy size={18} className="text-azure" />
                        ) : (
                          <Flag size={18} className="text-azure" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-silver">
                          {round.competition_name ?? round.round_type}
                        </span>
                        <span className="block text-xs text-slate">
                          {shortDate(round.date_played)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-mono text-lg font-black text-silver">
                          {round.gross_score}
                        </span>
                        <span
                          className={cn(
                            'block font-mono text-xs font-bold',
                            toParTone(round.gross_score),
                          )}
                        >
                          {toParLabel(round.gross_score)}
                        </span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-slate" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Desktop hover-preview panel */}
          {shownPreview && (
            <GlassCard
              className="hidden p-5 lg:block"
              data-testid="game-preview"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-azure">
                {previewRound ? 'Quick look' : 'Latest game'}
              </p>
              <h3 className="mt-1 truncate text-sm font-bold text-silver">
                {shownPreview.competition_name ?? shownPreview.round_type}
              </h3>
              <p className="text-xs text-slate">{shortDate(shownPreview.date_played)}</p>

              <div className="mt-4 flex items-baseline gap-3">
                <span className="font-mono text-3xl font-black text-azure">
                  {shownPreview.gross_score}
                </span>
                <span
                  className={cn(
                    'font-mono text-sm font-bold',
                    toParTone(shownPreview.gross_score),
                  )}
                >
                  {toParLabel(shownPreview.gross_score)}
                </span>
              </div>

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate">Differential</dt>
                  <dd className="font-mono text-silver">
                    {shownPreview.score_differential ?? '—'}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate">Handicap</dt>
                  <dd className="font-mono text-silver">
                    {shownPreview.handicap_before ?? '—'}
                    <span className="mx-1 text-slate">→</span>
                    {shownPreview.handicap_after ?? '—'}
                  </dd>
                </div>
              </dl>

              <p className="mt-4 text-xs text-slate">Tap the game to open the full scorecard.</p>
            </GlassCard>
          )}
        </div>
      </div>

      {/* Scorecard modal */}
      {activeRound && (
        <RoundScorecardModal round={activeRound} onClose={() => setActiveRound(null)} />
      )}
    </div>
  );
}
