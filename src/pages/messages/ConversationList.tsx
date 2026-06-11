// The left pane of /messages: every conversation the signed-in user can see,
// sorted by last activity (server-side). Parents get two sections — "Your
// chats" then "Your child's chats" (oversight:true rows, read-only). The
// "New message" action opens the contact picker (NewChatDialog).

import { Eye, MessageSquare, PenSquare, Users } from 'lucide-react';

import { cn } from '../../lib/cn';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import {
  conversationTitle,
  listTimeLabel,
  oversightChildName,
  type Conversation,
} from './messages.queries';

// ── One row ───────────────────────────────────────────────────────────────────

function ConversationRow({
  conv,
  selected,
  currentUserId,
  onSelect,
}: {
  conv: Conversation;
  selected: boolean;
  currentUserId: string | undefined;
  onSelect: (id: number) => void;
}) {
  const title = conversationTitle(conv, currentUserId);
  const preview = conv.last_message
    ? `${conv.last_message.sender_name.split(' ')[0]}: ${conv.last_message.body}`
    : 'No messages yet';

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(conv.id)}
        aria-current={selected ? 'true' : undefined}
        data-testid={`conversation-${conv.id}`}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all',
          selected
            ? 'border border-azure/20 bg-azure/15'
            : 'border border-transparent hover:bg-white/5',
        )}
      >
        {conv.type === 'group' ? (
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
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={cn(
                'truncate text-sm text-silver',
                conv.unread_count > 0 ? 'font-black' : 'font-semibold',
              )}
            >
              {title}
            </p>
            {conv.last_message ? (
              <span className="shrink-0 text-[10px] text-slate">
                {listTimeLabel(conv.last_message.created_at)}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p
              className={cn(
                'truncate text-xs',
                conv.unread_count > 0 ? 'font-semibold text-silver' : 'text-slate',
              )}
            >
              {conv.oversight ? (
                <span className="mr-1 inline-flex items-center gap-1 text-azure">
                  <Eye size={11} aria-hidden />
                  <span className="sr-only">Read only — </span>
                </span>
              ) : null}
              {preview}
            </p>
            {conv.unread_count > 0 ? (
              <span
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-azure px-1.5 text-[10px] font-black text-white"
                data-testid={`unread-${conv.id}`}
                aria-label={`${conv.unread_count} unread`}
              >
                {conv.unread_count > 99 ? '99+' : conv.unread_count}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}

// ── The list ──────────────────────────────────────────────────────────────────

export function ConversationList({
  conversations,
  selectedId,
  currentUserId,
  isParent,
  onSelect,
  onNewChat,
}: {
  conversations: Conversation[];
  selectedId: number | null;
  currentUserId: string | undefined;
  isParent: boolean;
  onSelect: (id: number) => void;
  onNewChat: () => void;
}) {
  const mine = conversations.filter((c) => !c.oversight);
  const oversight = conversations.filter((c) => c.oversight);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-1 pb-3">
        <h2 className="text-lg font-black text-silver">Messages</h2>
        <Button
          type="button"
          size="sm"
          onClick={onNewChat}
          data-testid="new-message-btn"
        >
          <PenSquare size={15} aria-hidden />
          New message
        </Button>
      </div>

      {conversations.length === 0 ? (
        <div
          className="glass-light flex flex-1 flex-col items-center justify-center rounded-2xl p-8 text-center"
          data-testid="conversations-empty"
        >
          <MessageSquare size={32} className="text-azure/60" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-silver">No chats yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-slate">
            Tap “New message” to say hello — your coach and the club team are a
            message away.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {isParent && oversight.length > 0 ? (
            <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate">
              Your chats
            </p>
          ) : null}

          {mine.length > 0 ? (
            <ul className="flex flex-col gap-1" data-testid="conversation-list">
              {mine.map((c) => (
                <ConversationRow
                  key={c.id}
                  conv={c}
                  selected={c.id === selectedId}
                  currentUserId={currentUserId}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          ) : isParent && oversight.length > 0 ? (
            <p className="px-1 py-2 text-xs text-slate">
              No chats of your own yet — tap “New message” to reach the club.
            </p>
          ) : null}

          {oversight.length > 0 ? (
            <>
              <p className="px-1 pb-2 pt-4 text-[10px] font-bold uppercase tracking-widest text-slate">
                Your child’s chats
              </p>
              <ul
                className="flex flex-col gap-1"
                data-testid="oversight-conversation-list"
              >
                {oversight.map((c) => (
                  <ConversationRow
                    key={c.id}
                    conv={c}
                    selected={c.id === selectedId}
                    currentUserId={currentUserId}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
              <p className="px-1 pt-2 text-[10px] text-slate">
                You can read {oversightChildName(oversight[0])}’s club chats but
                not write in them.
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
