// Tournament SCORE ENTRY — admin / coach only (route guard wired by the parent).
// One editable scorecard per scoreable entry. THE BACKEND OWNS ALL SCORING: we
// submit raw strokes (or a total gross) and DISPLAY the computed net /
// Stableford / position / course handicap it returns. The only arithmetic here
// is summing strokes for a live running total — never net / Stableford /
// handicap.
//
// Scores can only be entered while the tournament is in_progress; any other
// status renders a clear gate and no form (advancing status is a later pass).

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Lock,
  TrendingUp,
} from 'lucide-react';

import { ApiError, api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { useQuery } from '@tanstack/react-query';
import {
  formatLabel,
  scoringBasisLabel,
  statusLabel,
  statusTone,
  useTournament,
  type Tournament,
} from './tournaments.queries';
import { useTournamentEntries, type TournamentEntry } from './tournament-entries.queries';
import {
  useCourseHoles,
  useSubmitScore,
  useTournamentScores,
  type Hole,
  type HoleScoreInput,
  type SubmitScoreResult,
  type TournamentScore,
} from './tournament-scores.queries';

// ── Juniors name map ──────────────────────────────────────────────────────────
// GET /api/juniors (admin/coach see all) embeds the child's full_name on each
// row (backend _with_child_name). We read it directly here — no users join
// needed. Shares the ['juniors','all'] cache key used elsewhere.

interface JuniorWithName {
  id: number;
  full_name?: string;
}

function useJuniorNames(): {
  nameFor: (juniorId: number) => string;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: ['juniors', 'all'],
    queryFn: () => api.get<JuniorWithName[]>('/api/juniors'),
    staleTime: 60 * 1000,
  });
  const byId = new Map<number, string>();
  for (const j of query.data ?? []) {
    if (j.full_name?.trim()) byId.set(j.id, j.full_name.trim());
  }
  return {
    nameFor: (juniorId: number) => byId.get(juniorId) ?? `Golfer #${juniorId}`,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

// Map a submit error to a clear inline message by the backend's error codes.
function submitMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVALID_STATUS':
        return 'Scores can only be entered while the tournament is in progress.';
      case 'WITHDRAWN':
        return 'This entry has been withdrawn and cannot be scored.';
      case 'VALIDATION_ERROR':
        return error.message || 'Please check the scores entered.';
      default:
        return error.message;
    }
  }
  if (error instanceof Error) return error.message;
  return 'Could not save the score. Please try again.';
}

// Entries we can score: everything except withdrawn (registered / confirmed /
// interested / declined still belong to the tournament; the backend re-checks).
function isScoreable(entry: TournamentEntry): boolean {
  return entry.status !== 'withdrawn';
}

function BackLink({ id }: { id: number }) {
  return (
    <Link
      to={`/tournaments/${id}`}
      className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-slate transition-colors hover:text-azure focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
      data-testid="enter-scores-back-link"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to tournament
    </Link>
  );
}

// ── Per-entry scorecard ───────────────────────────────────────────────────────

interface EntryScorecardProps {
  tournament: Tournament;
  entry: TournamentEntry;
  name: string;
  holes: Hole[];
  existing: TournamentScore | undefined;
}

// strokes state keyed by hole number; '' means not yet entered.
type StrokesState = Record<number, string>;

