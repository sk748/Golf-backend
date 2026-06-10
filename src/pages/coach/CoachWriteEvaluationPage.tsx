// Coach monthly-evaluation CREATION — the band-conditional form (CLAUDE.md calls
// this the most "intelligent" piece of frontend work in the app). One flat row
// per golfer per month: common fields + exactly ONE band-specific section,
// chosen by the golfer's level band (report_template: skills / practice_scores /
// competition). Duplicate junior+month is a backend 409 — surfaced as "already
// exists for {month}", never a generic error.
//
// Sign-off is sequential: this page may save, or save + coach-sign. It NEVER
// offers a committee signature (that's the committee's counter-sign page).
//
// Route: /evaluations/new (coach/admin — guard wired in App.tsx by the owner).

import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  PenLine,
  Save,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useAuth } from '../../auth/useAuth';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import type { JuniorProfile, LevelBand } from '../../types/api';
import {
  useCoachSign,
  useCreateEvaluation,
  useEvaluationsFor,
  useGolferNames,
  useJuniorCompetitionsForMonth,
  useJuniors,
  type CreateEvaluationInput,
} from './coach-evaluations.queries';
import {
  useLevelBands,
  type Evaluation,
  type EvaluationAssessment,
  type EvaluationRecommendation,
} from '../committee/committee-evaluations.queries';
import {
  assessmentLabel,
  formatMonth,
  monthOptions,
  recommendationLabel,
} from '../committee/committee-format';

// ── Shared bits (match the app's glass form treatment) ────────────────────────

const inputClass =
  'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50';

const labelClass = 'block text-sm font-semibold text-silver';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
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

function SectionCard({
  icon,
  title,
  children,
  testId,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <GlassCard className="overflow-hidden" data-testid={testId}>
      <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
        {icon}
        <h2 className="text-sm font-bold uppercase tracking-widest text-azure">
          {title}
        </h2>
      </div>
      <div className="space-y-5 px-5 py-5">{children}</div>
    </GlassCard>
  );
}

// ── Number parsing ("" stays unset) ───────────────────────────────────────────

function parseIntField(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

// Decimal to 1dp (the avg_score columns are Numeric(4,1)).
function parseDecimal1dp(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined;
}

// ── Band resolution ────────────────────────────────────────────────────────────
// A junior's band = the row matching their band_id, falling back to the band
// whose [min_level, max_level] contains current_level (mirrors the committee
// page's level-range vocabulary). The band's report_template picks the section.

type ReportTemplate = 'skills' | 'practice_scores' | 'competition';

function resolveBand(
  junior: JuniorProfile | undefined,
  bands: LevelBand[] | undefined,
): LevelBand | undefined {
  if (!junior || !bands) return undefined;
  return (
    bands.find((b) => b.id === junior.band_id) ??
    bands.find(
      (b) =>
        junior.current_level >= b.min_level &&
        junior.current_level <= b.max_level,
    )
  );
}

// Template off the band row; if bands haven't loaded, derive from the level the
// same way the committee read-view does (L1–3 skills, L4–5 practice, L6+ comp).
function resolveTemplate(
  band: LevelBand | undefined,
  level: number,
): ReportTemplate {
  if (
    band?.report_template === 'skills' ||
    band?.report_template === 'practice_scores' ||
    band?.report_template === 'competition'
  ) {
    return band.report_template;
  }
  if (level <= 3) return 'skills';
  if (level <= 5) return 'practice_scores';
  return 'competition';
}

const TEMPLATE_SECTION_TITLES: Record<ReportTemplate, string> = {
  skills: 'Skills focus',
  practice_scores: 'Practice scores',
  competition: 'Competition record',
};

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  attendance_count: string;
  attendance_total: string;
  assessment: '' | EvaluationAssessment;
  recommendation: '' | EvaluationRecommendation;
  special_remarks: string;
  putting_assessment: string;
  chipping_assessment: string;
  full_swing_assessment: string;
  avg_score_9: string;
  avg_score_18: string;
  competitions_played: string;
  best_gross_score: string;
}

const EMPTY_FORM: FormState = {
  attendance_count: '',
  attendance_total: '',
  assessment: '',
  recommendation: '',
  special_remarks: '',
  putting_assessment: '',
  chipping_assessment: '',
  full_swing_assessment: '',
  avg_score_9: '',
  avg_score_18: '',
  competitions_played: '',
  best_gross_score: '',
};

