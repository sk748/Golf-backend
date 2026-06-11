// One open conversation: ascending message bubbles (10s poll), the persistent
// kid-simple disclaimer, and the composer. Messages are immutable — no edit or
// delete anywhere. Every message can be reported to the club (hover/tap flag,
// optional reason), including by oversight-viewing parents. Oversight threads
// (a parent reading their child's chat) have NO composer — a quiet read-only
// banner instead. A 'held' message is visible only to its sender (and admin);
// its bubble carries a quiet "Held for review by the club" note.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  Flag,
  Loader2,
  MessageSquare,
  Send,
  Users,
} from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import {
  CHAT_DISCLAIMER,
  MAX_MESSAGE_LENGTH,
  conversationTitle,
  dayLabel,
  isNewDay,
  messageTimeLabel,
  oversightChildName,
  useFlagMessage,
  useMarkRead,
  useMessages,
  useSendMessage,
  type ChatMessage,
  type Conversation,
} from './messages.queries';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// ── Flag (report) flow — small inline panel under the bubble ─────────────────

function FlagPanel({
  message,
  onDone,
  onCancel,
}: {
  message: ChatMessage;
  onDone: () => void;
  onCancel: () => void;
}) {
  const flag = useFlagMessage();
  const [reason, setReason] = useState('');

  return (
    <div
      className="mt-1.5 w-full max-w-xs rounded-xl border border-white/10 bg-navy p-3"
      data-testid={`flag-panel-${message.id}`}
    >
      <p className="text-xs font-semibold text-silver">
        Report this message to the club?
      </p>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why? (optional)"
        maxLength={500}
        className="mt-2 w-full rounded-xl border border-white/10 bg-navy px-3 py-2 text-xs text-silver outline-none transition-colors focus:border-azure"
        data-testid={`flag-reason-${message.id}`}
      />
      {flag.isError ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {errorMessage(flag.error, 'Could not send the report.')}
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="danger"
          disabled={flag.isPending}
          onClick={() =>
            flag.mutate(
              { messageId: message.id, reason },
              { onSuccess: onDone },
            )
          }
          data-testid={`flag-submit-${message.id}`}
        >
          {flag.isPending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Flag size={14} aria-hidden />
          )}
          Report
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── One message bubble ────────────────────────────────────────────────────────

function MessageBubble({
  message,
  showSender,
  flagging,
  flagged,
  onFlagStart,
  onFlagDone,
  onFlagCancel,
}: {
  message: ChatMessage;
  showSender: boolean;
  flagging: boolean;
  flagged: boolean;
  onFlagStart: () => void;
  onFlagDone: () => void;
  onFlagCancel: () => void;
}) {
  const own = message.own;
  const held = message.status === 'held';

  return (
    <div
      className={cn(
        'group flex flex-col',
        own ? 'items-end' : 'items-start',
      )}
      data-testid={`message-${message.id}`}
    >
      <div
        className={cn(
          'flex max-w-[85%] items-end gap-1.5 sm:max-w-[70%]',
          own && 'flex-row-reverse',
        )}
      >
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5',
            own
              ? 'rounded-br-md bg-azure text-white'
              : 'glass-light rounded-bl-md text-silver',
            held && 'opacity-80',
          )}
        >
          {showSender && !own ? (
            <p className="mb-0.5 text-[11px] font-bold text-azure">
              {message.sender.full_name}
            </p>
          ) : null}
          <p className="whitespace-pre-wrap break-words text-sm">
            {message.body}
          </p>
          <p
            className={cn(
              'mt-1 text-right text-[10px]',
              own ? 'text-white/60' : 'text-slate',
            )}
          >
            {messageTimeLabel(message.created_at)}
          </p>
        </div>

        {/* Report — quiet, hover-revealed on desktop, always reachable on touch */}
        <button
          type="button"
          onClick={onFlagStart}
          aria-label="Report this message"
          title="Report this message"
          data-testid={`flag-btn-${message.id}`}
          className="rounded-lg p-1.5 text-slate/70 transition-all hover:bg-white/5 hover:text-red-400 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Flag size={13} aria-hidden />
        </button>
      </div>

      {held ? (
        <p
          className={cn(
            'mt-1 flex items-center gap-1 text-[10px] text-slate',
            own ? 'pr-8' : 'pl-8',
          )}
          data-testid={`held-note-${message.id}`}
        >
          <Clock size={10} aria-hidden />
          Held for review by the club — only you can see this for now.
        </p>
      ) : null}

      {flagging ? (
        <FlagPanel message={message} onDone={onFlagDone} onCancel={onFlagCancel} />
      ) : null}
      {flagged ? (
        <p
          className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400"
          data-testid={`flagged-note-${message.id}`}
        >
          <CheckCircle2 size={10} aria-hidden />
          Reported — thank you, the club will take a look.
        </p>
      ) : null}
    </div>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────────

function Composer({ conversationId }: { conversationId: number }) {
  const send = useSendMessage();
  const [body, setBody] = useState('');
  const trimmed = body.trim();

  function handleSend() {
    if (!trimmed || send.isPending) return;
    send.mutate(
      { conversationId, body: trimmed },
      { onSuccess: () => setBody('') },
    );
  }

  return (
    <div className="border-t border-white/5 px-3 pb-3 pt-2 sm:px-4">
      <p className="pb-2 text-center text-[10px] leading-relaxed text-slate">
        {CHAT_DISCLAIMER}
      </p>
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Write a message…"
          aria-label="Write a message"
          className="max-h-32 min-h-12 w-full flex-1 resize-none rounded-xl border border-white/10 bg-navy px-4 py-3 text-sm text-silver outline-none transition-colors focus:border-azure"
          data-testid="composer-input"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!trimmed || send.isPending}
          aria-label="Send message"
          data-testid="composer-send"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-azure text-white shadow-lg shadow-azure/30 transition-all hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          {send.isPending ? (
            <Loader2 size={18} className="animate-spin" aria-hidden />
          ) : (
            <Send size={18} aria-hidden />
          )}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        {send.isError ? (
          <p className="mt-1.5 text-xs text-red-400" role="alert" data-testid="send-error">
            {errorMessage(send.error, 'Could not send your message.')}
          </p>
        ) : (
          <span />
        )}
        {body.length > MAX_MESSAGE_LENGTH - 200 ? (
          <p className="mt-1.5 shrink-0 text-[10px] text-slate">
            {MAX_MESSAGE_LENGTH - body.length} characters left
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ── The thread ────────────────────────────────────────────────────────────────

export function MessageThread({
  conversation,
  currentUserId,
  onBack,
}: {
  conversation: Conversation;
  currentUserId: string | undefined;
  onBack: () => void;
}) {
  const messages = useMessages(conversation.id);
  const markRead = useMarkRead();
  const markReadMutate = markRead.mutate;

  const [flaggingId, setFlaggingId] = useState<number | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<Set<number>>(new Set());

  const items = useMemo(() => messages.data ?? [], [messages.data]);
  const lastId = items.length > 0 ? items[items.length - 1].id : null;

  // Mark the thread read when it opens and again whenever a new last message
  // has rendered. Keyed on (conversation, last message) so polling refetches
  // that bring nothing new don't re-fire it. Oversight viewers aren't members,
  // so the backend would 403 their read-marking — skip it.
  const lastMarkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (conversation.oversight) return;
    if (messages.isLoading || messages.isError) return;
    const key = `${conversation.id}:${lastId ?? 'none'}`;
    if (lastMarkedRef.current === key) return;
    lastMarkedRef.current = key;
    markReadMutate(conversation.id);
  }, [conversation.id, conversation.oversight, lastId, messages.isLoading, messages.isError, markReadMutate]);

  // Keep the scroll pinned to the newest message.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation.id, lastId]);

  // Reset transient flag UI when switching threads.
  useEffect(() => {
    setFlaggingId(null);
    setFlaggedIds(new Set());
  }, [conversation.id]);

  const title = conversationTitle(conversation, currentUserId);
  const isGroup = conversation.type === 'group';
  const memberNames = conversation.members.map((m) => m.full_name).join(', ');

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid={`thread-${conversation.id}`}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/5 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to all chats"
          data-testid="thread-back"
          className="rounded-lg p-2 text-slate transition-colors hover:bg-white/5 hover:text-silver lg:hidden"
        >
          <ArrowLeft size={18} aria-hidden />
        </button>
        {isGroup ? (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/15 text-gold"
            aria-hidden="true"
          >
            <Users size={16} />
          </div>
        ) : (
          <Avatar name={title} className="shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-silver">{title}</p>
          <p className="truncate text-[11px] text-slate">
            {isGroup
              ? `${conversation.members.length} members · ${memberNames}`
              : 'Direct message'}
          </p>
        </div>
      </div>

      {/* Oversight banner — parent reading their child's chat */}
      {conversation.oversight ? (
        <p
          className="flex items-center gap-2 border-b border-white/5 bg-azure/10 px-4 py-2.5 text-xs font-semibold text-azure"
          data-testid="oversight-banner"
        >
          <Eye size={13} className="shrink-0" aria-hidden />
          You’re viewing this as {oversightChildName(conversation)}’s parent —
          read only.
        </p>
      ) : null}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4"
        data-testid="message-scroll"
      >
        {messages.isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-slate" data-testid="messages-loading">
            <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
            Loading messages…
          </div>
        ) : messages.isError ? (
          <div
            className="mx-auto flex max-w-sm items-center gap-2 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            role="alert"
            data-testid="messages-error"
          >
            <AlertCircle size={16} className="shrink-0" aria-hidden />
            {errorMessage(messages.error, 'Could not load this conversation.')}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center" data-testid="messages-empty">
            <MessageSquare size={28} className="text-azure/60" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-silver">
              No messages yet
            </p>
            <p className="mt-1 max-w-xs text-xs text-slate">
              {conversation.oversight
                ? 'Nothing has been said in this chat yet.'
                : 'Say hello — every great round starts with a friendly word.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((m, i) => {
              const prev = i > 0 ? items[i - 1] : undefined;
              return (
                <div key={m.id} className="flex flex-col gap-2">
                  {isNewDay(prev?.created_at, m.created_at) ? (
                    <p className="py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate">
                      {dayLabel(m.created_at)}
                    </p>
                  ) : null}
                  <MessageBubble
                    message={m}
                    showSender={
                      isGroup &&
                      (!prev || prev.sender.user_id !== m.sender.user_id)
                    }
                    flagging={flaggingId === m.id}
                    flagged={flaggedIds.has(m.id)}
                    onFlagStart={() => setFlaggingId(m.id)}
                    onFlagDone={() => {
                      setFlaggingId(null);
                      setFlaggedIds((s) => new Set(s).add(m.id));
                    }}
                    onFlagCancel={() => setFlaggingId(null)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer — or the read-only note for oversight threads */}
      {conversation.oversight ? (
        <p className="border-t border-white/5 px-4 py-3 text-center text-[10px] text-slate">
          {CHAT_DISCLAIMER}
        </p>
      ) : (
        <Composer conversationId={conversation.id} />
      )}
    </div>
  );
}
