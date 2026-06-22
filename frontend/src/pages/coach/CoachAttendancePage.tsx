import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Users,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { Badge } from '../../components/ui/Badge';
import { useCoachSessions, type CoachSession } from './coach-schedule.queries';
import {
  useSession,
  useClassEnrollments,
  useAttendanceSummary,
  useBulkAttendance,
  type AttendanceStatus,
} from './coach-attendance.queries';
import { useGolferNames } from './coach-evaluations.queries';
import {
  currentWeekStart,
  dayLabel,
  parseISODate,
  sessionISODate,
  sessionTimeLabel,
  shiftWeek,
} from './coach-dates';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function sessionLabel(s: CoachSession): string {
  const iso = sessionISODate(s);
  const date = iso ? dayLabel(parseISODate(iso)) : 'undated';
  const time = sessionTimeLabel(s);
  const title = s.session_type ?? 'Session';
  return time ? `${title} · ${date} ${time}` : `${title} · ${date}`;
}

const STATUS_ORDER: AttendanceStatus[] = ['present', 'absent', 'excused'];
const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  excused: 'Excused',
};
// Selected-state colour per status (unselected falls back to a neutral chip).
const STATUS_ACTIVE: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-500 text-white',
  absent: 'bg-red-500 text-white',
  excused: 'bg-gold text-navy',
};

