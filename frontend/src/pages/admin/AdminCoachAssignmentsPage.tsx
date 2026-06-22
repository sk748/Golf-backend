// Admin "Coach assignments" page (route /coach-assignments, admin-guarded in
// App.tsx). Lists every junior with an inline assigned-coach select; changing
// the select immediately PUTs the assignment (null unassigns). The coach
// filter is purely client-side off the already-loaded list.

import { useState } from 'react';
import { AlertCircle, Loader2, UserCheck, UserX, Users } from 'lucide-react';

import { useAuth } from '../../auth/useAuth';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { User } from '../../types/api';
import { Badge } from '../../components/ui/Badge';
import { GlassCard } from '../../components/ui/GlassCard';
import { StatCard } from '../../components/ui/StatCard';
import { fieldClass, labelClass } from '../auth/AuthShell';
import {
  useAllJuniors,
  useAssignCoach,
  useCoachUsers,
  type AssignableJunior,
} from './coach-assignment.queries';

// Sentinel for the filter dropdown's non-coach options.
const FILTER_ALL = 'all';
const FILTER_UNASSIGNED = 'unassigned';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function juniorName(j: AssignableJunior): string {
  return j.full_name?.trim() || `Golfer #${j.id}`;
}

function handicapLabel(j: AssignableJunior): string {
  return j.has_handicap && j.handicap_index != null
    ? j.handicap_index.toFixed(1)
    : '—';
}

const coachSelectClass =
  'rounded-lg border border-white/10 bg-navy px-2.5 py-1.5 text-xs text-silver outline-none transition-colors focus:border-azure disabled:opacity-50';

export function AdminCoachAssignmentsPage() {
  const { user } = useAuth();

  const juniorsQuery = useAllJuniors();
  const coachesQuery = useCoachUsers();

  const [coachFilter, setCoachFilter] = useState<string>(FILTER_ALL);

  // Defence in depth: the route is admin-guarded, but never render the
  // management UI for another role that deep-links here.
  if (user && user.role !== 'admin') {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up">
        <GlassCard className="p-10 text-center text-slate" role="alert">
          Coach assignments are managed by the club admin.
        </GlassCard>
      </div>
    );
  }

  const juniors = juniorsQuery.data ?? [];
  const coaches = coachesQuery.data ?? [];

  const assignedCount = juniors.filter((j) => j.coach_id !== null).length;
  const unassignedCount = juniors.length - assignedCount;

  const visibleJuniors =
    coachFilter === FILTER_ALL
      ? juniors
      : coachFilter === FILTER_UNASSIGNED
        ? juniors.filter((j) => j.coach_id === null)
        : juniors.filter((j) => j.coach_id === coachFilter);

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-silver">Coach assignments</h1>
        <p className="mt-1 text-sm text-slate">
          Assign each junior to a coach. Coaches see their assigned juniors on
          their dashboard.
        </p>
      </div>

      {/* Summary strip */}
      <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          icon={Users}
          value={juniorsQuery.isLoading ? '…' : juniors.length}
          label="Juniors"
          testId="assign-stat-total"
        />
        <StatCard
          icon={UserCheck}
          value={juniorsQuery.isLoading ? '…' : assignedCount}
          label="Assigned"
          testId="assign-stat-assigned"
        />
        <StatCard
          icon={UserX}
          value={
            juniorsQuery.isLoading ? (
              '…'
            ) : (
              <span className={unassignedCount > 0 ? 'text-gold' : undefined}>
                {unassignedCount}
              </span>
            )
          }
          label="Unassigned"
          testId="assign-stat-unassigned"
        />
      </div>

      {/* Coaches list failed: the selects can't be populated. */}
      {coachesQuery.isError && (
        <GlassCard
          className="mt-5 border border-red-500/30 bg-red-500/10 p-4"
          role="alert"
          data-testid="coaches-error"
        >
          <div className="flex items-center gap-3 text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="text-sm font-semibold">
              {errorMessage(
                coachesQuery.error,
                'Could not load the coach list.',
              )}{' '}
              Assignments are unavailable until it loads.
            </span>
          </div>
        </GlassCard>
      )}

      {/* Filter */}
      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="filter-coach" className={labelClass}>
            Coach
          </label>
          <select
            id="filter-coach"
            value={coachFilter}
            onChange={(e) => setCoachFilter(e.target.value)}
            className={fieldClass}
            data-testid="filter-coach"
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

      {/* List states */}
      <div className="mt-6">
        {juniorsQuery.isLoading ? (
          <div
            className="flex items-center justify-center gap-3 py-16 text-slate"
            data-testid="assignments-loading"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>Loading juniors…</span>
          </div>
        ) : juniorsQuery.isError ? (
          <GlassCard
            className="border border-red-500/30 bg-red-500/10 p-5"
            role="alert"
            data-testid="assignments-error"
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
            data-testid="assignments-empty"
          >
            No juniors in the programme yet.
          </GlassCard>
        ) : visibleJuniors.length === 0 ? (
          <GlassCard
            className="p-10 text-center text-slate"
            data-testid="assignments-filter-empty"
          >
            No juniors match this filter.
          </GlassCard>
        ) : (
          <JuniorList
            juniors={visibleJuniors}
            coaches={coaches}
            coachesReady={coachesQuery.isSuccess}
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
  coachesReady: boolean;
}

function JuniorList({ juniors, coaches, coachesReady }: JuniorListProps) {
  return (
    <>
      {/* Desktop table */}
      <GlassCard className="hidden overflow-hidden md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate">
              <th scope="col" className="px-5 py-3 font-semibold">
                Junior
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Level
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Handicap
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">
                Assigned coach
              </th>
            </tr>
          </thead>
          <tbody>
            {juniors.map((j) => (
              <JuniorRow
                key={j.id}
                junior={j}
                coaches={coaches}
                coachesReady={coachesReady}
              />
            ))}
          </tbody>
        </table>
      </GlassCard>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {juniors.map((j) => (
          <JuniorCard
            key={j.id}
            junior={j}
            coaches={coaches}
            coachesReady={coachesReady}
          />
        ))}
      </div>
    </>
  );
}

interface JuniorAssignProps {
  junior: AssignableJunior;
  coaches: User[];
  coachesReady: boolean;
}

// Per-row mutation wiring shared by the table row and the mobile card. Each
// row owns its own mutation instance so pending/error state stays per-junior.
function useAssignControl({ junior, coachesReady }: JuniorAssignProps) {
  const assign = useAssignCoach();

  const onCoachChange = (value: string) => {
    const coachId = value === '' ? null : value;
    if (coachId === junior.coach_id) return;
    assign.mutate({ juniorId: junior.id, coachId });
  };

  return {
    assign,
    onCoachChange,
    selectDisabled: assign.isPending || !coachesReady,
  };
}

function CoachSelect({
  junior,
  coaches,
  disabled,
  onChange,
  className,
}: {
  junior: AssignableJunior;
  coaches: User[];
  disabled: boolean;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <>
      <label className="sr-only" htmlFor={`coach-select-${junior.id}`}>
        Assigned coach for {juniorName(junior)}
      </label>
      <select
        id={`coach-select-${junior.id}`}
        value={junior.coach_id ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(coachSelectClass, className)}
        data-testid={`coach-select-${junior.id}`}
      >
        <option value="">Unassigned</option>
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name || c.email}
          </option>
        ))}
      </select>
    </>
  );
}

