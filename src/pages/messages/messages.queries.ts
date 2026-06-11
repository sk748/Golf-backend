// TanStack Query hooks + display helpers for club MESSAGING. One page serves
// all five roles: DMs (who-may-message-whom is server-enforced via
// /api/messaging/contacts), staff-created groups, automatic roster groups
// ("Kofi Coach — Players"), and parent OVERSIGHT (a parent sees their child's
// conversations read-only; the backend marks them oversight:true).
//
// Messages are immutable — there is deliberately no edit/delete here. A
// message may come back status 'held' (visible only to its sender and admin)
// until the club reviews it. Polling: the open thread refetches every 10s,
// the conversation list every 30s; mutations invalidate.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { Role } from '../../types/api';

// ── Types (standard {data}/{data,count} envelope — the client unwraps) ───────

export interface ConversationMember {
  user_id: string;
  full_name: string;
  role: Role;
}

export interface LastMessage {
  id: number;
  body: string;
  sender_name: string;
  created_at: string;
}

// GET /api/conversations item, sorted by last activity server-side. For
// parents, oversight:true rows are their child's conversations (read-only).
export interface Conversation {
  id: number;
  type: 'dm' | 'group';
  roster_kind: 'players' | 'parents' | null;
  name: string | null;
  members: ConversationMember[];
  last_message: LastMessage | null;
  unread_count: number;
  oversight: boolean;
}

export type MessageStatus = 'visible' | 'held' | 'hidden';

// GET /api/conversations/:id/messages item (ascending by created_at).
export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender: ConversationMember;
  body: string;
  status: MessageStatus;
  created_at: string;
  own: boolean;
}

// GET /api/messaging/contacts — exactly who the current user may DM (the
// matrix is server-enforced). ALL people-picking uses this; never /api/users.
export interface Contact {
  user_id: string;
  full_name: string;
  role: Role;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

// The conversation list. Polls every 30s so unread counts and new threads
// arrive without a manual refresh.
export function useConversations(): UseQueryResult<Conversation[]> {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<Conversation[]>('/api/conversations'),
    refetchInterval: 30_000,
  });
}

export function useContacts(): UseQueryResult<Contact[]> {
  return useQuery({
    queryKey: ['messaging', 'contacts'],
    queryFn: () => api.get<Contact[]>('/api/messaging/contacts'),
    staleTime: 5 * 60 * 1000,
  });
}

// One thread's messages, ascending. Polls every 10s while the thread is open.
export function useMessages(
  conversationId?: number,
): UseQueryResult<ChatMessage[]> {
  return useQuery({
    queryKey: ['conversations', conversationId, 'messages'],
    queryFn: () =>
      api.get<ChatMessage[]>(`/api/conversations/${conversationId}/messages`),
    enabled: Boolean(conversationId),
    refetchInterval: 10_000,
  });
}

// ── Writes ────────────────────────────────────────────────────────────────────

// POST /api/conversations {type:'dm', user_id} — returns the existing DM with
// that person or creates a new one (the backend dedupes).
export function useStartDm(): UseMutationResult<
  Conversation,
  Error,
  { user_id: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ user_id }) =>
      api.post<Conversation>('/api/conversations', { type: 'dm', user_id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'], exact: true });
    },
  });
}

// POST /api/conversations {type:'group', name, member_ids} — admin/coach only
// (the page only offers it to those roles; the backend enforces it too).
export function useCreateGroup(): UseMutationResult<
  Conversation,
  Error,
  { name: string; member_ids: string[] }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, member_ids }) =>
      api.post<Conversation>('/api/conversations', {
        type: 'group',
        name,
        member_ids,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'], exact: true });
    },
  });
}

// POST /api/conversations/:id/messages {body} (≤2000 chars). The created
// message may come back status:'held' — the thread renders the quiet
// held-for-review note on the sender's own bubble.
export function useSendMessage(): UseMutationResult<
  ChatMessage,
  Error,
  { conversationId: number; body: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, body }) =>
      api.post<ChatMessage>(`/api/conversations/${conversationId}/messages`, {
        body,
      }),
    onSuccess: (_msg, { conversationId }) => {
      void qc.invalidateQueries({
        queryKey: ['conversations', conversationId, 'messages'],
      });
      // Last-message preview + ordering in the list.
      void qc.invalidateQueries({ queryKey: ['conversations'], exact: true });
    },
  });
}

