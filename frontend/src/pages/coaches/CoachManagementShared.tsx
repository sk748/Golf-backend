// Shared display components for the Coach Management section. Pure presentation;
// presets, labels and formatters live in coach-management.queries.ts.

import { FileSpreadsheet, TrendingDown, TrendingUp, Minus } from 'lucide-react';

import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/cn';
import { WINDOW_PRESETS, type CoachSummary } from './coach-management.queries';

export function PeriodSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-xl bg-navy/60 p-1"
      role="group"
      aria-label="Reporting period"
    >
      {WINDOW_PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(p.key)}
          aria-pressed={value === p.key}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
            value === p.key ? 'bg-azure/20 text-azure' : 'text-slate hover:text-silver',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// Handicap change: positive == improvement (index dropped). Down arrow + emerald
// for improvement, up arrow + red for regression, dash for no data.
export function HandicapChange({
  change,
  className,
}: {
  change: number | null;
  className?: string;
}) {
  if (change === null || change === 0) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-slate', className)}>
        <Minus size={14} />
        {change === 0 ? '0.0' : '—'}
      </span>
    );
  }
  const improved = change > 0;
  const Icon = improved ? TrendingDown : TrendingUp;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-bold',
        improved ? 'text-emerald-400' : 'text-red-400',
        className,
      )}
      title={improved ? 'Handicap index improved' : 'Handicap index rose'}
    >
      <Icon size={14} />
      {Math.abs(change).toFixed(1)}
    </span>
  );
}

// Three-segment assessment mix (below / meeting / exceeding).
export function AssessmentMix({
  evals,
  showCounts = false,
}: {
  evals: CoachSummary['evaluations'];
  showCounts?: boolean;
}) {
  const { below_expectation: below, meeting_expectation: meeting, exceeding_expectation: exceeding } = evals;
  const total = below + meeting + exceeding;
  if (total === 0) {
    return <span className="text-xs text-slate">No evaluations</span>;
  }
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex h-2 w-full min-w-[6rem] overflow-hidden rounded-full bg-navy"
        title={`Below ${below} · Meeting ${meeting} · Exceeding ${exceeding}`}
      >
        {below > 0 && <span className="bg-red-400/70" style={{ width: pct(below) }} />}
        {meeting > 0 && <span className="bg-azure/70" style={{ width: pct(meeting) }} />}
        {exceeding > 0 && <span className="bg-emerald-400/70" style={{ width: pct(exceeding) }} />}
      </div>
      {showCounts && (
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <Badge tone="red">Below {below}</Badge>
          <Badge tone="azure">Meeting {meeting}</Badge>
          <Badge tone="emerald">Exceeding {exceeding}</Badge>
        </div>
      )}
    </div>
  );
}

// A compact .xlsx export button with built-in pending state.
export function ExportButton({
  onClick,
  pending,
  label = 'Export .xlsx',
}: {
  onClick: () => void;
  pending: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
    >
      <FileSpreadsheet size={16} />
      {label}
      {pending && <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />}
    </button>
  );
}