function EntryScorecard({
  tournament,
  entry,
  name,
  holes,
  existing,
}: EntryScorecardProps) {
  const submit = useSubmitScore(tournament.id);
  const isStableford = tournament.format === 'stableford';

  // Total-only mode is unavailable for Stableford (backend requires per-hole).
  // For an entry that ALREADY has a score, default to total-only with the gross
  // prefilled — per-hole detail can't be prefilled (the list endpoint doesn't
  // expose it), and the backend REPLACES all hole rows on submit, so a partial
  // per-hole edit would clobber a full round. Stableford can't go total-only, so
  // existing Stableford scores stay in per-hole mode and lean on the
  // completeness guard (all holes required) instead.
  const [totalOnly, setTotalOnly] = useState(existing != null && !isStableford);
  const usePerHole = isStableford || !totalOnly;

  const holeNumbers = useMemo(
    () => Array.from({ length: tournament.holes }, (_, i) => i + 1),
    [tournament.holes],
  );

  const holeMeta = useMemo(() => {
    const map = new Map<number, Hole>();
    for (const h of holes) map.set(h.hole_number, h);
    return map;
  }, [holes]);

  // Prefill the gross total from an existing score; per-hole inputs start blank
  // (the list endpoint doesn't expose per-hole strokes). Editing re-submits.
  const [strokes, setStrokes] = useState<StrokesState>({});
  const [grossOnly, setGrossOnly] = useState<string>(
    existing ? String(existing.gross_score) : '',
  );

  // Live running total of raw strokes (display only — NOT net/Stableford).
  const runningTotal = useMemo(() => {
    let total = 0;
    let any = false;
    for (const n of holeNumbers) {
      const raw = strokes[n];
      if (raw != null && raw !== '') {
        const v = Number(raw);
        if (Number.isFinite(v)) {
          total += v;
          any = true;
        }
      }
    }
    return any ? total : null;
  }, [strokes, holeNumbers]);

  const result: SubmitScoreResult | undefined = submit.data;

  // Per-hole completeness: the backend REPLACES every hole row with what's
  // submitted and sets gross = sum of submitted holes, so a partial per-hole
  // submit silently overwrites a full round. Require ALL holes 1..holes before a
  // per-hole submit; never auto-fill. Tracks how many are still empty.
  const filledHoles = useMemo(
    () =>
      holeNumbers.filter((n) => {
        const raw = strokes[n];
        return raw != null && raw !== '' && Number(raw) > 0;
      }).length,
    [holeNumbers, strokes],
  );
  const allHolesFilled = filledHoles === tournament.holes;
  const showIncompleteError =
    usePerHole && filledHoles > 0 && !allHolesFilled;

  function handleSubmit() {
    if (usePerHole) {
      if (!allHolesFilled) return; // guard (a): block partial per-hole submits
      const hole_scores: HoleScoreInput[] = [];
      for (const n of holeNumbers) {
        const raw = strokes[n];
        if (raw != null && raw !== '') {
          const v = Number(raw);
          if (Number.isFinite(v) && v > 0) {
            hole_scores.push({ hole_number: n, strokes: v });
          }
        }
      }
      submit.mutate({
        entry_id: entry.id,
        holes_played: tournament.holes,
        hole_scores,
      });
    } else {
      const gross = Number(grossOnly);
      submit.mutate({
        entry_id: entry.id,
        holes_played: tournament.holes,
        gross_score: Number.isFinite(gross) ? gross : undefined,
      });
    }
  }

  const canSubmit = usePerHole
    ? allHolesFilled
    : grossOnly !== '' && Number(grossOnly) > 0;

  return (
    <GlassCard
      className="overflow-hidden"
      data-testid={`score-entry-${entry.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="min-w-0">
          <p className="font-bold text-silver">{name}</p>
          <p className="mt-0.5 text-xs text-slate">
            Entry #{entry.id}
            {existing ? ' · score on file' : ''}
          </p>
        </div>
        {existing ? (
          <Badge tone="emerald" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Submitted
          </Badge>
        ) : null}
      </div>

      <div className="px-5 py-5">
        {/* Mode toggle — hidden for Stableford (per-hole required). */}
        {isStableford ? (
          <p className="mb-4 text-xs text-slate" data-testid={`stableford-note-${entry.id}`}>
            {existing
              ? `Editing replaces all hole scores — re-enter all ${tournament.holes} holes.`
              : `Stableford scoring needs each hole's strokes — enter the full scorecard below.`}
          </p>
        ) : (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              variant={usePerHole ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setTotalOnly(false)}
              data-testid={`mode-per-hole-${entry.id}`}
            >
              Per hole
            </Button>
            <Button
              variant={!usePerHole ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setTotalOnly(true)}
              data-testid={`mode-total-${entry.id}`}
            >
              Enter total only
            </Button>
          </div>
        )}

        {usePerHole ? (
          <ScoreGrid
            entryId={entry.id}
            holeNumbers={holeNumbers}
            holeMeta={holeMeta}
            strokes={strokes}
            onChange={(n, value) =>
              setStrokes((prev) => ({ ...prev, [n]: value }))
            }
            runningTotal={runningTotal}
          />
        ) : (
          <div className="max-w-xs">
            <label
              htmlFor={`gross-${entry.id}`}
              className="block text-xs font-semibold uppercase tracking-wider text-slate"
            >
              Total gross score
            </label>
            <input
              id={`gross-${entry.id}`}
              type="number"
              inputMode="numeric"
              min={1}
              value={grossOnly}
              onChange={(e) => setGrossOnly(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center font-mono text-2xl font-black text-silver focus:outline-none focus-visible:border-azure focus-visible:ring-2 focus-visible:ring-azure/40"
              data-testid={`gross-input-${entry.id}`}
            />
          </div>
        )}

        {/* Completeness guard (a): all holes required for a per-hole submit. */}
        {showIncompleteError ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-amber-500/10 p-3 text-sm text-gold"
            data-testid={`incomplete-holes-${entry.id}`}
          >
            Enter all {tournament.holes} holes
            {isStableford ? '.' : ', or switch to total-only.'}
          </p>
        ) : null}

        {/* Submit */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            size="md"
            onClick={handleSubmit}
            disabled={submit.isPending || !canSubmit}
            data-testid={`submit-score-${entry.id}`}
          >
            {submit.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            )}
            {existing ? 'Update score' : 'Submit score'}
          </Button>
          {usePerHole && runningTotal != null ? (
            <span className="text-sm text-slate">
              Running total:{' '}
              <span className="font-mono font-bold text-silver">
                {runningTotal}
              </span>
            </span>
          ) : null}
        </div>

        {/* Backend-computed result */}
        {submit.isSuccess && result ? (
          <ScoreResult result={result} format={tournament.format} />
        ) : null}

        {submit.isError ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            data-testid={`submit-error-${entry.id}`}
          >
            {submitMessage(submit.error)}
          </p>
        ) : null}
      </div>
    </GlassCard>
  );
}