export function CoachAttendancePage() {
  const { user } = useAuth();
  const coachId = user?.id;

  // Session picker: pull a recent window (last ~4 weeks through next week) of the
  // coach's sessions to choose from. No date library — derive the bounds locally.
  const dateFrom = shiftWeek(currentWeekStart(), -4);
  const dateTo = shiftWeek(currentWeekStart(), 2);
  const sessionsQuery = useCoachSessions(coachId, {
    date_from: dateFrom,
    date_to: dateTo,
  });
  const sessions = sessionsQuery.data ?? [];

  const [sessionId, setSessionId] = useState<number | null>(null);

  // Resolve the picked session -> its class -> the enrolled roster.
  const session = useSession(sessionId ?? undefined);
  const classId = session.data?.class_id ?? null;
  const enrollments = useClassEnrollments(classId);
  const summary = useAttendanceSummary(sessionId ?? undefined);
  const bulk = useBulkAttendance();
  const { nameFor, levelFor } = useGolferNames();

  const roster = useMemo(() => enrollments.data ?? [], [enrollments.data]);

  // Working draft of each junior's status, seeded from any existing attendance.
  const [draft, setDraft] = useState<Record<number, AttendanceStatus>>({});

  // Seed the draft once the roster + existing summary are available (or when the
  // session changes). Existing marks win; unmarked juniors default to present.
  // Build the seeded draft from the roster + any existing attendance. Existing
  // marks win; unmarked juniors default to present. Memoized so the seeding
  // effect only fires when the roster set or saved summary actually changes —
  // not on every query refetch (which would discard in-progress edits).
  const seededDraft = useMemo(() => {
    const existing: Record<number, AttendanceStatus> = {};
    for (const r of summary.data?.records ?? []) existing[r.junior_id] = r.status;
    const seeded: Record<number, AttendanceStatus> = {};
    for (const e of roster) {
      seeded[e.junior_id] = existing[e.junior_id] ?? 'present';
    }
    return seeded;
  }, [roster, summary.data]);

  const rosterKey = roster.map((e) => e.junior_id).join(',');

  useEffect(() => {
    if (roster.length === 0) return;
    setDraft(seededDraft);
    // Re-seed on session change, a different roster, or freshly loaded summary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, rosterKey, summary.data]);

  const rosterLoading = session.isLoading || enrollments.isLoading;
  const hasSavedBefore = (summary.data?.records?.length ?? 0) > 0;

  function setStatus(juniorId: number, status: AttendanceStatus) {
    setDraft((d) => ({ ...d, [juniorId]: status }));
  }

  function handleSubmit() {
    if (!sessionId) return;
    const records = roster.map((e) => ({
      junior_id: e.junior_id,
      status: draft[e.junior_id] ?? 'present',
    }));
    bulk.mutate({ session_id: sessionId, records });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="animate-fade-in-up text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Coaching
      </p>
      <h1 className="animate-fade-in-up stagger-1 mt-1 text-2xl font-black text-silver sm:text-3xl">
        Attendance
      </h1>
      <p className="animate-fade-in-up stagger-1 mt-2 max-w-2xl text-sm text-slate">
        Mark each junior present, absent, or excused. Attendance counts toward
        their band session minimums.
      </p>

      {/* ── Session picker ──────────────────────────────────────────────── */}
      <GlassCard className="animate-fade-in-up stagger-1 mt-6 p-5">
        <label
          htmlFor="session-picker"
          className="text-sm font-bold text-silver"
        >
          Session
        </label>
        {sessionsQuery.isLoading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate">
            <Loader2 size={18} className="animate-spin text-azure" />
            Loading your sessions…
          </div>
        ) : sessionsQuery.isError ? (
          <div
            className="mt-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            role="alert"
            data-testid="sessions-error"
          >
            {errorMessage(sessionsQuery.error, 'Could not load your sessions.')}
          </div>
        ) : sessions.length === 0 ? (
          <p className="mt-3 text-sm text-slate" data-testid="sessions-empty">
            You have no recent sessions to take attendance for.
          </p>
        ) : (
          <select
            id="session-picker"
            className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-silver focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
            value={sessionId ?? ''}
            onChange={(e) =>
              setSessionId(e.target.value ? Number(e.target.value) : null)
            }
            data-testid="session-picker"
          >
            <option value="">Choose a session…</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {sessionLabel(s)}
              </option>
            ))}
          </select>
        )}
      </GlassCard>

      {/* ── Roster + marking ────────────────────────────────────────────── */}
      {sessionId && (
        <GlassCard className="animate-fade-in-up stagger-2 mt-4 p-5" data-testid="roster-card">
          {rosterLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate" data-testid="roster-loading">
              <Loader2 size={18} className="animate-spin text-azure" />
              Loading roster…
            </div>
          ) : session.isError ? (
            <div className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400" role="alert" data-testid="roster-session-error">
              {errorMessage(session.error, 'Could not load that session.')}
            </div>
          ) : enrollments.isError ? (
            <div className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400" role="alert" data-testid="roster-error">
              {errorMessage(enrollments.error, 'Could not load the roster.')}
            </div>
          ) : classId == null ? (
            <div className="py-6 text-center" data-testid="roster-no-class">
              <Users size={26} className="mx-auto text-slate" />
              <p className="mt-3 text-sm font-semibold text-silver">
                No class attached
              </p>
              <p className="mt-1 text-xs text-slate">
                This session isn’t linked to a class, so there’s no roster to
                mark.
              </p>
            </div>
          ) : roster.length === 0 ? (
            <div className="py-6 text-center" data-testid="roster-empty">
              <Users size={26} className="mx-auto text-slate" />
              <p className="mt-3 text-sm font-semibold text-silver">
                No juniors enrolled
              </p>
              <p className="mt-1 text-xs text-slate">
                This class has no enrolled juniors yet.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-bold text-silver">
                  <Users size={16} className="text-azure" />
                  Roster ({roster.length})
                </h2>
                {hasSavedBefore && (
                  <Badge tone="emerald" className="px-2 py-0.5">
                    Already recorded
                  </Badge>
                )}
              </div>

              <ul className="mt-4 flex flex-col gap-2" data-testid="roster-list">
                {roster.map((e) => {
                  const current = draft[e.junior_id] ?? 'present';
                  const name = nameFor(e.junior_id);
                  const level = levelFor(e.junior_id);
                  return (
                    <li
                      key={e.junior_id}
                      className="glass-light flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center sm:justify-between"
                      data-testid={`roster-row-${e.junior_id}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-silver">
                          {name}
                        </p>
                        {level != null && (
                          <p className="mt-0.5 text-xs text-slate">
                            Level {level}
                          </p>
                        )}
                      </div>
                      <div
                        className="flex gap-2"
                        role="radiogroup"
                        aria-label={`Attendance for ${name}`}
                      >
                        {STATUS_ORDER.map((status) => {
                          const active = current === status;
                          return (
                            <button
                              key={status}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => setStatus(e.junior_id, status)}
                              className={cn(
                                'min-h-[44px] flex-1 rounded-xl px-3 text-sm font-bold transition-all active:scale-[0.98] sm:flex-none focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50',
                                active
                                  ? STATUS_ACTIVE[status]
                                  : 'border border-white/15 text-slate hover:bg-white/5',
                              )}
                              data-testid={`status-${e.junior_id}-${status}`}
                            >
                              {STATUS_LABEL[status]}
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {bulk.isError && (
                <div
                  className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
                  role="alert"
                  data-testid="bulk-error"
                >
                  {errorMessage(bulk.error, 'Could not save attendance.')}
                </div>
              )}
              {bulk.isSuccess && !bulk.isPending && (
                <p
                  className="mt-4 flex items-center gap-2 text-sm text-emerald-400"
                  data-testid="bulk-success"
                >
                  <CheckCircle2 size={16} />
                  Attendance saved.
                </p>
              )}

              <div className="mt-5">
                <Button
                  fullWidth
                  size="lg"
                  disabled={bulk.isPending}
                  onClick={handleSubmit}
                  data-testid="submit-attendance"
                >
                  {bulk.isPending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <ClipboardCheck size={18} />
                  )}
                  {hasSavedBefore ? 'Update attendance' : 'Save attendance'}
                </Button>
              </div>
            </>
          )}
        </GlassCard>
      )}
    </div>
  );
}
