// Reusable benchmark target display for a single level.
//
// Renders the level's four skill targets alongside optional actuals (e.g. from
// a junior's progress data).  When an actual is provided, a subtle indicator
// shows whether the junior is at, under, or over the target (lower = better).
//
// If no benchmark exists for the level, a tasteful note is shown — this is
// expected for L1–5 and L9 which don't have numerical targets in v1.
//
// Props are intentionally minimal so player/progress pages can embed this
// without knowing anything about the benchmark query cache.

import { useBenchmarkForLevel } from './benchmarks.queries';
import { cn } from '../../lib/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BenchmarkActuals {
  full_swing?: number | null;
  around_green?: number | null;
  putting?: number | null;
  nine_hole?: number | null;
}

interface BenchmarkTargetsProps {
  /** The junior's current level (1–9+). */
  level: number;
  /**
   * Optional actuals to compare against the targets.  Any key that is
   * undefined or null is simply omitted — the target alone is displayed.
   */
  actuals?: BenchmarkActuals;
  className?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// For golf skill metrics, lower scores are better.
type Delta = 'under' | 'at' | 'over';

function delta(actual: number, target: number): Delta {
  if (actual < target) return 'under';
  if (actual === target) return 'at';
  return 'over';
}

const DELTA_STYLES: Record<Delta, string> = {
  under: 'text-emerald-400',  // beating the target
  at: 'text-azure',           // exactly on target
  over: 'text-amber-400',     // above target (needs work)
};

const DELTA_LABELS: Record<Delta, string> = {
  under: 'below target',
  at: 'on target',
  over: 'above target',
};

// ── Row sub-component ─────────────────────────────────────────────────────────

interface SkillRowProps {
  label: string;
  target: number;
  actual?: number | null;
}

function SkillRow({ label, target, actual }: SkillRowProps) {
  const hasActual = actual !== undefined && actual !== null;
  const d: Delta | null = hasActual ? delta(actual!, target) : null;
  const diff = hasActual ? actual! - target : null;

  return (
    <tr className="border-t border-white/5">
      {/* Skill label */}
      <td className="py-2.5 pl-4 pr-2 text-sm text-slate">{label}</td>

      {/* Target */}
      <td className="py-2.5 px-2 text-right font-mono text-sm font-semibold text-silver">
        {target}
      </td>

      {/* Actual (only when supplied) */}
      <td className="py-2.5 pl-2 pr-4 text-right font-mono text-sm">
        {hasActual ? (
          <span className={cn('font-semibold', d ? DELTA_STYLES[d] : '')}>
            {actual}
          </span>
        ) : (
          <span className="text-slate/40">—</span>
        )}
      </td>

      {/* Δ indicator */}
      <td className="py-2.5 pr-4 text-right text-xs">
        {hasActual && d !== null && diff !== null ? (
          <span
            className={cn('tabular-nums', DELTA_STYLES[d])}
            aria-label={`${Math.abs(diff)} ${DELTA_LABELS[d]}`}
          >
            {diff === 0 ? '=' : diff > 0 ? `+${diff}` : diff}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function BenchmarkTargets({ level, actuals, className }: BenchmarkTargetsProps) {
  const benchmark = useBenchmarkForLevel(level);

  if (!benchmark) {
    return (
      <p
        className={cn(
          'rounded-xl bg-white/[0.03] px-4 py-3 text-sm text-slate',
          className,
        )}
        data-testid="benchmark-no-targets"
      >
        No benchmark targets are defined for Level {level}.
      </p>
    );
  }

  return (
    <div className={cn('overflow-x-auto', className)} data-testid="benchmark-targets">
      <table className="w-full min-w-[20rem] text-left text-sm" aria-label={`Level ${level} benchmark targets`}>
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-slate">
            <th scope="col" className="py-2 pl-4 pr-2 font-semibold">Skill</th>
            <th scope="col" className="py-2 px-2 text-right font-semibold">Target</th>
            <th scope="col" className="py-2 pl-2 pr-4 text-right font-semibold">
              {actuals ? 'You' : ''}
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-semibold">
              {actuals ? 'Diff' : ''}
            </th>
          </tr>
        </thead>
        <tbody>
          <SkillRow
            label="Full swing"
            target={benchmark.full_swing_target}
            actual={actuals?.full_swing}
          />
          <SkillRow
            label="Around the green"
            target={benchmark.around_green_target}
            actual={actuals?.around_green}
          />
          <SkillRow
            label="Putting"
            target={benchmark.putting_target}
            actual={actuals?.putting}
          />
          <SkillRow
            label="9-hole score"
            target={benchmark.nine_hole_target}
            actual={actuals?.nine_hole}
          />
        </tbody>
      </table>

      {actuals && (
        <p className="mt-1.5 px-4 pb-2 text-[11px] text-slate/60">
          Lower scores are better. Green = beating target · Amber = above target.
        </p>
      )}
    </div>
  );
}
