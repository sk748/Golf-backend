import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  PenLine,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import {
  useCommitteeSign,
  useEvaluation,
  useEvaluations,
  useGolferNames,
  useLevelBands,
  type Evaluation,
  type EvaluationFilters,
} from './committee-evaluations.queries';
import {
  assessmentLabel,
  formatDate,
  formatMonth,
  monthOptions,
  recommendationLabel,
} from './committee-format';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

type StatusFilter =
  | 'queue' // coach_signed=true & committee_signed=false (default)
  | 'all'
  | 'unsigned' // coach_signed=false
  | 'countersigned'; // committee_signed=true

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'queue', label: 'Awaiting counter-sign' },
  { value: 'countersigned', label: 'Counter-signed' },
  { value: 'unsigned', label: 'Not yet coach-signed' },
  { value: 'all', label: 'All evaluations' },
];

function statusToFilters(status: StatusFilter): Partial<EvaluationFilters> {
  switch (status) {
    case 'queue':
      return { coach_signed: true, committee_signed: false };
    case 'countersigned':
      return { committee_signed: true };
    case 'unsigned':
      return { coach_signed: false };
    case 'all':
      return {};
  }
}

export function CommitteeEvaluationsPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('id') ? Number(params.get('id')) : undefined;

  const [status, setStatus] = useState<StatusFilter>('queue');
  const [bandId, setBandId] = useState<number | undefined>(undefined);
  const [month, setMonth] = useState<string>('');

  const bands = useLevelBands();
  const months = useMemo(() => monthOptions(6), []);

  const filters: EvaluationFilters = {
    ...statusToFilters(status),
    report_month: month || undefined,
  };
  const list = useEvaluations(filters);
  const names = useGolferNames();

  // Band is filtered client-side (the list endpoint has no band param; an
  // evaluation carries current_level which maps into a band's level range).
  const bandById = useMemo(
    () => new Map((bands.data ?? []).map((b) => [b.id, b])),
    [bands.data],
  );
  const selectedBand = bandId ? bandById.get(bandId) : undefined;
  const items = (list.data ?? []).filter(
    (ev) =>
      !selectedBand ||
      (ev.current_level >= selectedBand.min_level &&
        ev.current_level <= selectedBand.max_level),
  );

  const select = (id: number) => {
    const next = new URLSearchParams(params);
    next.set('id', String(id));
    setParams(next, { replace: false });
  };
  const clearSelection = () => {
    const next = new URLSearchParams(params);
    next.delete('id');
    setParams(next, { replace: false });
  };

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-400">
        Programme oversight
      </p>
      <h1 className="mt-1 text-2xl font-black text-silver sm:text-3xl">
        Evaluations
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        Review monthly evaluations and add the committee counter-sign once the
        coach has signed.
      </p>

      {selectedId ? (
        <EvaluationDetail
          id={selectedId}
          golferName={names.nameFor}
          onBack={clearSelection}
        />
      ) : (
        <>
          {/* ── Filters ──────────────────────────────────────────────────── */}
          <div className="mt-6 flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="filter-status" className={selectLabelClass}>
                Status
              </label>
              <select
                id="filter-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                className={selectClass}
                data-testid="filter-status"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-band" className={selectLabelClass}>
                Band
              </label>
              <select
                id="filter-band"
                value={bandId ?? ''}
                onChange={(e) =>
                  setBandId(e.target.value ? Number(e.target.value) : undefined)
                }
                className={selectClass}
                data-testid="filter-band"
              >
                <option value="">All bands</option>
                {(bands.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.band_label} (L{b.min_level}–{b.max_level})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-month" className={selectLabelClass}>
                Month
              </label>
              <select
                id="filter-month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className={selectClass}
                data-testid="filter-month"
              >
                <option value="">Any month</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {formatMonth(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── List ─────────────────────────────────────────────────────── */}
          <div className="mt-6">
            {list.isLoading ? (
              <div
                className="flex items-center justify-center gap-3 py-16 text-slate"
                data-testid="evals-loading"
              >
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                <span>Loading evaluations…</span>
              </div>
            ) : list.isError ? (
              <GlassCard
                className="border border-red-500/30 bg-red-500/10 p-5"
                role="alert"
                data-testid="evals-error"
              >
                <div className="flex items-center gap-3 text-red-400">
                  <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-semibold">
                    {errorMessage(
                      list.error,
                      'Could not load evaluations. Please try again.',
                    )}
                  </span>
                </div>
              </GlassCard>
            ) : items.length === 0 ? (
              <GlassCard
                className="p-10 text-center text-slate"
                data-testid="evals-empty"
              >
                No evaluations match these filters.
              </GlassCard>
            ) : (
              <EvaluationList
                items={items}
                golferName={names.nameFor}
                onSelect={select}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── List (table on desktop, cards on mobile) ─────────────────────────────────
function SignoffBadges({ ev }: { ev: Evaluation }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={ev.coach_signed ? 'gold' : 'slate'}>
        {ev.coach_signed ? 'Coach signed' : 'Coach pending'}
      </Badge>
      <Badge tone={ev.committee_signed ? 'emerald' : 'slate'}>
        {ev.committee_signed ? 'Counter-signed' : 'Counter-sign pending'}
      </Badge>
    </div>
  );
}

function EvaluationList({
  items,
  golferName,
  onSelect,
}: {
  items: Evaluation[];
  golferName: (id: number) => string;
  onSelect: (id: number) => void;
}) {
  return (
    <>
      {/* Desktop table */}
      <GlassCard className="hidden overflow-hidden md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate">
              <th scope="col" className="px-5 py-3 font-semibold">
                Golfer
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Month
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Level
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Sign-off
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((ev) => (
              <tr
                key={ev.id}
                className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                data-testid={`eval-row-${ev.id}`}
              >
                <td className="px-5 py-4 font-semibold text-silver">
                  {golferName(ev.junior_id)}
                </td>
                <td className="px-5 py-4 text-slate">
                  {formatMonth(ev.report_month)}
                </td>
                <td className="px-5 py-4 text-slate">L{ev.current_level}</td>
                <td className="px-5 py-4">
                  <SignoffBadges ev={ev} />
                </td>
                <td className="px-5 py-4 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelect(ev.id)}
                    data-testid={`eval-open-${ev.id}`}
                  >
                    Review
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {items.map((ev) => (
          <GlassCard
            key={ev.id}
            className="p-4"
            data-testid={`eval-row-${ev.id}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-silver">
                  {golferName(ev.junior_id)}
                </p>
                <p className="text-xs text-slate">
                  L{ev.current_level} · {formatMonth(ev.report_month)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelect(ev.id)}
                data-testid={`eval-open-${ev.id}`}
              >
                Review
              </Button>
            </div>
            <div className="mt-3">
              <SignoffBadges ev={ev} />
            </div>
          </GlassCard>
        ))}
      </div>
    </>
  );
}

// ── Detail + counter-sign ─────────────────────────────────────────────────────
function EvaluationDetail({
  id,
  golferName,
  onBack,
}: {
  id: number;
  golferName: (id: number) => string;
  onBack: () => void;
}) {
  const query = useEvaluation(id);
  const sign = useCommitteeSign();

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate transition-colors hover:text-silver"
        data-testid="eval-back"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to list
      </button>

      {query.isLoading ? (
        <div
          className="flex items-center justify-center gap-3 py-16 text-slate"
          data-testid="eval-detail-loading"
        >
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>Loading evaluation…</span>
        </div>
      ) : query.isError ? (
        <GlassCard
          className="border border-red-500/30 bg-red-500/10 p-5"
          role="alert"
          data-testid="eval-detail-error"
        >
          <div className="flex items-center gap-3 text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="text-sm font-semibold">
              {errorMessage(query.error, 'Could not load this evaluation.')}
            </span>
          </div>
        </GlassCard>
      ) : query.data ? (
        <EvaluationCard
          ev={query.data}
          golferName={golferName}
          sign={sign}
        />
      ) : null}
    </div>
  );
}

function EvaluationCard({
  ev,
  golferName,
  sign,
}: {
  ev: Evaluation;
  golferName: (id: number) => string;
  sign: ReturnType<typeof useCommitteeSign>;
}) {
  // Domain rule: committee may sign only after the coach has signed.
  const canCounterSign = ev.coach_signed && !ev.committee_signed;

  return (
    <GlassCard className="p-5 sm:p-6" data-testid="eval-detail">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-silver">
            {golferName(ev.junior_id)}
          </h2>
          <p className="mt-1 text-sm text-slate">
            Level {ev.current_level} · {formatMonth(ev.report_month)}
          </p>
        </div>
        <SignoffBadges ev={ev} />
      </div>

      {/* Common fields */}
      <Section title="Summary">
        <Field
          label="Attendance"
          value={
            ev.attendance_total != null
              ? `${ev.attendance_count} / ${ev.attendance_total}`
              : String(ev.attendance_count)
          }
        />
        <Field label="Assessment" value={assessmentLabel(ev.assessment)} />
        <Field
          label="Recommendation"
          value={recommendationLabel(ev.recommendation)}
        />
      </Section>

      {/* Band-specific fields: render only the non-null fields for this band. */}
      <BandSpecificFields ev={ev} />

      {ev.special_remarks && (
        <Section title="Special remarks">
          <p className="col-span-full whitespace-pre-line text-sm text-silver">
            {ev.special_remarks}
          </p>
        </Section>
      )}

      {/* Sign-off state */}
      <Section title="Sign-off">
        <Field
          label="Coach"
          value={
            ev.coach_signed
              ? `Signed · ${formatDate(ev.coach_signed_date)}`
              : 'Not signed'
          }
        />
        <Field
          label="Committee"
          value={
            ev.committee_signed
              ? `Counter-signed · ${formatDate(ev.committee_signed_date)}`
              : 'Not counter-signed'
          }
        />
      </Section>

      {/* Counter-sign action */}
      <div className="mt-6 border-t border-white/10 pt-5">
        {ev.committee_signed ? (
          <div
            className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-400"
            data-testid="eval-already-signed"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            This evaluation has been counter-signed.
          </div>
        ) : (
          <>
            {!ev.coach_signed && (
              <p
                className="mb-3 flex items-center gap-2 text-sm text-slate"
                data-testid="eval-coach-pending"
              >
                <ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                The coach must sign before the committee can counter-sign.
              </p>
            )}
            {sign.isError && (
              <p
                className="mb-3 flex items-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-400"
                role="alert"
                data-testid="eval-sign-error"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {errorMessage(sign.error, 'Could not counter-sign. Please try again.')}
              </p>
            )}
            <Button
              variant="gold"
              size="md"
              disabled={!canCounterSign || sign.isPending}
              onClick={() => sign.mutate(ev.id)}
              data-testid="eval-countersign"
            >
              {sign.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <PenLine className="h-4 w-4" aria-hidden="true" />
              )}
              {sign.isPending ? 'Signing…' : 'Counter-sign evaluation'}
            </Button>
          </>
        )}
      </div>
    </GlassCard>
  );
}

// Renders only the band-appropriate, non-null fields off the flat row.
function BandSpecificFields({ ev }: { ev: Evaluation }) {
  const level = ev.current_level;

  // L1–3 (Beginners): skill text. L4–5: practice scores. L6+: competition stats.
  if (level <= 3) {
    const fields: [string, string | null][] = [
      ['Putting', ev.putting_assessment],
      ['Chipping', ev.chipping_assessment],
      ['Full swing', ev.full_swing_assessment],
    ];
    const present = fields.filter(([, v]) => v != null && v !== '');
    if (present.length === 0) return null;
    return (
      <Section title="Skills assessment">
        {present.map(([label, value]) => (
          <div key={label} className="col-span-full">
            <p className={fieldLabelClass}>{label}</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-silver">
              {value}
            </p>
          </div>
        ))}
      </Section>
    );
  }

  if (level <= 5) {
    const fields: [string, number | null][] = [
      ['Avg 9-hole score', ev.avg_score_9],
      ['Avg 18-hole score', ev.avg_score_18],
    ];
    const present = fields.filter(([, v]) => v != null);
    if (present.length === 0) return null;
    return (
      <Section title="Practice scores">
        {present.map(([label, value]) => (
          <Field key={label} label={label} value={String(value)} />
        ))}
      </Section>
    );
  }

  // L6–8 and L9+
  const fields: [string, number | null][] = [
    ['Competitions played', ev.competitions_played],
    ['Best gross score', ev.best_gross_score],
  ];
  const present = fields.filter(([, v]) => v != null);
  if (present.length === 0) return null;
  return (
    <Section title="Competition record">
      {present.map(([label, value]) => (
        <Field key={label} label={label} value={String(value)} />
      ))}
    </Section>
  );
}

// ── Small presentational helpers ─────────────────────────────────────────────
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h3 className="text-xs font-bold uppercase tracking-wider text-violet-400">
        {title}
      </h3>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</div>
    </section>
  );
}

const fieldLabelClass =
  'text-xs font-semibold uppercase tracking-wider text-slate';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-light rounded-xl p-3">
      <p className={fieldLabelClass}>{label}</p>
      <p className="mt-1 text-sm font-semibold text-silver">{value}</p>
    </div>
  );
}

const selectLabelClass =
  'mb-1 block text-xs font-semibold uppercase tracking-wider text-slate';
const selectClass =
  'rounded-lg border border-white/10 bg-navy px-3 py-2 text-sm text-silver outline-none transition-colors focus:border-azure disabled:opacity-50';
