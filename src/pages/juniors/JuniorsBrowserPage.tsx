// Staff junior browser (route /juniors — admin + coach + committee, wired in
// App.tsx). One club-wide table of every junior in the programme with
// client-side filters (name search, band, coach) and a summary strip. Each row
// links to the staff profile view at /juniors/:id. Data comes from the shared
// useAllJuniors hook (['juniors','all']) — no new endpoints, no mock data.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import type { LevelBand, User } from '../../types/api';
import { PARTICIPANT_TYPES } from '../../features/participant/participant';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { StatCard } from '../../components/ui/StatCard';
import { fieldClass, labelClass } from '../auth/AuthShell';
import {
  useAllJuniors,
  useCoachUsers,
  type AssignableJunior,
} from '../admin/coach-assignment.queries';
import { useLevelBands } from '../committee/committee-evaluations.queries';
import {
  ageFromDob,
  approvalStatusLabel,
  approvalStatusTone,
  useApproveJunior,
} from './juniors.queries';

const FILTER_ALL = 'all';
const FILTER_UNASSIGNED = 'unassigned';

// Signup-chain approval filter (client-side, build-phase-2 decisions 5+7).
const APPROVAL_FILTER_OPTIONS = [
  { value: FILTER_ALL, label: 'All statuses' },
  { value: 'pending_staff', label: 'Pending club' },
  { value: 'pending_parent', label: 'Pending parent' },
  { value: 'active', label: 'Active' },
] as const;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function juniorName(j: AssignableJunior): string {
  return j.full_name?.trim() || `Golfer #${j.id}`;
}

// Handicap to 1dp, gated on has_handicap (not every junior has one).
function handicapLabel(j: AssignableJunior): string {
  return j.has_handicap && j.handicap_index != null
    ? j.handicap_index.toFixed(1)
    : '—';
}

function coachName(coaches: User[], coachId: string | null): string {
  if (!coachId) return 'Unassigned';
  const coach = coaches.find((c) => c.id === coachId);
  return coach ? coach.full_name || coach.email : 'Unassigned';
}

