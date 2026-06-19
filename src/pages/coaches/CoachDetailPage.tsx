// Coach detail (route /coaches/:coachId, admin+committee guarded in App.tsx).
// One coach as a dashboard: headline stats, sessions-by-type chart, sessions
// timeline, roster management (assign/unassign juniors — admin only), per-junior
// performance, and a per-coach .xlsx billing export. Analytics come from
// GET /api/coach-analytics/:coachId; assignment reuses the shared coach hooks.

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CalendarCheck,
  Loader2,
  Receipt,
  TrendingDown,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useAuth } from '../../auth/useAuth';
import { Badge } from '../../components/ui/Badge';
import { GlassCard } from '../../components/ui/GlassCard';
import { StatCard } from '../../components/ui/StatCard';
import { ApiError } from '../../lib/api';
import {
  useAllJuniors,
  useAssignCoach,
  type AssignableJunior,
} from '../admin/coach-assignment.queries';
import {
  useCoachAnalyticsDetail,
  useExportCoach,
  windowForPreset,
  DEFAULT_PRESET_KEY,
  ASSESSMENT_LABEL,
  SESSION_TYPE_LABEL,
  attendancePct,
  type CoachJuniorRow,
} from './coach-management.queries';
import {
  AssessmentMix,
  ExportButton,
  HandicapChange,
  PeriodSelector,
} from './CoachManagementShared';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function juniorName(j: AssignableJunior): string {
  return j.full_name?.trim() || `Golfer #${j.id}`;
}

const assessmentTone: Record<string, 'red' | 'azure' | 'emerald'> = {
  below_expectation: 'red',
  meeting_expectation: 'azure',
  exceeding_expectation: 'emerald',
};

