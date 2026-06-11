import type { ReactNode } from 'react';
import { Check, Loader2, Pin, PinOff, Sparkles, UserPlus } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { GlassCard } from '../../components/ui/GlassCard';
import { Badge } from '../../components/ui/Badge';
import { useAchievements } from '../../features/achievements/use-achievements';
import { useAchievementUnlocks } from '../../features/achievements/achievements.queries';
import { AchievementIcon } from '../../features/achievements/AchievementIcon';
import {
  CATEGORY_LABELS,
  TIER_LABEL,
  type AchievementCategory,
  type EvaluatedAchievement,
} from '../../features/achievements/catalog';
import { useMyJunior } from './player-progress.queries';
import {
  featuredAwardOf,
  useSetFeaturedAward,
} from './featured-award.queries';

// Top of the level meter — Level 9 is the peak of the junior pathway.
const MAX_LEVEL = 9;

// Order the wall is rendered in (most exciting / aspirational first).
const CATEGORY_ORDER: AchievementCategory[] = [
  'level',
  'scoring',
  'handicap',
  'rounds',
  'sessions',
  'competition',
];

// Map a level to its development band (used for the headline Badge).
function bandForLevel(level: number): string {
  if (level >= 9) return 'Elite';
  if (level >= 6) return 'Intermediate';
  if (level >= 4) return 'Attaining Handicap';
  return 'Beginner';
}

