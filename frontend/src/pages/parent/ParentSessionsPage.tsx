// Parent → coaching session requests (route /sessions). Lists the parent's own
// booking requests with status badges, offers a request form (choose child,
// preferred date, preferred time, optional notes — coach left unset, the club
// assigns one), and lets the parent cancel a pending request.
//
// All server data via TanStack Query + the shared api client. POST/DELETE
// invalidate the requests list. No mock data.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Loader2,
  Trash2,
  Users,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { GlassCard } from '../../components/ui/GlassCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { childName, useMyChildren } from './parent-children.queries';
import {
  statusLabel,
  statusTone,
  useCancelBookingRequest,
  useCreateBookingRequest,
  useMyBookingRequests,
  type BookingRequest,
} from './parent-sessions.queries';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function prettyDate(iso: string | null): string {
  if (!iso) return 'Date to confirm';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isPending(status: BookingRequest['status']): boolean {
  return String(status).toLowerCase() === 'pending';
}

// ── Request form ──────────────────────────────────────────────────────────────

function RequestForm() {
  const children = useMyChildren();
  const create = useCreateBookingRequest();
  const kids = useMemo(() => children.data ?? [], [children.data]);

  const [juniorId, setJuniorId] = useState<number | ''>('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  // Default to the only child when there is exactly one.
  useEffect(() => {
    if (juniorId === '' && kids.length === 1) setJuniorId(kids[0].id);
  }, [kids, juniorId]);

  const minDate = todayIso();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (juniorId === '') {
      setFormError('Please choose which child this session is for.');
      return;
    }
    if (!date) {
      setFormError('Please choose a preferred date.');
      return;
    }
    if (!time.trim()) {
      setFormError('Please add a preferred time.');
      return;
    }
    create.mutate(
      {
        junior_id: juniorId,
        preferred_date: date,
        preferred_time: time.trim(),
        admin_notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setJustSubmitted(true);
          setDate('');
          setTime('');
          setNotes('');
          if (kids.length > 1) setJuniorId('');
          window.setTimeout(() => setJustSubmitted(false), 4000);
        },
      },
    );
  }

  if (children.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate">
        <Loader2 size={16} className="animate-spin text-azure" aria-hidden />
        Loading…
      </div>
    );
  }

  if (!children.isError && kids.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <Users size={24} className="text-emerald-400" aria-hidden />
        <p className="text-sm font-semibold text-silver">No child linked yet</p>
        <p className="max-w-sm text-xs text-slate">
          Once your child is linked to your account, you&apos;ll be able to
          request coaching sessions for them here.
        </p>
      </div>
    );
  }

  const submitError =
    create.isError && errorMessage(create.error, 'Could not send your request.');

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="request-form">
      {/* Child */}
      <div>
        <label
          htmlFor="req-child"
          className="text-xs font-bold uppercase tracking-wider text-slate"
        >
          For which child
        </label>
        <select
          id="req-child"
          value={juniorId}
          onChange={(e) =>
            setJuniorId(e.target.value === '' ? '' : Number(e.target.value))
          }
          className="mt-1.5 w-full rounded-xl border border-white/15 bg-navy/60 px-3 py-3 text-sm font-semibold text-silver focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        >
          <option value="" className="bg-navy">
            Choose a child…
          </option>
          {kids.map((k) => (
            <option key={k.id} value={k.id} className="bg-navy text-silver">
              {childName(k)}
            </option>
          ))}
        </select>
      </div>

      {/* Date + time */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="req-date"
            className="text-xs font-bold uppercase tracking-wider text-slate"
          >
            Preferred date
          </label>
          <input
            id="req-date"
            type="date"
            value={date}
            min={minDate}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/15 bg-navy/60 px-3 py-3 text-sm font-semibold text-silver focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
          />
        </div>
        <div>
          <label
            htmlFor="req-time"
            className="text-xs font-bold uppercase tracking-wider text-slate"
          >
            Preferred time
          </label>
          <input
            id="req-time"
            type="text"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="e.g. 10:00 or after school"
            className="mt-1.5 w-full rounded-xl border border-white/15 bg-navy/60 px-3 py-3 text-sm font-semibold text-silver placeholder:text-slate/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label
          htmlFor="req-notes"
          className="text-xs font-bold uppercase tracking-wider text-slate"
        >
          Anything the coach should know (optional)
        </label>
        <textarea
          id="req-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="e.g. would like to focus on putting"
          className="mt-1.5 w-full resize-y rounded-xl border border-white/15 bg-navy/60 px-3 py-3 text-sm text-silver placeholder:text-slate/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        />
      </div>

      <p className="text-xs text-slate">
        The club will confirm a coach and the final time. You&apos;ll see the
        status update below.
      </p>

      {formError ? (
        <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400" role="alert">
          {formError}
        </p>
      ) : null}
      {submitError ? (
        <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400" role="alert">
          {submitError}
        </p>
      ) : null}
      {justSubmitted ? (
        <p
          className="flex items-center gap-2 rounded-xl bg-emerald-500/15 p-3 text-sm font-semibold text-emerald-400"
          role="status"
          data-testid="request-success"
        >
          <CheckCircle2 size={16} aria-hidden />
          Request sent — the club will be in touch.
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        fullWidth
        disabled={create.isPending}
        data-testid="submit-request"
      >
        {create.isPending ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Sending…
          </>
        ) : (
          <>
            <CalendarPlus size={16} aria-hidden />
            Request session
          </>
        )}
      </Button>
    </form>
  );
}

