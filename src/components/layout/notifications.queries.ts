// Bell + unread-badge data (social phase). One summary endpoint feeds both:
// the bell's feed/count and the Messages nav badge. Polled every 60s — the
// agreed "counts" cadence (open threads poll faster on their own page).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';

// payload keys vary by type: first_contact {conversation_id, staff_name,
// child_name}; message_held {message_id, conversation_id, sender_name};
// message_flagged {message_id, conversation_id, flagged_by_name, reason}.
export interface AppNotification {
  id: number;
  type: string;
  payload: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export interface NotificationsSummary {
  items: AppNotification[];
  unread_notifications: number;
  unread_messages: number;
}

export function useNotificationsSummary(): UseQueryResult<NotificationsSummary> {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationsSummary>('/api/notifications'),
    refetchInterval: 60_000,
  });
}

// PUT /api/notifications/read — {ids} marks those, empty body marks all.
export function useMarkNotificationsRead(): UseMutationResult<
  { updated: number },
  Error,
  number[] | undefined
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: number[]) =>
      api.put<{ updated: number }>(
        '/api/notifications/read',
        ids && ids.length > 0 ? { ids } : {},
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// Human line for a notification row. Unknown types fall back to the raw type
// so a future backend event never renders as an empty row.
export function notificationText(n: AppNotification): string {
  const p = n.payload ?? {};
  const s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
  switch (n.type) {
    case 'first_contact':
      return `${s('staff_name') || 'A staff member'} started a chat with ${s('child_name') || 'your child'}`;
    case 'message_held':
      return `A message from ${s('sender_name') || 'a member'} was held for review`;
    case 'message_flagged':
      return `${s('flagged_by_name') || 'Someone'} flagged a message${s('reason') ? ` — “${s('reason')}”` : ''}`;
    default:
      return n.type.replace(/_/g, ' ');
  }
}

// Where clicking a notification should take the user. Moderation events are
// admin-only by construction (only admins receive them).
export function notificationLink(n: AppNotification): string {
  switch (n.type) {
    case 'message_held':
    case 'message_flagged':
      return '/moderation';
    default:
      return '/messages';
  }
}
