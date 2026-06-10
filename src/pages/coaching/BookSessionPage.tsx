// Group sessions — FAMILY side (route /book-session, parent + player; guarded
// in App.tsx). Browse the upcoming published sessions and book a place: a
// player books themselves (session_id only — the backend resolves their
// junior); a parent picks which child first. Eligibility, capacity and
// duplicates are enforced server-side; INELIGIBLE/CONFLICT messages surface
// inline on the card that caused them.
//
// PRIVACY: this page must only fetch family-scoped data — /api/sessions (the
// backend forces published-only for these roles), /api/booking-requests (own
// rows only) and, for parents only, their own children. No club-wide lookups.

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Loader2,
  PartyPopper,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { useAuth } from '../../auth/useAuth';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { childName, useMyChildren } from '../parent/parent-children.queries';
import { parseISODate, sessionTimeLabel } from '../coach/coach-dates';
import {
  bookingStatusLabel,
  bookingStatusTone,
  eligibilityLabel,
  isSessionFull,
  occupancyLabel,
  sessionTypeLabel,
  useBookableSessions,
  useBookSession,
  useCancelBooking,
  useMyBookings,
  type BookingRow,
  type GroupSession,
} from './group-sessions.queries';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function prettyDate(iso: string | null): string {
  if (!iso) return 'Date to confirm';
  const d = parseISODate(iso.slice(0, 10));
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function sessionDisplayTitle(s: GroupSession | undefined): string {
  if (!s) return 'Coaching session';
  return s.title?.trim() || sessionTypeLabel(s.session_type);
}

// ── Parent-only child picker (mount-gated — players never fetch children) ─────

function ChildPicker({
  value,
  onChange,
}: {
  value: number | '';
  onChange: (v: number | '') => void;
}) {
  const children = useMyChildren();
  const kids = useMemo(() => children.data ?? [], [children.data]);

  // Default to the only child when there is exactly one.
  useEffect(() => {
    if (value === '' && kids.length === 1) onChange(kids[0].id);
  }, [kids, value, onChange]);

  if (children.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate">
        <Loader2 size={16} className="animate-spin text-azure" aria-hidden />
        Loading…
      </div>
    );
  }
  if (children.isError) {
    return (
      <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400" role="alert">
        {errorMessage(children.error, 'Could not load your children.')}
      </p>
    );
  }
  if (kids.length === 0) {
    return (
      <p className="text-sm text-slate" data-testid="book-no-children">
        Once your child is linked to your account, you can book sessions for
        them here.
      </p>
    );
  }
  if (kids.length === 1) {
    return (
      <p className="text-sm font-semibold text-silver" data-testid="book-single-child">
        Booking for {childName(kids[0])}
      </p>
    );
  }

  return (
    <div>
      <label
        htmlFor="book-child"
        className="text-xs font-bold uppercase tracking-wider text-slate"
      >
        Who are you booking for?
      </label>
      <select
        id="book-child"
        value={value}
        onChange={(e) =>
          onChange(e.target.value === '' ? '' : Number(e.target.value))
        }
        className="mt-1.5 w-full rounded-xl border border-white/15 bg-navy/60 px-3 py-3 text-sm font-semibold text-silver focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        data-testid="book-child-select"
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
  );
}

// ── One bookable session card ─────────────────────────────────────────────────