// ── Request list row ──────────────────────────────────────────────────────────

function RequestRow({
  req,
  childLabel,
}: {
  req: BookingRequest;
  childLabel: string;
}) {
  const cancel = useCancelBookingRequest();
  const pending = isPending(req.status);

  return (
    <li>
      <GlassCard
        tone="light"
        className="p-4"
        data-testid={`request-row-${req.id}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-silver">{childLabel}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate">
              <Clock size={13} aria-hidden />
              {prettyDate(req.preferred_date)}
              {req.preferred_time ? <span>· {req.preferred_time}</span> : null}
            </p>
            {req.admin_notes ? (
              <p className="mt-2 text-sm text-slate">{req.admin_notes}</p>
            ) : null}
          </div>
          <Badge tone={statusTone(req.status)} shape="pill">
            {statusLabel(req.status)}
          </Badge>
        </div>

        {pending ? (
          <div className="mt-3 flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => cancel.mutate(req.id)}
              disabled={cancel.isPending}
              data-testid={`cancel-request-${req.id}`}
            >
              {cancel.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  Cancelling…
                </>
              ) : (
                <>
                  <Trash2 size={14} aria-hidden />
                  Cancel request
                </>
              )}
            </Button>
          </div>
        ) : null}

        {cancel.isError ? (
          <p className="mt-2 text-xs text-red-400" role="alert">
            {errorMessage(cancel.error, 'Could not cancel this request.')}
          </p>
        ) : null}
      </GlassCard>
    </li>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ParentSessionsPage() {
  const requests = useMyBookingRequests();
  const children = useMyChildren();

  // Resolve a child's display name for a request (their family only).
  const childLabelFor = (juniorId: number): string => {
    const kid = (children.data ?? []).find((k) => k.id === juniorId);
    return childName(kid);
  };

  const sorted = useMemo(
    () =>
      [...(requests.data ?? [])].sort((a, b) =>
        (b.preferred_date ?? b.created_at ?? '').localeCompare(
          a.preferred_date ?? a.created_at ?? '',
        ),
      ),
    [requests.data],
  );

  return (
    <div className="animate-fade-in-up mx-auto max-w-3xl" data-testid="parent-sessions-page">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">
        Coaching
      </p>
      <h1 className="mt-1 text-2xl font-black text-silver sm:text-3xl">
        Coaching sessions
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        Request extra one-to-one time with a coach for your child, and keep track
        of where each request stands.
      </p>

      {/* Group sessions CTA — coached group sessions are booked from their own
          page; this freeform request flow stays for one-to-one time. */}
      <GlassCard
        className="animate-fade-in-up stagger-1 mt-6 flex flex-wrap items-center justify-between gap-4 p-5"
        data-testid="group-sessions-cta"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
            <Users size={18} className="text-emerald-400" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-silver">
              Group sessions are open for booking
            </p>
            <p className="mt-0.5 text-xs text-slate">
              Browse upcoming coached group sessions and book your child a place.
            </p>
          </div>
        </div>
        <Link to="/book-session" data-testid="browse-group-sessions">
          <Button type="button" variant="secondary" size="sm">
            Browse group sessions
            <ArrowRight size={14} aria-hidden />
          </Button>
        </Link>
      </GlassCard>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Form */}
        <GlassCard className="animate-fade-in-up stagger-1 p-5 sm:p-6 lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-azure/15">
              <CalendarPlus size={16} className="text-azure" aria-hidden />
            </span>
            <h2 className="text-sm font-bold text-silver">Request a session</h2>
          </div>
          <div className="mt-5">
            <RequestForm />
          </div>
        </GlassCard>

        {/* List */}
        <div className="lg:col-span-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-black text-silver">Your requests</h2>
            <span className="text-xs text-slate">newest first</span>
          </div>

          <div className="mt-4">
            {requests.isLoading ? (
              <div
                className="flex items-center gap-2 text-sm text-slate"
                data-testid="requests-loading"
              >
                <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
                Loading your requests…
              </div>
            ) : requests.isError ? (
              <p
                className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
                role="alert"
                data-testid="requests-error"
              >
                {errorMessage(requests.error, 'Could not load your session requests.')}
              </p>
            ) : sorted.length === 0 ? (
              <GlassCard className="p-6 text-center" data-testid="requests-empty">
                <CalendarPlus size={28} className="mx-auto text-azure/60" aria-hidden />
                <p className="mt-2 text-sm font-semibold text-silver">
                  No session requests yet
                </p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-slate">
                  Use the form to request your first coaching session. The club
                  will confirm a coach and time.
                </p>
                <Link
                  to="/dashboard"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-azure hover:gap-2"
                >
                  Back to dashboard
                </Link>
              </GlassCard>
            ) : (
              <ul className="flex flex-col gap-3" data-testid="requests-list">
                {sorted.map((req) => (
                  <RequestRow
                    key={req.id}
                    req={req}
                    childLabel={childLabelFor(req.junior_id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