export function JuniorsBrowserPage() {
  const { user } = useAuth();
  const juniorsQuery = useAllJuniors();
  const coachesQuery = useCoachUsers();
  const bandsQuery = useLevelBands();

  const [search, setSearch] = useState('');
  const [bandFilter, setBandFilter] = useState<string>(FILTER_ALL);
  const [coachFilter, setCoachFilter] = useState<string>(FILTER_ALL);
  const [approvalFilter, setApprovalFilter] = useState<string>(FILTER_ALL);
  const [participantFilter, setParticipantFilter] = useState<string>(FILTER_ALL);

  // Only admin/committee may activate pending_staff signups (the backend 403s
  // a coach) — gate the inline Approve button accordingly.
  const canApprove = user?.role === 'admin' || user?.role === 'committee';

  const juniors = useMemo(() => juniorsQuery.data ?? [], [juniorsQuery.data]);
  const coaches = coachesQuery.data ?? [];
  const bands = bandsQuery.data ?? [];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return juniors.filter((j) => {
      if (q && !juniorName(j).toLowerCase().includes(q)) return false;
      if (bandFilter !== FILTER_ALL && String(j.band_id) !== bandFilter) {
        return false;
      }
      if (approvalFilter !== FILTER_ALL && j.approval_status !== approvalFilter) {
        return false;
      }
      if (
        participantFilter !== FILTER_ALL &&
        (j.participant_type ?? 'registered_junior') !== participantFilter
      ) {
        return false;
      }
      if (coachFilter === FILTER_UNASSIGNED) return j.coach_id === null;
      if (coachFilter !== FILTER_ALL) return j.coach_id === coachFilter;
      return true;
    });
  }, [juniors, search, bandFilter, coachFilter, approvalFilter, participantFilter]);

  // Per-band counts for the summary strip (band_id → count).
  const bandCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const j of juniors) {
      counts.set(j.band_id, (counts.get(j.band_id) ?? 0) + 1);
    }
    return counts;
  }, [juniors]);

  // Signups waiting on the club (pending_staff) for the summary strip.
  const pendingClubCount = useMemo(
    () => juniors.filter((j) => j.approval_status === 'pending_staff').length,
    [juniors],
  );

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      {/* Header */}
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Programme
      </p>
      <h1 className="mt-1 text-2xl font-black text-silver sm:text-3xl">
        Juniors
      </h1>
      <p className="mt-1 text-sm text-slate">
        Every junior in the development programme. Open a profile for progress,
        handicap history and the full intake record.
      </p>

      {/* Summary strip: total + pending club approvals + per-band counts */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 sm:gap-4">
        <StatCard
          icon={Users}
          value={juniorsQuery.isLoading ? '…' : juniors.length}
          label="Juniors"
          testId="juniors-stat-total"
        />
        <StatCard
          icon={UserCheck}
          value={juniorsQuery.isLoading ? '…' : pendingClubCount}
          label="Pending club approval"
          testId="juniors-stat-pending-club"
        />
        {bands.map((b: LevelBand) => (
          <StatCard
            key={b.id}
            value={juniorsQuery.isLoading ? '…' : (bandCounts.get(b.id) ?? 0)}
            label={b.name}
            testId={`juniors-stat-band-${b.id}`}
          />
        ))}
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div className="min-w-[14rem] flex-1 sm:flex-none">
          <label htmlFor="juniors-search" className={labelClass}>
            Search
          </label>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate"
              aria-hidden="true"
            />
            <input
              id="juniors-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className={fieldClass + ' pl-10'}
              data-testid="juniors-search"
            />
          </div>
        </div>

        <div>
          <label htmlFor="juniors-filter-band" className={labelClass}>
            Band
          </label>
          <select
            id="juniors-filter-band"
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value)}
            className={fieldClass}
            data-testid="juniors-filter-band"
          >
            <option value={FILTER_ALL}>All bands</option>
            {bands.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name} ({b.band_label})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="juniors-filter-approval" className={labelClass}>
            Approval
          </label>
          <select
            id="juniors-filter-approval"
            value={approvalFilter}
            onChange={(e) => setApprovalFilter(e.target.value)}
            className={fieldClass}
            data-testid="juniors-filter-approval"
          >
            {APPROVAL_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="juniors-filter-participant" className={labelClass}>
            Participant
          </label>
          <select
            id="juniors-filter-participant"
            value={participantFilter}
            onChange={(e) => setParticipantFilter(e.target.value)}
            className={fieldClass}
            data-testid="juniors-filter-participant"
          >
            <option value={FILTER_ALL}>All participants</option>
            {PARTICIPANT_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="juniors-filter-coach" className={labelClass}>
            Coach
          </label>
          <select
            id="juniors-filter-coach"
            value={coachFilter}
            onChange={(e) => setCoachFilter(e.target.value)}
            className={fieldClass}
            data-testid="juniors-filter-coach"
          >
            <option value={FILTER_ALL}>All coaches</option>
            <option value={FILTER_UNASSIGNED}>Unassigned</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name || c.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Coach list failed — names degrade to "Unassigned", say so. */}
      {coachesQuery.isError && (
        <GlassCard
          className="mt-5 border border-red-500/30 bg-red-500/10 p-4"
          role="alert"
          data-testid="juniors-coaches-error"
        >
          <div className="flex items-center gap-3 text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="text-sm font-semibold">
              {errorMessage(coachesQuery.error, 'Could not load the coach list.')}{' '}
              Coach names are unavailable until it loads.
            </span>
          </div>
        </GlassCard>
      )}

      {/* List states */}
      <div className="mt-6">
        {juniorsQuery.isLoading ? (
          <div
            className="flex items-center justify-center gap-3 py-16 text-slate"
            data-testid="juniors-loading"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>Loading juniors…</span>
          </div>
        ) : juniorsQuery.isError ? (
          <GlassCard
            className="border border-red-500/30 bg-red-500/10 p-5"
            role="alert"
            data-testid="juniors-error"
          >
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="text-sm font-semibold">
                {errorMessage(
                  juniorsQuery.error,
                  'Could not load juniors. Please try again.',
                )}
              </span>
            </div>
          </GlassCard>
        ) : juniors.length === 0 ? (
          <GlassCard
            className="p-10 text-center text-slate"
            data-testid="juniors-empty"
          >
            No juniors in the programme yet.
          </GlassCard>
        ) : visible.length === 0 ? (
          <GlassCard
            className="p-10 text-center text-slate"
            data-testid="juniors-filter-empty"
          >
            No juniors match these filters.
          </GlassCard>
        ) : (
          <JuniorList
            juniors={visible}
            coaches={coaches}
            bands={bands}
            canApprove={canApprove}
          />
        )}
      </div>
    </div>
  );
}

// ── List (desktop table + mobile cards) ──────────────────────────────────────

interface JuniorListProps {
  juniors: AssignableJunior[];
  coaches: User[];
  bands: LevelBand[];
  // admin/committee only — coaches never see the inline Approve control.
  canApprove: boolean;
}

function bandBadge(bands: LevelBand[], bandId: number) {
  const band = bands.find((b) => b.id === bandId);
  return band ? (
    <Badge tone="slate" shape="pill">
      {band.name}
    </Badge>
  ) : null;
}

