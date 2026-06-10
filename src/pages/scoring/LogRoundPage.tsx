// LOG A ROUND — players log their own rounds; coaches/admins log on a junior's
// behalf (route /log-round, guards wired in App.tsx by the integrator). Submits
// via POST /api/scores/sync through round-entry.queries. THE BACKEND OWNS ALL
// WHS MATH: the differential and any new handicap index are displayed straight
// from the response. The only arithmetic here is summing hole strokes into a
// gross total (allowed — plain arithmetic, not WHS).
//
// Player-entered rounds come back PENDING (a coach verifies before the index
// moves); staff-entered rounds are verified immediately. The success card
// explains which of the three outcomes happened, in plain encouraging language
// (juniors use this page).

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Flag,
  Loader2,
  Send,
  TrendingUp,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { useAuth } from '../../auth/useAuth';
import type { CourseTee, Hole } from '../../types/api';
import { useCoursesWithTees, useHoles } from '../admin/admin-courses.queries';
import {
  useJuniors,
  usePlayerUsers,
} from '../coach/coach-evaluations.queries';
import {
  submitHoleScores,
  useSubmitRound,
  type HoleStrokesInput,
  type SyncScoreInput,
  type SyncScoreResult,
} from './round-entry.queries';

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50';

const labelClass = 'block text-sm font-semibold text-silver';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

// Local today as ISO YYYY-MM-DD (not UTC — coaches log rounds in the evening).
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// Tee option label: "White · Men · 73.0/137"
function teeLabel(tee: CourseTee): string {
  const gender = tee.gender
    ? tee.gender.charAt(0).toUpperCase() + tee.gender.slice(1)
    : '';
  const name = tee.name || tee.color;
  return [name, gender, `${tee.course_rating}/${tee.slope_rating}`]
    .filter(Boolean)
    .join(' · ');
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-slate">{hint}</p> : null}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-left ring-1 ring-white/10 transition-colors hover:bg-white/10"
      data-testid={testId}
    >
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-azure' : 'bg-white/15',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
          )}
        />
      </span>
      <span className="text-sm text-silver">{label}</span>
    </button>
  );
}

// ── Per-hole grid (mirrors TournamentEnterScoresPage's visual approach) ───────

type StrokesState = Record<number, string>;

