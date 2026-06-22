// Group sessions — STAFF side (route /coach-sessions, admin + coach; guarded in
// App.tsx). A coach publishes sessions open for booking (title/focus, capacity,
// level/age bounds, requirements), reviews the pending approvals queue, and
// approves/declines bookings per session. An admin sees every coach's sessions
// and can publish on a coach's behalf.
//
// This page is staff-only routed, so the club-wide junior name lookup
// (GET /api/juniors via the shared ['juniors','all'] key) is safe here — it
// must never move into the parent/player surfaces.

import { useMemo, useState, type ReactNode } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Inbox,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  Save,
  Users,
  X,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useAuth } from '../../auth/useAuth';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { useAllJuniors, useCoachUsers } from '../admin/coach-assignment.queries';
import { parseISODate, sessionTimeLabel, toISODate } from '../coach/coach-dates';
import {
  bookingStatusLabel,
  bookingStatusTone,
  eligibilityLabel,
  occupancyLabel,
  sessionTypeLabel,
  useApproveBooking,
  useCoachSessions,
  useCreateSession,
  useDeclineBooking,
  usePendingBookings,
  useSessionBookings,
  useUpdateSession,
  type BookingRow,
  type GroupSession,
  type PublishSessionInput,
} from './group-sessions.queries';

// ── Small shared bits ─────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50';

const labelClass = 'block text-sm font-semibold text-silver';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function ErrorPanel({ message, testId }: { message: string; testId?: string }) {
  return (
    <p
      className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
      role="alert"
      data-testid={testId}
    >
      {message}
    </p>
  );
}

function prettyDate(iso: string | null): string {
  if (!iso) return 'Date TBC';
  const d = parseISODate(iso.slice(0, 10));
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
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

// Junior display names from the club-wide list (staff-only; shares the
// established ['juniors','all'] cache key).
function useJuniorNames(): { nameFor: (juniorId: number) => string } {
  const juniors = useAllJuniors();
  const byId = useMemo(
    () => new Map((juniors.data ?? []).map((j) => [j.id, j.full_name?.trim()])),
    [juniors.data],
  );
  return {
    nameFor: (juniorId: number) => byId.get(juniorId) || `Golfer #${juniorId}`,
  };
}

function sessionDisplayTitle(s: GroupSession | undefined): string {
  if (!s) return 'Coaching session';
  return s.title?.trim() || sessionTypeLabel(s.session_type);
}

// ── Approve / decline pair (used by the queue and per-session lists) ──────────

function ApproveDeclineButtons({ booking }: { booking: BookingRow }) {
  const approve = useApproveBooking();
  const decline = useDeclineBooking();
  const busy = approve.isPending || decline.isPending;
  const error = approve.error ?? decline.error;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="gold"
          size="sm"
          disabled={busy}
          onClick={() => approve.mutate({ id: booking.id })}
          data-testid={`approve-booking-${booking.id}`}
        >
          {approve.isPending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 size={14} aria-hidden />
          )}
          Approve
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => decline.mutate({ id: booking.id })}
          data-testid={`decline-booking-${booking.id}`}
        >
          {decline.isPending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <X size={14} aria-hidden />
          )}
          Decline
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {errorMessage(error, 'Could not update this booking.')}
        </p>
      ) : null}
    </div>
  );
}

// ── Pending approvals queue ───────────────────────────────────────────────────

