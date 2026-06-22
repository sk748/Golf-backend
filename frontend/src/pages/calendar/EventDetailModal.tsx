import { useState } from 'react';
import { Calendar, Clock, MapPin, Trash2, Users, X } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { useAuth } from '../../auth/useAuth';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { formatDateRange } from '../tournaments/tournaments.queries';
import {
  audienceLabel,
  eventTimeLabel,
  useDeleteEvent,
  useEventRsvps,
  useRsvp,
  type Event,
} from './events.queries';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// A small labelled row for the meta block.
function MetaRow({
  icon: Icon,
  children,
}: {
  icon: typeof Calendar;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-silver">
      <Icon size={16} className="mt-0.5 shrink-0 text-azure" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function EventDetailModal({
  event,
  onClose,
}: {
  event: Event;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const canManage = event.is_owner || user?.role === 'admin';
  const canSeeResponders =
    event.is_owner || user?.role === 'admin' || user?.role === 'committee';

  const [showResponders, setShowResponders] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const rsvp = useRsvp();
  const del = useDeleteEvent();
  const responders = useEventRsvps(event.id, showResponders && canSeeResponders);

  const cancelled = event.status === 'cancelled';

  function onRsvp(status: 'going' | 'not_going') {
    rsvp.mutate({ id: event.id, status });
  }

  function onDelete() {
    del.mutate(event.id, { onSuccess: () => onClose() });
  }

  return (
    <>
      {/* Transparent click-catcher — never dims the background (house rule). */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
        className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/10 bg-navy/95 p-5 shadow-2xl backdrop-blur"
        data-testid="event-detail-modal"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className={cn(
                  'text-lg font-black text-silver',
                  cancelled && 'line-through',
                )}
              >
                {event.title}
              </h2>
              {event.mandatory && (
                <Badge tone="gold" shape="pill">
                  Mandatory
                </Badge>
              )}
              {cancelled && (
                <Badge tone="red" shape="pill">
                  Cancelled
                </Badge>
              )}
            </div>
            {event.owner_name && (
              <p className="mt-0.5 text-xs text-slate">By {event.owner_name}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate hover:bg-white/5 hover:text-silver"
          >
            <X size={18} />
          </button>
        </div>

        {/* Meta */}
        <div className="space-y-2.5">
          <MetaRow icon={Calendar}>{formatDateRange(event.date, null)}</MetaRow>
          <MetaRow icon={Clock}>{eventTimeLabel(event)}</MetaRow>
          {event.location && <MetaRow icon={MapPin}>{event.location}</MetaRow>}
          <MetaRow icon={Users}>{audienceLabel(event)}</MetaRow>
        </div>

        {event.description && (
          <p className="mt-4 whitespace-pre-line text-sm text-silver/90">
            {event.description}
          </p>
        )}

        {/* RSVP */}
        {!cancelled && (
          <div className="mt-5 rounded-xl border border-white/10 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-silver">
                {event.rsvp_required ? 'Are you coming?' : 'RSVP'}
              </p>
              <span className="text-xs text-slate" data-testid="event-going-count">
                {event.going_count} going
              </span>
            </div>
            <div className="mt-2.5 flex gap-2">
              <Button
                size="sm"
                variant={event.my_rsvp === 'going' ? 'primary' : 'ghost'}
                onClick={() => onRsvp('going')}
                disabled={rsvp.isPending}
                data-testid="event-rsvp-going"
              >
                Going
              </Button>
              <Button
                size="sm"
                variant={event.my_rsvp === 'not_going' ? 'danger' : 'ghost'}
                onClick={() => onRsvp('not_going')}
                disabled={rsvp.isPending}
                data-testid="event-rsvp-not-going"
              >
                Not going
              </Button>
            </div>
            {rsvp.isError && (
              <p className="mt-2 text-xs text-red-400" role="alert">
                {errorMessage(rsvp.error, 'Could not save your RSVP.')}
              </p>
            )}
          </div>
        )}

        {/* Who's coming (owner / admin / committee) */}
        {canSeeResponders && (
          <div className="mt-4">
            {!showResponders ? (
              <button
                type="button"
                onClick={() => setShowResponders(true)}
                className="text-sm font-semibold text-azure hover:underline"
                data-testid="event-show-responders"
              >
                Who's coming?
              </button>
            ) : (
              <div data-testid="event-responders">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate">
                  Responses
                </p>
                {responders.isLoading ? (
                  <p className="text-xs text-slate">Loading responses…</p>
                ) : responders.isError ? (
                  <p className="text-xs text-red-400" role="alert">
                    {errorMessage(responders.error, 'Could not load responses.')}
                  </p>
                ) : (responders.data ?? []).length === 0 ? (
                  <p className="text-xs text-slate">No responses yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {(responders.data ?? []).map((r) => (
                      <li
                        key={r.user_id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="min-w-0 truncate text-silver">
                          {r.name}{' '}
                          <span className="text-xs text-slate">({r.role})</span>
                        </span>
                        <Badge
                          tone={r.status === 'going' ? 'emerald' : 'slate'}
                          shape="pill"
                        >
                          {r.status === 'going' ? 'Going' : 'Not going'}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* Manage (owner / admin) */}
        {canManage && (
          <div className="mt-5 border-t border-white/10 pt-4">
            {!confirmingDelete ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingDelete(true)}
                data-testid="event-delete"
              >
                <Trash2 size={16} /> Delete event
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-silver">Delete this event?</span>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={onDelete}
                  disabled={del.isPending}
                  data-testid="event-delete-confirm"
                >
                  {del.isPending ? 'Deleting…' : 'Yes, delete'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
            {del.isError && (
              <p className="mt-2 text-xs text-red-400" role="alert">
                {errorMessage(del.error, 'Could not delete the event.')}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