// Approval badge for a row — active juniors show nothing.
function approvalBadge(j: AssignableJunior) {
  const label = approvalStatusLabel(j.approval_status);
  if (!label) return null;
  return (
    <Badge
      tone={approvalStatusTone(j.approval_status)}
      shape="pill"
      data-testid={`junior-approval-${j.id}`}
    >
      {label}
    </Badge>
  );
}

// Inline "Approve" for a pending_staff row (own mutation instance per row so
// pending/error state stays local). PUT /api/juniors/:id/approve → active.
function ApproveControl({ juniorId }: { juniorId: number }) {
  const approve = useApproveJunior();
  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      <Button
        size="sm"
        onClick={() => approve.mutate(juniorId)}
        disabled={approve.isPending}
        data-testid={`junior-approve-${juniorId}`}
      >
        {approve.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        )}
        Approve
      </Button>
      {approve.isError ? (
        <span role="alert" className="text-xs font-semibold text-red-400">
          {errorMessage(approve.error, 'Could not approve. Please try again.')}
        </span>
      ) : null}
    </span>
  );
}

function JuniorList({ juniors, coaches, bands, canApprove }: JuniorListProps) {
  return (
    <>
      {/* Desktop table */}
      <GlassCard className="hidden overflow-hidden md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            All juniors with age, level, band, handicap, assigned coach and
            tournament readiness.
          </caption>
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate">
              <th scope="col" className="px-5 py-3 font-semibold">
                Junior
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Age
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Level
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Handicap
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Coach
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                <span className="sr-only">Tournament ready / open profile</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {juniors.map((j) => {
              const age = ageFromDob(j.date_of_birth);
              return (
                <tr
                  key={j.id}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
                  data-testid={`junior-row-${j.id}`}
                >
                  <td className="px-5 py-3.5">
                    <Link
                      to={`/juniors/${j.id}`}
                      className="inline-flex items-center gap-3 rounded font-semibold text-silver transition hover:text-azure focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
                    >
                      <Avatar name={juniorName(j)} className="h-8 w-8 text-xs" />
                      {juniorName(j)}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 tabular-nums text-slate">
                    {age != null ? age : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <Badge tone="azure">L{j.current_level}</Badge>
                      {bandBadge(bands, j.band_id)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-mono tabular-nums text-slate">
                    {handicapLabel(j)}
                  </td>
                  <td className="px-5 py-3.5 text-slate">
                    {coachName(coaches, j.coach_id)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="inline-flex items-center gap-2">
                      {approvalBadge(j)}
                      {canApprove && j.approval_status === 'pending_staff' && (
                        <ApproveControl juniorId={j.id} />
                      )}
                      {j.tournament_ready && (
                        <Badge tone="gold" shape="pill">
                          Tournament ready
                        </Badge>
                      )}
                      <Link
                        to={`/juniors/${j.id}`}
                        aria-label={`Open ${juniorName(j)}'s profile`}
                        className="rounded text-slate transition hover:text-azure focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
                      >
                        <ChevronRight size={18} aria-hidden="true" />
                      </Link>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GlassCard>

      {/* Mobile cards. The profile link wraps only the name row (not the whole
          card) so the inline Approve button isn't nested inside an anchor. */}
      <div className="space-y-3 md:hidden">
        {juniors.map((j) => {
          const age = ageFromDob(j.date_of_birth);
          return (
            <GlassCard
              key={j.id}
              className="p-4 transition hover:bg-white/[0.06]"
              data-testid={`junior-row-${j.id}`}
            >
              <Link
                to={`/juniors/${j.id}`}
                className="flex items-center justify-between gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={juniorName(j)} className="h-9 w-9 text-sm" />
                  <span className="truncate font-semibold text-silver">
                    {juniorName(j)}
                  </span>
                </span>
                <ChevronRight
                  size={18}
                  className="shrink-0 text-slate"
                  aria-hidden="true"
                />
              </Link>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <Badge tone="azure">L{j.current_level}</Badge>
                {bandBadge(bands, j.band_id)}
                {approvalBadge(j)}
                {j.tournament_ready && (
                  <Badge tone="gold" shape="pill">
                    Tournament ready
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-xs text-slate">
                {age != null ? `Age ${age}` : 'Age —'} · Handicap{' '}
                <span className="font-mono text-silver">
                  {handicapLabel(j)}
                </span>{' '}
                · {coachName(coaches, j.coach_id)}
              </p>
              {canApprove && j.approval_status === 'pending_staff' && (
                <div className="mt-3">
                  <ApproveControl juniorId={j.id} />
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </>
  );
}
