// "New message" picker — a self-built modal (matching RoundScorecardModal's
// pattern: backdrop click / X / Escape all close). People come ONLY from
// /api/messaging/contacts (the server-enforced who-may-DM-whom matrix); we
// never request /api/users here. Admin/coach additionally get a "New group"
// tab (name + multi-pick). Picking a person starts (or reopens) the DM and
// hands the conversation back to the page.

import { useEffect, useState } from 'react';
import { Check, Loader2, Users, X } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, RoleBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import {
  groupContactsByRole,
  useContacts,
  useCreateGroup,
  useStartDm,
  type Contact,
  type Conversation,
} from './messages.queries';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// ── Shared contacts loader states ─────────────────────────────────────────────

function ContactsStates({
  isLoading,
  isError,
  error,
  isEmpty,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
}) {
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-8 text-sm text-slate"
        data-testid="contacts-loading"
      >
        <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
        Loading people…
      </div>
    );
  }
  if (isError) {
    return (
      <p
        className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
        role="alert"
        data-testid="contacts-error"
      >
        {errorMessage(error, 'Could not load your contacts.')}
      </p>
    );
  }
  if (isEmpty) {
    return (
      <p className="py-8 text-center text-sm text-slate" data-testid="contacts-empty">
        No one to message yet — the club will connect you with your coach.
      </p>
    );
  }
  return null;
}

// ── Direct-message tab ────────────────────────────────────────────────────────

function DmPicker({
  onOpened,
}: {
  onOpened: (conversation: Conversation) => void;
}) {
  const contacts = useContacts();
  const startDm = useStartDm();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const groups = groupContactsByRole(contacts.data ?? []);

  function handlePick(contact: Contact) {
    if (startDm.isPending) return;
    setPendingId(contact.user_id);
    startDm.mutate(
      { user_id: contact.user_id },
      { onSuccess: (conv) => onOpened(conv) },
    );
  }

  return (
    <div>
      <ContactsStates
        isLoading={contacts.isLoading}
        isError={contacts.isError}
        error={contacts.error}
        isEmpty={(contacts.data ?? []).length === 0}
      />
      {startDm.isError ? (
        <p
          className="mb-2 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          role="alert"
          data-testid="start-dm-error"
        >
          {errorMessage(startDm.error, 'Could not open that chat.')}
        </p>
      ) : null}

      {groups.map((group) => (
        <div key={group.role} className="mt-3 first:mt-0">
          <p className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate">
            {group.label}
          </p>
          <ul className="flex flex-col gap-1">
            {group.contacts.map((c) => (
              <li key={c.user_id}>
                <button
                  type="button"
                  onClick={() => handlePick(c)}
                  disabled={startDm.isPending}
                  data-testid={`contact-${c.user_id}`}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all hover:bg-white/5 disabled:opacity-60"
                >
                  <Avatar name={c.full_name} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-silver">
                    {c.full_name}
                  </span>
                  {startDm.isPending && pendingId === c.user_id ? (
                    <Loader2 size={16} className="animate-spin text-azure" aria-hidden />
                  ) : (
                    <RoleBadge role={c.role} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── New-group tab (admin/coach only) ──────────────────────────────────────────

function GroupBuilder({
  onOpened,
}: {
  onOpened: (conversation: Conversation) => void;
}) {
  const contacts = useContacts();
  const createGroup = useCreateGroup();
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());

  const groups = groupContactsByRole(contacts.data ?? []);
  const canCreate = name.trim().length > 0 && memberIds.size > 0;

  function toggle(userId: string) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function handleCreate() {
    if (!canCreate || createGroup.isPending) return;
    createGroup.mutate(
      { name: name.trim(), member_ids: [...memberIds] },
      { onSuccess: (conv) => onOpened(conv) },
    );
  }

  return (
    <div>
      <label
        htmlFor="group-name"
        className="text-xs font-bold tracking-wide text-silver/80"
      >
        Group name
      </label>
      <input
        id="group-name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        placeholder="e.g. Saturday clinic"
        className="mt-1.5 w-full rounded-xl border border-white/10 bg-navy px-4 py-3 text-sm text-silver outline-none transition-colors focus:border-azure"
        data-testid="group-name-input"
      />

      <p className="mt-4 px-1 text-xs font-bold tracking-wide text-silver/80">
        Members{' '}
        {memberIds.size > 0 ? (
          <Badge tone="azure" className="ml-1">
            {memberIds.size} picked
          </Badge>
        ) : null}
      </p>

      <div className="mt-1.5">
        <ContactsStates
          isLoading={contacts.isLoading}
          isError={contacts.isError}
          error={contacts.error}
          isEmpty={(contacts.data ?? []).length === 0}
        />
        {groups.map((group) => (
          <div key={group.role} className="mt-3 first:mt-0">
            <p className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate">
              {group.label}
            </p>
            <ul className="flex flex-col gap-1">
              {group.contacts.map((c) => {
                const picked = memberIds.has(c.user_id);
                return (
                  <li key={c.user_id}>
                    <button
                      type="button"
                      onClick={() => toggle(c.user_id)}
                      aria-pressed={picked}
                      data-testid={`group-pick-${c.user_id}`}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
                        picked
                          ? 'border-azure/20 bg-azure/15'
                          : 'border-transparent hover:bg-white/5',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                          picked
                            ? 'border-azure bg-azure text-white'
                            : 'border-white/20',
                        )}
                        aria-hidden="true"
                      >
                        {picked ? <Check size={13} /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-silver">
                        {c.full_name}
                      </span>
                      <RoleBadge role={c.role} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {createGroup.isError ? (
        <p
          className="mt-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          role="alert"
          data-testid="create-group-error"
        >
          {errorMessage(createGroup.error, 'Could not create the group.')}
        </p>
      ) : null}

      <Button
        type="button"
        fullWidth
        className="mt-4"
        disabled={!canCreate || createGroup.isPending}
        onClick={handleCreate}
        data-testid="create-group-btn"
      >
        {createGroup.isPending ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden />
            Creating…
          </>
        ) : (
          <>
            <Users size={16} aria-hidden />
            Create group
          </>
        )}
      </Button>
    </div>
  );
}

// ── The dialog ────────────────────────────────────────────────────────────────

export function NewChatDialog({
  canCreateGroup,
  onOpened,
  onClose,
}: {
  canCreateGroup: boolean;
  onOpened: (conversation: Conversation) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'dm' | 'group'>('dm');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="New message"
      data-testid="new-chat-dialog"
    >
      <GlassCard
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-b-none p-4 sm:rounded-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-silver">New message</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="new-chat-close"
            className="rounded-lg p-2 text-slate transition-colors hover:bg-white/5 hover:text-silver"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {canCreateGroup ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setTab('dm')}
              data-testid="tab-dm"
              className={cn(
                'rounded-xl px-4 py-2 text-sm font-medium transition-all',
                tab === 'dm' ? 'bg-azure text-white' : 'glass text-slate hover:text-silver',
              )}
            >
              Direct message
            </button>
            <button
              type="button"
              onClick={() => setTab('group')}
              data-testid="tab-group"
              className={cn(
                'rounded-xl px-4 py-2 text-sm font-medium transition-all',
                tab === 'group' ? 'bg-azure text-white' : 'glass text-slate hover:text-silver',
              )}
            >
              New group
            </button>
          </div>
        ) : null}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          {tab === 'group' && canCreateGroup ? (
            <GroupBuilder onOpened={onOpened} />
          ) : (
            <DmPicker onOpened={onOpened} />
          )}
        </div>
      </GlassCard>
    </div>
  );
}