// PUT /api/conversations/:id/read — called when a thread is opened and after
// new messages render. Exact-invalidates the LIST only (unread counts); the
// open thread's messages are untouched, so marking read never causes a
// refetch loop.
export function useMarkRead(): UseMutationResult<unknown, Error, number> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: number) =>
      api.put<unknown>(`/api/conversations/${conversationId}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['conversations'], exact: true });
    },
  });
}

// POST /api/messages/:id/flag {reason?} — report a message to the club.
// Available on every message, including for oversight-viewing parents.
export function useFlagMessage(): UseMutationResult<
  unknown,
  Error,
  { messageId: number; reason?: string }
> {
  return useMutation({
    mutationFn: ({ messageId, reason }) =>
      api.post<unknown>(
        `/api/messages/${messageId}/flag`,
        reason?.trim() ? { reason: reason.trim() } : undefined,
      ),
  });
}

// ── Display helpers (presentation only) ──────────────────────────────────────

export const MAX_MESSAGE_LENGTH = 2000;

// The persistent thread disclaimer (locked wording direction: one quiet line,
// kid-simple, visible but not loud).
export const CHAT_DISCLAIMER =
  'Chats can be seen by parents and club admins. Be kind — misuse can lead to disciplinary action.';

// For a DM, the person who isn't the signed-in user.
export function dmPartner(
  conv: Conversation,
  currentUserId: string | undefined,
): ConversationMember | undefined {
  return (
    conv.members.find((m) => m.user_id !== currentUserId) ?? conv.members[0]
  );
}

// List/thread title: groups use their name; DMs use the other person's name.
// For an oversight DM the "other person" is computed against the CHILD, not
// the parent, so prefer the non-player member there.
export function conversationTitle(
  conv: Conversation,
  currentUserId: string | undefined,
): string {
  if (conv.type === 'group') return conv.name?.trim() || 'Group chat';
  if (conv.oversight) {
    const staff = conv.members.find((m) => m.role !== 'player');
    if (staff) return staff.full_name;
  }
  return dmPartner(conv, currentUserId)?.full_name ?? 'Conversation';
}

// The child whose conversation a parent is overseeing — the player member.
export function oversightChildName(conv: Conversation): string {
  return (
    conv.members.find((m) => m.role === 'player')?.full_name ?? 'your child'
  );
}

// Contact-picker grouping. Coach first — for a junior that's who they want.
export const CONTACT_ROLE_ORDER: Role[] = [
  'coach',
  'admin',
  'committee',
  'parent',
  'player',
];

export const CONTACT_GROUP_LABELS: Record<Role, string> = {
  coach: 'Coaches',
  admin: 'Club admins',
  committee: 'Committee',
  parent: 'Parents',
  player: 'Players',
};

export function groupContactsByRole(
  contacts: Contact[],
): { role: Role; label: string; contacts: Contact[] }[] {
  return CONTACT_ROLE_ORDER.map((role) => ({
    role,
    label: CONTACT_GROUP_LABELS[role],
    contacts: contacts.filter((c) => c.role === role),
  })).filter((g) => g.contacts.length > 0);
}

// ── Time labels ───────────────────────────────────────────────────────────────

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Conversation-list timestamp: time today, weekday this week, short date else.
export function listTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (sameDay(d, now)) {
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 6);
  if (d >= weekAgo) {
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// In-thread bubble timestamp.
export function messageTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Day-separator label between messages from different days.
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (sameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// True when two messages fall on different calendar days (drives separators).
export function isNewDay(prevIso: string | undefined, iso: string): boolean {
  if (!prevIso) return true;
  const a = new Date(prevIso);
  const b = new Date(iso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return !sameDay(a, b);
}
