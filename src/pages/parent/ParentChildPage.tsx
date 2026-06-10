// Parent → child detail page (route /my-child). Read-only view of one child's
// full progress: handicap (if present), band progress against the band minimum,
// attendance breakdown, evaluations (read-only, sourced from the progress
// endpoint — parents have no access to /api/evaluations), and a month picker
// for the monthly report. A child switcher appears when a parent has several.
//
// All server data via TanStack Query + the shared api client. No mock data, no
// WHS recomputation.

import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Target,
  TrendingUp,
  Trophy,
  Users,
  X,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { GlassCard } from '../../components/ui/GlassCard';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { CompetitionHistory } from '../tournaments/CompetitionHistory';
import { LogExternalResultCard } from '../tournaments/LogExternalResultCard';
import { EditChildDetailsCard } from './EditChildDetailsCard';
import {
  bandForLevel,
  childName,
  useChildMonthlyReport,
  useChildProgress,
  useLevelBands,
  useMyChildren,
  type ChildEvaluation,
  type ParentChild,
  type ParentLevelBand,
} from './parent-children.queries';
import { useTournaments } from '../tournaments/tournaments.queries';
import {
  entryStatusLabel,
  entryStatusTone,
  useApproveEntry,
  useDeclineEntry,
  useMyEntries,
  useWithdrawEntry,
  type TournamentEntry,
} from '../tournaments/tournament-entries.queries';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// First-of-month ISO string for a given Date.
function monthStart(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function monthLabel(iso: string): string {
  // iso is YYYY-MM-01; build a local date to avoid tz drift on the label.
  const [y, m] = iso.split('-').map(Number);
  if (!y || !m) return iso;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

// Last 12 months (first-of-month), newest first, for the report picker.
function recentMonths(count = 12): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) =>
    monthStart(new Date(now.getFullYear(), now.getMonth() - i, 1)),
  );
}

function assessmentLabel(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v.startsWith('exceed')) return 'Exceeding expectations';
  if (v.startsWith('meet')) return 'Meeting expectations';
  if (v.startsWith('below')) return 'Working towards expectations';
  return raw;
}

function assessmentTone(
  raw: string | undefined | null,
): 'emerald' | 'azure' | 'gold' | 'slate' {
  if (!raw) return 'slate';
  const v = raw.trim().toLowerCase();
  if (v.startsWith('exceed')) return 'emerald';
  if (v.startsWith('meet')) return 'azure';
  if (v.startsWith('below')) return 'gold';
  return 'slate';
}

function recommendationLabel(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'move_next_level') return 'Ready to move up a level';
  if (v === 'continue_level') return 'Continue at this level';
  return raw;
}

// ── Evaluations (read-only, from progress) ───────────────────────────────────