function GridNine({
  label,
  holes,
  holeMeta,
  strokes,
  onChange,
}: {
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
              <td key={n} className="px-1.5 py-2 text-center font-mono text-slate">
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
                  data-testid={`log-hole-${n}`}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Success card — the three outcomes, all straight off the response ──────────

function SuccessCard({
  result,
  onReset,
  forPlayerName,
}: {
  result: SyncScoreResult;
  onReset: () => void;
  forPlayerName: string | null;
}) {
  const sc = result.scorecard;
  return (
    <GlassCard className="mt-6 p-6" data-testid="log-round-success">
      <p className="flex items-center gap-2 text-base font-black text-emerald-300">
        <CheckCircle2 className="h-5 w-5" aria-hidden />
        Round saved{forPlayerName ? ` for ${forPlayerName}` : ' — nice work!'}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-slate">Gross</dt>
          <dd className="mt-0.5 font-mono text-2xl font-black text-silver">
            {sc.gross_score}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-slate">
            Differential
          </dt>
          <dd className="mt-0.5 font-mono text-2xl font-black text-silver">
            {result.differential}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-slate">Course</dt>
          <dd className="mt-0.5 text-sm font-bold text-silver">
            {sc.course_name || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-slate">Tee</dt>
          <dd className="mt-0.5 text-sm font-bold text-silver">
            {sc.tee_color || '—'}
          </dd>
        </div>
      </dl>

      {result.new_handicap_index != null ? (
        <p
          className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm font-bold text-emerald-300"
          data-testid="success-new-index"
        >
          <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />
          New handicap index: {result.new_handicap_index}
        </p>
      ) : !sc.counts_toward_handicap ? (
        <p
          className="mt-4 flex items-center gap-2 rounded-xl bg-slate/10 p-3 text-sm font-semibold text-slate"
          data-testid="success-practice"
        >
          <Flag className="h-4 w-4 shrink-0" aria-hidden />
          Practice round — doesn&apos;t affect your handicap.
        </p>
      ) : (
        <p
          className="mt-4 flex items-center gap-2 rounded-xl bg-amber-500/10 p-3 text-sm font-semibold text-gold"
          data-testid="success-pending"
        >
          <Clock className="h-4 w-4 shrink-0" aria-hidden />
          Awaiting verification — a coach will confirm this round before it
          affects your handicap.
        </p>
      )}

      <div className="mt-5">
        <Button size="md" onClick={onReset} data-testid="log-another">
          Log another round
        </Button>
      </div>
    </GlassCard>
  );
}

// ── Staff junior picker ───────────────────────────────────────────────────────
// Owns the useJuniors/usePlayerUsers queries so they fire ONLY when this
// component is mounted — and it is only mounted for staff (admin/coach). A
// player's browser must never request the club-wide juniors roster or the
// users list (privacy rule; /api/users also 403s for players).

function StaffJuniorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (userId: string, label: string | null) => void;
}) {
  const juniors = useJuniors();
  const playerUsers = usePlayerUsers();

  // Staff junior options: /api/juniors gives junior -> user_id; names come from
  // the player users list (same join as coach-evaluations' useGolferNames).
  const juniorOptions = useMemo(() => {
    const nameByUserId = new Map(
      (playerUsers.data ?? []).map((u) => [u.id, u.full_name]),
    );
    return (juniors.data ?? []).map((j) => ({
      userId: j.user_id,
      label: nameByUserId.get(j.user_id)?.trim() || `Golfer #${j.id}`,
    }));
  }, [juniors.data, playerUsers.data]);

  return (
    <Field
      label="Player"
      htmlFor="log-junior"
      hint="The junior this round belongs to."
    >
      <select
        id="log-junior"
        className={inputClass}
        value={value}
        disabled={juniors.isLoading || playerUsers.isLoading}
        onChange={(e) => {
          const userId = e.target.value;
          onChange(
            userId,
            juniorOptions.find((o) => o.userId === userId)?.label ?? null,
          );
        }}
        data-testid="log-junior-picker"
      >
        <option value="" className="bg-navy">
          {juniors.isLoading || playerUsers.isLoading
            ? 'Loading juniors…'
            : 'Choose a junior'}
        </option>
        {juniorOptions.map((o) => (
          <option key={o.userId} value={o.userId} className="bg-navy">
            {o.label}
          </option>
        ))}
      </select>
      {juniors.isError || playerUsers.isError ? (
        <p className="mt-1 text-xs text-red-400" role="alert">
          Could not load the juniors list. Please try again.
        </p>
      ) : null}
    </Field>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LogRoundPage() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'coach';

  const coursesQuery = useCoursesWithTees();
  const submit = useSubmitRound();

  // Form state. The selected junior's display name lives here (reported by
  // StaffJuniorPicker) so the success card can show it after the picker — and
  // its queries — have unmounted.
  const [targetUserId, setTargetUserId] = useState('');
  const [targetUserName, setTargetUserName] = useState<string | null>(null);
  const [courseId, setCourseId] = useState('');
  const [teeSetId, setTeeSetId] = useState('');
  const [holesPlayed, setHolesPlayed] = useState<9 | 18>(18);
  const [datePlayed, setDatePlayed] = useState(todayISO);
  const [counts, setCounts] = useState(true);
  const [gross, setGross] = useState('');
  const [gridOpen, setGridOpen] = useState(false);
  const [strokes, setStrokes] = useState<StrokesState>({});

  // Default the course once the list loads (typically just Karen CC).
  useEffect(() => {
    if (!courseId && coursesQuery.data?.length) {
      setCourseId(String(coursesQuery.data[0].id));
    }
  }, [courseId, coursesQuery.data]);

  const selectedCourse = useMemo(
    () => coursesQuery.data?.find((c) => String(c.id) === courseId),
    [coursesQuery.data, courseId],
  );

  // Par/SI reference for the optional per-hole grid (display only).
  const holesQuery = useHoles(selectedCourse?.id);
  const holeMeta = useMemo(() => {
    const map = new Map<number, Hole>();
    for (const h of holesQuery.data ?? []) map.set(h.hole_number, h);
    return map;
  }, [holesQuery.data]);

  const holeNumbers = useMemo(
    () => Array.from({ length: holesPlayed }, (_, i) => i + 1),
    [holesPlayed],
  );

  // Running total of grid strokes — plain arithmetic (allowed), never WHS.
  const filledEntries = useMemo<HoleStrokesInput[]>(() => {
    const out: HoleStrokesInput[] = [];
    for (const n of holeNumbers) {
      const raw = strokes[n];
      if (raw != null && raw !== '') {
        const v = Number(raw);
        if (Number.isFinite(v) && v > 0) out.push({ hole_number: n, strokes: v });
      }
    }
    return out;
  }, [holeNumbers, strokes]);

  const gridInUse = gridOpen && filledEntries.length > 0;
  const gridComplete = filledEntries.length === holesPlayed;
  const runningTotal = filledEntries.reduce((sum, h) => sum + h.strokes, 0);

  // The gross we submit: the grid's sum when the grid is in use, else the quick
  // total field.
  const effectiveGross = gridInUse ? runningTotal : Number(gross);

  const today = todayISO();
  const canSubmit =
    teeSetId !== '' &&
    datePlayed !== '' &&
    datePlayed <= today &&
    (!isStaff || targetUserId !== '') &&
    (gridInUse ? gridComplete : gross !== '' && Number(gross) > 0) &&
    !submit.isPending;

  function resetForAnother() {
    setGross('');
    setStrokes({});
    submit.reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    const body: SyncScoreInput = {
      tee_set_id: Number(teeSetId),
      gross_score: effectiveGross,
      holes_played: holesPlayed,
      date_played: datePlayed,
      counts_toward_handicap: counts,
    };
    if (isStaff && targetUserId) body.user_id = targetUserId;

    const holeDetail = gridInUse && gridComplete ? [...filledEntries] : null;

    submit.mutate(body, {
      onSuccess: (result) => {
        // Optional per-hole detail — best-effort, never blocks the success.
        if (holeDetail) {
          void submitHoleScores(result.scorecard.id, holeDetail);
        }
      },
    });
  }

  // After a successful submit, show the result card instead of the form.
  if (submit.isSuccess && submit.data) {
    return (
      <PageShell isStaff={isStaff}>
        <SuccessCard
          result={submit.data}
          onReset={resetForAnother}
          forPlayerName={isStaff ? targetUserName : null}
        />
      </PageShell>
    );
  }

  const front = holeNumbers.filter((n) => n <= 9);
  const back = holeNumbers.filter((n) => n >= 10);

  return (
    <PageShell isStaff={isStaff}>
      <form onSubmit={handleSubmit} noValidate>
        <GlassCard className="mt-6 px-5 py-5 sm:px-6">
          <div className="space-y-5">
            {/* Staff: who played the round. Mounted ONLY for staff so the
                juniors/users queries never fire for players. */}
            {isStaff ? (
              <StaffJuniorPicker
                value={targetUserId}
                onChange={(userId, label) => {
                  setTargetUserId(userId);
                  setTargetUserName(label);
                }}
              />
            ) : null}

            {/* Course + tee. */}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Course" htmlFor="log-course">
                <select
                  id="log-course"
                  className={inputClass}
                  value={courseId}
                  disabled={coursesQuery.isLoading}
                  onChange={(e) => {
                    setCourseId(e.target.value);
                    setTeeSetId(''); // tees are course-specific
                  }}
                  data-testid="log-course-picker"
                >
                  {coursesQuery.isLoading ? (
                    <option value="" className="bg-navy">
                      Loading courses…
                    </option>
                  ) : null}
                  {(coursesQuery.data ?? []).map((c) => (
                    <option key={c.id} value={c.id} className="bg-navy">
                      {c.name}
                    </option>
                  ))}
                </select>
                {coursesQuery.isError ? (
                  <p className="mt-1 text-xs text-red-400" role="alert">
                    {errorMessage(coursesQuery.error, 'Could not load courses.')}
                  </p>
                ) : null}
              </Field>

              <Field
                label="Tee played"
                htmlFor="log-tee"
                hint="Which markers you played from."
              >
                <select
                  id="log-tee"
                  className={inputClass}
                  value={teeSetId}
                  disabled={!selectedCourse}
                  onChange={(e) => setTeeSetId(e.target.value)}
                  data-testid="log-tee-picker"
                >
                  <option value="" className="bg-navy">
                    {selectedCourse ? 'Choose a tee' : 'Select a course first'}
                  </option>
                  {(selectedCourse?.tees ?? []).map((tee) => (
                    <option key={tee.id} value={tee.id} className="bg-navy">
                      {teeLabel(tee)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Holes + date. */}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Holes played">
                <div className="flex gap-3" role="radiogroup" aria-label="Holes played">
                  {([18, 9] as const).map((h) => {
                    const active = holesPlayed === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setHolesPlayed(h)}
                        className={cn(
                          'flex-1 rounded-xl px-4 py-3 text-sm font-bold ring-1 transition-all',
                          active
                            ? 'bg-azure/20 text-azure ring-azure/60'
                            : 'bg-white/5 text-slate ring-white/10 hover:bg-white/10',
                        )}
                        data-testid={`log-holes-${h}`}
                      >
                        {h} holes
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Date played" htmlFor="log-date">
                <input
                  id="log-date"
                  type="date"
                  className={inputClass}
                  value={datePlayed}
                  max={today}
                  onChange={(e) => setDatePlayed(e.target.value)}
                  data-testid="log-date"
                />
              </Field>
            </div>

            <Field label="Counts toward handicap" hint="Turn off for practice rounds.">
              <Toggle
                checked={counts}
                onChange={setCounts}
                label={counts ? 'Counts toward handicap' : 'Practice round only'}
                testId="log-counts-toggle"
              />
            </Field>

            {/* The score: quick total, or the optional per-hole grid. */}
            <div>
              <label htmlFor="log-gross" className={labelClass}>
                Total gross score
              </label>
              <p className="mt-0.5 text-xs text-slate">
                {gridInUse
                  ? 'Adding up from your hole-by-hole scores below.'
                  : 'Every stroke counted — enter your total here.'}
              </p>
              <input
                id="log-gross"
                type="number"
                inputMode="numeric"
                min={1}
                value={gridInUse ? String(runningTotal) : gross}
                disabled={gridInUse}
                onChange={(e) => setGross(e.target.value)}
                className="mt-2 w-full max-w-xs rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center font-mono text-2xl font-black text-silver focus:outline-none focus-visible:border-azure focus-visible:ring-2 focus-visible:ring-azure/40 disabled:opacity-70"
                data-testid="log-gross-input"
              />
            </div>

            <div>
              <button
                type="button"
                onClick={() => setGridOpen((open) => !open)}
                className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-azure transition-colors hover:text-azure/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
                aria-expanded={gridOpen}
                data-testid="log-grid-toggle"
              >
                {gridOpen ? (
                  <ChevronUp className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden />
                )}
                {gridOpen ? 'Hide hole-by-hole entry' : 'Enter hole by hole (optional)'}
              </button>

              {gridOpen ? (
                <div className="mt-4 space-y-5">
                  {holesQuery.isError ? (
                    <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-gold">
                      Couldn&apos;t load the course scorecard (par / stroke
                      index), so per-hole guidance is hidden. You can still
                      enter strokes or a total.
                    </p>
                  ) : null}
                  <GridNine
                    label={back.length ? 'Front 9' : 'Holes'}
                    holes={front}
                    holeMeta={holeMeta}
                    strokes={strokes}
                    onChange={(n, value) =>
                      setStrokes((prev) => ({ ...prev, [n]: value }))
                    }
                  />
                  {back.length ? (
                    <GridNine
                      label="Back 9"
                      holes={back}
                      holeMeta={holeMeta}
                      strokes={strokes}
                      onChange={(n, value) =>
                        setStrokes((prev) => ({ ...prev, [n]: value }))
                      }
                    />
                  ) : null}
                  {gridInUse ? (
                    <p className="text-right text-xs text-slate">
                      Gross so far:{' '}
                      <span className="font-mono font-bold text-silver">
                        {runningTotal}
                      </span>
                    </p>
                  ) : null}
                  {gridInUse && !gridComplete ? (
                    <p
                      role="alert"
                      className="rounded-xl bg-amber-500/10 p-3 text-sm text-gold"
                      data-testid="log-grid-incomplete"
                    >
                      Enter all {holesPlayed} holes, or clear the grid to use the
                      total instead.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {submit.isError ? (
              <p
                role="alert"
                className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
                data-testid="log-round-error"
              >
                {errorMessage(
                  submit.error,
                  'Could not save the round. Please try again.',
                )}
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                size="md"
                disabled={!canSubmit}
                data-testid="log-round-submit"
              >
                {submit.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                Save round
              </Button>
            </div>
          </div>
        </GlassCard>
      </form>
    </PageShell>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────

function PageShell({
  isStaff,
  children,
}: {
  isStaff: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Scoring
      </p>
      <h1 className="mt-1 text-2xl font-black text-silver sm:text-3xl">
        Log a round
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        {isStaff
          ? 'Enter a round on a junior’s behalf. Staff-entered rounds are verified immediately.'
          : 'Played golf? Enter your score — every round helps your game grow.'}
      </p>
      {children}
    </div>
  );
}
