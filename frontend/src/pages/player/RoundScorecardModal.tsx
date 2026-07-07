// Full per-hole scorecard for a single round, shown as a self-built modal
// overlay (no modal library). Click-backdrop / X button / Escape all close it.
// Per-hole cells are colour-coded by strokes-minus-par (this is display scoring,
// not WHS/handicap math). Handicap values themselves are only ever DISPLAYED.

import { useEffect, useMemo } from 'react';
import { Loader2, X } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { GlassCard } from '../../components/ui/GlassCard';
import type { Hole, HoleScore, Round } from '../../types/api';
import { useHoleScores, useHoles } from './player-games.queries';

const COURSE_PAR = 72;

interface RoundScorecardModalProps {
  round: Round;
  onClose: () => void;
}

interface MergedHole {
  hole_number: number;
  par: number | null;
  stroke_index: number | null;
  strokes: number | null;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// gross - 72 as E / +n / -n. Not handicap math: just a friendly to-par label.
function toPar(gross: number): string {
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

// Colour a single score cell vs that hole's par (strokes - par).
function scoreCellClass(strokes: number | null, par: number | null): string {
  if (strokes == null || par == null) return 'text-silver';
  const diff = strokes - par;
  if (diff <= -2) return 'rounded bg-amber-500 px-1.5 font-black text-navy';
  if (diff === -1) return 'rounded bg-emerald-500/30 px-1.5 font-bold text-emerald-300';
  if (diff === 0) return 'text-silver';
  if (diff === 1) return 'text-gold';
  return 'text-red-400';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Build 18 rows merged by hole number. Holes from /api/holes give par + SI;
// the player's hole-scores give strokes. Either side may be missing.
function mergeHoles(holes: Hole[], scores: HoleScore[]): MergedHole[] {
  const byNumber = new Map<number, MergedHole>();
  for (let n = 1; n <= 18; n += 1) {
    byNumber.set(n, { hole_number: n, par: null, stroke_index: null, strokes: null });
  }
  for (const h of holes) {
    const row = byNumber.get(h.hole_number);
    if (row) {
      row.par = h.par;
      row.stroke_index = h.stroke_index;
    }
  }
  for (const s of scores) {
    const row = byNumber.get(s.hole_number);
    if (row) row.strokes = s.strokes;
  }
  // Only keep holes we have at least par OR a score for, so courses with <18
  // holes don't render empty rows.
  return Array.from(byNumber.values()).filter(
    (r) => r.par != null || r.strokes != null,
  );
}

function sum(rows: MergedHole[], key: 'par' | 'strokes'): number | null {
  let total = 0;
  let any = false;
  for (const r of rows) {
    const v = r[key];
    if (v != null) {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}

function NineTable({
  title,
  rows,
}: {
  title: string;
  rows: MergedHole[];
}) {
  if (rows.length === 0) return null;
  const parOut = sum(rows, 'par');
  const scoreOut = sum(rows, 'strokes');
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-sm">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate">
            <th scope="col" className="py-2 pr-3 font-semibold">
              {title}
            </th>
            {rows.map((r) => (
              <th
                key={r.hole_number}
                scope="col"
                className="px-2 py-2 text-center font-mono font-semibold"
              >
                {r.hole_number}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-center font-semibold">
              {title.startsWith('Front') ? 'Out' : 'In'}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-white/5">
            <th scope="row" className="py-2 pr-3 text-left text-xs text-slate">
              Par
            </th>
            {rows.map((r) => (
              <td key={r.hole_number} className="px-2 py-2 text-center font-mono text-slate">
                {r.par ?? '—'}
              </td>
            ))}
            <td className="px-2 py-2 text-center font-mono font-bold text-silver">
              {parOut ?? '—'}
            </td>
          </tr>
          <tr className="border-t border-white/5">
            <th scope="row" className="py-2 pr-3 text-left text-xs text-slate">
              SI
            </th>
            {rows.map((r) => (
              <td key={r.hole_number} className="px-2 py-2 text-center font-mono text-slate/70">
                {r.stroke_index ?? '—'}
              </td>
            ))}
            <td className="px-2 py-2 text-center text-slate/50">—</td>
          </tr>
          <tr className="border-t border-white/10">
            <th scope="row" className="py-2 pr-3 text-left text-xs font-semibold text-silver">
              Score
            </th>
            {rows.map((r) => (
              <td key={r.hole_number} className="px-2 py-2 text-center">
                <span className={cn('inline-block font-mono', scoreCellClass(r.strokes, r.par))}>
                  {r.strokes ?? '—'}
                </span>
              </td>
            ))}
            <td className="px-2 py-2 text-center font-mono font-black text-azure">
              {scoreOut ?? '—'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function RoundScorecardModal({ round, onClose }: RoundScorecardModalProps) {
  const scoresQuery = useHoleScores(round.id);
  const holesQuery = useHoles(round.course_id);

  // Escape closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isLoading = scoresQuery.isLoading || holesQuery.isLoading;
  const isError = scoresQuery.isError || holesQuery.isError;

  const merged = useMemo(
    () => mergeHoles(holesQuery.data ?? [], scoresQuery.data ?? []),
    [holesQuery.data, scoresQuery.data],
  );
  const front = merged.filter((r) => r.hole_number <= 9);
  const back = merged.filter((r) => r.hole_number >= 10);
  const hasScores = (scoresQuery.data ?? []).length > 0;

  const totalPar = sum(merged, 'par');

  return (
    <div
      className="animate-fade-in-up fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
      data-testid="scorecard-modal"
    >
      <GlassCard
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Round scorecard"
      >
        {/* Header: round meta */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-azure">
              {round.competition_name ?? round.round_type}
            </p>
            <h2 className="mt-1 text-lg font-black text-silver">
              {formatDate(round.date_played)}
            </h2>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="font-mono text-2xl font-black text-silver">
                {round.gross_score}
              </span>
              <span
                className={cn('font-mono text-sm font-bold', toParTone(round.gross_score))}
              >
                {toPar(round.gross_score)}
              </span>
              {round.handicap_after != null && (
                <span className="text-xs text-slate">
                  Handicap after:{' '}
                  <span className="font-mono text-silver">{round.handicap_after}</span>
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scorecard"
            className="rounded-lg p-2 text-slate transition-colors hover:bg-white/10 hover:text-silver focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
            data-testid="scorecard-close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="mt-6">
          {isLoading ? (
            <div
              className="flex items-center gap-2 text-sm text-slate"
              data-testid="scorecard-loading"
            >
              <Loader2 size={18} className="animate-spin text-azure" />
              Loading your scorecard…
            </div>
          ) : isError ? (
            <div
              className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
              role="alert"
              data-testid="scorecard-error"
            >
              {errorMessage(
                scoresQuery.error ?? holesQuery.error,
                'Could not load this scorecard.',
              )}
            </div>
          ) : !hasScores ? (
            <div data-testid="scorecard-empty" className="space-y-3">
              <p className="text-sm text-slate">
                No hole-by-hole scores for this round.
              </p>
              <div className="glass-light rounded-xl p-4">
                <p className="text-xs text-slate">Round total</p>
                <p className="mt-1 font-mono text-2xl font-black text-silver">
                  {round.gross_score}
                  <span className={cn('ml-2 text-base', toParTone(round.gross_score))}>
                    {toPar(round.gross_score)}
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6" data-testid="scorecard-table">
              <NineTable title="Front 9" rows={front} />
              <NineTable title="Back 9" rows={back} />

              {/* Totals */}
              <div className="glass-light flex items-center justify-between rounded-xl p-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate">Total</p>
                  <p className="mt-1 text-xs text-slate">
                    Par {totalPar ?? COURSE_PAR}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-3xl font-black text-azure">
                    {round.gross_score}
                  </p>
                  <p className={cn('font-mono text-sm font-bold', toParTone(round.gross_score))}>
                    {toPar(round.gross_score)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
