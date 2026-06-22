// /messages — one chat page for all five roles (route + nav wired by the
// orchestrator; backend scopes everything per token). Mobile-first: small
// screens switch between the conversation list and the open thread (coaches on
// phones); lg+ shows the classic two-pane layout. The list polls every 30s,
// the open thread every 10s (inside the hooks). Parents see their own chats
// first, then their child's oversight chats (read-only inside the thread).

import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, MessagesSquare } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useAuth } from '../../auth/useAuth';
import { GlassCard } from '../../components/ui/GlassCard';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';
import { NewChatDialog } from './NewChatDialog';
import { useConversations, type Conversation } from './messages.queries';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function MessagesPage() {
  const { user } = useAuth();
  const conversations = useConversations();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  // A conversation returned by POST /api/conversations (start DM / create
  // group) that the polled list hasn't picked up yet — real server data, kept
  // only until the invalidated list catches up.
  const [justOpened, setJustOpened] = useState<Conversation | null>(null);

  const items = useMemo(
    () => conversations.data ?? [],
    [conversations.data],
  );

  const selected: Conversation | null = useMemo(() => {
    if (selectedId == null) return null;
    return (
      items.find((c) => c.id === selectedId) ??
      (justOpened?.id === selectedId ? justOpened : null)
    );
  }, [items, selectedId, justOpened]);

  const isParent = user?.role === 'parent';
  const canCreateGroup = user?.role === 'admin' || user?.role === 'coach';

  function handleOpened(conv: Conversation) {
    setJustOpened(conv);
    setSelectedId(conv.id);
    setNewChatOpen(false);
  }

  return (
    <div
      // Fill the viewport beneath the AppShell header + main padding so the
      // thread scrolls internally, never the page.
      className="animate-fade-in-up mx-auto flex h-[calc(100dvh-5.25rem)] min-h-[24rem] max-w-6xl flex-col sm:h-[calc(100dvh-6.75rem)]"
      data-testid="messages-page"
    >
      {conversations.isLoading ? (
        <div
          className="flex flex-1 items-center justify-center gap-2 text-sm text-slate"
          data-testid="conversations-loading"
        >
          <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
          Loading your chats…
        </div>
      ) : conversations.isError ? (
        <GlassCard className="m-auto w-full max-w-sm p-6 text-center" data-testid="conversations-error">
          <AlertCircle size={28} className="mx-auto text-red-400" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-silver">
            Could not load your chats
          </p>
          <p className="mt-1 text-xs text-red-400" role="alert">
            {errorMessage(conversations.error, 'Something went wrong.')}
          </p>
        </GlassCard>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          {/* List pane — hidden on mobile while a thread is open */}
          <div
            className={cn(
              'min-h-0',
              selected ? 'hidden lg:block' : 'block',
            )}
          >
            <ConversationList
              conversations={items}
              selectedId={selectedId}
              currentUserId={user?.id}
              isParent={isParent}
              onSelect={setSelectedId}
              onNewChat={() => setNewChatOpen(true)}
            />
          </div>

          {/* Thread pane — hidden on mobile until a thread is chosen */}
          <div
            className={cn(
              'min-h-0',
              selected ? 'block' : 'hidden lg:block',
            )}
          >
            <GlassCard className="h-full overflow-hidden">
              {selected ? (
                <MessageThread
                  conversation={selected}
                  currentUserId={user?.id}
                  onBack={() => setSelectedId(null)}
                />
              ) : (
                <div
                  className="flex h-full flex-col items-center justify-center p-8 text-center"
                  data-testid="thread-placeholder"
                >
                  <MessagesSquare size={36} className="text-azure/50" aria-hidden />
                  <p className="mt-3 text-sm font-semibold text-silver">
                    Pick a chat to start reading
                  </p>
                  <p className="mt-1 max-w-xs text-xs text-slate">
                    Your conversations with the club stay here — choose one on
                    the left or start a new message.
                  </p>
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      )}

      {newChatOpen ? (
        <NewChatDialog
          canCreateGroup={canCreateGroup}
          onOpened={handleOpened}
          onClose={() => setNewChatOpen(false)}
        />
      ) : null}
    </div>
  );
}