function BookableCard({
  session,
  isParent,
  juniorId,
  requestedStatus,
}: {
  session: GroupSession;
  isParent: boolean;
  juniorId: number | '';
  // status of an existing pending/approved booking onto this session, if any
  requestedStatus: string | null;
}) {
  const book = useBookSession();
  const full = isSessionFull(session);
  const time = sessionTimeLabel(session);
  const eligibility = eligibilityLabel(session);
  const needsChild = isParent && juniorId === '';

  function handleBook() {
    book.mutate(
      isParent
        ? { session_id: session.id, junior_id: juniorId as number }
        : { session_id: session.id },
    );
  }

  return (
    <GlassCard className="flex h-full flex-col p-5" data-testid={`bookable-session-${session.id}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-black text-silver">
          {sessionDisplayTitle(session)}
        </p>
        <Badge tone="azure" shape="pill" className="shrink-0">
          {sessionTypeLabel(session.session_type)}
        </Badge>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate">
        <span className="inline-flex items-center gap-1.5">
          <Clock size={14} aria-hidden />
          {prettyDate(session.date)}
          {time ? ` · ${time}` : ''}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users size={14} aria-hidden />
          {occupancyLabel(session)}
        </span>
      </p>

      {eligibility ? (
        <p className="mt-2 text-xs font-semibold text-slate">{eligibility}</p>
      ) : null}
      {session.requirements ? (
        <p className="mt-2 text-xs text-slate">{session.requirements}</p>
      ) : null}

      <div className="mt-auto pt-4">
        {requestedStatus === 'approved' ? (
          <p
            className="flex items-center gap-2 rounded-xl bg-emerald-500/15 p-3 text-sm font-semibold text-emerald-400"
            data-testid={`booked-${session.id}`}
          >
            <PartyPopper size={16} aria-hidden />
            You&apos;re in — see you there!
          </p>
        ) : requestedStatus === 'pending' ? (
          <p
            className="flex items-center gap-2 rounded-xl bg-gold/10 p-3 text-sm font-semibold text-gold"
            data-testid={`requested-${session.id}`}
          >
            <CheckCircle2 size={16} aria-hidden />
            Requested — waiting for the coach to confirm.
          </p>
        ) : (
          <>
            <Button
              type="button"
              fullWidth
              disabled={full || needsChild || book.isPending}
              onClick={handleBook}
              data-testid={`book-session-${session.id}`}
            >
              {book.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  Booking…
                </>
              ) : full ? (
                'Session full'
              ) : (
                <>
                  <CalendarCheck size={16} aria-hidden />
                  Book a place
                </>
              )}
            </Button>
            {needsChild && !full ? (
              <p className="mt-2 text-center text-xs text-slate">
                Choose a child above first.
              </p>
            ) : null}
            {book.isError ? (
              <p
                className="mt-2 rounded-xl bg-red-500/15 p-2.5 text-xs text-red-400"
                role="alert"
                data-testid={`book-error-${session.id}`}
              >
                {errorMessage(book.error, 'Could not book this session.')}
              </p>
            ) : null}
          </>
        )}
      </div>
    </GlassCard>
  );
}

// ── My bookings row ───────────────────────────────────────────────────────────

function MyBookingRow({
  booking,
  session,
}: {
  booking: BookingRow;
  session: GroupSession | undefined;
}) {
  const cancel = useCancelBooking();
  const pending = String(booking.status).toLowerCase() === 'pending';

  return (
    <li
      className="glass-light flex flex-wrap items-center justify-between gap-3 rounded-xl p-3"
      data-testid={`my-booking-${booking.id}`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-silver">
          {booking.session_id ? sessionDisplayTitle(session) : 'Coaching session'}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate">
          <Clock size={12} aria-hidden />
          {prettyDate(booking.preferred_date)}
          {booking.preferred_time
            ? ` · ${booking.preferred_time.slice(0, 5)}`
            : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={bookingStatusTone(booking.status)} shape="pill">
          {bookingStatusLabel(booking.status)}
        </Badge>
        {pending ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(booking.id)}
            data-testid={`cancel-booking-${booking.id}`}
          >
            {cancel.isPending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Trash2 size={14} aria-hidden />
            )}
            Cancel
          </Button>
        ) : null}
      </div>
      {cancel.isError ? (
        <p className="w-full text-xs text-red-400" role="alert">
          {errorMessage(cancel.error, 'Could not cancel this booking.')}
        </p>
      ) : null}
    </li>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function BookSessionPage() {
  const { user } = useAuth();
  const isParent = user?.role === 'parent';

  const sessions = useBookableSessions();
  const bookings = useMyBookings();
  const [juniorId, setJuniorId] = useState<number | ''>('');

  const sessionsById = useMemo(
    () => new Map((sessions.data ?? []).map((s) => [s.id, s])),
    [sessions.data],
  );

  // Existing pending/approved booking per session, so a card can show
  // "Requested" / "You're in" instead of the book button. Parents: only the
  // currently SELECTED child's bookings block a card — with no child picked
  // yet we show the book button (child A's booking must not hide the button
  // the parent needs for child B).
  const requestedStatusFor = (sessionId: number): string | null => {
    if (isParent && juniorId === '') return null;
    const match = (bookings.data ?? []).find((b) => {
      if (b.session_id !== sessionId) return false;
      const v = String(b.status).toLowerCase();
      if (v !== 'pending' && v !== 'approved') return false;
      return !isParent || b.junior_id === juniorId;
    });
    return match ? String(match.status).toLowerCase() : null;
  };

  const upcoming = sessions.data ?? [];
  const sortedBookings = useMemo(
    () =>
      [...(bookings.data ?? [])].sort((a, b) =>
        (b.preferred_date ?? '').localeCompare(a.preferred_date ?? ''),
      ),
    [bookings.data],
  );

  return (
    <div className="animate-fade-in-up mx-auto max-w-4xl" data-testid="book-session-page">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">
        Coaching
      </p>
      <h1 className="mt-1 text-2xl font-black text-silver sm:text-3xl">
        Group sessions
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        {isParent
          ? 'Browse upcoming coached sessions and book a place for your child. The coach confirms every booking.'
          : 'Browse upcoming coached sessions and grab a place. Your coach confirms your spot — keep practising!'}
      </p>

      {isParent ? (
        <GlassCard className="animate-fade-in-up stagger-1 mt-6 p-4 sm:p-5">
          <ChildPicker value={juniorId} onChange={setJuniorId} />
        </GlassCard>
      ) : null}

      {/* ── Bookable sessions ───────────────────────────────────────────── */}
      <div className="mt-8 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-black text-silver">Open for booking</h2>
        <span className="text-xs text-slate">soonest first</span>
      </div>

      <div className="mt-4">
        {sessions.isLoading ? (
          <div
            className="flex items-center gap-2 text-sm text-slate"
            data-testid="bookable-loading"
          >
            <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
            Looking for sessions…
          </div>
        ) : sessions.isError ? (
          <p
            className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            role="alert"
            data-testid="bookable-error"
          >
            {errorMessage(sessions.error, 'Could not load the sessions.')}
          </p>
        ) : upcoming.length === 0 ? (
          <GlassCard className="p-8 text-center" data-testid="bookable-empty">
            <Sparkles size={28} className="mx-auto text-azure/60" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-silver">
              No sessions open right now
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate">
              When a coach opens a group session for booking it will appear
              here — check back soon.
            </p>
          </GlassCard>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2" data-testid="bookable-list">
            {upcoming.map((s) => (
              <li key={s.id}>
                <BookableCard
                  session={s}
                  isParent={isParent}
                  juniorId={juniorId}
                  requestedStatus={requestedStatusFor(s.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── My bookings ─────────────────────────────────────────────────── */}
      <div className="mt-10 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-black text-silver">
          {isParent ? 'Your bookings' : 'My bookings'}
        </h2>
        <span className="text-xs text-slate">newest first</span>
      </div>

      <div className="mt-4">
        {bookings.isLoading ? (
          <div
            className="flex items-center gap-2 text-sm text-slate"
            data-testid="my-bookings-loading"
          >
            <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
            Loading your bookings…
          </div>
        ) : bookings.isError ? (
          <p
            className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            role="alert"
            data-testid="my-bookings-error"
          >
            {errorMessage(bookings.error, 'Could not load your bookings.')}
          </p>
        ) : sortedBookings.length === 0 ? (
          <GlassCard className="p-6 text-center" data-testid="my-bookings-empty">
            <CalendarCheck size={28} className="mx-auto text-azure/60" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-silver">
              No bookings yet
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate">
              Book onto a session above and it will show up here with its
              status.
            </p>
          </GlassCard>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="my-bookings-list">
            {sortedBookings.map((b) => (
              <MyBookingRow
                key={b.id}
                booking={b}
                session={
                  b.session_id ? sessionsById.get(b.session_id) : undefined
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
