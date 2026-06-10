import {
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Flag,
  Loader2,
  Lock,
  MessageSquareText,
  Sparkles,
  Star,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { GlassCard } from '../../components/ui/GlassCard';
import { Badge } from '../../components/ui/Badge';
import { CompetitionHistory } from '../tournaments/CompetitionHistory';
import type {
  JuniorProgress,
  LevelBand,
  LevelBenchmark,
  PlayerFeedback,
} from '../../types/api';
import {
  useJuniorProgress,
  useLevelBands,
  useLevelBenchmarks,
  useMyFeedback,
  useMyJunior,
} from './player-progress.queries';

// The development plan tops out at level 9. Used to detect the "Elite" summit.
const TOP_LEVEL = 9;
const ALL_LEVELS = Array.from({ length: TOP_LEVEL }, (_, i) => i + 1);

// Normalize any thrown value into a user-facing message.
function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// Find the band whose [min_level, max_level] window contains a given level.
function bandForLevel(
  bands: LevelBand[] | undefined,
  level: number,
): LevelBand | undefined {
  return bands?.find((b) => level >= b.min_level && level <= b.max_level);
}

function benchmarkForLevel(
  benchmarks: LevelBenchmark[] | undefined,
  level: number,
): LevelBenchmark | undefined {
  return benchmarks?.find((b) => b.level_number === level);
}

// The newest evaluation (by report_month) acts as a fallback "current
// assessment" when no signed coach feedback exists yet.
function latestEvaluation(progress: JuniorProgress | undefined) {
  if (!progress?.evaluations?.length) return undefined;
  return [...progress.evaluations].sort((a, b) =>
    (b.report_month ?? '').localeCompare(a.report_month ?? ''),
  )[0];
}

// ── Shared bits ────────────────────────────────────────────────────────────

function ErrorPanel({ message, testId }: { message: string; testId?: string }) {
  return (
    <div
      className="rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
      role="alert"
      data-testid={testId}
    >
      {message}
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-azure/15">
        <Icon size={16} className="text-azure" aria-hidden />
      </span>
      <div>
        <h2 className="text-sm font-bold text-silver">{title}</h2>
        {hint ? <p className="text-xs text-slate">{hint}</p> : null}
      </div>
    </div>
  );
}

// Accessible progress bar comparing a count to a target (not handicap math).
function SessionsBar({
  present,
  target,
}: {
  present: number;
  target: number;
}) {
  const safeTarget = target > 0 ? target : 0;
  const pct =
    safeTarget > 0 ? Math.min(100, Math.round((present / safeTarget) * 100)) : 0;
  const done = safeTarget > 0 && present >= safeTarget;
  return (
    <div data-testid="sessions-progress">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-slate">
          Practice sessions
        </span>
        <span className="font-mono text-sm font-bold text-silver">
          <span className={cn(done ? 'text-emerald-400' : 'text-azure')}>
            {present}
          </span>
          <span className="text-slate"> / {safeTarget || '—'}</span>
        </span>
      </div>
      <div
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={present}
        aria-valuemin={0}
        aria-valuemax={safeTarget || undefined}
        aria-label={`${present} of ${safeTarget} sessions completed`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all',
            done ? 'bg-emerald-400' : 'bg-azure',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-slate">
        {safeTarget <= 0
          ? 'Keep showing up — every session counts.'
          : done
            ? 'Sessions target reached — awesome work!'
            : `${Math.max(0, safeTarget - present)} more to hit your target. You've got this!`}
      </p>
    </div>
  );
}

// Labelled grid of the four skill targets for a level (font-mono numbers).
function BenchmarkGrid({
  benchmark,
  testId,
}: {
  benchmark: LevelBenchmark;
  testId?: string;
}) {
  const cells: { label: string; value: number }[] = [
    { label: 'Full swing', value: benchmark.full_swing_target },
    { label: 'Around green', value: benchmark.around_green_target },
    { label: 'Putting', value: benchmark.putting_target },
    { label: '9-hole', value: benchmark.nine_hole_target },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" data-testid={testId}>
      {cells.map((c) => (
        <div
          key={c.label}
          className="glass-light rounded-xl p-3 text-center"
          data-testid={`benchmark-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        >
          <p className="font-mono text-xl font-black text-silver">{c.value}</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-slate">
            {c.label}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Next-level spotlight (the hero) ──────────────────────────────────────────

function NextLevelSpotlight({
  currentLevel,
  bands,
  benchmarks,
  progress,
  feedback,
}: {
  currentLevel: number;
  bands: LevelBand[] | undefined;
  benchmarks: LevelBenchmark[] | undefined;
  progress: JuniorProgress | undefined;
  feedback: PlayerFeedback | null | undefined;
}) {
  const nextLevel = currentLevel + 1;
  const nextBand = bandForLevel(bands, nextLevel);
  const atTop = currentLevel >= TOP_LEVEL || !nextBand;

  if (atTop) {
    return (
      <GlassCard
        className="animate-fade-in-up relative overflow-hidden border border-gold/40 p-6 sm:p-8"
        data-testid="next-level-spotlight"
        data-at-top="true"
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold/20 blur-3xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold/20">
            <Star size={26} className="text-gold" aria-hidden />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
              Top of the ladder
            </p>
            <h2 className="mt-0.5 text-2xl font-black text-silver sm:text-3xl">
              You&apos;re at the top level — Elite!
            </h2>
          </div>
        </div>
        <p className="relative mt-4 max-w-2xl text-sm text-slate">
          {bandForLevel(bands, currentLevel)?.description ??
            'You’ve climbed every rung. Keep sharpening your game, chase those sub-84 rounds, and enjoy the view from the top.'}
        </p>
      </GlassCard>
    );
  }

  // Pick the assessment to surface: signed feedback first, else latest eval.
  const assessment =
    feedback?.assessment?.trim() ||
    latestEvaluation(progress)?.assessment?.trim() ||
    null;

  // Sessions needed are governed by the band the player is *currently* working
  // through (min_sessions to clear before moving up).
  const currentBand = bandForLevel(bands, currentLevel);
  const present = progress?.attendance?.present ?? 0;
  const minSessions = currentBand?.min_sessions ?? 0;

  const nextBenchmark = benchmarkForLevel(benchmarks, nextLevel);

  return (
    <GlassCard
      className="animate-fade-in-up relative overflow-hidden border border-azure/40 p-6 shadow-[0_0_40px_-12px_rgba(56,189,248,0.5)] sm:p-8"
      data-testid="next-level-spotlight"
      data-at-top="false"
    >
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-azure/25 blur-3xl"
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-azure/20">
            <TrendingUp size={26} className="text-azure" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
              Your next goal
            </p>
            <h2 className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-2xl font-black text-silver sm:text-3xl">
              <span>Next: Level</span>
              <span className="font-mono text-azure">{nextLevel}</span>
            </h2>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="azure" shape="pill">
            {nextBand.name}
          </Badge>
          {nextBand.band_label ? (
            <Badge tone="slate" shape="pill">
              {nextBand.band_label}
            </Badge>
          ) : null}
        </div>

        {nextBand.description ? (
          <p className="mt-3 max-w-2xl text-sm text-slate">
            {nextBand.description}
          </p>
        ) : null}

        {/* What it takes to get there */}
        <div className="mt-6 space-y-5">
          <SessionsBar present={present} target={minSessions} />

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate">
              Where you are now
            </p>
            {assessment ? (
              <p
                className="mt-1.5 text-sm text-silver"
                data-testid="spotlight-assessment"
              >
                {assessment}
              </p>
            ) : (
              <p
                className="mt-1.5 text-sm text-slate"
                data-testid="spotlight-assessment-empty"
              >
                No assessment yet — your next session is a fresh start.
              </p>
            )}
          </div>

          {nextBenchmark ? (
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate">
                <Target size={13} className="text-azure" aria-hidden />
                Level {nextLevel} targets to aim for
              </p>
              <div className="mt-2">
                <BenchmarkGrid
                  benchmark={nextBenchmark}
                  testId="spotlight-benchmarks"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </GlassCard>
  );
}

// ── Level ladder ─────────────────────────────────────────────────────────────

type RungState = 'done' | 'current' | 'next' | 'locked';

function LadderRung({
  level,
  state,
  band,
  showDescription,
}: {
  level: number;
  state: RungState;
  band: LevelBand | undefined;
  showDescription: boolean;
}) {
  const isCurrent = state === 'current';
  const isNext = state === 'next';
  const isDone = state === 'done';

  const Icon: LucideIcon = isDone
    ? CheckCircle2
    : isCurrent
      ? Flag
      : isNext
        ? ArrowUpRight
        : Lock;

  return (
    <li
      data-testid={`ladder-level-${level}`}
      {...(isCurrent ? { 'data-current': 'true' } : {})}
      data-state={state}
      className={cn(
        'relative flex items-start gap-4 rounded-2xl p-4 transition-colors',
        isNext &&
          'glass-light border border-azure/50 shadow-[0_0_28px_-12px_rgba(56,189,248,0.55)]',
        isCurrent && 'glass-light border border-gold/40',
        isDone && 'opacity-90',
        state === 'locked' && 'opacity-60',
      )}
    >
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-mono text-lg font-black',
          isDone && 'bg-emerald-500/15 text-emerald-400',
          isCurrent && 'bg-gold/20 text-gold',
          isNext && 'bg-azure/20 text-azure',
          state === 'locked' && 'bg-white/5 text-slate',
        )}
        aria-hidden
      >
        {level}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              'text-sm font-bold',
              isNext || isCurrent ? 'text-silver' : 'text-slate',
            )}
          >
            Level {level}
          </p>
          {band ? (
            <span className="text-xs text-slate">· {band.name}</span>
          ) : null}

          {isCurrent ? (
            <Badge tone="gold" shape="pill" className="ml-auto">
              You&apos;re here
            </Badge>
          ) : isNext ? (
            <Badge tone="azure" shape="pill" className="ml-auto">
              Next up
            </Badge>
          ) : isDone ? (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
              <Icon size={14} aria-hidden />
              Done
            </span>
          ) : (
            <Icon size={14} className="ml-auto text-slate" aria-hidden />
          )}
        </div>

        {showDescription && band?.description ? (
          <p className="mt-1.5 text-xs leading-relaxed text-slate">
            {band.description}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function LevelLadder({
  currentLevel,
  bands,
}: {
  currentLevel: number;
  bands: LevelBand[] | undefined;
}) {
  // Render top level first so the ladder reads like a climb (summit at top).
  const ordered = [...ALL_LEVELS].reverse();
  const nextLevel = currentLevel + 1;

  function stateFor(level: number): RungState {
    if (level < currentLevel) return 'done';
    if (level === currentLevel) return 'current';
    if (level === nextLevel) return 'next';
    return 'locked';
  }

  return (
    <ol className="flex flex-col gap-2.5" data-testid="level-ladder">
      {ordered.map((level) => {
        const state = stateFor(level);
        return (
          <LadderRung
            key={level}
            level={level}
            state={state}
            band={bandForLevel(bands, level)}
            showDescription={state === 'current' || state === 'next'}
          />
        );
      })}
    </ol>
  );
}

// ── Coach feedback (anonymous) ───────────────────────────────────────────────

function CoachFeedback({ feedback }: { feedback: PlayerFeedback | null }) {
  if (!feedback) {
    return (
      <p className="text-sm text-slate" data-testid="feedback-empty">
        No feedback yet — keep playing and your coach will add notes.
      </p>
    );
  }

  const skills: { label: string; value: string | null }[] = [
    { label: 'Putting', value: feedback.putting_assessment },
    { label: 'Chipping', value: feedback.chipping_assessment },
    { label: 'Full swing', value: feedback.full_swing_assessment },
  ].filter((s) => s.value && s.value.trim().length > 0);

  const remarks = feedback.special_remarks?.trim();

  if (!remarks && skills.length === 0) {
    return (
      <p className="text-sm text-slate" data-testid="feedback-empty">
        No notes to work on right now — keep up the great practice!
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="feedback-content">
      {remarks ? (
        <div className="glass-light rounded-xl p-4" data-testid="feedback-remarks">
          <p className="text-sm leading-relaxed text-silver">{remarks}</p>
        </div>
      ) : null}

      {skills.length > 0 ? (
        <dl className="grid gap-2.5 sm:grid-cols-3">
          {skills.map((s) => (
            <div
              key={s.label}
              className="glass-light rounded-xl p-3"
              data-testid={`feedback-skill-${s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            >
              <dt className="text-[11px] font-bold uppercase tracking-wider text-azure">
                {s.label}
              </dt>
              <dd className="mt-1 text-sm leading-relaxed text-silver">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function PlayerProgressPage() {
  const junior = useMyJunior();
  const juniorId = junior.data?.id;
  const progress = useJuniorProgress(juniorId);
  const bands = useLevelBands();
  const benchmarks = useLevelBenchmarks();
  const feedback = useMyFeedback();

  // The profile gates everything (we need a junior id). Resolve its state first.
  const profileLoading = junior.isLoading;
  // A 404 here = no junior profile yet (handled as a friendly empty state).
  const noProfile = junior.isError;

  // Loading: profile in flight, or profile present but dependent reads loading.
  const dependentsLoading =
    Boolean(juniorId) &&
    (progress.isLoading || bands.isLoading || benchmarks.isLoading);

  const content = () => {
    if (profileLoading || dependentsLoading) {
      return (
        <div
          className="flex items-center gap-2 py-16 text-sm text-slate"
          data-testid="progress-loading"
        >
          <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
          Loading your progress…
        </div>
      );
    }

    if (noProfile) {
      return (
        <GlassCard
          className="animate-fade-in-up p-8 text-center"
          data-testid="no-profile"
        >
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-azure/15">
            <Sparkles size={24} className="text-azure" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-black text-silver">
            No player profile yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate">
            Once you&apos;re set up as a junior golfer, your level ladder and
            progress will show up here. Ask your coach or club admin to get you
            started.
          </p>
        </GlassCard>
      );
    }

    // Any non-404 error from the dependent reads → red panel.
    const depError =
      progress.error ?? bands.error ?? benchmarks.error ?? feedback.error;
    if (progress.isError || bands.isError || benchmarks.isError) {
      return (
        <ErrorPanel
          message={errorMessage(
            depError,
            'Could not load your progress. Please try again.',
          )}
          testId="progress-error"
        />
      );
    }

    // current_level from the live progress read is authoritative; fall back to
    // the profile if progress somehow omits it.
    const currentLevel =
      progress.data?.current_level ?? junior.data?.current_level ?? 1;
    const currentBand = bandForLevel(bands.data, currentLevel);
    const currentBenchmark = benchmarkForLevel(benchmarks.data, currentLevel);

    return (
      <div className="space-y-6">
        {/* 1) NEXT-LEVEL SPOTLIGHT — the hero */}
        <NextLevelSpotlight
          currentLevel={currentLevel}
          bands={bands.data}
          benchmarks={benchmarks.data}
          progress={progress.data}
          feedback={feedback.data}
        />

        {/* 2) LEVEL LADDER */}
        <GlassCard className="animate-fade-in-up stagger-1 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeading
              icon={TrendingUp}
              title="Your level ladder"
              hint="Nine levels from first swing to Elite. Keep climbing!"
            />
            {currentBand ? (
              <Badge tone="gold" shape="pill">
                {currentBand.name}
              </Badge>
            ) : null}
          </div>
          <div className="mt-5">
            <LevelLadder currentLevel={currentLevel} bands={bands.data} />
          </div>
        </GlassCard>

        {/* 3) THIS LEVEL'S BENCHMARKS */}
        {currentBenchmark ? (
          <GlassCard
            className="animate-fade-in-up stagger-2 p-5 sm:p-6"
            data-testid="current-benchmarks"
          >
            <SectionHeading
              icon={Target}
              title={`Level ${currentLevel} benchmarks`}
              hint="Your targets right now."
            />
            <div className="mt-5">
              <BenchmarkGrid benchmark={currentBenchmark} />
            </div>
          </GlassCard>
        ) : null}

        {/* 4) COACH FEEDBACK (anonymous) */}
        <GlassCard
          className="animate-fade-in-up stagger-3 p-5 sm:p-6"
          data-testid="coach-feedback"
        >
          <SectionHeading
            icon={feedback.data ? MessageSquareText : ClipboardList}
            title="What to work on"
            hint="Coach feedback"
          />
          <div className="mt-5">
            {feedback.isLoading ? (
              <div
                className="flex items-center gap-2 text-sm text-slate"
                data-testid="feedback-loading"
              >
                <Loader2
                  size={16}
                  className="animate-spin text-azure"
                  aria-hidden
                />
                Loading feedback…
              </div>
            ) : feedback.isError ? (
              <ErrorPanel
                message={errorMessage(
                  feedback.error,
                  'Could not load coach feedback.',
                )}
                testId="feedback-error"
              />
            ) : (
              <CoachFeedback feedback={feedback.data ?? null} />
            )}
          </div>
        </GlassCard>

        {/* 5) COMPETITION HISTORY — internal + external events, with best gross */}
        {juniorId != null ? (
          <div className="animate-fade-in-up stagger-3">
            <CompetitionHistory juniorId={juniorId} title="Your competitions" />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="mx-auto max-w-4xl animate-fade-in-up"
      data-testid="progress-page"
    >
      {content()}
    </div>
  );
}