function EvaluationCard({ evaluation }: { evaluation: ChildEvaluation }) {
  const assessment = assessmentLabel(evaluation.assessment);
  const recommendation = recommendationLabel(evaluation.recommendation);
  const scores: { label: string; value: number | null }[] = [
    { label: '9-hole avg', value: evaluation.avg_score_9 },
    { label: '18-hole avg', value: evaluation.avg_score_18 },
    { label: 'Best gross', value: evaluation.best_gross_score },
  ].filter((s) => s.value != null);

  return (
    <GlassCard tone="light" className="p-4" data-testid={`eval-${evaluation.report_month}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-silver">
          {monthLabel(evaluation.report_month)}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="slate" shape="pill">
            Level {evaluation.current_level}
          </Badge>
          {assessment ? (
            <Badge tone={assessmentTone(evaluation.assessment)}>{assessment}</Badge>
          ) : null}
        </div>
      </div>
      {recommendation ? (
        <p className="mt-2 text-sm text-slate">{recommendation}</p>
      ) : null}
      {scores.length > 0 ? (
        <dl className="mt-3 grid grid-cols-3 gap-2.5">
          {scores.map((s) => (
            <div key={s.label} className="rounded-lg bg-white/5 p-2.5 text-center">
              <dd className="font-mono text-lg font-black text-silver">{s.value}</dd>
              <dt className="mt-0.5 text-[11px] uppercase tracking-wider text-slate">
                {s.label}
              </dt>
            </div>
          ))}
        </dl>
      ) : null}
    </GlassCard>
  );
}

// ── Monthly report (defensive read-only render) ──────────────────────────────

function isPrimitive(v: unknown): v is string | number | boolean {
  return (
    typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
  );
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function MonthlyReportPanel({
  juniorId,
  month,
}: {
  juniorId: number;
  month: string;
}) {
  const report = useChildMonthlyReport(juniorId, month);

  // Surface scalar fields from the report object as a simple definition list;
  // we don't know every key, so we render the primitive ones we get.
  const rows = useMemo(() => {
    const data = report.data;
    if (!data || typeof data !== 'object') return [];
    return Object.entries(data as Record<string, unknown>)
      .filter(([, v]) => isPrimitive(v) && String(v).trim() !== '')
      .map(([k, v]) => ({ key: k, label: humanizeKey(k), value: String(v) }));
  }, [report.data]);

  if (report.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate">
        <Loader2 size={16} className="animate-spin text-azure" aria-hidden />
        Loading {monthLabel(month)} report…
      </div>
    );
  }
  if (report.isError) {
    // A 404 here usually means "no report for that month" — treat softly.
    const status = report.error instanceof ApiError ? report.error.status : 0;
    if (status === 404) {
      return (
        <p className="text-sm text-slate" data-testid="report-none">
          No report for {monthLabel(month)} yet.
        </p>
      );
    }
    return (
      <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400" role="alert">
        {errorMessage(report.error, 'Could not load the monthly report.')}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate" data-testid="report-empty">
        No report details recorded for {monthLabel(month)}.
      </p>
    );
  }

  return (
    <dl className="grid gap-2.5 sm:grid-cols-2" data-testid="report-rows">
      {rows.map((r) => (
        <div key={r.key} className="rounded-xl bg-white/5 p-3">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate">
            {r.label}
          </dt>
          <dd className="mt-1 text-sm text-silver">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Tournaments (one child's entries + actions) ───────────────────────────────
// Entries carry no tournament name, so we cross-reference tournament_id →
// tournament via useTournaments(). interested → Approve/Decline; registered/
// confirmed → Withdraw; declined/withdrawn shown muted.

function ChildEntryRow({
  entry,
  tournamentName,
}: {
  entry: TournamentEntry;
  tournamentName: string;
}) {
  const approve = useApproveEntry();
  const decline = useDeclineEntry();
  const withdraw = useWithdrawEntry();
  const busy = approve.isPending || decline.isPending || withdraw.isPending;
  const actionError =
    (approve.isError && approve.error) ||
    (decline.isError && decline.error) ||
    (withdraw.isError && withdraw.error) ||
    null;

  const muted = entry.status === 'declined' || entry.status === 'withdrawn';

  return (
    <li
      className={cn('glass-light rounded-xl p-3.5', muted && 'opacity-60')}
      data-testid={`child-entry-${entry.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/tournaments/${entry.tournament_id}`}
            className="inline-flex items-center gap-1 text-sm font-bold text-silver transition hover:text-azure focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 rounded"
          >
            {tournamentName}
            <ArrowRight size={13} className="text-azure" aria-hidden />
          </Link>
        </div>
        <Badge tone={entryStatusTone(entry.status)}>
          {entryStatusLabel(entry.status)}
        </Badge>
      </div>

      {entry.status === 'interested' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => approve.mutate(entry.id)}
            disabled={busy}
            data-testid={`child-entry-approve-${entry.id}`}
          >
            {approve.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            )}
            Approve
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => decline.mutate(entry.id)}
            disabled={busy}
            data-testid={`child-entry-decline-${entry.id}`}
          >
            {decline.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <X className="h-4 w-4" aria-hidden />
            )}
            Decline
          </Button>
        </div>
      ) : entry.status === 'registered' || entry.status === 'confirmed' ? (
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => withdraw.mutate(entry.id)}
            disabled={busy}
            data-testid={`child-entry-withdraw-${entry.id}`}
          >
            {withdraw.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <X className="h-4 w-4" aria-hidden />
            )}
            Withdraw
          </Button>
        </div>
      ) : null}

      {actionError ? (
        <p
          role="alert"
          className="mt-2.5 rounded-lg bg-red-500/15 p-2.5 text-xs text-red-400"
        >
          {actionError instanceof ApiError
            ? actionError.message
            : 'Something went wrong. Please try again.'}
        </p>
      ) : null}
    </li>
  );
}

function ChildTournamentsCard({ child }: { child: ParentChild }) {
  const entries = useMyEntries();
  const tournaments = useTournaments();

  const mine = (entries.data ?? []).filter((e) => e.junior_id === child.id);
  // interested first (action needed), then active, then muted; newest within.
  const order: Record<string, number> = {
    interested: 0,
    registered: 1,
    confirmed: 1,
    declined: 2,
    withdrawn: 2,
  };
  const sorted = [...mine].sort((a, b) => {
    const byStatus = (order[a.status] ?? 3) - (order[b.status] ?? 3);
    if (byStatus !== 0) return byStatus;
    return (b.registered_at ?? '').localeCompare(a.registered_at ?? '');
  });

  const tournamentName = (id: number): string =>
    tournaments.data?.find((t) => t.id === id)?.name ?? 'Tournament';

  return (
    <GlassCard className="animate-fade-in-up stagger-3 p-5 sm:p-6" data-testid="child-tournaments">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15">
            <Trophy size={16} className="text-gold" aria-hidden />
          </span>
          <h2 className="text-sm font-bold text-silver">Tournaments</h2>
        </div>
        <Link
          to="/tournaments"
          className="inline-flex items-center gap-1 text-xs font-bold text-azure transition hover:gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50 rounded"
        >
          Browse events
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>

      <div className="mt-5">
        {entries.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate">
            <Loader2 size={16} className="animate-spin text-azure" aria-hidden />
            Loading entries…
          </div>
        ) : entries.isError ? (
          <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400" role="alert">
            {entries.error instanceof ApiError
              ? entries.error.message
              : 'Could not load tournament entries.'}
          </p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-slate" data-testid="child-tournaments-empty">
            {childName(child)} isn&apos;t entered in any tournaments yet. Browse
            upcoming events to register.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5" data-testid="child-tournaments-list">
            {sorted.map((e) => (
              <ChildEntryRow
                key={e.id}
                entry={e}
                tournamentName={tournamentName(e.tournament_id)}
              />
            ))}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}

// ── The child detail body (one child) ────────────────────────────────────────

function ChildDetail({
  child,
  bands,
}: {
  child: ParentChild;
  bands: ParentLevelBand[] | undefined;
}) {
  const progress = useChildProgress(child.id);
  const months = useMemo(() => recentMonths(12), []);
  const [month, setMonth] = useState<string>(months[0]);

  const name = childName(child);
  const currentLevel = progress.data?.current_level ?? child.current_level;
  const band = bandForLevel(bands, currentLevel);
  const minSessions = band?.min_sessions ?? 0;

  const att = progress.data?.attendance;
  const present = att?.present ?? 0;
  const pct =
    minSessions > 0 ? Math.min(100, Math.round((present / minSessions) * 100)) : 0;
  const sessionsDone = minSessions > 0 && present >= minSessions;

  const hasHandicap = child.has_handicap && child.handicap_index != null;

  const evaluations = useMemo(
    () =>
      [...(progress.data?.evaluations ?? [])].sort((a, b) =>
        (b.report_month ?? '').localeCompare(a.report_month ?? ''),
      ),
    [progress.data?.evaluations],
  );

  return (
    <div className="space-y-6">
      {/* Header / hero */}
      <GlassCard className="animate-fade-in-up p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={name} className="h-12 w-12 text-lg" />
            <div>
              <h1 className="text-2xl font-black text-silver">{name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge tone="azure" shape="pill">
                  Level {currentLevel}
                </Badge>
                {band ? <Badge tone="slate" shape="pill">{band.name}</Badge> : null}
                {child.tournament_ready ? (
                  <Badge tone="gold" shape="pill">
                    Tournament ready
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>

          {/* Handicap hero — only when the child has one. */}
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate">
              Handicap index
            </p>
            {hasHandicap ? (
              <p
                className="mt-0.5 font-mono text-4xl font-black leading-none text-azure"
                data-testid="child-handicap"
              >
                {child.handicap_index}
              </p>
            ) : (
              <p className="mt-1 max-w-[12rem] text-sm font-semibold text-slate">
                Not yet established — earned through signed scorecards.
              </p>
            )}
          </div>
        </div>

        {band?.description ? (
          <p className="mt-4 max-w-2xl text-sm text-slate">{band.description}</p>
        ) : null}
      </GlassCard>

      {/* Progress dependents loading / error */}
      {progress.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate" data-testid="child-loading">
          <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
          Loading progress…
        </div>
      ) : progress.isError ? (
        <p className="rounded-xl bg-red-500/15 p-4 text-sm text-red-400" role="alert">
          {errorMessage(progress.error, "Could not load your child's progress.")}
        </p>
      ) : (
        <>
          {/* Band progress + attendance */}
          <GlassCard className="animate-fade-in-up stagger-1 p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-azure/15">
                <TrendingUp size={16} className="text-azure" aria-hidden />
              </span>
              <h2 className="text-sm font-bold text-silver">Band progress</h2>
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate">
                  Sessions attended
                </span>
                <span className="font-mono text-sm font-bold">
                  <span className={cn(sessionsDone ? 'text-emerald-400' : 'text-azure')}>
                    {present}
                  </span>
                  <span className="text-slate"> / {minSessions || '—'}</span>
                </span>
              </div>
              <div
                className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuenow={present}
                aria-valuemin={0}
                aria-valuemax={minSessions || undefined}
                aria-label={`${present} of ${minSessions} sessions attended`}
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    sessionsDone ? 'bg-emerald-400' : 'bg-azure',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate">
                {minSessions <= 0
                  ? 'Every session helps your child progress.'
                  : sessionsDone
                    ? `Reached this band's minimum of ${minSessions} sessions.`
                    : `${Math.max(0, minSessions - present)} more toward this band's minimum of ${minSessions}.`}
              </p>
            </div>

            {att ? (
              <dl className="mt-5 grid grid-cols-3 gap-2.5" data-testid="attendance-breakdown">
                <div className="rounded-xl bg-white/5 p-3 text-center">
                  <dd className="font-mono text-xl font-black text-emerald-400">
                    {att.present}
                  </dd>
                  <dt className="mt-0.5 text-[11px] uppercase tracking-wider text-slate">
                    Present
                  </dt>
                </div>
                <div className="rounded-xl bg-white/5 p-3 text-center">
                  <dd className="font-mono text-xl font-black text-gold">
                    {att.excused}
                  </dd>
                  <dt className="mt-0.5 text-[11px] uppercase tracking-wider text-slate">
                    Excused
                  </dt>
                </div>
                <div className="rounded-xl bg-white/5 p-3 text-center">
                  <dd className="font-mono text-xl font-black text-slate">
                    {att.absent}
                  </dd>
                  <dt className="mt-0.5 text-[11px] uppercase tracking-wider text-slate">
                    Absent
                  </dt>
                </div>
              </dl>
            ) : null}
          </GlassCard>

          {/* Evaluations (read-only) */}
          <GlassCard className="animate-fade-in-up stagger-2 p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-azure/15">
                <ClipboardList size={16} className="text-azure" aria-hidden />
              </span>
              <div>
                <h2 className="text-sm font-bold text-silver">Coach evaluations</h2>
                <p className="text-xs text-slate">Read-only — newest first</p>
              </div>
            </div>
            <div className="mt-5">
              {evaluations.length === 0 ? (
                <p className="text-sm text-slate" data-testid="evals-empty">
                  No evaluations recorded yet. As your child progresses, monthly
                  coach reports will appear here.
                </p>
              ) : (
                <div className="flex flex-col gap-3" data-testid="evals-list">
                  {evaluations.map((e) => (
                    <EvaluationCard key={e.report_month} evaluation={e} />
                  ))}
                </div>
              )}
            </div>
          </GlassCard>

          {/* Targets for the current level */}
          {progress.data?.benchmarks?.length ? (
            <GlassCard className="animate-fade-in-up stagger-3 p-5 sm:p-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-azure/15">
                  <Target size={16} className="text-azure" aria-hidden />
                </span>
                <h2 className="text-sm font-bold text-silver">Skill targets</h2>
              </div>
              {(() => {
                const b = progress.data?.benchmarks.find(
                  (x) => x.level_number === currentLevel,
                );
                if (!b)
                  return (
                    <p className="mt-4 text-sm text-slate">
                      No targets recorded for this level.
                    </p>
                  );
                const cells = [
                  { label: 'Full swing', value: b.full_swing_target },
                  { label: 'Around green', value: b.around_green_target },
                  { label: 'Putting', value: b.putting_target },
                  { label: '9-hole', value: b.nine_hole_target },
                ];
                return (
                  <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {cells.map((c) => (
                      <div
                        key={c.label}
                        className="glass-light rounded-xl p-3 text-center"
                      >
                        <p className="font-mono text-xl font-black text-silver">
                          {c.value}
                        </p>
                        <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-slate">
                          {c.label}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </GlassCard>
          ) : null}
        </>
      )}

      {/* Tournaments (own query — not gated on the progress fetch) */}
      <ChildTournamentsCard child={child} />

      {/* Monthly report with picker */}
      <GlassCard className="animate-fade-in-up stagger-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-azure/15">
              <CalendarDays size={16} className="text-azure" aria-hidden />
            </span>
            <h2 className="text-sm font-bold text-silver">Monthly report</h2>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate">
            <span className="sr-only">Choose a month</span>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              data-testid="month-picker"
              className="rounded-lg border border-white/15 bg-navy/60 px-3 py-2 text-sm font-semibold text-silver focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
            >
              {months.map((m) => (
                <option key={m} value={m} className="bg-navy text-silver">
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5">
          <MonthlyReportPanel juniorId={child.id} month={month} />
        </div>
      </GlassCard>

      {/* Competition history — internal + external events feeding best-gross. */}
      <CompetitionHistory juniorId={child.id} title="Competition history" />

      {/* Parent-logged external results (start unverified; coach verifies). */}
      <LogExternalResultCard juniorId={child.id} juniorName={name} />

      {/* Family-owned child details (availability, experience, medical, goals). */}
      <EditChildDetailsCard child={child} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ParentChildPage() {
  const children = useMyChildren();
  const bands = useLevelBands();
  const location = useLocation();

  // Optional deep-link from the dashboard child card: state.childId.
  const linkedId =
    (location.state as { childId?: number } | null)?.childId ?? null;

  const kids = useMemo(() => children.data ?? [], [children.data]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Resolve selection: explicit pick → deep-link → first child.
  useEffect(() => {
    if (selectedId != null) return;
    if (linkedId != null && kids.some((k) => k.id === linkedId)) {
      setSelectedId(linkedId);
    } else if (kids.length > 0) {
      setSelectedId(kids[0].id);
    }
  }, [kids, linkedId, selectedId]);

  const selected =
    kids.find((k) => k.id === selectedId) ?? (kids.length ? kids[0] : undefined);

  return (
    <div className="animate-fade-in-up mx-auto max-w-4xl" data-testid="parent-child-page">
      {children.isLoading || bands.isLoading ? (
        <div
          className="flex items-center gap-2 py-16 text-sm text-slate"
          data-testid="page-loading"
        >
          <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
          Loading…
        </div>
      ) : children.isError ? (
        <p className="rounded-xl bg-red-500/15 p-4 text-sm text-red-400" role="alert">
          {errorMessage(children.error, "Could not load your child's details.")}
        </p>
      ) : kids.length === 0 ? (
        <GlassCard className="p-8 text-center" data-testid="child-empty">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15">
            <Users size={24} className="text-emerald-400" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-black text-silver">No child linked yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate">
            Once your child is enrolled and linked to your account, their full
            progress and reports will appear here.
          </p>
          <Link
            to="/dashboard"
            className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-azure hover:gap-2"
          >
            Back to dashboard
          </Link>
        </GlassCard>
      ) : (
        <>
          {/* Child switcher (only when more than one) */}
          {kids.length > 1 ? (
            <div
              className="mb-6 flex flex-wrap gap-2"
              role="tablist"
              aria-label="Choose a child"
              data-testid="child-switcher"
            >
              {kids.map((k) => {
                const active = selected?.id === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedId(k.id)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50',
                      active
                        ? 'bg-azure text-white shadow-lg shadow-azure/30'
                        : 'glass text-silver hover:bg-white/10',
                    )}
                  >
                    <Avatar
                      name={childName(k)}
                      className={cn(
                        'h-6 w-6 text-xs',
                        active && 'border-white/40 bg-white/20 text-white',
                      )}
                    />
                    {childName(k)}
                  </button>
                );
              })}
            </div>
          ) : null}

          {selected ? (
            <ChildDetail key={selected.id} child={selected} bands={bands.data} />
          ) : null}
        </>
      )}
    </div>
  );
}
