import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, MessageSquare } from 'lucide-react';

import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/time';
import {
  notificationLink,
  notificationText,
  useMarkNotificationsRead,
  useNotificationsSummary,
} from './notifications.queries';

// Header bell: a single attention count + a dropdown feed in two sections —
// "Messages" (unread chat previews) and "Activity" (one-off social/moderation
// events). The badge counts BOTH unread messages and unread notifications so
// the bell notifies on unopened messages for every role. Messages clear when
// the thread is opened (the chat read endpoint), not from here; "Mark all
// read" only marks the Activity notifications.
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data } = useNotificationsSummary();
  const markRead = useMarkNotificationsRead();

  const items = data?.items ?? [];
  const messages = data?.recent_messages ?? [];
  const unreadNotifications = data?.unread_notifications ?? 0;
  const unreadMessages = data?.unread_messages ?? 0;
  const badge = unreadMessages + unreadNotifications;

  function onNotificationClick(id: number, link: string) {
    markRead.mutate([id]);
    setOpen(false);
    navigate(link);
  }

  function onMessageClick() {
    // Opening the thread list is what clears message unreads (server-side, on
    // the Messages page) — the bell only navigates there.
    setOpen(false);
    navigate('/messages');
  }

  const isEmpty = items.length === 0 && messages.length === 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={badge > 0 ? `Notifications (${badge} unread)` : 'Notifications'}
        data-testid="notification-bell"
        className="relative rounded-lg p-2 text-slate transition-colors hover:bg-white/5 hover:text-silver"
      >
        <Bell size={20} />
        {badge > 0 && (
          <span
            data-testid="notification-bell-count"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-navy"
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            data-testid="notification-panel"
            className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-navy/95 shadow-xl backdrop-blur"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <p className="text-sm font-semibold text-silver">Notifications</p>
              {unreadNotifications > 0 && (
                <button
                  type="button"
                  onClick={() => markRead.mutate(undefined)}
                  data-testid="notifications-mark-all-read"
                  className="flex items-center gap-1 text-xs font-medium text-azure hover:underline"
                >
                  <CheckCheck size={14} /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {isEmpty ? (
                <p className="px-4 py-8 text-center text-sm text-slate">
                  Nothing new — you're all caught up.
                </p>
              ) : (
                <>
                  {messages.length > 0 && (
                    <section data-testid="notification-messages">
                      <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate">
                        Messages
                      </p>
                      {messages.map((m) => (
                        <button
                          key={m.message_id}
                          type="button"
                          onClick={onMessageClick}
                          data-testid={`notification-message-${m.message_id}`}
                          className="block w-full border-b border-white/5 bg-azure/5 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-white/5"
                        >
                          <span className="flex items-start gap-2">
                            <MessageSquare
                              size={16}
                              className="mt-0.5 shrink-0 text-azure"
                              aria-hidden="true"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-silver">
                                {m.sender_name}
                                <span className="font-normal text-slate"> · {m.conversation_name}</span>
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-slate">
                                {m.preview}
                              </span>
                              <span className="mt-0.5 block text-xs text-slate">
                                {relativeTime(m.created_at)}
                              </span>
                            </span>
                          </span>
                        </button>
                      ))}
                    </section>
                  )}

                  {items.length > 0 && (
                    <section data-testid="notification-activity">
                      <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate">
                        Activity
                      </p>
                      {items.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => onNotificationClick(n.id, notificationLink(n))}
                          data-testid={`notification-${n.id}`}
                          className={cn(
                            'block w-full border-b border-white/5 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-white/5',
                            !n.read && 'bg-azure/5',
                          )}
                        >
                          <span className="flex items-start gap-2">
                            {!n.read && (
                              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-azure" aria-hidden="true" />
                            )}
                            <span className="min-w-0">
                              <span className="block text-sm text-silver">{notificationText(n)}</span>
                              <span className="mt-0.5 block text-xs text-slate">
                                {relativeTime(n.created_at)}
                              </span>
                            </span>
                          </span>
                        </button>
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
