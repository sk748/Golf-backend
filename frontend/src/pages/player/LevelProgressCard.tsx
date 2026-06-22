// LEVEL & PROGRESS card for the Karen Golf STUDENT dashboard.
//
// Motivational, kid-friendly card that shows a junior their current level and
// progress toward the next one. Collapsed: big level number + a progress signal.
// Expanded (click / Enter / Space): this level's details + benchmarks, where the
// player is right now, anonymous coach feedback ("what to work on"), and what the
// next level unlocks.
//
// ANONYMITY: the /feedback endpoint strips coach identity before it reaches us.
// This component NEVER renders or implies who wrote any note — feedback is always
// labelled generically ("Coach feedback" / "What to work on").
//
// No props — it fetches its own data via player-progress.queries. No emoji
// (lucide-react icons only). No WHS/handicap math.

import { useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  Award,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader2,
  Lock,
  MessageSquare,
  MessageSquareText,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Unlock,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Badge } from '../../components/ui/Badge';
import { GlassCard } from '../../components/ui/GlassCard';
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

const MAX_LEVEL = 9;

// Normalize any thrown value into a friendly, user-facing message.
function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Find the band whose [min_level, max_level] range covers a given level.
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

// ── Encouraging copy mapping for backend assessment / recommendation enums ────
type AssessmentTone = 'red' | 'azure' | 'gold';
interface AssessmentLabel {
  label: string;
  tone: AssessmentTone;
}

function assessmentLabel(assessment: string | null | undefined): AssessmentLabel | null {
  switch (assessment) {
    case 'below_expectation':
      return { label: 'Building up', tone: 'red' };
    case 'meeting_expectation':
      return { label: 'On track', tone: 'azure' };
    case 'exceeding_expectation':
      return { label: 'Excelling', tone: 'gold' };
    default:
      return null;
  }
}

function recommendationLabel(rec: string | null | undefined): string | null {
  switch (rec) {
    case 'continue_level':
      return 'Keep growing at this level';
    case 'move_next_level':
      return 'Ready to move up!';
    default:
      return null;
  }
}

// ── Small presentational helpers ──────────────────────────────────────────────
function ErrorPanel({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
      role="alert"
      data-testid="level-card-error"
    >
      {message}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  children,
}: {
  icon: typeof Target;
  children: ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-azure">
      <Icon size={14} className="text-azure" />
      {children}
    </h3>
  );
}

function BenchmarkStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-light rounded-xl p-3" data-testid={`benchmark-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <p className="font-mono text-lg font-black text-silver">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate">{label}</p>
    </div>
  );
}

