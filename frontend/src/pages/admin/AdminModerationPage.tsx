// Admin Moderation — two tabs:
//   1. Review queue: every held and/or open-flagged message, with Release /
//      Hide / Resolve-flag actions. Messages are immutable — moderation only
//      changes visibility, never the body.
//   2. All conversations: paged oversight browser over every club chat, with a
//      read-only thread panel (held/hidden rows clearly badged).
// Admin-only page; route guarded by RequireRole in App.tsx (wired by the
// orchestrator). All data via admin-moderation.queries.ts.

import { useState } from 'react';
import {
  AlertCircle,
  Eye,
  EyeOff,
  Flag,
  Loader2,
  MessagesSquare,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/time';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, RoleBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import {
  useAdminConversations,
  useConversationThread,
  useHideMessage,
  useModerationQueue,
  useReleaseMessage,
  useResolveFlag,
  type AdminConversation,
  type MessageStatus,
  type ModerationQueueItem,
} from './admin-moderation.queries';

const PAGE = 50;

type Tab = 'queue' | 'conversations';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

// Held = caught by the blocked-word filter (gold, pending review).
// Hidden = moderated away by an admin (red; original stays readable to admin).
function StatusBadge({ status }: { status: MessageStatus }) {
  if (status === 'held') {
    return (
      <Badge tone="gold" shape="pill" data-testid="status-badge-held">
        Held
      </Badge>
    );
  }
  if (status === 'hidden') {
    return (
      <Badge tone="red" shape="pill" data-testid="status-badge-hidden">
        Hidden
      </Badge>
    );
  }
  return null;
}

export function AdminModerationPage() {
  const [tab, setTab] = useState<Tab>('queue');

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <ShieldAlert size={18} className="text-azure" aria-hidden="true" />
        <h1 className="text-2xl font-black text-silver">Moderation</h1>
      </div>
      <p className="mt-1 text-sm text-slate">
        Review held and flagged messages, and oversee every club conversation.
        Messages are never edited or deleted — only hidden or released.
      </p>

      {/* Tabs */}
      <div role="tablist" aria-label="Moderation sections" className="mt-5 flex flex-wrap gap-2">
        {(
          [
            { id: 'queue', label: 'Review queue', icon: ShieldAlert },
            { id: 'conversations', label: 'All conversations', icon: MessagesSquare },
          ] as const
        ).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              data-testid={`moderation-tab-${t.id}`}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50',
                active ? 'bg-azure text-white' : 'glass text-slate hover:text-silver',
              )}
            >
              <t.icon size={14} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {tab === 'queue' ? <ReviewQueueTab /> : <ConversationsTab />}
      </div>
    </div>
  );
}

// ── Tab 1 — Review queue ─────────────────────────────────────────────────────
function ReviewQueueTab() {
  const { data, isLoading, isError, error } = useModerationQueue();
  const items = data ?? [];

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center gap-3 py-16 text-slate"
        data-testid="queue-loading"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span>Loading the review queue…</span>
      </div>
    );
  }
  if (isError) {
    return (
      <GlassCard
        className="border border-red-500/30 bg-red-500/10 p-5"
        role="alert"
        data-testid="queue-error"
      >
        <div className="flex items-center gap-3 text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold">
            {errorMessage(error, 'Could not load the review queue. Please try again.')}
          </span>
        </div>
      </GlassCard>
    );
  }
  if (items.length === 0) {
    return (
      <GlassCard className="p-10 text-center" data-testid="queue-empty">
        <ShieldCheck className="mx-auto h-8 w-8 text-emerald-400" aria-hidden="true" />
        <p className="mt-3 text-lg font-bold text-silver">All clear</p>
        <p className="mt-1 text-sm text-slate">
          Nothing needs review right now. Held and flagged messages will appear
          here automatically — this list refreshes every 30 seconds.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-3" data-testid="queue-list">
      {items.map((item) => (
        <QueueCard key={item.message.id} item={item} />
      ))}
    </div>
  );
}