// Editable per-hole grid (front 9 / back 9), large touch-friendly inputs, with
// par + SI displayed per hole (display only).
function ScoreGrid({
  entryId,
  holeNumbers,
  holeMeta,
  strokes,
  onChange,
  runningTotal,
}: {
  entryId: number;
  holeNumbers: number[];
  holeMeta: Map<number, Hole>;
  strokes: StrokesState;
  onChange: (hole: number, value: string) => void;
  runningTotal: number | null;
}) {
  const front = holeNumbers.filter((n) => n <= 9);
  const back = holeNumbers.filter((n) => n >= 10);
  return (
    <div className="space-y-5">
      <GridNine
        entryId={entryId}
        label={back.length ? 'Front 9' : 'Holes'}
        holes={front}
        holeMeta={holeMeta}
        strokes={strokes}
        onChange={onChange}
      />
      {back.length ? (
        <GridNine
          entryId={entryId}
          label="Back 9"
          holes={back}
          holeMeta={holeMeta}
          strokes={strokes}
          onChange={onChange}
        />
      ) : null}
      {runningTotal != null ? (
        <p className="text-right text-xs text-slate">
          Gross so far:{' '}
          <span className="font-mono font-bold text-silver">{runningTotal}</span>
        </p>
      ) : null}
    </div>
  );
}

