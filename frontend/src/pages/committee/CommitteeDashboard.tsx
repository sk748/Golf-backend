import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Loader2,
  PenLine,
  Trophy,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { FeatureCard } from '../../components/ui/FeatureCard';
import { AttentionBand } from '../../components/ui/AttentionBand';
import {
  useActiveTournaments,
  useEvaluationSummary,
  useEvaluations,
  useGolferNames,
  useJuniors,
  useLevelBands,
} from './committee-evaluations.queries';
import {
  currentMonthStart,
  formatMonth,
  monthOptions,
} from './committee-format';
import { AnnouncementsWidget } from '../announcements/AnnouncementsWidget';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// Compact stat for a FeatureCard: a quiet placeholder while loading, an em dash
// on error, otherwise the value.
function statValue(
  loading: boolean,
  error: boolean,
  value: number | string,
): string | number {
  if (loading) return '·';
  if (error) return '—';
  return value;
}

export function CommitteeDashboard() {
  // The committee's primary job: counter-sign evaluations the coach has signed.
  const queue = useEvaluations({ coach_signed: true, committee_signed: false });
  const juniors = useJuniors();
  const tournaments = useActiveTournaments();
  const names = useGolferNames();

  const queueItems = queue.data ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <p className="animate-fade-in-up text-[11px] font-bold uppercase tracking-[0.2em] text-violet-400">
        Programme oversight
      </p>
      <h1 className="animate-fade-in-up stagger-1 mt-1 text-2xl font-black text-silver sm:text-3xl">
        Junior Golf Committee
      </h1>
      <p className="animate-fade-in-up stagger-1 mt-2 max-w-2xl text-sm text-slate">
        Read-across visibility into juniors, evaluations, and tournaments — and
        the second sign-off on monthly evaluations.
      </p>

      {/* ── Bento grid: 4 columns on desktop, single column on mobile ─────── */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4 [&>*]:min-w-0">
        {/* Row 0 — COUNTER-SIGN ATTENTION BAND (full width) */}
        <div className="animate-fade-in-up stagger-1 lg:col-span-4">
          <AttentionBand
            icon={PenLine}
            eyebrow="Counter-sign queue"
            headline={
              queue.isLoading
                ? 'Checking the counter-sign queue…'
                : queueItems.length > 0
                  ? `${queueItems.length} evaluation${queueItems.length === 1 ? '' : 's'} awaiting your counter-signature`
                  : 'All caught up — nothing to counter-sign'
            }
            subline={
              queueItems.length > 0
                ? 'Coach-signed evaluations need your second sign-off to complete the month.'
                : 'Every coach-signed evaluation has been counter-signed.'
            }
            ctaLabel="Review evaluations"
            to="/evaluations"
            testId="countersign-callout"
          />
        </div>

        {/* Row 1 — navigation hub: counter-sign emphasised, juniors + tournaments alongside */}
        <div className="animate-fade-in-up stagger-1 lg:col-span-2">
          <FeatureCard
            label="Counter-sign"
            icon={PenLine}
            tone={queueItems.length > 0 ? 'gold' : 'default'}
            stat={statValue(queue.isLoading, queue.isError, queueItems.length)}
            headline="evaluations awaiting your sign-off"
            to="/evaluations"
            testId="feature-countersign"
          />
        </div>
        <div className="animate-fade-in-up stagger-1 lg:col-span-1">
          <FeatureCard
            label="Juniors"
            icon={GraduationCap}
            tone="azure"
            stat={statValue(juniors.isLoading, juniors.isError, juniors.data?.length ?? 0)}
            headline="in the development programme"
            to="/juniors"
            testId="feature-juniors"
          />
        </div>
        <div className="animate-fade-in-up stagger-1 lg:col-span-1">
          <FeatureCard
            label="Tournaments"
            icon={Trophy}
            stat={statValue(tournaments.isLoading, tournaments.isError, tournaments.data?.length ?? 0)}
            headline="active events"
            to="/tournaments"
            testId="feature-tournaments"
          />
        </div>

        {/* Row 2 — counter-sign queue (primary CTA list) + band summary */}
        <GlassCard className="animate-fade-in-up stagger-2 p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-silver">
              Counter-sign queue
            </h2>
            <Link
              to="/evaluations"
              className="text-xs font-medium text-violet-400 hover:underline"
              data-testid="queue-view-all"
            >
              Open evaluations
            </Link>
          </div>
          <p className="mt-1 text-xs text-slate">
            Coach-signed evaluations waiting for the committee sign-off.
          </p>

          <div className="mt-4">
            {queue.isLoading ? (
              <div
                className="flex items-center gap-2 text-sm text-slate"
                data-testid="queue-loading"
              >
                <Loader2 size={18} className="animate-spin text-azure" />
                Loading queue…
              </div>
            ) : queue.isError ? (
              <div
                className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
                role="alert"
                data-testid="queue-error"
              >
                {errorMessage(queue.error, 'Could not load the queue.')}
              </div>
            ) : queueItems.length === 0 ? (
              <div
                className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-400"
                data-testid="queue-empty"
              >
                <CheckCircle2 size={18} aria-hidden="true" />
                Nothing waiting — every signed evaluation is counter-signed.
              </div>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="queue-list">
                {queueItems.slice(0, 6).map((ev) => (
                  <li key={ev.id}>
                    <Link
                      to={`/evaluations?id=${ev.id}`}
                      className="glass-light flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-white/5"
                      data-testid={`queue-item-${ev.id}`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
                        <ClipboardCheck size={16} className="text-violet-400" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-silver">
                          {names.nameFor(ev.junior_id)}
                        </span>
                        <span className="block truncate text-xs text-slate">
                          Level {ev.current_level} · {formatMonth(ev.report_month)}
                        </span>
                      </span>
                      <Badge tone="gold" className="shrink-0">
                        Coach signed
                      </Badge>
                      <ArrowRight size={16} className="shrink-0 text-slate" />
                    </Link>
                  </li>
                ))}
                {queueItems.length > 6 && (
                  <li className="pt-1">
                    <Link
                      to="/evaluations"
                      className="text-xs font-medium text-violet-400 hover:underline"
                    >
                      +{queueItems.length - 6} more in the queue
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <Link to="/evaluations" data-testid="action-evaluations">
              <Button variant="primary" size="sm">
                <PenLine size={16} />
                Review evaluations
              </Button>
            </Link>
          </div>
        </GlassCard>

        <div className="h-full lg:col-span-2">
          <BandSummaryWidget />
        </div>

        {/* Row 3 — club announcements (full width) */}
        <div className="lg:col-span-4">
          <AnnouncementsWidget className="animate-fade-in-up stagger-3 p-5" />
        </div>
      </div>
    </div>
  );
}

// Compact band + month picker showing sign-off progress across a band.
function BandSummaryWidget() {
  const bands = useLevelBands();
  const months = useMemo(() => monthOptions(6), []);
  const [bandId, setBandId] = useState<number | undefined>(undefined);
  const [month, setMonth] = useState<string>(currentMonthStart());

  // Default to the first band once loaded.
  const effectiveBandId = bandId ?? bands.data?.[0]?.id;
  const summary = useEvaluationSummary(effectiveBandId, month);
  const rows = summary.data ?? [];

  const counts = {
    total: rows.length,
    coach: rows.filter((r) => r.coach_signed).length,
    committee: rows.filter((r) => r.committee_signed).length,
  };

  return (
    <GlassCard className="animate-fade-in-up stagger-2 h-full p-5">
      <h2 className="text-sm font-bold text-silver">Band sign-off summary</h2>
      <p className="mt-1 text-xs text-slate">
        Monthly evaluation progress for a whole band.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <div>
          <label htmlFor="band-select" className={selectLabelClass}>
            Band
          </label>
          <select
            id="band-select"
            value={effectiveBandId ?? ''}
            onChange={(e) => setBandId(Number(e.target.value))}
            disabled={bands.isLoading || !bands.data?.length}
            className={selectClass}
            data-testid="band-select"
          >
            {(bands.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.band_label} (L{b.min_level}–{b.max_level})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="month-select" className={selectLabelClass}>
            Month
          </label>
          <select
            id="month-select"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className={selectClass}
            data-testid="month-select"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        {bands.isError ? (
          <div className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400" role="alert">
            {errorMessage(bands.error, 'Could not load bands.')}
          </div>
        ) : summary.isLoading || bands.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate">
            <Loader2 size={18} className="animate-spin text-azure" />
            Loading summary…
          </div>
        ) : summary.isError ? (
          <div className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400" role="alert">
            {errorMessage(summary.error, 'Could not load the band summary.')}
          </div>
        ) : counts.total === 0 ? (
          <p className="text-sm text-slate" data-testid="band-summary-empty">
            No juniors in this band.
          </p>
        ) : (
          <dl className="grid grid-cols-3 gap-2 text-center" data-testid="band-summary">
            <SummaryStat label="Golfers" value={counts.total} />
            <SummaryStat label="Coach signed" value={counts.coach} tone="gold" />
            <SummaryStat
              label="Counter-signed"
              value={counts.committee}
              tone="emerald"
            />
          </dl>
        )}
      </div>
    </GlassCard>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'gold' | 'emerald';
}) {
  const color =
    tone === 'gold' ? 'text-gold' : tone === 'emerald' ? 'text-emerald-400' : 'text-silver';
  return (
    <div className="glass-light rounded-xl p-3">
      <dd className={`text-xl font-black ${color}`}>{value}</dd>
      <dt className="mt-1 text-[11px] text-slate">{label}</dt>
    </div>
  );
}

const selectLabelClass =
  'mb-1 block text-xs font-semibold uppercase tracking-wider text-slate';
const selectClass =
  'w-full rounded-lg border border-white/10 bg-navy px-3 py-2 text-sm text-silver outline-none transition-colors focus:border-azure disabled:opacity-50';