function AssignError({ error }: { error: unknown }) {
  return (
    <p
      className="mt-1 flex items-center justify-end gap-1 text-xs text-red-400"
      role="alert"
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {errorMessage(error, 'Could not update the assignment.')}
    </p>
  );
}

function JuniorRow({ junior, coaches, coachesReady }: JuniorAssignProps) {
  const { assign, onCoachChange, selectDisabled } = useAssignControl({
    junior,
    coaches,
    coachesReady,
  });

  return (
    <tr
      className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
      data-testid={`assign-row-${junior.id}`}
    >
      <td className="px-5 py-4 font-semibold text-silver">
        {juniorName(junior)}
      </td>
      <td className="px-5 py-4">
        <Badge tone="slate">L{junior.current_level}</Badge>
      </td>
      <td className="px-5 py-4 tabular-nums text-slate">
        {handicapLabel(junior)}
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center justify-end gap-2">
          {assign.isPending && (
            <Loader2
              className="h-4 w-4 animate-spin text-azure"
              aria-hidden="true"
            />
          )}
          <CoachSelect
            junior={junior}
            coaches={coaches}
            disabled={selectDisabled}
            onChange={onCoachChange}
          />
        </div>
        {assign.isError && <AssignError error={assign.error} />}
      </td>
    </tr>
  );
}

function JuniorCard({ junior, coaches, coachesReady }: JuniorAssignProps) {
  const { assign, onCoachChange, selectDisabled } = useAssignControl({
    junior,
    coaches,
    coachesReady,
  });

  return (
    <GlassCard className="p-4" data-testid={`assign-row-${junior.id}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-semibold text-silver">
          {juniorName(junior)}
        </span>
        <Badge tone="slate" className="shrink-0">
          L{junior.current_level}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-slate">
        Handicap{' '}
        <span className="tabular-nums text-silver">
          {handicapLabel(junior)}
        </span>
      </p>

      <div className="mt-3 flex items-center gap-2">
        <CoachSelect
          junior={junior}
          coaches={coaches}
          disabled={selectDisabled}
          onChange={onCoachChange}
          className="flex-1"
        />
        {assign.isPending && (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-azure"
            aria-hidden="true"
          />
        )}
      </div>
      {assign.isError && <AssignError error={assign.error} />}
    </GlassCard>
  );
}