export function CoachDetailPage() {
  const { coachId } = useParams<{ coachId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [presetKey, setPresetKey] = useState(DEFAULT_PRESET_KEY);
  const window = useMemo(() => windowForPreset(presetKey), [presetKey]);

  const query = useCoachAnalyticsDetail(coachId, window);
  const exportCoach = useExportCoach();
  const data = query.data;

  const chartData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.sessions_by_type)
      .filter(([, n]) => n > 0)
      .map(([type, n]) => ({ label: SESSION_TYPE_LABEL[type] ?? type, count: n }));
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up space-y-6">
      <Link to="/coaches" className="inline-flex items-center gap-1 text-sm text-slate hover:text-azure">
        <ArrowLeft size={16} /> All coaches
      </Link>

      {query.isLoading ? (
        <GlassCard className="flex items-center justify-center p-12 text-slate">
          <Loader2 className="mr-2 animate-spin" size={18} /> Loading coach…
        </GlassCard>
      ) : query.isError ? (
        <GlassCard className="flex items-center gap-2 p-6 text-red-400" role="alert">
          <AlertCircle size={18} />
          {errorMessage(query.error, 'Could not load this coach.')}
        </GlassCard>
      ) : !data ? null : (
        <>
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-black text-silver sm:text-3xl">{data.coach_name}</h1>
              <p className="mt-1 text-sm text-slate">
                {data.junior_count} assigned {data.junior_count === 1 ? 'junior' : 'juniors'} ·{' '}
                {data.window.date_from} → {data.window.date_to}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PeriodSelector value={presetKey} onChange={setPresetKey} />
              <ExportButton
                label="Export coach"
                pending={exportCoach.isPending}
                onClick={() => coachId && exportCoach.mutate({ coachId, window })}
              />
            </div>
          </header>

          {exportCoach.isError && (
            <GlassCard className="flex items-center gap-2 p-3 text-sm text-red-400" role="alert">
              <AlertCircle size={16} />
              {errorMessage(exportCoach.error, 'Export failed. Please try again.')}
            </GlassCard>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={CalendarCheck} value={data.sessions_run} label="Sessions run" />
            <StatCard
              icon={Receipt}
              value={data.billable_one_on_one.count}
              label={`Billable 1-on-1s · ${data.billable_one_on_one.attendees} attendees`}
            />
            <StatCard
              icon={CalendarCheck}
              value={attendancePct(data.attendance.rate)}
              label={`Attendance · ${data.attendance.present}/${data.attendance.total}`}
            />
            <StatCard
              icon={TrendingDown}
              value={<HandicapChange change={data.avg_handicap_change} />}
              label={`Avg hcp change · ${data.juniors_with_handicap} with handicap`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard className="p-5">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate">Sessions by type</h2>
              {chartData.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate">No completed sessions in this period.</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
                      <CartesianGrid vertical={false} stroke="rgba(100,116,139,0.12)" />
                      <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                        contentStyle={{
                          background: '#0b1220',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 12,
                          color: '#e2e8f0',
                        }}
                      />
                      <Bar dataKey="count" name="Sessions" fill="#0082CD" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-5">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate">Evaluation outcomes</h2>
              <p className="mb-3 text-sm text-slate">
                {data.evaluations.total} evaluation{data.evaluations.total === 1 ? '' : 's'} signed ·{' '}
                <span className="font-bold text-silver">{data.evaluations.move_next_level}</span> recommended for
                promotion · avg level <span className="font-bold text-silver">{data.avg_current_level ?? '—'}</span>
              </p>
              <AssessmentMix evals={data.evaluations} showCounts />
            </GlassCard>
          </div>

          {/* Sessions timeline */}
          <GlassCard className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <CalendarCheck size={16} className="text-azure" />
              <h2 className="text-sm font-bold text-silver">Sessions timeline</h2>
            </div>
            {data.sessions.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate">No completed sessions in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate">
                      <th className="px-4 py-2.5 font-bold">Date</th>
                      <th className="px-4 py-2.5 font-bold">Type</th>
                      <th className="px-4 py-2.5 font-bold">Focus</th>
                      <th className="px-4 py-2.5 text-center font-bold">Present</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.map((s) => (
                      <tr key={s.id} className="border-b border-white/5">
                        <td className="px-4 py-2.5 text-silver">{fmtDate(s.date)}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-silver">{SESSION_TYPE_LABEL[s.session_type] ?? s.session_type}</span>
                          {s.billable && <Badge tone="gold" className="ml-2">Billable</Badge>}
                        </td>
                        <td className="px-4 py-2.5 text-slate">{s.title ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center text-silver">
                          {s.present}/{s.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>

          {/* Roster management + per-junior performance */}
          <RosterSection coachId={coachId!} assigned={data.juniors} canEdit={isAdmin} />

          <p className="flex items-center gap-1.5 text-xs text-slate">
            <Award size={14} />
            Performance figures aggregate this coach&apos;s assigned juniors over the period. Handicap, evaluations and
            promotions are all staff-signed-off upstream — this view reports them, it doesn&apos;t compute golf scoring.
          </p>
        </>
      )}
    </div>
  );
}

// Coach-centric roster: shows the juniors assigned to THIS coach (with their
// performance) and lets an admin assign more or unassign. Committee sees it
// read-only.
function RosterSection({
  coachId,
  assigned,
  canEdit,
}: {
  coachId: string;
  assigned: CoachJuniorRow[];
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const allJuniorsQuery = useAllJuniors(canEdit); // only needed for the add-picker
  const assignMutation = useAssignCoach();
  const [toAdd, setToAdd] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Juniors not already on this coach — candidates to assign.
  const candidates = useMemo(
    () => (allJuniorsQuery.data ?? []).filter((j) => j.coach_id !== coachId),
    [allJuniorsQuery.data, coachId],
  );

  async function runAssign(juniorId: number, newCoachId: string | null) {
    setActionError(null);
    try {
      await assignMutation.mutateAsync({ juniorId, coachId: newCoachId });
      // useAssignCoach invalidates juniors + coach rosters; also refresh analytics.
      await queryClient.invalidateQueries({ queryKey: ['coach-analytics'] });
      setToAdd('');
    } catch (err) {
      setActionError(errorMessage(err, 'Could not update the assignment.'));
    }
  }

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Users size={16} className="text-azure" />
        <h2 className="text-sm font-bold text-silver">Roster &amp; performance</h2>
        <span className="ml-auto text-xs text-slate">{assigned.length} assigned</span>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3">
          <UserPlus size={16} className="text-emerald-300" />
          <label htmlFor="assign-junior" className="text-xs font-bold text-slate">
            Assign a junior to this coach:
          </label>
          <select
            id="assign-junior"
            value={toAdd}
            onChange={(e) => setToAdd(e.target.value)}
            disabled={assignMutation.isPending}
            className="rounded-lg border border-white/10 bg-navy px-2.5 py-1.5 text-xs text-silver outline-none transition-colors focus:border-azure disabled:opacity-50"
          >
            <option value="">Select a junior…</option>
            {candidates.map((j) => (
              <option key={j.id} value={j.id}>
                {juniorName(j)}
                {j.coach_id ? ' (reassign)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!toAdd || assignMutation.isPending}
            onClick={() => runAssign(Number(toAdd), coachId)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
          >
            <UserPlus size={14} /> Assign
          </button>
        </div>
      )}

      {actionError && (
        <p className="flex items-center gap-2 px-4 py-2 text-sm text-red-400" role="alert">
          <AlertCircle size={16} /> {actionError}
        </p>
      )}

      {assigned.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate">
          No juniors are assigned to this coach yet.
          {canEdit && ' Use the selector above to assign one.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate">
                <th className="px-4 py-2.5 font-bold">Junior</th>
                <th className="px-4 py-2.5 font-bold">Band</th>
                <th className="px-4 py-2.5 text-center font-bold">Level</th>
                <th className="px-4 py-2.5 text-center font-bold">Handicap</th>
                <th className="px-4 py-2.5 text-center font-bold">Hcp change</th>
                <th className="px-4 py-2.5 font-bold">Latest assessment</th>
                {canEdit && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {assigned.map((j) => (
                <tr key={j.junior_id} className="border-b border-white/5">
                  <td className="px-4 py-2.5">
                    <Link to={`/juniors/${j.junior_id}`} className="font-medium text-silver hover:text-azure">
                      {j.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate">{j.band_label ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center text-silver">{j.current_level ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center text-silver">
                    {j.has_handicap && j.handicap_index != null ? j.handicap_index.toFixed(1) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <HandicapChange change={j.handicap_change} className="justify-center" />
                  </td>
                  <td className="px-4 py-2.5">
                    {j.latest_assessment ? (
                      <Badge tone={assessmentTone[j.latest_assessment] ?? 'slate'}>
                        {ASSESSMENT_LABEL[j.latest_assessment] ?? j.latest_assessment}
                        {j.latest_recommendation === 'move_next_level' && ' · promote'}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate">No evaluation</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={assignMutation.isPending}
                        onClick={() => runAssign(j.junior_id, null)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-slate transition-colors hover:text-red-400 disabled:opacity-50"
                      >
                        <UserMinus size={14} /> Unassign
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