function GridNine({
  entryId,
  label,
  holes,
  holeMeta,
  strokes,
  onChange,
}: {
  entryId: number;
  label: string;
  holes: number[];
  holeMeta: Map<number, Hole>;
  strokes: StrokesState;
  onChange: (hole: number, value: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] border-collapse text-sm">
        <caption className="sr-only">{label} score entry</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate">
            <th scope="col" className="py-2 pr-3 font-semibold">
              {label}
            </th>
            {holes.map((n) => (
              <th
                key={n}
                scope="col"
                className="px-1.5 py-2 text-center font-mono font-semibold"
              >
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-white/5">
            <th scope="row" className="py-2 pr-3 text-left text-xs text-slate">
              Par
            </th>
            {holes.map((n) => (
              <td
                key={n}
                className="px-1.5 py-2 text-center font-mono text-slate"
              >
                {holeMeta.get(n)?.par ?? '—'}
              </td>
            ))}
          </tr>
          <tr className="border-t border-white/5">
            <th scope="row" className="py-2 pr-3 text-left text-xs text-slate">
              SI
            </th>
            {holes.map((n) => (
              <td
                key={n}
                className="px-1.5 py-2 text-center font-mono text-slate/70"
              >
                {holeMeta.get(n)?.stroke_index ?? '—'}
              </td>
            ))}
          </tr>
          <tr className="border-t border-white/10">
            <th
              scope="row"
              className="py-2 pr-3 text-left text-xs font-semibold text-silver"
            >
              Score
            </th>
            {holes.map((n) => (
              <td key={n} className="px-1 py-2 text-center">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  aria-label={`Hole ${n} strokes`}
                  value={strokes[n] ?? ''}
                  onChange={(e) => onChange(n, e.target.value)}
                  className={cn(
                    'h-11 w-11 rounded-lg border border-white/10 bg-white/5 text-center font-mono text-base font-bold text-silver',
                    'focus:outline-none focus-visible:border-azure focus-visible:ring-2 focus-visible:ring-azure/40',
                  )}
                  data-testid={`hole-${entryId}-${n}`}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// The backend's computed figures after a submit. All display — never derived.
function ScoreResult({
  result,
  format,
}: {
  result: SubmitScoreResult;
  format: Tournament['format'];
}) {
  return (
    <div
      className="mt-4 rounded-xl bg-emerald-500/10 p-4"
      data-testid="score-result"
    >
      <p className="flex items-center gap-2 text-sm font-bold text-emerald-300">
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        Score saved
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Stat label="Gross" value={result.gross_score} />
        <Stat label="Net" value={result.net_score} />
        {format === 'stableford' ? (
          <Stat label="Points" value={result.stableford_points} />
        ) : null}
        <Stat
          label="Position"
          value={result.position != null ? `#${result.position}` : null}
        />
        <Stat label="Course HCP" value={result.course_handicap} />
      </dl>
      {result.new_handicap_index != null ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-gold">
          <TrendingUp className="h-4 w-4" aria-hidden />
          Handicap updated to {result.new_handicap_index}
        </p>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-slate">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-lg font-black text-silver">
        {value == null ? '—' : value}
      </dd>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function TournamentEnterScoresPage() {
  const { id } = useParams<{ id: string }>();
  const tournamentId = Number(id);
  const validId = Number.isFinite(tournamentId) && tournamentId > 0;

  const tournamentQuery = useTournament(tournamentId);
  const entriesQuery = useTournamentEntries(tournamentId);
  const scoresQuery = useTournamentScores(tournamentId);
  const names = useJuniorNames();
  const t = tournamentQuery.data;
  const holesQuery = useCourseHoles(t?.course_id);

  // Invalid / not-found id.
  if (
    !validId ||
    (tournamentQuery.isError &&
      tournamentQuery.error instanceof ApiError &&
      tournamentQuery.error.status === 404)
  ) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in-up">
        <Link
          to="/tournaments"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate hover:text-azure"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All tournaments
        </Link>
        <GlassCard
          className="mt-6 px-6 py-16 text-center"
          data-testid="enter-scores-not-found"
        >
          <ClipboardList className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
          <p className="mt-4 text-base font-bold text-silver">
            Tournament not found
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <BackLink id={tournamentId} />

      {tournamentQuery.isLoading ? (
        <div className="mt-6 flex items-center gap-3 py-12 text-sm text-slate">
          <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
          Loading tournament…
        </div>
      ) : tournamentQuery.isError ? (
        <div
          role="alert"
          className="mt-6 rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
          data-testid="enter-scores-error"
        >
          {errorMessage(tournamentQuery.error, 'Could not load this tournament.')}
        </div>
      ) : t ? (
        <>
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(t.status)} shape="pill">
                {statusLabel(t.status)}
              </Badge>
              <Badge tone="azure">{formatLabel(t.format)}</Badge>
              <Badge tone="emerald">{scoringBasisLabel(t.scoring_basis)}</Badge>
              <Badge tone="slate">
                <span className="font-mono">{t.holes}</span>&nbsp;holes
              </Badge>
            </div>
            <h1 className="mt-3 text-2xl font-black text-silver">
              Enter scores
            </h1>
            <p className="mt-1 text-sm text-slate">{t.name}</p>
          </div>

          {/* Status gate */}
          {t.status !== 'in_progress' ? (
            <GlassCard
              className="mt-6 px-6 py-12 text-center"
              data-testid="enter-scores-status-gate"
            >
              <Lock className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
              <p className="mt-4 text-base font-bold text-silver">
                Scoring isn&apos;t open yet
              </p>
              <p className="mt-1 text-sm text-slate">
                Scores can only be entered while the tournament is in progress.
                Current status: {statusLabel(t.status)}.
              </p>
            </GlassCard>
          ) : (
            <EntryList
              tournament={t}
              entriesQuery={entriesQuery}
              scoresQuery={scoresQuery}
              holesQuery={holesQuery}
              names={names}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function EntryList({
  tournament,
  entriesQuery,
  scoresQuery,
  holesQuery,
  names,
}: {
  tournament: Tournament;
  entriesQuery: ReturnType<typeof useTournamentEntries>;
  scoresQuery: ReturnType<typeof useTournamentScores>;
  holesQuery: ReturnType<typeof useCourseHoles>;
  names: ReturnType<typeof useJuniorNames>;
}) {
  // Loading: wait on the data we need to render rows (entries + names). Holes /
  // existing scores enrich but shouldn't block the list.
  if (entriesQuery.isLoading || names.isLoading) {
    return (
      <div className="mt-6 flex items-center gap-3 py-12 text-sm text-slate">
        <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
        Loading entries…
      </div>
    );
  }

  if (entriesQuery.isError) {
    return (
      <div
        role="alert"
        className="mt-6 rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
        data-testid="entries-error"
      >
        {errorMessage(entriesQuery.error, 'Could not load entries.')}
      </div>
    );
  }

  const entries = (entriesQuery.data ?? []).filter(isScoreable);

  if (entries.length === 0) {
    return (
      <GlassCard
        className="mt-6 px-6 py-12 text-center"
        data-testid="entries-empty"
      >
        <ClipboardList className="mx-auto h-10 w-10 text-slate/60" aria-hidden />
        <p className="mt-4 text-base font-bold text-silver">
          No entries to score yet
        </p>
        <p className="mt-1 text-sm text-slate">
          Once juniors are registered for this event, their scorecards will
          appear here.
        </p>
      </GlassCard>
    );
  }

  const scoreByEntry = new Map<number, TournamentScore>();
  for (const sc of scoresQuery.data ?? []) scoreByEntry.set(sc.entry_id, sc);
  const holes = holesQuery.data ?? [];

  return (
    <div className="mt-6 space-y-6">
      {holesQuery.isError ? (
        <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-gold">
          Couldn&apos;t load the course scorecard (par / stroke index), so per-hole
          guidance is hidden. You can still enter strokes or a total.
        </p>
      ) : null}
      {entries.map((entry) => (
        <EntryScorecard
          key={entry.id}
          tournament={tournament}
          entry={entry}
          name={names.nameFor(entry.junior_id)}
          holes={holes}
          existing={scoreByEntry.get(entry.id)}
        />
      ))}
    </div>
  );
}
