// Coach Management hub (route /coaches, admin+committee guarded in App.tsx).
// Dashboard-style landing for the section: totals, an all-coaches .xlsx export,
// and a roster of coaches — each row drills into a detailed coach page where the
// analytics and student-assignment live. Every figure comes from the backend
// (GET /api/coach-analytics); the page only displays + downloads.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CalendarCheck,
  ChevronRight,
  Loader2,
  Receipt,
  UserX,
  Users,
} from 'lucide-react';

import { useAuth } from '../../auth/useAuth';
import { GlassCard } from '../../components/ui/GlassCard';
import { StatCard } from '../../components/ui/StatCard';
import { ApiError } from '../../lib/api';
import { useAllJuniors } from '../admin/coach-assignment.queries';
import {
  useCoachAnalyticsOverview,
  useExportAllCoaches,
  windowForPreset,
  DEFAULT_PRESET_KEY,
  type CoachSummary,
} from './coach-management.queries';
import {
  AssessmentMix,
  ExportButton,
  HandicapChange,
  PeriodSelector,
} from './CoachManagementShared';
import { attendancePct } from './coach-management.queries';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function CoachManagementPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [presetKey, setPresetKey] = useState(DEFAULT_PRESET_KEY);
  const window = useMemo(() => windowForPreset(presetKey), [presetKey]);

  const query = useCoachAnalyticsOverview(window);
  // Only admins assign juniors, so only they need the unassigned-count list.
  const juniorsQuery = useAllJuniors(isAdmin);
  const exportAll = useExportAllCoaches();

  const coaches = useMemo(() => query.data?.coaches ?? [], [query.data]);
  const unassignedCount = useMemo(
    () => (juniorsQuery.data ?? []).filter((j) => j.coach_id === null).length,
    [juniorsQuery.data],
  );

  const totals = useMemo(
    () =>
      coaches.reduce(
        (acc, c) => {
          acc.sessions += c.sessions_run;
          acc.billable += c.billable_one_on_one.count;
          acc.present += c.attendance.present;
          acc.attTotal += c.attendance.total;
          return acc;
        },
        { sessions: 0, billable: 0, present: 0, attTotal: 0 },
      ),
    [coaches],
  );
  const overallAttendance = totals.attTotal > 0 ? totals.present / totals.attTotal : null;

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-silver sm:text-3xl">Coach management</h1>
          <p className="mt-1 text-sm text-slate">
            Each coach&apos;s workload, billable 1-on-1s, and how their assigned
            juniors are progressing. Open a coach to manage their roster and export
            their billing sheet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector value={presetKey} onChange={setPresetKey} />
          <ExportButton
            label="Export all coaches"
            pending={exportAll.isPending}
            onClick={() => exportAll.mutate(window)}
          />
        </div>
      </header>

      {exportAll.isError && (
        <GlassCard className="flex items-center gap-2 p-3 text-sm text-red-400" role="alert">
          <AlertCircle size={16} />
          {errorMessage(exportAll.error, 'Export failed. Please try again.')}
        </GlassCard>
      )}

      {query.isLoading ? (
        <GlassCard className="flex items-center justify-center p-12 text-slate">
          <Loader2 className="mr-2 animate-spin" size={18} /> Loading coaches…
        </GlassCard>
      ) : query.isError ? (
        <GlassCard className="flex items-center gap-2 p-6 text-red-400" role="alert">
          <AlertCircle size={18} />
          {errorMessage(query.error, 'Could not load coaches.')}
        </GlassCard>
      ) : coaches.length === 0 ? (
        <GlassCard className="p-10 text-center text-slate">
          No active coaches yet. Create coach accounts under Users, then assign
          juniors to them here.
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={Users} value={coaches.length} label="Active coaches" />
            <StatCard icon={CalendarCheck} value={totals.sessions} label="Sessions run" />
            <StatCard icon={Receipt} value={totals.billable} label="Billable 1-on-1s" />
            {isAdmin ? (
              <StatCard icon={UserX} value={unassignedCount} label="Unassigned juniors" />
            ) : (
              <StatCard
                icon={CalendarCheck}
                value={attendancePct(overallAttendance)}
                label="Attendance rate"
              />
            )}
          </div>

          <GlassCard className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate">
                    <th className="px-4 py-3 font-bold">Coach</th>
                    <th className="px-4 py-3 text-center font-bold">Juniors</th>
                    <th className="px-4 py-3 text-center font-bold">Sessions</th>
                    <th className="px-4 py-3 text-center font-bold">1-on-1 (billable)</th>
                    <th className="px-4 py-3 text-center font-bold">Attendance</th>
                    <th className="px-4 py-3 text-center font-bold">Avg level</th>
                    <th className="px-4 py-3 text-center font-bold">Hcp change</th>
                    <th className="px-4 py-3 font-bold">Assessment mix</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {coaches.map((c) => (
                    <CoachRow key={c.coach_id} coach={c} />
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <p className="text-xs text-slate">
            Overall attendance this period: {attendancePct(overallAttendance)}.
            Handicap change averages each coach&apos;s juniors who played counting
            rounds — a drop (improvement) shows green. 1-on-1 sessions are flagged
            billable and counted; pricing is handled outside the app.
          </p>
        </>
      )}
    </div>
  );
}

function CoachRow({ coach }: { coach: CoachSummary }) {
  return (
    <tr className="border-b border-white/5 transition-colors hover:bg-white/5">
      <td className="px-4 py-3">
        <Link to={`/coaches/${coach.coach_id}`} className="font-bold text-silver hover:text-azure">
          {coach.coach_name}
        </Link>
      </td>
      <td className="px-4 py-3 text-center text-silver">{coach.junior_count}</td>
      <td className="px-4 py-3 text-center text-silver">{coach.sessions_run}</td>
      <td className="px-4 py-3 text-center text-silver">
        {coach.billable_one_on_one.count}
        {coach.billable_one_on_one.attendees > 0 && (
          <span className="ml-1 text-xs text-slate">({coach.billable_one_on_one.attendees})</span>
        )}
      </td>
      <td className="px-4 py-3 text-center text-silver">{attendancePct(coach.attendance.rate)}</td>
      <td className="px-4 py-3 text-center text-silver">{coach.avg_current_level ?? '—'}</td>
      <td className="px-4 py-3 text-center">
        <HandicapChange change={coach.avg_handicap_change} className="justify-center" />
      </td>
      <td className="px-4 py-3">
        <AssessmentMix evals={coach.evaluations} />
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          to={`/coaches/${coach.coach_id}`}
          className="inline-flex items-center text-slate hover:text-azure"
          aria-label={`Manage ${coach.coach_name}`}
        >
          <ChevronRight size={18} />
        </Link>
      </td>
    </tr>
  );
}