const ASSESSMENT_OPTIONS: EvaluationAssessment[] = [
  'below_expectation',
  'meeting_expectation',
  'exceeding_expectation',
];

const RECOMMENDATION_OPTIONS: EvaluationRecommendation[] = [
  'continue_level',
  'move_next_level',
];

// What the page shows after a successful save.
interface SaveOutcome {
  golferName: string;
  month: string;
  signed: boolean;
  signError: string | null;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function CoachWriteEvaluationPage() {
  const { user } = useAuth();
  const coachId = user?.id;

  const juniorsQuery = useJuniors();
  const bandsQuery = useLevelBands();
  const { nameFor } = useGolferNames();
  const months = useMemo(() => monthOptions(12), []);

  const [juniorIdRaw, setJuniorIdRaw] = useState('');
  const [month, setMonth] = useState<string>(months[0]);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);

  const juniorId = juniorIdRaw ? Number(juniorIdRaw) : undefined;
  const junior = (juniorsQuery.data ?? []).find((j) => j.id === juniorId);
  const band = resolveBand(junior, bandsQuery.data);

  // Duplicate guard: one row per golfer per month. While this query is in
  // flight we hold the form back, so the coach can't start typing into a month
  // that already has a row.
  const existingQuery = useEvaluationsFor(juniorId, month);
  const existing = existingQuery.data?.[0];

  const pickerReady = Boolean(junior && month);

  const select = (value: string) => {
    setJuniorIdRaw(value);
    setOutcome(null);
  };
  const pickMonth = (value: string) => {
    setMonth(value);
    setOutcome(null);
  };
  const reset = () => {
    setJuniorIdRaw('');
    setOutcome(null);
  };

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-slate transition-colors hover:text-azure focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back
      </Link>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Coaching
      </p>
      <h1 className="mt-1 text-2xl font-black text-silver sm:text-3xl">
        Write monthly evaluation
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        One evaluation per golfer per month. The form shows the section that
        matches the golfer&apos;s level band.
      </p>

