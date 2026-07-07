// HandicapJourneyCard — read-only view of a junior's path to their first handicap.
// Roles: player (self), parent (own child), committee, admin, coach.
// Warm + motivating tone — juniors may be reading this directly.

import { CheckCircle, Circle, Clock, Flag, TrendingDown } from 'lucide-react';
import { GlassCard } from '../../components/ui/GlassCard';
import { Badge } from '../../components/ui/Badge';
import { useHandicapJourney, type HandicapJourneyStatus } from './handicap.queries';

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<HandicapJourneyStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  cards_submitted: 'Cards submitted',
  attained: 'Handicap attained',
};

type BadgeTone = 'slate' | 'azure' | 'gold' | 'emerald';

const STATUS_TONE: Record<HandicapJourneyStatus, BadgeTone> = {
  not_started: 'slate',
  in_progress: 'azure',
  cards_submitted: 'gold',
  attained: 'emerald',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-azure transition-all duration-500"
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${value} of ${max} signed cards`}
      />
    </div>
  );
}

interface ScoreBandRowProps {
  label: string;
  avg: number | null;
  rounds: number;
  min: number;
  max: number;
  onTarget: boolean;
}

function ScoreBandRow({ label, avg, rounds, min, max, onTarget }: ScoreBandRowProps) {
  // Lower is better in golf.
  const hasData = avg !== null && rounds > 0;

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-silver">{label}</p>
        <p className="text-xs text-slate">
          Target: {min}–{max} strokes
        </p>
      </div>
      <div className="shrink-0 text-right">
        {hasData ? (
          <>
            <span className="text-lg font-black text-silver">{avg!.toFixed(1)}</span>
            <span className="ml-1 text-xs text-slate">avg ({rounds} round{rounds !== 1 ? 's' : ''})</span>
          </>
        ) : (
          <span className="text-sm text-slate/60">No rounds yet</span>
        )}
      </div>
      <div className="shrink-0">
        {hasData ? (
          onTarget ? (
            <CheckCircle size={18} className="text-emerald-400" aria-label="On target" />
          ) : (
            <TrendingDown size={18} className="text-gold" aria-label="Still improving" />
          )
        ) : (
          <Circle size={18} className="text-white/20" aria-label="No data" />
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface HandicapJourneyCardProps {
  juniorId: number;
}

export function HandicapJourneyCard({ juniorId }: HandicapJourneyCardProps) {
  const { data: journey, isLoading, isError, error } = useHandicapJourney(juniorId);

  // ── Loading ──
  if (isLoading) {
    return (
      <GlassCard className="animate-pulse p-5">
        <div className="mb-3 h-4 w-40 rounded bg-white/10" />
        <div className="h-2 w-full rounded bg-white/10" />
        <div className="mt-3 h-4 w-56 rounded bg-white/10" />
      </GlassCard>
    );
  }

  // ── Error ──
  if (isError || !journey) {
    return (
      <GlassCard className="p-5">
        <p className="text-sm text-red-400">
          {isError
            ? `Could not load handicap journey: ${(error as Error)?.message ?? 'Unknown error'}`
            : 'No journey data available.'}
        </p>
      </GlassCard>
    );
  }

  const { progress, status, coach_notes, attained_at } = journey;
  const isAttained = status === 'attained';

  return (
    <GlassCard className="p-5">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Flag size={18} className="shrink-0 text-gold" />
          <h3 className="font-bold text-silver">Path to a Handicap</h3>
        </div>
        <Badge tone={STATUS_TONE[status]} shape="pill">
          {STATUS_LABEL[status]}
        </Badge>
      </div>

      {/* Celebration — attained */}
      {isAttained && (
        <div className="mb-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-center">
          <p className="text-base font-black text-emerald-400">
            Handicap attained!
          </p>
          {attained_at && (
            <p className="mt-0.5 text-xs text-emerald-400/70">
              Achieved{' '}
              {new Date(attained_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          )}
        </div>
      )}

      {/* Ready for handicap — not yet formally attained */}
      {!isAttained && progress.ready_for_handicap && (
        <div className="mb-4 rounded-xl bg-gold/10 px-4 py-3 text-center">
          <p className="text-base font-black text-gold">
            Ready for a handicap!
          </p>
          <p className="mt-0.5 text-xs text-gold/70">
            All targets met — let your coach know.
          </p>
        </div>
      )}

      {/* Signed-card progress */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-silver">Signed scorecards</span>
          <span className="text-sm font-bold text-azure">
            {progress.signed_cards} / {progress.target_signed_cards}
          </span>
        </div>
        <ProgressBar value={progress.signed_cards} max={progress.target_signed_cards} />
        {progress.cards_remaining > 0 && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate">
            <Clock size={12} />
            {progress.cards_remaining} more card{progress.cards_remaining !== 1 ? 's' : ''} to go
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="mb-4 border-t border-white/8" />

      {/* Score bands */}
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate">
          Score targets (lower is better)
        </p>
        <ScoreBandRow
          label="9-hole rounds"
          avg={progress.avg_9_hole}
          rounds={progress.nine_hole_rounds}
          min={progress.targets.nine_hole.min}
          max={progress.targets.nine_hole.max}
          onTarget={progress.nine_on_target}
        />
        <ScoreBandRow
          label="18-hole rounds"
          avg={progress.avg_18_hole}
          rounds={progress.eighteen_hole_rounds}
          min={progress.targets.eighteen_hole.min}
          max={progress.targets.eighteen_hole.max}
          onTarget={progress.eighteen_on_target}
        />
      </div>

      {/* Coach notes (read-only) */}
      {coach_notes && (
        <>
          <div className="my-4 border-t border-white/8" />
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate">
              Coach notes
            </p>
            <p className="text-sm text-silver/80">{coach_notes}</p>
          </div>
        </>
      )}
    </GlassCard>
  );
}