function QueueCard({ item }: { item: ModerationQueueItem }) {
  const { message, sender, conversation, flags } = item;
  const hide = useHideMessage();
  const release = useReleaseMessage();
  const resolve = useResolveFlag();
  const actionError = hide.error ?? release.error ?? resolve.error;

  return (
    <GlassCard className="p-5" data-testid={`queue-item-${message.id}`}>
      {/* Who said it, where */}
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={sender.full_name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-silver">{sender.full_name}</span>
            <RoleBadge role={sender.role} />
            <StatusBadge status={message.status} />
          </div>
          <p className="mt-0.5 truncate text-xs text-slate">
            in {conversation.name} · {relativeTime(message.created_at)}
          </p>
        </div>
      </div>

      {/* The message itself (immutable; shown verbatim to the admin) */}
      <div className="glass-light mt-3 rounded-xl p-3">
        <p className="text-sm whitespace-pre-wrap text-silver">{message.body}</p>
      </div>

      {/* Why it's here */}
      <div className="mt-3 space-y-2">
        {message.status === 'held' && (
          <p
            className="flex items-center gap-2 rounded-xl bg-gold/10 px-3 py-2 text-xs font-semibold text-gold"
            data-testid={`held-reason-${message.id}`}
          >
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {message.held_reason ?? 'Held automatically'}
          </p>
        )}
        {flags.map((flag) => (
          <div
            key={flag.id}
            className="flex flex-wrap items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2"
            data-testid={`flag-${flag.id}`}
          >
            <Flag className="h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-xs text-red-400">
              <span className="font-semibold">Flagged by {flag.flagged_by.full_name}</span>
              {flag.reason ? ` — ${flag.reason}` : ''}
              <span className="text-red-400/70"> · {relativeTime(flag.created_at)}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="px-3 py-1.5 text-xs"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate(flag.id)}
              data-testid={`resolve-flag-${flag.id}`}
            >
              {resolve.isPending && (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              )}
              Resolve flag
            </Button>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {message.status === 'held' && (
          <Button
            variant="primary"
            size="sm"
            disabled={release.isPending || hide.isPending}
            onClick={() => release.mutate(message.id)}
            data-testid={`release-message-${message.id}`}
          >
            {release.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
            Release
          </Button>
        )}
        {message.status !== 'hidden' && (
          <Button
            variant="danger"
            size="sm"
            disabled={hide.isPending || release.isPending}
            onClick={() => hide.mutate(message.id)}
            data-testid={`hide-message-${message.id}`}
          >
            {hide.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            )}
            Hide
          </Button>
        )}
      </div>

      {actionError && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {actionError instanceof ApiError && actionError.status === 409
            ? 'This message is no longer held — the queue has been refreshed.'
            : errorMessage(actionError, 'Action failed. Please try again.')}
        </p>
      )}
    </GlassCard>
  );
}

// ── Tab 2 — All conversations ────────────────────────────────────────────────
function ConversationsTab() {
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<AdminConversation | null>(null);

  const { data, isLoading, isError, error } = useAdminConversations(limit);
  const conversations = data ?? [];
  const canLoadMore = conversations.length === limit;

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center gap-3 py-16 text-slate"
        data-testid="conversations-loading"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        <span>Loading conversations…</span>
      </div>
    );
  }
  if (isError) {
    return (
      <GlassCard
        className="border border-red-500/30 bg-red-500/10 p-5"
        role="alert"
        data-testid="conversations-error"
      >
        <div className="flex items-center gap-3 text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold">
            {errorMessage(error, 'Could not load conversations. Please try again.')}
          </span>
        </div>
      </GlassCard>
    );
  }
  if (conversations.length === 0) {
    return (
      <GlassCard className="p-10 text-center" data-testid="conversations-empty">
        <MessagesSquare className="mx-auto h-8 w-8 text-slate" aria-hidden="true" />
        <p className="mt-3 text-lg font-bold text-silver">No conversations yet</p>
        <p className="mt-1 text-sm text-slate">
          Every club chat — coach rosters, group chats, and direct messages —
          will be listed here as soon as one exists.
        </p>
      </GlassCard>
    );
  }

  return (
    <div
      className={cn(
        'grid gap-4',
        selected && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
      )}
    >
      {/* List — on small screens the thread panel takes over when open */}
      <div className={cn(selected && 'hidden lg:block')}>
        <GlassCard className="overflow-hidden">
          <ul className="divide-y divide-white/5" data-testid="conversations-list">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <ConversationRow
                  conv={conv}
                  active={selected?.id === conv.id}
                  onSelect={() => setSelected(conv)}
                />
              </li>
            ))}
          </ul>
        </GlassCard>
        {canLoadMore && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLimit((l) => l + PAGE)}
              data-testid="conversations-load-more"
            >
              Load more
            </Button>
          </div>
        )}
      </div>

      {selected && (
        <ThreadPanel conv={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function ConversationRow({
  conv,
  active,
  onSelect,
}: {
  conv: AdminConversation;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={`conversation-row-${conv.id}`}
      className={cn(
        'w-full px-5 py-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-azure/50',
        active ? 'bg-azure/10' : 'hover:bg-white/[0.03]',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold text-silver">
          {conv.name}
        </span>
        <Badge tone={conv.type === 'group' ? 'azure' : 'slate'} shape="pill">
          {conv.type === 'group' ? 'Group' : 'DM'}
        </Badge>
        {conv.roster_kind && (
          <Badge tone="gold" shape="pill">
            {conv.roster_kind} roster
          </Badge>
        )}
      </div>
      <div className="mt-1 flex items-center gap-3 text-xs text-slate">
        <span className="inline-flex shrink-0 items-center gap-1">
          <Users className="h-3 w-3" aria-hidden="true" />
          {conv.members.length} member{conv.members.length === 1 ? '' : 's'}
        </span>
        {conv.last_message ? (
          <>
            <span className="min-w-0 truncate">
              {conv.last_message.sender_name}: {conv.last_message.body}
            </span>
            <span className="shrink-0">
              {relativeTime(conv.last_message.created_at)}
            </span>
          </>
        ) : (
          <span className="italic">No messages yet</span>
        )}
      </div>
    </button>
  );
}

// Read-only oversight view of one thread. Admin reads everything; held and
// hidden rows are badged so it's obvious what other members can't see.
function ThreadPanel({
  conv,
  onClose,
}: {
  conv: AdminConversation;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useConversationThread(conv.id);
  const messages = data ?? [];

  return (
    <GlassCard className="flex max-h-[34rem] flex-col self-start" data-testid="thread-panel">
      <div className="flex items-start gap-3 border-b border-white/10 p-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-silver">{conv.name}</h2>
          <p className="mt-0.5 truncate text-xs text-slate">
            Read-only oversight · {conv.members.map((m) => m.full_name).join(', ')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close conversation"
          data-testid="thread-close"
          className="rounded-lg p-1.5 text-slate transition-colors hover:bg-white/5 hover:text-silver focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div
            className="flex items-center justify-center gap-3 py-10 text-slate"
            data-testid="thread-loading"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>Loading messages…</span>
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-400"
            data-testid="thread-error"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {errorMessage(error, 'Could not load this conversation.')}
          </div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate" data-testid="thread-empty">
            No messages in this conversation yet.
          </p>
        ) : (
          <ul className="space-y-4" data-testid="thread-messages">
            {messages.map((msg) => (
              <li
                key={msg.id}
                className="flex items-start gap-3"
                data-testid={`thread-message-${msg.id}`}
              >
                <Avatar name={msg.sender.full_name} className="h-8 w-8 text-xs" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-silver">
                      {msg.sender.full_name}
                    </span>
                    <RoleBadge role={msg.sender.role} />
                    <StatusBadge status={msg.status} />
                    <span className="text-xs text-slate">
                      {relativeTime(msg.created_at)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      'mt-1 text-sm whitespace-pre-wrap text-silver',
                      msg.status === 'hidden' && 'text-silver/50',
                    )}
                  >
                    {msg.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}
