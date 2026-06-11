// TanStack Query hooks + local types for Admin Moderation (review queue) and
// the all-chats oversight browser. All server I/O goes through the shared api
// client (CLAUDE.md §2). Types are defined locally — this module must not
// import from src/pages/messages/ (built in parallel).
//
// Backend contract (admin-only, standard {data}/{data,count} envelope):
//   GET /api/moderation/queue            — held and/or open-flagged messages, newest first
//   PUT /api/messages/:id/hide           — hide a message (idempotent; body retained)
//   PUT /api/messages/:id/release        — held → visible (409 if not held)
//   PUT /api/flags/:id/resolve           — resolve one flag
//   GET /api/admin/conversations         — ALL club conversations, paged (?limit=&offset=)
//   GET /api/conversations/:id/messages  — full thread asc; admin sees held/hidden rows

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { Role } from '../../types/api';

// ── Local types (mirror backend serializers) ─────────────────────────────────
export type MessageStatus = 'visible' | 'held' | 'hidden';
export type FlagStatus = 'open' | 'resolved';
export type ConversationType = 'dm' | 'group';
export type RosterKind = 'players' | 'parents';

export interface MessageParticipant {
  user_id: string;
  full_name: string;
  role: Role;
}

export interface MessageFlag {
  id: number;
  message_id: number;
  flagged_by: { user_id: string; full_name: string };
  reason: string | null;
  status: FlagStatus;
  created_at: string;
}

export interface ModerationQueueItem {
  message: {
    id: number;
    conversation_id: number;
    body: string;
    status: MessageStatus;
    held_reason: string | null;
    created_at: string;
  };
  sender: MessageParticipant;
  conversation: { id: number; type: ConversationType; name: string };
  // Only OPEN flags on this message (resolved ones drop out of the queue).
  flags: MessageFlag[];
}

export interface AdminConversation {
  id: number;
  type: ConversationType;
  roster_kind: RosterKind | null;
  name: string;
  members: MessageParticipant[];
  last_message: {
    id: number;
    body: string; // preview, server-truncated to 120 chars
    sender_name: string;
    created_at: string;
  } | null;
  unread_count: number;
  oversight: boolean;
}

export interface ThreadMessage {
  id: number;
  sender: MessageParticipant;
  body: string;
  status: MessageStatus;
  created_at: string;
  own: boolean;
}

// ── Queries ──────────────────────────────────────────────────────────────────

// GET /api/moderation/queue — mounted only on the Review-queue tab; polls every
// 30s so new held/flagged messages surface without a manual refresh.
export function useModerationQueue(): UseQueryResult<ModerationQueueItem[]> {
  return useQuery({
    queryKey: ['admin', 'moderation', 'queue'],
    queryFn: () => api.get<ModerationQueueItem[]>('/api/moderation/queue'),
    refetchInterval: 30_000,
  });
}

// GET /api/admin/conversations?limit=&offset= — "load more" grows the limit
// (offset stays 0), matching the audit-log paging convention; the page treats
// a full page (rows.length === limit) as "there may be more".
export function useAdminConversations(
  limit: number,
): UseQueryResult<AdminConversation[]> {
  return useQuery({
    queryKey: ['admin', 'conversations', { limit }],
    queryFn: () =>
      api.get<AdminConversation[]>('/api/admin/conversations', {
        limit,
        offset: 0,
      }),
  });
}

// GET /api/conversations/:id/messages — read-only thread view (asc). Admin
// sees everything; held/hidden rows carry their status for badging.
export function useConversationThread(
  conversationId: number | null,
): UseQueryResult<ThreadMessage[]> {
  return useQuery({
    queryKey: ['admin', 'conversations', conversationId, 'messages'],
    queryFn: () =>
      api.get<ThreadMessage[]>(`/api/conversations/${conversationId}/messages`),
    enabled: conversationId !== null,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

// Moderating a message changes the queue, every cached thread, and the
// conversation-list previews — refetch the whole admin messaging slice.
function useInvalidateModeration(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'conversations'] }),
    ]).then(() => undefined);
}

// PUT /api/messages/:id/hide — idempotent.
export function useHideMessage(): UseMutationResult<unknown, Error, number> {
  const invalidate = useInvalidateModeration();
  return useMutation({
    mutationFn: (messageId: number) =>
      api.put<unknown>(`/api/messages/${messageId}/hide`),
    onSettled: () => invalidate(),
  });
}

// PUT /api/messages/:id/release — 409 if the message is no longer held; we
// invalidate on settle either way so a stale queue corrects itself.
export function useReleaseMessage(): UseMutationResult<unknown, Error, number> {
  const invalidate = useInvalidateModeration();
  return useMutation({
    mutationFn: (messageId: number) =>
      api.put<unknown>(`/api/messages/${messageId}/release`),
    onSettled: () => invalidate(),
  });
}

// PUT /api/flags/:id/resolve
export function useResolveFlag(): UseMutationResult<unknown, Error, number> {
  const invalidate = useInvalidateModeration();
  return useMutation({
    mutationFn: (flagId: number) =>
      api.put<unknown>(`/api/flags/${flagId}/resolve`),
    onSettled: () => invalidate(),
  });
}