function PendingQueue({
  sessionsById,
  coachScopeId,
}: {
  sessionsById: Map<number, GroupSession>;
  coachScopeId?: string; // set for coaches — only their (or unassigned) rows
}) {
  const pending = usePendingBookings();
  const { nameFor } = useJuniorNames();

  const rows = useMemo(() => {
    const all = pending.data ?? [];
    if (!coachScopeId) return all;
    // The backend 403s a coach acting on another coach's booking; keep the
    // queue actionable by showing only their own (or coach-unassigned) rows.
    return all.filter((b) => !b.coach_id || b.coach_id === coachScopeId);
  }, [pending.data, coachScopeId]);

  return (
    <GlassCard className="animate-fade-in-up stagger-1 mt-6 p-5" data-testid="pending-queue">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15">
          <Inbox size={16} className="text-gold" aria-hidden />
        </span>
        <h2 className="text-sm font-bold text-silver">Pending approvals</h2>
        {rows.length > 0 ? (
          <Badge tone="gold" shape="pill">
            {rows.length}
          </Badge>
        ) : null}
      </div>

      <div className="mt-4">
        {pending.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate" data-testid="queue-loading">
            <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
            Loading bookings…
          </div>
        ) : pending.isError ? (
          <ErrorPanel
            message={errorMessage(pending.error, 'Could not load pending bookings.')}
            testId="queue-error"
          />
        ) : rows.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate" data-testid="queue-empty">
            <CheckCircle2 size={16} className="text-emerald-400" aria-hidden />
            No bookings waiting on you.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="queue-list">
            {rows.map((b) => {
              const session = b.session_id
                ? sessionsById.get(b.session_id)
                : undefined;
              return (
                <li
                  key={b.id}
                  className="glass-light flex flex-wrap items-center justify-between gap-3 rounded-xl p-3"
                  data-testid={`queue-row-${b.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-silver">
                      {nameFor(b.junior_id)}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate">
                      <span>
                        {b.session_id
                          ? sessionDisplayTitle(session)
                          : 'One-to-one request'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} aria-hidden />
                        {prettyDate(b.preferred_date)}
                        {b.preferred_time
                          ? ` · ${b.preferred_time.slice(0, 5)}`
                          : ''}
                      </span>
                    </p>
                  </div>
                  <ApproveDeclineButtons booking={b} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}

// ── Publish form ──────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'group', label: 'Group session' },
  { value: 'one_on_one', label: 'One-on-one' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'tournament_prep', label: 'Tournament prep' },
];

interface PublishFormState {
  coach_id: string; // admin picks; coach is fixed to self
  title: string;
  session_type: string;
  date: string;
  start_time: string;
  end_time: string;
  max_attendance: string;
  level_min: string;
  level_max: string;
  age_min: string;
  age_max: string;
  requirements: string;
  notes: string;
  open_for_booking: boolean;
}

function emptyForm(coachId: string): PublishFormState {
  return {
    coach_id: coachId,
    title: '',
    session_type: 'group',
    date: '',
    start_time: '',
    end_time: '',
    max_attendance: '',
    level_min: '',
    level_max: '',
    age_min: '',
    age_max: '',
    requirements: '',
    notes: '',
    open_for_booking: true, // publish by default
  };
}

function parseIntOrUndef(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

// Admin-only coach picker (mount-gated so coaches never trigger the fetch).
function CoachSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const coaches = useCoachUsers();
  return (
    <Field label="Coach" htmlFor="pub-coach" hint="Who runs this session.">
      <select
        id="pub-coach"
        className={inputClass}
        value={value}
        disabled={coaches.isLoading}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" className="bg-navy">
          {coaches.isLoading ? 'Loading coaches…' : 'Choose a coach…'}
        </option>
        {(coaches.data ?? []).map((c) => (
          <option key={c.id} value={c.id} className="bg-navy">
            {c.full_name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function PublishForm({ isAdmin, selfId }: { isAdmin: boolean; selfId: string }) {
  const create = useCreateSession();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PublishFormState>(() =>
    emptyForm(isAdmin ? '' : selfId),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState(false);

  const set = <K extends keyof PublishFormState>(
    key: K,
    value: PublishFormState[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setJustPublished(false);
    if (!form.coach_id) {
      setFormError('Choose a coach for this session.');
      return;
    }
    if (!form.date || !form.start_time || !form.end_time) {
      setFormError('Date, start time and end time are required.');
      return;
    }

    const payload: PublishSessionInput = {
      coach_id: form.coach_id,
      session_type: form.session_type,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      status: 'scheduled',
      open_for_booking: form.open_for_booking,
    };
    if (form.title.trim()) payload.title = form.title.trim();
    if (form.requirements.trim()) payload.requirements = form.requirements.trim();
    if (form.notes.trim()) payload.notes = form.notes.trim();
    const max = parseIntOrUndef(form.max_attendance);
    if (max !== undefined) payload.max_attendance = max;
    const lmin = parseIntOrUndef(form.level_min);
    if (lmin !== undefined) payload.level_min = lmin;
    const lmax = parseIntOrUndef(form.level_max);
    if (lmax !== undefined) payload.level_max = lmax;
    const amin = parseIntOrUndef(form.age_min);
    if (amin !== undefined) payload.age_min = amin;
    const amax = parseIntOrUndef(form.age_max);
    if (amax !== undefined) payload.age_max = amax;

    create.mutate(payload, {
      onSuccess: () => {
        setForm(emptyForm(isAdmin ? form.coach_id : selfId));
        setJustPublished(true);
        window.setTimeout(() => setJustPublished(false), 4000);
      },
    });
  }

  return (
    <GlassCard className="animate-fade-in-up stagger-2 mt-4 overflow-hidden" data-testid="publish-card">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="publish-toggle"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-azure/15">
            <CalendarPlus size={16} className="text-azure" aria-hidden />
          </span>
          <span className="text-sm font-bold text-silver">
            Publish a group session
          </span>
        </span>
        {open ? (
          <ChevronUp size={18} className="text-slate" aria-hidden />
        ) : (
          <ChevronDown size={18} className="text-slate" aria-hidden />
        )}
      </button>

      {open ? (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 border-t border-white/5 px-5 py-5"
          noValidate
          data-testid="publish-form"
        >
          {isAdmin ? (
            <CoachSelect
              value={form.coach_id}
              onChange={(v) => set('coach_id', v)}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Title / focus"
              htmlFor="pub-title"
              hint="What the session works on."
            >
              <input
                id="pub-title"
                className={inputClass}
                value={form.title}
                placeholder="Short game + putting"
                onChange={(e) => set('title', e.target.value)}
              />
            </Field>
            <Field label="Session type" htmlFor="pub-type">
              <select
                id="pub-type"
                className={inputClass}
                value={form.session_type}
                onChange={(e) => set('session_type', e.target.value)}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-navy">
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" htmlFor="pub-date">
              <input
                id="pub-date"
                type="date"
                className={inputClass}
                value={form.date}
                min={toISODate(new Date())}
                onChange={(e) => set('date', e.target.value)}
              />
            </Field>
            <Field label="Starts" htmlFor="pub-start">
              <input
                id="pub-start"
                type="time"
                className={inputClass}
                value={form.start_time}
                onChange={(e) => set('start_time', e.target.value)}
              />
            </Field>
            <Field label="Ends" htmlFor="pub-end">
              <input
                id="pub-end"
                type="time"
                className={inputClass}
                value={form.end_time}
                onChange={(e) => set('end_time', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Max attendance"
              htmlFor="pub-max"
              hint="Blank = no cap."
            >
              <input
                id="pub-max"
                type="number"
                min={1}
                inputMode="numeric"
                className={inputClass}
                value={form.max_attendance}
                placeholder="No cap"
                onChange={(e) => set('max_attendance', e.target.value)}
              />
            </Field>
            <Field label="Level range" hint="Blank = any level.">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className={inputClass}
                  value={form.level_min}
                  placeholder="Min"
                  aria-label="Level minimum"
                  onChange={(e) => set('level_min', e.target.value)}
                />
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className={inputClass}
                  value={form.level_max}
                  placeholder="Max"
                  aria-label="Level maximum"
                  onChange={(e) => set('level_max', e.target.value)}
                />
              </div>
            </Field>
            <Field label="Age range" hint="Blank = any age.">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className={inputClass}
                  value={form.age_min}
                  placeholder="Min"
                  aria-label="Age minimum"
                  onChange={(e) => set('age_min', e.target.value)}
                />
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className={inputClass}
                  value={form.age_max}
                  placeholder="Max"
                  aria-label="Age maximum"
                  onChange={(e) => set('age_max', e.target.value)}
                />
              </div>
            </Field>
          </div>

          <Field
            label="Requirements"
            htmlFor="pub-reqs"
            hint="Shown to families, e.g. what to bring."
          >
            <input
              id="pub-reqs"
              className={inputClass}
              value={form.requirements}
              placeholder="Bring a putter and a wedge"
              onChange={(e) => set('requirements', e.target.value)}
            />
          </Field>

          <Field label="Notes" htmlFor="pub-notes" hint="Internal session notes.">
            <textarea
              id="pub-notes"
              rows={2}
              className={cn(inputClass, 'resize-y')}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>

          <button
            type="button"
            role="switch"
            aria-checked={form.open_for_booking}
            onClick={() => set('open_for_booking', !form.open_for_booking)}
            className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-left ring-1 ring-white/10 transition-colors hover:bg-white/10"
            data-testid="publish-open-toggle"
          >
            <span
              className={cn(
                'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                form.open_for_booking ? 'bg-azure' : 'bg-white/15',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                  form.open_for_booking
                    ? 'translate-x-[1.375rem]'
                    : 'translate-x-0.5',
                )}
              />
            </span>
            <span className="text-sm text-silver">
              Open for booking — families can request a place straight away
            </span>
          </button>

          {formError ? <ErrorPanel message={formError} /> : null}
          {create.isError ? (
            <ErrorPanel
              message={errorMessage(create.error, 'Could not publish the session.')}
              testId="publish-error"
            />
          ) : null}
          {justPublished ? (
            <p
              className="flex items-center gap-2 rounded-xl bg-emerald-500/15 p-3 text-sm font-semibold text-emerald-400"
              role="status"
              data-testid="publish-success"
            >
              <CheckCircle2 size={16} aria-hidden />
              Session published.
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={create.isPending}
            data-testid="publish-submit"
          >
            {create.isPending ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <CalendarPlus size={16} aria-hidden />
            )}
            Publish session
          </Button>
        </form>
      ) : null}
    </GlassCard>
  );
}

// ── Per-session bookings list ─────────────────────────────────────────────────

function SessionBookings({
  sessionId,
  nameFor,
}: {
  sessionId: number;
  nameFor: (juniorId: number) => string;
}) {
  const bookings = useSessionBookings(sessionId);
  const rows = bookings.data ?? [];

  if (bookings.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate">
        <Loader2 size={16} className="animate-spin text-azure" aria-hidden />
        Loading bookings…
      </div>
    );
  }
  if (bookings.isError) {
    return (
      <ErrorPanel
        message={errorMessage(bookings.error, 'Could not load bookings.')}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate" data-testid={`session-bookings-empty-${sessionId}`}>
        No bookings yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-testid={`session-bookings-${sessionId}`}>
      {rows.map((b) => (
        <li
          key={b.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/5"
        >
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold text-silver">
              {nameFor(b.junior_id)}
            </p>
            <Badge tone={bookingStatusTone(b.status)} shape="pill">
              {bookingStatusLabel(b.status)}
            </Badge>
          </div>
          {String(b.status).toLowerCase() === 'pending' ? (
            <ApproveDeclineButtons booking={b} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// ── Session edit panel (capacity / requirements / title) ─────────────────────

function SessionEditPanel({
  session,
  onClose,
}: {
  session: GroupSession;
  onClose: () => void;
}) {
  const update = useUpdateSession();
  const [title, setTitle] = useState(session.title ?? '');
  const [max, setMax] = useState(
    session.max_attendance != null ? String(session.max_attendance) : '',
  );
  const [requirements, setRequirements] = useState(session.requirements ?? '');

  function save() {
    update.mutate(
      {
        id: session.id,
        body: {
          title: title.trim() || null,
          max_attendance: parseIntOrUndef(max) ?? null,
          requirements: requirements.trim() || null,
        },
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div
      className="space-y-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10"
      data-testid={`session-edit-${session.id}`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title / focus" htmlFor={`edit-title-${session.id}`}>
          <input
            id={`edit-title-${session.id}`}
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field
          label="Max attendance"
          htmlFor={`edit-max-${session.id}`}
          hint="Blank = no cap."
        >
          <input
            id={`edit-max-${session.id}`}
            type="number"
            min={1}
            inputMode="numeric"
            className={inputClass}
            value={max}
            placeholder="No cap"
            onChange={(e) => setMax(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Requirements" htmlFor={`edit-reqs-${session.id}`}>
        <input
          id={`edit-reqs-${session.id}`}
          className={inputClass}
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
        />
      </Field>

      {update.isError ? (
        <ErrorPanel
          message={errorMessage(update.error, 'Could not save the session.')}
        />
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={update.isPending}
          onClick={save}
          data-testid={`session-edit-save-${session.id}`}
        >
          {update.isPending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Save size={14} aria-hidden />
          )}
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Session card ──────────────────────────────────────────────────────────────

function StaffSessionCard({
  session,
  nameFor,
}: {
  session: GroupSession;
  nameFor: (juniorId: number) => string;
}) {
  const update = useUpdateSession();
  const [showBookings, setShowBookings] = useState(false);
  const [editing, setEditing] = useState(false);

  const time = sessionTimeLabel(session);
  const eligibility = eligibilityLabel(session);

  return (
    <GlassCard tone="light" className="p-4" data-testid={`staff-session-${session.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-silver">
              {sessionDisplayTitle(session)}
            </p>
            {session.open_for_booking ? (
              <Badge tone="emerald" shape="pill">
                Open for booking
              </Badge>
            ) : (
              <Badge tone="slate" shape="pill">
                Closed
              </Badge>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate">
            <span className="inline-flex items-center gap-1">
              <Clock size={12} aria-hidden />
              {prettyDate(session.date)}
              {time ? ` · ${time}` : ''}
            </span>
            <span>{sessionTypeLabel(session.session_type)}</span>
            <span className="inline-flex items-center gap-1">
              <Users size={12} aria-hidden />
              {occupancyLabel(session)}
            </span>
          </p>
          {eligibility ? (
            <p className="mt-1 text-xs text-slate">{eligibility}</p>
          ) : null}
          {session.requirements ? (
            <p className="mt-1 text-xs text-slate">{session.requirements}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={update.isPending}
            onClick={() =>
              update.mutate({
                id: session.id,
                body: { open_for_booking: !session.open_for_booking },
              })
            }
            data-testid={`session-toggle-open-${session.id}`}
          >
            {update.isPending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : session.open_for_booking ? (
              <Lock size={14} aria-hidden />
            ) : (
              <LockOpen size={14} aria-hidden />
            )}
            {session.open_for_booking ? 'Close bookings' : 'Open bookings'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing((v) => !v)}
            data-testid={`session-edit-toggle-${session.id}`}
          >
            <Pencil size={14} aria-hidden />
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowBookings((v) => !v)}
            data-testid={`session-bookings-toggle-${session.id}`}
          >
            {showBookings ? (
              <ChevronUp size={14} aria-hidden />
            ) : (
              <ChevronDown size={14} aria-hidden />
            )}
            Bookings
          </Button>
        </div>
      </div>

      {update.isError ? (
        <div className="mt-2">
          <ErrorPanel
            message={errorMessage(update.error, 'Could not update the session.')}
          />
        </div>
      ) : null}

      {editing ? (
        <div className="mt-3">
          <SessionEditPanel session={session} onClose={() => setEditing(false)} />
        </div>
      ) : null}

      {showBookings ? (
        <div className="mt-3">
          <SessionBookings sessionId={session.id} nameFor={nameFor} />
        </div>
      ) : null}
    </GlassCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function CoachSessionsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  // Coach: own sessions only. Admin: club-wide (no coach filter).
  const coachFilter = isAdmin ? undefined : user?.id;
  const sessions = useCoachSessions(coachFilter, Boolean(user));
  const { nameFor } = useJuniorNames();

  const today = toISODate(new Date());
  const upcoming = useMemo(
    () =>
      (sessions.data ?? []).filter(
        (s) => (s.date ?? '') >= today && s.status !== 'cancelled',
      ),
    [sessions.data, today],
  );
  const sessionsById = useMemo(
    () => new Map((sessions.data ?? []).map((s) => [s.id, s])),
    [sessions.data],
  );

  return (
    <div className="mx-auto max-w-4xl" data-testid="coach-sessions-page">
      <p className="animate-fade-in-up text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
        Coaching
      </p>
      <h1 className="animate-fade-in-up stagger-1 mt-1 text-2xl font-black text-silver sm:text-3xl">
        Group sessions
      </h1>
      <p className="animate-fade-in-up stagger-1 mt-2 max-w-2xl text-sm text-slate">
        Publish sessions families can book onto, and approve or decline booking
        requests. Eligibility and capacity are enforced when families book.
      </p>

      <PendingQueue
        sessionsById={sessionsById}
        coachScopeId={isAdmin ? undefined : user?.id}
      />

      {user ? <PublishForm isAdmin={isAdmin} selfId={user.id} /> : null}

      <div className="mt-8 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-black text-silver">
          {isAdmin ? 'Upcoming sessions' : 'My upcoming sessions'}
        </h2>
        <span className="text-xs text-slate">soonest first</span>
      </div>

      <div className="mt-4">
        {sessions.isLoading ? (
          <div
            className="flex items-center gap-2 text-sm text-slate"
            data-testid="sessions-loading"
          >
            <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
            Loading sessions…
          </div>
        ) : sessions.isError ? (
          <ErrorPanel
            message={errorMessage(sessions.error, 'Could not load sessions.')}
            testId="sessions-error"
          />
        ) : upcoming.length === 0 ? (
          <GlassCard className="p-8 text-center" data-testid="sessions-empty">
            <CalendarPlus size={28} className="mx-auto text-azure/60" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-silver">
              No upcoming sessions
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate">
              Publish a session above and it will appear here — and on the
              families&apos; booking page once it&apos;s open for booking.
            </p>
          </GlassCard>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="sessions-list">
            {upcoming.map((s) => (
              <li key={s.id}>
                <StaffSessionCard session={s} nameFor={nameFor} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