// A simple filled track. `value/max` drives the width.
function ProgressBar({
  value,
  max,
  className,
  barClassName,
}: {
  value: number;
  max: number;
  className?: string;
  barClassName?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-white/10', className)}>
      <div
        className={cn('h-full rounded-full bg-azure transition-all', barClassName)}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}

// Friendly framed panel reused for loading / empty / error states.
function StatePanel({
  children,
  testId,
  tone = 'default',
}: {
  children: ReactNode;
  testId: string;
  tone?: 'default' | 'error';
}) {
  return (
    <div
      className={cn(
        'mx-auto mt-12 max-w-md rounded-2xl p-6 text-center text-sm',
        tone === 'error'
          ? 'bg-red-500/15 text-red-400'
          : 'glass text-slate',
      )}
      role={tone === 'error' ? 'alert' : undefined}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

function AchievementCard({
  a,
  featured,
  recent,
  onFeature,
  onClear,
  busy,
}: {
  a: EvaluatedAchievement;
  // Featuring is only offered when we know the player's junior id.
  featured: boolean;
  // The most-recently unlocked achievement — gets a soft glow.
  recent: boolean;
  onFeature: (() => void) | null;
  onClear: (() => void) | null;
  busy: boolean;
}) {
  const hasProgress =
    !a.earned && a.progressNow != null && a.progressTarget != null;
  // Only an EARNED achievement can be shown off in chat.
  const canFeature = a.earned && onFeature != null && onClear != null;

  return (
    <GlassCard
      tone="light"
      className={cn(
        'flex flex-col items-center gap-2 p-4 text-center transition',
        a.earned ? 'ring-1 ring-gold/40' : 'opacity-90',
        // Soft glow on the most-recently unlocked achievement.
        recent && 'ring-2 ring-gold/70 shadow-lg shadow-gold/30',
        featured && 'ring-2 ring-gold shadow-lg shadow-gold/20',
      )}
      data-testid={`achievement-${a.id}`}
      data-earned={a.earned}
      data-featured={featured}
      data-recent={recent}
    >
      <div className="relative">
        <AchievementIcon icon={a.icon} tier={a.tier} earned={a.earned} size="lg" />
        {a.earned && (
          <span
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-navy"
            aria-hidden="true"
          >
            <Check size={12} className="text-navy" strokeWidth={3} />
          </span>
        )}
      </div>

      <h3
        className={cn(
          'mt-1 text-sm font-bold leading-tight',
          a.earned ? 'text-silver' : 'text-slate',
        )}
      >
        {a.title}
      </h3>

      <p className="text-xs leading-snug text-slate">{a.description}</p>

      <div className="mt-auto flex flex-wrap items-center justify-center gap-1.5 pt-1">
        <Badge tone={a.earned ? 'gold' : 'slate'} shape="pill">
          {TIER_LABEL[a.tier]}
        </Badge>
        <Badge tone={a.earned ? 'emerald' : 'slate'} shape="pill">
          {a.earned ? 'Earned' : 'Locked'}
        </Badge>
        {featured && (
          <Badge tone="gold" shape="pill" data-testid={`featured-badge-${a.id}`}>
            Featured
          </Badge>
        )}
      </div>

      {hasProgress && (
        <div className="w-full pt-1">
          <ProgressBar value={a.progressNow ?? 0} max={a.progressTarget ?? 1} />
          <p className="mt-1 font-mono text-[11px] text-slate">
            {a.progressNow}/{a.progressTarget}
          </p>
        </div>
      )}

      {/* "Show off in chat" toggle — earned achievements only. */}
      {canFeature && (
        <button
          type="button"
          onClick={featured ? onClear : onFeature}
          disabled={busy}
          aria-pressed={featured}
          data-testid={`feature-toggle-${a.id}`}
          className={cn(
            'mt-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-50',
            featured
              ? 'bg-gold/15 text-gold hover:bg-gold/25'
              : 'text-slate hover:bg-white/5 hover:text-gold',
          )}
        >
          {busy ? (
            <Loader2 size={12} className="animate-spin" aria-hidden />
          ) : featured ? (
            <PinOff size={12} aria-hidden />
          ) : (
            <Pin size={12} aria-hidden />
          )}
          {featured ? 'Clear' : 'Show off in chat'}
        </button>
      )}
    </GlassCard>
  );
}

export function AchievementsPage() {
  const {
    achievements,
    earnedCount,
    total,
    currentLevel,
    isLoading,
    isError,
    error,
    noProfile,
  } = useAchievements();

  // The player's own junior profile drives which achievement is featured and
  // who we PUT the change for. The mutation invalidates the junior query so the
  // active state here (and the chat chip) refreshes.
  const junior = useMyJunior();
  const juniorId = junior.data?.id;
  const featuredKey = featuredAwardOf(junior.data).featured_achievement_key;

  // Most-recently unlocked achievement (server-recorded, newest by unlocked_at)
  // — gets a soft glow on the wall. Unlocks come back oldest→newest.
  const unlocks = useAchievementUnlocks();
  const recentKey = unlocks.data?.length
    ? unlocks.data[unlocks.data.length - 1].key
    : null;
  const setFeatured = useSetFeaturedAward();
  const featuringId = setFeatured.isPending
    ? (setFeatured.variables?.body && 'achievement_key' in setFeatured.variables.body
        ? setFeatured.variables.body.achievement_key
        : null)
    : null;

  // ── States ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl" data-testid="achievements-page">
        <StatePanel testId="achievements-loading">
          <Loader2 size={28} className="mx-auto mb-3 animate-spin text-azure" />
          Loading your achievements…
        </StatePanel>
      </div>
    );
  }

  if (noProfile) {
    return (
      <div className="mx-auto max-w-5xl" data-testid="achievements-page">
        <StatePanel testId="achievements-no-profile">
          <UserPlus size={28} className="mx-auto mb-3 text-azure" />
          <p className="font-bold text-silver">No player profile yet</p>
          <p className="mt-1">
            Your achievements will appear here once you&apos;re set up. Keep an
            eye out — your first badges are waiting.
          </p>
        </StatePanel>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-5xl" data-testid="achievements-page">
        <StatePanel testId="achievements-error" tone="error">
          {error instanceof ApiError
            ? error.message
            : 'Could not load achievements.'}
        </StatePanel>
      </div>
    );
  }

  // ── Loaded ──────────────────────────────────────────────────────────────
  const band = bandForLevel(currentLevel);
  const earnedPct = total > 0 ? Math.round((earnedCount / total) * 100) : 0;

  return (
    <div
      className="mx-auto max-w-5xl animate-fade-in-up"
      data-testid="achievements-page"
    >
      {/* ── Header + level meter ─────────────────────────────────────────── */}
      <GlassCard className="p-5 sm:p-6" data-testid="achievements-summary">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
              Your journey
            </p>
            <h2 className="mt-1 flex items-baseline gap-2 text-3xl font-black text-silver sm:text-4xl">
              Level <span className="font-mono text-gold">{currentLevel}</span>
            </h2>
          </div>
          <Badge tone="gold" shape="pill" data-testid="level-band">
            {band}
          </Badge>
        </div>

        {/* Segmented level meter: one segment per level, filled up to current. */}
        <div
          className="mt-5 flex gap-1.5"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={MAX_LEVEL}
          aria-valuenow={Math.min(currentLevel, MAX_LEVEL)}
          aria-label={`Level ${currentLevel} of ${MAX_LEVEL}`}
          data-testid="level-meter"
        >
          {Array.from({ length: MAX_LEVEL }, (_, i) => {
            const filled = i < currentLevel;
            return (
              <div
                key={i}
                className={cn(
                  'h-3 flex-1 rounded-full transition-colors',
                  filled ? 'bg-gradient-to-r from-azure to-gold' : 'bg-white/10',
                )}
              />
            );
          })}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[11px] text-slate">
          <span>Level 1</span>
          <span>Level {MAX_LEVEL} — Elite</span>
        </div>

        {/* Unlocked summary */}
        <div className="mt-6 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-bold text-silver">
              <Sparkles size={16} className="text-gold" />
              Achievements unlocked
            </p>
            <p className="font-mono text-sm text-silver">
              <span className="text-gold">{earnedCount}</span> / {total}
            </p>
          </div>
          <ProgressBar
            value={earnedCount}
            max={total}
            className="mt-3 h-2.5"
            barClassName="bg-gradient-to-r from-azure to-gold"
          />
          <p className="mt-2 text-xs text-slate">
            {earnedCount === 0
              ? 'Every champion starts here — your first badge is within reach.'
              : earnedCount >= total
                ? 'Incredible — you have unlocked them all. Legend!'
                : `You're ${earnedPct}% of the way there. Keep going!`}
          </p>
          {earnedCount > 0 && juniorId != null && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gold/80">
              <Pin size={12} aria-hidden />
              Tap “Show off in chat” on a badge to feature it next to your name.
            </p>
          )}
        </div>
      </GlassCard>

      {/* ── The wall ─────────────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-col gap-8">
        {CATEGORY_ORDER.map((category) => {
          const group = achievements.filter((a) => a.category === category);
          if (group.length === 0) return null;
          const groupEarned = group.filter((a) => a.earned).length;

          return (
            <section key={category} data-testid={`achievement-group-${category}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-black text-silver">
                  {CATEGORY_LABELS[category]}
                </h2>
                <span className="font-mono text-xs text-slate">
                  {groupEarned}/{group.length}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {group.map((a) => {
                  const isFeatured = featuredKey === a.id;
                  return (
                    <AchievementCard
                      key={a.id}
                      a={a}
                      featured={isFeatured}
                      recent={recentKey === a.id}
                      busy={featuringId === a.id || (isFeatured && setFeatured.isPending)}
                      onFeature={
                        juniorId != null
                          ? () =>
                              setFeatured.mutate({
                                juniorId,
                                body: { achievement_key: a.id },
                              })
                          : null
                      }
                      onClear={
                        juniorId != null
                          ? () =>
                              setFeatured.mutate({
                                juniorId,
                                body: { achievement_key: null },
                              })
                          : null
                      }
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
