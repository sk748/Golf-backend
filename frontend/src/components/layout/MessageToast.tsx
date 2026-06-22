import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, X } from 'lucide-react';

import { relativeTime } from '../../lib/time';
import {
  useNotificationsSummary,
  type RecentMessage,
} from './notifications.queries';

// Transient top-right banners for NEW incoming messages. We piggy-back on the
// existing notifications poll (60s) — NO second poller — so toast latency is
// bounded by that cadence (a message can take up to ~60s to surface). New-ness
// is detected by diffing recent_messages' message_ids against a "seen" set:
// the set is seeded from the FIRST successful poll WITHOUT toasting (so we
// don't blast a toast for every already-unread message on page load); only ids
// that appear in a LATER poll are toasted.

const AUTO_DISMISS_MS = 6_000;
const MAX_TOASTS = 3;

export function MessageToast() {
  const navigate = useNavigate();
  const { data } = useNotificationsSummary();

  // Ids we've already accounted for (seeded on first poll, then grown).
  const seenIds = useRef<Set<number>>(new Set());
  const seeded = useRef(false);
  const [toasts, setToasts] = useState<RecentMessage[]>([]);

  const recent = data?.recent_messages;

  useEffect(() => {
    if (!recent) return;

    // First poll: seed the seen-set silently, no toasts.
    if (!seeded.current) {
      for (const m of recent) seenIds.current.add(m.message_id);
      seeded.current = true;
      return;
    }

    const fresh = recent.filter((m) => !seenIds.current.has(m.message_id));
    if (fresh.length === 0) return;

    for (const m of fresh) seenIds.current.add(m.message_id);

    // Newest on top; cap the visible stack.
    setToasts((prev) => [...fresh.reverse(), ...prev].slice(0, MAX_TOASTS));
  }, [recent]);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.message_id !== id));
  }

  function open(id: number) {
    dismiss(id);
    navigate('/messages');
  }

  if (toasts.length === 0) return null;

  return createPortal(
    // Sits below the sticky header (h ~ py-3 + content ≈ 3.5rem). Pointer
    // events only on the cards so the gap doesn't trap clicks.
    <div className="pointer-events-none fixed right-4 top-[4.25rem] z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((m) => (
        <MessageToastCard
          key={m.message_id}
          message={m}
          onOpen={() => open(m.message_id)}
          onDismiss={() => dismiss(m.message_id)}
        />
      ))}
    </div>,
    document.body,
  );
}

function MessageToastCard({
  message,
  onOpen,
  onDismiss,
}: {
  message: RecentMessage;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      data-testid={`message-toast-${message.message_id}`}
      className="pointer-events-auto rounded-2xl border border-azure/20 bg-navy/95 shadow-xl backdrop-blur"
    >
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-azure/15">
            <MessageSquare size={15} className="text-azure" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-silver">
              {message.sender_name}
              <span className="font-normal text-slate"> · {message.conversation_name}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-slate">{message.preview}</span>
            <span className="mt-0.5 block text-xs text-slate">
              {relativeTime(message.created_at)}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          data-testid={`message-toast-dismiss-${message.message_id}`}
          className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate transition-colors hover:bg-white/5 hover:text-silver"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