      <div className="mt-6 space-y-6">
        {/* ── 1 · Golfer + month ─────────────────────────────────────────── */}
        <SectionCard
          icon={<UserRound className="h-4 w-4 text-azure" aria-hidden />}
          title="Golfer & month"
          testId="eval-picker"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Golfer" htmlFor="eval-junior">
              <select
                id="eval-junior"
                className={inputClass}
                value={juniorIdRaw}
                disabled={juniorsQuery.isLoading}
                onChange={(e) => select(e.target.value)}
                data-testid="eval-junior-select"
              >
                <option value="" className="bg-navy">
                  {juniorsQuery.isLoading
                    ? 'Loading golfers…'
                    : 'Choose a golfer'}
                </option>
                {(juniorsQuery.data ?? []).map((j) => (
                  <option key={j.id} value={j.id} className="bg-navy">
                    {nameFor(j.id)} · L{j.current_level}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Report month" htmlFor="eval-month">
              <select
                id="eval-month"
                className={inputClass}
                value={month}
                onChange={(e) => pickMonth(e.target.value)}
                data-testid="eval-month-select"
              >
                {months.map((m) => (
                  <option key={m} value={m} className="bg-navy">
                    {formatMonth(m)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {juniorsQuery.isError ? (
            <p className="text-xs text-red-400" role="alert">
              Could not load golfers:{' '}
              {errorMessage(juniorsQuery.error, 'please try again.')}
            </p>
          ) : null}
          {!juniorsQuery.isLoading &&
          !juniorsQuery.isError &&
          (juniorsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-slate" data-testid="eval-no-juniors">
              No junior golfers found yet.
            </p>
          ) : null}

          {junior ? (
            <div
              className="flex flex-wrap items-center gap-2"
              data-testid="eval-band-badge"
            >
              <Badge tone="azure">
                {band
                  ? `${band.band_label} (L${band.min_level}–${band.max_level})`
                  : `Level ${junior.current_level}`}
              </Badge>
              <Badge tone="slate">L{junior.current_level}</Badge>
              {band ? (
                <span className="text-xs text-slate">
                  {TEMPLATE_SECTION_TITLES[resolveTemplate(band, junior.current_level)]}{' '}
                  section · band minimum {band.min_sessions} sessions
                </span>
              ) : null}
            </div>
          ) : null}
        </SectionCard>

        {/* ── 2 · Guard / form ───────────────────────────────────────────── */}
        {!pickerReady ? (
          <GlassCard
            className="px-6 py-10 text-center text-sm text-slate"
            data-testid="eval-pick-prompt"
          >
            Choose a golfer and a month to begin.
          </GlassCard>
        ) : outcome ? (
          <SuccessCard outcome={outcome} onReset={reset} />
        ) : existingQuery.isLoading ? (
          <div
            className="flex items-center justify-center gap-3 py-10 text-sm text-slate"
            data-testid="eval-existing-loading"
          >
            <Loader2 className="h-5 w-5 animate-spin text-azure" aria-hidden />
            Checking for an existing evaluation…
          </div>
        ) : existingQuery.isError ? (
          <GlassCard
            className="border border-red-500/30 bg-red-500/10 p-5"
            role="alert"
            data-testid="eval-existing-error"
          >
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
              <span className="text-sm font-semibold">
                {errorMessage(
                  existingQuery.error,
                  'Could not check for an existing evaluation.',
                )}
              </span>
            </div>
          </GlassCard>
        ) : existing ? (
          <ExistingEvaluationCard
            evaluation={existing}
            golferName={nameFor(existing.junior_id)}
            coachId={coachId}
          />
        ) : junior ? (
          <EvaluationForm
            key={`${junior.id}-${month}`}
            junior={junior}
            band={band}
            month={month}
            coachId={coachId}
            golferName={nameFor(junior.id)}
            onSaved={setOutcome}
          />
        ) : null}
      </div>
    </div>
  );
}

// ── Existing-evaluation guard ──────────────────────────────────────────────────
// Shown instead of the form when the golfer already has a row for the month.
// Offers the coach-sign action when it's this coach's own unsigned evaluation
// (the backend only lets the assigned coach sign). Never a committee control.

function ExistingEvaluationCard({
  evaluation,
  golferName,
  coachId,
}: {
  evaluation: Evaluation;
  golferName: string;
  coachId?: string;
}) {
  const sign = useCoachSign();
  const isMine = coachId != null && String(evaluation.coach_id) === String(coachId);
  const canSign = isMine && !evaluation.coach_signed;

  return (
    <GlassCard className="p-5 sm:p-6" data-testid="eval-existing">
      <div className="flex items-start gap-3">
        <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden />
        <div className="min-w-0">
          <p className="font-bold text-silver">
            Already evaluated for {formatMonth(evaluation.report_month)}
          </p>
          <p className="mt-1 text-sm text-slate">
            {golferName} has an evaluation for this month — only one is allowed
            per golfer per month.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <Badge tone={evaluation.coach_signed ? 'gold' : 'slate'}>
          {evaluation.coach_signed ? 'Coach signed' : 'Coach pending'}
        </Badge>
        <Badge tone={evaluation.committee_signed ? 'emerald' : 'slate'}>
          {evaluation.committee_signed
            ? 'Counter-signed'
            : 'Counter-sign pending'}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div className="glass-light rounded-xl p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">
            Attendance
          </p>
          <p className="mt-1 font-semibold text-silver">
            {evaluation.attendance_total != null
              ? `${evaluation.attendance_count} / ${evaluation.attendance_total}`
              : String(evaluation.attendance_count)}
          </p>
        </div>
        <div className="glass-light rounded-xl p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">
            Assessment
          </p>
          <p className="mt-1 font-semibold text-silver">
            {assessmentLabel(evaluation.assessment)}
          </p>
        </div>
        <div className="glass-light rounded-xl p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">
            Recommendation
          </p>
          <p className="mt-1 font-semibold text-silver">
            {recommendationLabel(evaluation.recommendation)}
          </p>
        </div>
      </div>

      {canSign ? (
        <div className="mt-5 border-t border-white/10 pt-4">
          {sign.isError ? (
            <p
              className="mb-3 flex items-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-400"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {errorMessage(sign.error, 'Could not sign. Please try again.')}
            </p>
          ) : null}
          <Button
            variant="gold"
            size="md"
            disabled={sign.isPending}
            onClick={() => sign.mutate(evaluation.id)}
            data-testid="eval-existing-sign"
          >
            {sign.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <PenLine className="h-4 w-4" aria-hidden />
            )}
            {sign.isPending ? 'Signing…' : 'Sign this evaluation'}
          </Button>
        </div>
      ) : null}
    </GlassCard>
  );
}

// ── Success state ──────────────────────────────────────────────────────────────

function SuccessCard({
  outcome,
  onReset,
}: {
  outcome: SaveOutcome;
  onReset: () => void;
}) {
  return (
    <GlassCard className="p-6 text-center" data-testid="eval-success">
      <CheckCircle2
        className="mx-auto h-10 w-10 text-emerald-400"
        aria-hidden
      />
      <p className="mt-3 text-lg font-black text-silver">
        Evaluation saved{outcome.signed ? ' and signed' : ''}
      </p>
      <p className="mt-1 text-sm text-slate">
        {outcome.golferName} · {formatMonth(outcome.month)}
        {outcome.signed
          ? ' — it now awaits the committee counter-sign.'
          : ' — saved as a draft; sign it when ready.'}
      </p>
      {outcome.signError ? (
        <p
          className="mx-auto mt-3 max-w-md rounded-xl bg-gold/10 px-3 py-2 text-sm text-gold"
          role="alert"
          data-testid="eval-sign-failed"
        >
          The evaluation was saved, but signing failed:{' '}
          {outcome.signError} You can sign it from your dashboard queue.
        </p>
      ) : null}
      <div className="mt-5">
        <Button variant="ghost" size="md" onClick={onReset} data-testid="eval-write-another">
          Write another evaluation
        </Button>
      </div>
    </GlassCard>
  );
}

// ── The band-conditional form ──────────────────────────────────────────────────

function EvaluationForm({
  junior,
  band,
  month,
  coachId,
  golferName,
  onSaved,
}: {
  junior: JuniorProfile;
  band: LevelBand | undefined;
  month: string;
  coachId?: string;
  golferName: string;
  onSaved: (outcome: SaveOutcome) => void;
}) {
  const queryClient = useQueryClient();
  const create = useCreateEvaluation();
  const sign = useCoachSign();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const template = resolveTemplate(band, junior.current_level);
  const bandLabel = band?.band_label ?? `Level ${junior.current_level}`;

  // Month-scoped, backend-computed stats prefill (competition template only).
  const comps = useJuniorCompetitionsForMonth(
    template === 'competition' ? junior.id : undefined,
    month,
  );

  const attendanceCount = parseIntField(form.attendance_count);
  const valid =
    attendanceCount !== undefined &&
    attendanceCount >= 0 &&
    form.assessment !== '' &&
    form.recommendation !== '';

  const busy = create.isPending || sign.isPending;

  const set = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));

  function buildPayload(): CreateEvaluationInput {
    const payload: CreateEvaluationInput = {
      junior_id: junior.id,
      coach_id: coachId ?? '',
      report_month: month,
      current_level: junior.current_level,
      attendance_count: attendanceCount ?? 0,
      assessment: form.assessment as EvaluationAssessment,
      recommendation: form.recommendation as EvaluationRecommendation,
    };

    const total = parseIntField(form.attendance_total);
    if (total !== undefined) payload.attendance_total = total;
    if (form.special_remarks.trim())
      payload.special_remarks = form.special_remarks.trim();

    // Exactly one band section is sent; the others stay unset (nullable).
    if (template === 'skills') {
      if (form.putting_assessment.trim())
        payload.putting_assessment = form.putting_assessment.trim();
      if (form.chipping_assessment.trim())
        payload.chipping_assessment = form.chipping_assessment.trim();
      if (form.full_swing_assessment.trim())
        payload.full_swing_assessment = form.full_swing_assessment.trim();
    } else if (template === 'practice_scores') {
      const avg9 = parseDecimal1dp(form.avg_score_9);
      const avg18 = parseDecimal1dp(form.avg_score_18);
      if (avg9 !== undefined) payload.avg_score_9 = avg9;
      if (avg18 !== undefined) payload.avg_score_18 = avg18;
    } else {
      const played = parseIntField(form.competitions_played);
      const best = parseIntField(form.best_gross_score);
      if (played !== undefined) payload.competitions_played = played;
      if (best !== undefined) payload.best_gross_score = best;
    }
    return payload;
  }

  async function submit(alsoSign: boolean) {
    if (!valid || !coachId) return;
    setSubmitError(null);

    let created: Evaluation;
    try {
      created = await create.mutateAsync(buildPayload());
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Domain rule: one row per golfer per month — name the conflict, and
        // refetch the guard query so the existing-evaluation card appears.
        setSubmitError(
          `An evaluation for this golfer already exists for ${formatMonth(month)}.`,
        );
        void queryClient.invalidateQueries({ queryKey: ['evaluations'] });
      } else {
        setSubmitError(
          errorMessage(err, 'Could not save the evaluation. Please try again.'),
        );
      }
      return;
    }

    let signed = false;
    let signError: string | null = null;
    if (alsoSign) {
      try {
        await sign.mutateAsync(created.id);
        signed = true;
      } catch (err) {
        signError = errorMessage(err, 'Please try again.');
      }
    }
    onSaved({ golferName, month, signed, signError });
  }

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
      data-testid="eval-form"
    >
      {/* Common fields */}
      <SectionCard
        icon={<ClipboardCheck className="h-4 w-4 text-azure" aria-hidden />}
        title="Monthly summary"
        testId="eval-common-section"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Sessions attended" htmlFor="attendance_count">
            <input
              id="attendance_count"
              type="number"
              min={0}
              inputMode="numeric"
              className={inputClass}
              value={form.attendance_count}
              placeholder="0"
              onChange={(e) => set({ attendance_count: e.target.value })}
              data-testid="eval-attendance-count"
            />
          </Field>
          <Field
            label="Sessions scheduled"
            htmlFor="attendance_total"
            hint={
              band
                ? `Optional — band minimum: ${band.min_sessions} sessions.`
                : 'Optional.'
            }
          >
            <input
              id="attendance_total"
              type="number"
              min={0}
              inputMode="numeric"
              className={inputClass}
              value={form.attendance_total}
              placeholder="—"
              onChange={(e) => set({ attendance_total: e.target.value })}
              data-testid="eval-attendance-total"
            />
          </Field>
        </div>

        <Field label="Assessment">
          <div
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            role="radiogroup"
            aria-label="Assessment"
          >
            {ASSESSMENT_OPTIONS.map((option) => {
              const active = form.assessment === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set({ assessment: option })}
                  className={cn(
                    'rounded-xl px-3 py-3 text-sm font-bold ring-1 transition-all',
                    active
                      ? 'bg-azure/20 text-azure ring-azure/60'
                      : 'bg-white/5 text-slate ring-white/10 hover:bg-white/10',
                  )}
                  data-testid={`eval-assessment-${option}`}
                >
                  {assessmentLabel(option)}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Recommendation">
          <div
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            role="radiogroup"
            aria-label="Recommendation"
          >
            {RECOMMENDATION_OPTIONS.map((option) => {
              const active = form.recommendation === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set({ recommendation: option })}
                  className={cn(
                    'rounded-xl px-3 py-3 text-sm font-bold ring-1 transition-all',
                    active
                      ? 'bg-azure/20 text-azure ring-azure/60'
                      : 'bg-white/5 text-slate ring-white/10 hover:bg-white/10',
                  )}
                  data-testid={`eval-recommendation-${option}`}
                >
                  {recommendationLabel(option)}
                </button>
              );
            })}
          </div>
        </Field>

        <Field
          label="Special remarks"
          htmlFor="special_remarks"
          hint="Optional — anything the committee or parents should know."
        >
          <textarea
            id="special_remarks"
            rows={3}
            className={cn(inputClass, 'resize-y')}
            value={form.special_remarks}
            placeholder="Progress notes, focus for next month…"
            onChange={(e) => set({ special_remarks: e.target.value })}
            data-testid="eval-special-remarks"
          />
        </Field>
      </SectionCard>

      {/* Band-specific section — exactly one of the three templates. */}
      <SectionCard
        icon={<BarChart3 className="h-4 w-4 text-azure" aria-hidden />}
        title={`${bandLabel} — ${TEMPLATE_SECTION_TITLES[template]}`}
        testId={`eval-band-section-${template}`}
      >
        {template === 'skills' ? (
          <>
            <Field label="Putting" htmlFor="putting_assessment">
              <textarea
                id="putting_assessment"
                rows={2}
                className={cn(inputClass, 'resize-y')}
                value={form.putting_assessment}
                placeholder="Pace control improving; aim drills next…"
                onChange={(e) => set({ putting_assessment: e.target.value })}
                data-testid="eval-putting"
              />
            </Field>
            <Field label="Chipping" htmlFor="chipping_assessment">
              <textarea
                id="chipping_assessment"
                rows={2}
                className={cn(inputClass, 'resize-y')}
                value={form.chipping_assessment}
                placeholder="Clean contact from tight lies…"
                onChange={(e) => set({ chipping_assessment: e.target.value })}
                data-testid="eval-chipping"
              />
            </Field>
            <Field label="Full swing" htmlFor="full_swing_assessment">
              <textarea
                id="full_swing_assessment"
                rows={2}
                className={cn(inputClass, 'resize-y')}
                value={form.full_swing_assessment}
                placeholder="Setup and tempo; working on balance…"
                onChange={(e) => set({ full_swing_assessment: e.target.value })}
                data-testid="eval-full-swing"
              />
            </Field>
          </>
        ) : template === 'practice_scores' ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Average 9-hole score"
              htmlFor="avg_score_9"
              hint="One decimal place, e.g. 62.5."
            >
              <input
                id="avg_score_9"
                type="number"
                step="0.1"
                min={0}
                inputMode="decimal"
                className={inputClass}
                value={form.avg_score_9}
                placeholder="—"
                onChange={(e) => set({ avg_score_9: e.target.value })}
                data-testid="eval-avg-9"
              />
            </Field>
            <Field
              label="Average 18-hole score"
              htmlFor="avg_score_18"
              hint="One decimal place, e.g. 124.0."
            >
              <input
                id="avg_score_18"
                type="number"
                step="0.1"
                min={0}
                inputMode="decimal"
                className={inputClass}
                value={form.avg_score_18}
                placeholder="—"
                onChange={(e) => set({ avg_score_18: e.target.value })}
                data-testid="eval-avg-18"
              />
            </Field>
          </div>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Competitions played" htmlFor="competitions_played">
                <input
                  id="competitions_played"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className={inputClass}
                  value={form.competitions_played}
                  placeholder="—"
                  onChange={(e) => set({ competitions_played: e.target.value })}
                  data-testid="eval-competitions-played"
                />
              </Field>
              <Field label="Best gross score" htmlFor="best_gross_score">
                <input
                  id="best_gross_score"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className={inputClass}
                  value={form.best_gross_score}
                  placeholder="—"
                  onChange={(e) => set({ best_gross_score: e.target.value })}
                  data-testid="eval-best-gross"
                />
              </Field>
            </div>

            {/* Backend-computed stats for the report month (internal + external). */}
            <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5">
              {comps.isLoading ? (
                <p className="flex items-center gap-2 text-xs text-slate">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Loading this month&apos;s recorded competition stats…
                </p>
              ) : comps.isError ? (
                <p role="alert" className="text-xs text-slate" data-testid="eval-stats-error">
                  Recorded stats unavailable —{' '}
                  {errorMessage(comps.error, 'could not load them.')}
                </p>
              ) : comps.data ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate" data-testid="eval-stats-summary">
                    Recorded in {formatMonth(month)}:{' '}
                    <span className="font-semibold text-silver">
                      {comps.data.competitions_played} played
                    </span>{' '}
                    · best gross{' '}
                    <span className="font-semibold text-silver">
                      {comps.data.best_gross_score ?? '—'}
                    </span>
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      set({
                        competitions_played: String(
                          comps.data.competitions_played,
                        ),
                        best_gross_score:
                          comps.data.best_gross_score != null
                            ? String(comps.data.best_gross_score)
                            : '',
                      })
                    }
                    data-testid="eval-use-stats"
                  >
                    Use this month&apos;s recorded stats
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </SectionCard>

      {/* Errors */}
      {submitError ? (
        <div
          role="alert"
          className="rounded-xl bg-red-500/15 p-4 text-sm text-red-400"
          data-testid="eval-submit-error"
        >
          {submitError}
        </div>
      ) : null}

      {/* Actions: save draft, or save + coach-sign. NEVER a committee sign. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="ghost"
          size="md"
          disabled={!valid || busy}
          data-testid="eval-save-draft"
        >
          {create.isPending && !sign.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Save draft
        </Button>
        <Button
          type="button"
          variant="gold"
          size="md"
          disabled={!valid || busy}
          onClick={() => void submit(true)}
          data-testid="eval-save-sign"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <PenLine className="h-4 w-4" aria-hidden />
          )}
          Save &amp; sign
        </Button>
        {!valid ? (
          <span className="text-xs text-slate">
            Sessions attended, assessment and recommendation are required.
          </span>
        ) : null}
      </div>
    </form>
  );
}