// ── Expanded body ─────────────────────────────────────────────────────────────
function ExpandedDetails({
  nextLevel,
  currentBand,
  nextBand,
  benchmark,
  progress,
  feedback,
}: {
  nextLevel: number | null; // null => already at top level
  currentBand: LevelBand | undefined;
  nextBand: LevelBand | undefined;
  benchmark: LevelBenchmark | undefined;
  progress: JuniorProgress | undefined;
  feedback: PlayerFeedback | null | undefined;
}) {
  // Prefer signed feedback; fall back to the latest progress evaluation so the
  // player still sees where they are even before a feedback record is signed.
  const latestEval = progress?.evaluations?.[0];
  const assessment = assessmentLabel(
    feedback?.assessment ?? latestEval?.assessment,
  );
  const recommendation = recommendationLabel(
    feedback?.recommendation ?? latestEval?.recommendation,
  );

  // Coach feedback notes (anonymous — never tied to a name). Show whichever are
  // present.
  const notes: { key: string; label: string; text: string }[] = [];
  if (feedback?.special_remarks)
    notes.push({ key: 'remarks', label: 'Overall', text: feedback.special_remarks });
  if (feedback?.full_swing_assessment)
    notes.push({ key: 'full-swing', label: 'Full swing', text: feedback.full_swing_assessment });
  if (feedback?.chipping_assessment)
    notes.push({ key: 'chipping', label: 'Chipping', text: feedback.chipping_assessment });
  if (feedback?.putting_assessment)
    notes.push({ key: 'putting', label: 'Putting', text: feedback.putting_assessment });

  return (
    <div
      className="mt-5 divide-y divide-white/5 border-t border-white/5"
      data-testid="level-card-details"
    >
      {/* 1) THIS LEVEL ─────────────────────────────────────────────────── */}
      <section className="py-4">
        <SectionHeader icon={Target}>This level</SectionHeader>
        {currentBand ? (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-silver">{currentBand.name}</span>
              {currentBand.band_label ? (
                <Badge tone="azure" shape="pill">
                  {currentBand.band_label}
                </Badge>
              ) : null}
            </div>
            {currentBand.description ? (
              <p className="mt-2 text-sm leading-relaxed text-slate">
                {currentBand.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-slate">
              Aim for at least{' '}
              <span className="font-mono font-bold text-silver">
                {currentBand.min_sessions}
              </span>{' '}
              sessions at this level.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate">Level details are on their way.</p>
        )}

        {benchmark ? (
          <div
            className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
            data-testid="level-benchmarks"
          >
            <BenchmarkStat label="Full swing" value={benchmark.full_swing_target} />
            <BenchmarkStat label="Around green" value={benchmark.around_green_target} />
            <BenchmarkStat label="Putting" value={benchmark.putting_target} />
            <BenchmarkStat label="Nine hole" value={benchmark.nine_hole_target} />
          </div>
        ) : null}
      </section>

      {/* 2) WHERE YOU ARE ──────────────────────────────────────────────── */}
      <section className="py-4">
        <SectionHeader icon={TrendingUp}>Where you are</SectionHeader>
        {assessment || recommendation ? (
          <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="level-status">
            {assessment ? (
              <Badge tone={assessment.tone} data-testid="level-assessment">
                {assessment.label}
              </Badge>
            ) : null}
            {recommendation ? (
              <span className="text-sm text-silver" data-testid="level-recommendation">
                {recommendation}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate" data-testid="level-status-empty">
            Your progress check-in will show up here soon. Keep it up!
          </p>
        )}
      </section>

      {/* 3) WHAT TO WORK ON (anonymous coach feedback) ─────────────────── */}
      <section className="py-4">
        <SectionHeader icon={MessageSquareText}>What to work on</SectionHeader>
        {notes.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-3" data-testid="coach-feedback">
            {notes.map((note) => (
              <li key={note.key} data-testid={`coach-feedback-${note.key}`}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate">
                  {note.label}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-silver">{note.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate" data-testid="coach-feedback-empty">
            No feedback yet — keep playing and your coach will add notes.
          </p>
        )}
      </section>

      {/* 4) NEXT LEVEL UNLOCKS ─────────────────────────────────────────── */}
      <section className="py-4">
        <SectionHeader icon={nextLevel === null ? Trophy : Unlock}>
          {nextLevel === null ? 'Top level' : 'Next level unlocks'}
        </SectionHeader>
        {nextLevel === null ? (
          <div
            className="mt-3 flex items-start gap-3 rounded-xl bg-gold/10 p-3"
            data-testid="next-level-top"
          >
            <Trophy size={18} className="mt-0.5 shrink-0 text-gold" />
            <p className="text-sm leading-relaxed text-silver">
              You're at the top level! Amazing work — keep sharpening your game and
              inspiring the younger players.
            </p>
          </div>
        ) : nextBand && currentBand && nextBand.id === currentBand.id ? (
          // Next level stays inside the same band — keep progressing.
          <div className="mt-3 flex items-start gap-3" data-testid="next-level-same-band">
            <Lock size={18} className="mt-0.5 shrink-0 text-azure" />
            <p className="text-sm leading-relaxed text-silver">
              Next:{' '}
              <span className="font-bold">Level {nextLevel}</span> — keep
              progressing in {currentBand.name}.
            </p>
          </div>
        ) : nextBand ? (
          // Next level crosses into a new band — highlight what it unlocks.
          <div
            className="mt-3 rounded-xl bg-azure/10 p-3"
            data-testid="next-level-new-band"
          >
            <div className="flex items-center gap-2">
              <Unlock size={16} className="shrink-0 text-azure" />
              <span className="text-sm font-bold text-silver">{nextBand.name}</span>
              {nextBand.band_label ? (
                <Badge tone="azure" shape="pill">
                  {nextBand.band_label}
                </Badge>
              ) : null}
            </div>
            {nextBand.description ? (
              <p className="mt-2 text-sm leading-relaxed text-slate">
                {nextBand.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-azure">
              Reach Level {nextLevel} to unlock this.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate" data-testid="next-level-unknown">
            Next: <span className="font-bold text-silver">Level {nextLevel}</span> —
            keep going, you've got this!
          </p>
        )}
      </section>
    </div>
  );
}

export function LevelProgressCard() {
  const [expanded, setExpanded] = useState(false);

  const junior = useMyJunior();
  const juniorId = junior.data?.id;
  const progress = useJuniorProgress(juniorId);
  const bands = useLevelBands();
  const benchmarks = useLevelBenchmarks();
  const feedback = useMyFeedback();

  // ── Top-level states keyed off /api/juniors/me ───────────────────────────
  if (junior.isLoading) {
    return (
      <GlassCard className="animate-fade-in-up p-6" data-testid="level-card-loading">
        <div className="flex items-center gap-2 text-sm text-slate">
          <Loader2 size={18} className="animate-spin text-azure" />
          Loading your level…
        </div>
      </GlassCard>
    );
  }

  if (junior.isError) {
    // A 404 means the signed-in user simply has no junior profile — show a
    // friendly explanation rather than a scary error.
    if (junior.error instanceof ApiError && junior.error.status === 404) {
      return (
        <GlassCard className="animate-fade-in-up p-6" data-testid="level-card-no-profile">
          <div className="flex items-start gap-3">
            <Award size={20} className="mt-0.5 shrink-0 text-azure" />
            <div>
              <p className="text-sm font-bold text-silver">No player profile yet</p>
              <p className="mt-1 text-sm text-slate">
                Once you're set up with the junior programme, your level and
                progress will show up here.
              </p>
            </div>
          </div>
        </GlassCard>
      );
    }
    return (
      <GlassCard className="animate-fade-in-up p-6">
        <ErrorPanel
          message={errorMessage(junior.error, 'Could not load your level right now.')}
        />
      </GlassCard>
    );
  }

  if (!junior.data) return null;

  const currentLevel = junior.data.current_level;
  const currentBand = bandForLevel(bands.data, currentLevel);

  // Next level: current + 1, capped at MAX_LEVEL. Above the cap (or no band for
  // it) means "top level".
  const candidateNext = currentLevel + 1;
  const nextBand = bandForLevel(bands.data, candidateNext);
  const nextLevel = candidateNext > MAX_LEVEL || !nextBand ? null : candidateNext;

  const benchmark = benchmarkForLevel(benchmarks.data, currentLevel);

  // ── Honest progress signal: sessions attended vs the band's min_sessions ──
  const present = progress.data?.attendance.present ?? 0;
  const target = currentBand?.min_sessions ?? 0;
  const progressPct = target > 0 ? clampPercent((present / target) * 100) : 0;

  // Dependent data is still loading once we have a junior id but progress hasn't
  // resolved. We don't block the whole card — but we surface a small spinner for
  // the progress signal so the number isn't misleadingly "0".
  const progressLoading = progress.isLoading && Boolean(juniorId);

  // ── Collapsed hover/focus preview ─────────────────────────────────────────
  // Condensed "next step" cue. Prefer the coach recommendation; otherwise fall
  // back to a sessions-to-go count toward the next level, then sensible defaults.
  // Reuses the same next-level / sessions / recommendation data as the expanded
  // view so the two never disagree.
  const latestEval = progress.data?.evaluations?.[0];
  const previewRecommendation = recommendationLabel(
    feedback.data?.recommendation ?? latestEval?.recommendation,
  );
  const sessionsToGo = Math.max(0, target - present);
  let nextStepCue: string;
  if (previewRecommendation) {
    nextStepCue = previewRecommendation;
  } else if (nextLevel === null) {
    nextStepCue = "You're at the top level!";
  } else if (target > 0 && sessionsToGo > 0) {
    nextStepCue = `Level ${nextLevel} — ${sessionsToGo} session${
      sessionsToGo === 1 ? '' : 's'
    } to go`;
  } else if (target > 0) {
    nextStepCue = `Level ${nextLevel} — ready when your coach is`;
  } else {
    nextStepCue = `Level ${nextLevel} — keep going, you've got this!`;
  }

  // Top anonymized coach comment for the preview. Prefer overall remarks, then
  // the first available skill note. Never reveals coach identity.
  const coachComment =
    feedback.data?.special_remarks ||
    feedback.data?.full_swing_assessment ||
    feedback.data?.chipping_assessment ||
    feedback.data?.putting_assessment ||
    'No feedback yet — keep playing!';

  const toggle = () => setExpanded((v) => !v);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <GlassCard
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label="Your level and progress. Activate to see details."
      onClick={toggle}
      onKeyDown={onKeyDown}
      data-testid="level-card"
      className={cn(
        'group animate-fade-in-up cursor-pointer border border-white/10 p-6 transition-all',
        'hover:-translate-y-1 hover:border-azure/40',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
          <Sparkles size={14} className="text-azure" />
          Your level
        </p>
        {expanded ? (
          <ChevronUp size={18} className="shrink-0 text-slate" aria-hidden="true" />
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-slate">
            Tap for details
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        )}
      </div>

      {/* Big current level + band ─────────────────────────────────────── */}
      <div className="mt-4 flex items-end gap-4">
        <span
          className="font-mono text-6xl font-black leading-none text-silver"
          data-testid="current-level"
        >
          {currentLevel}
        </span>
        <div className="pb-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate">
            Level
          </p>
          {currentBand ? (
            <Badge
              tone="azure"
              shape="pill"
              className="mt-1"
              data-testid="current-band"
            >
              {currentBand.band_label || currentBand.name}
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Progress toward this level (sessions vs band min_sessions) ────── */}
      <div className="mt-5" data-testid="level-progress">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate">
            {progressLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin text-azure" />
                Loading sessions…
              </span>
            ) : (
              <>
                Sessions:{' '}
                <span className="font-mono font-bold text-silver">{present}</span> /{' '}
                <span className="font-mono font-bold text-silver">{target}</span>{' '}
                toward this level
              </>
            )}
          </span>
          {!progressLoading ? (
            <span
              className="font-mono font-bold text-azure"
              data-testid="level-progress-pct"
            >
              {progressPct}%
            </span>
          ) : null}
        </div>
        <div
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Sessions attended toward this level"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-azure to-azure/70 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Collapsed hover/focus preview ─────────────────────────────────
          Surfaces the next step + top anonymous coach note without a click.
          Revealed on hover AND keyboard focus; never shown once expanded. */}
      {!expanded ? (
        <div
          data-testid="level-preview"
          aria-hidden="true"
          className={cn(
            'mt-3 border-t border-white/5 pt-3',
            'hidden group-hover:block group-focus-within:block',
            'motion-safe:opacity-0 motion-safe:transition-opacity motion-safe:duration-200',
            'group-hover:opacity-100 group-focus-within:opacity-100',
          )}
        >
          <p
            className="flex items-start gap-1.5 text-xs text-slate"
            data-testid="level-preview-next"
          >
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-azure" />
            <span>
              Next step:{' '}
              <span className="font-medium text-silver">{nextStepCue}</span>
            </span>
          </p>
          <p
            className="mt-1.5 flex items-start gap-1.5 text-xs text-slate"
            data-testid="level-preview-coach"
          >
            <MessageSquare size={14} className="mt-0.5 shrink-0 text-azure" />
            <span>
              Coach says:{' '}
              <span className="line-clamp-2 text-silver">{coachComment}</span>
            </span>
          </p>
        </div>
      ) : null}

      {/* Expanded details ─────────────────────────────────────────────── */}
      {expanded ? (
        <ExpandedDetails
          nextLevel={nextLevel}
          currentBand={currentBand}
          nextBand={nextBand}
          benchmark={benchmark}
          progress={progress.data}
          feedback={feedback.data}
        />
      ) : null}
    </GlassCard>
  );
}
