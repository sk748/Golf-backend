import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { PartyPopper, Trophy, X } from 'lucide-react';

import { achievementById } from '../../features/achievements/catalog';
import { fireAchievementConfetti } from '../../features/achievements/confetti';
import { cn } from '../../lib/cn';
import {
  notificationLink,
  useMarkNotificationsRead,
  useNotificationsSummary,
  type AppNotification,
} from './notifications.queries';

// Confetti + a congratulations popup when an "achievement" notification first
// appears for THIS user — works for both the player (their own unlock/badge)
// and the parent (their child's). Piggy-backs on the existing notifications
// poll (no second poller); celebration latency is bounded by that 60s cadence,
// and the moment of earning usually creates the notification right away (the
// player sync / badge award invalidates the poll). We only celebrate UNREAD,
// recent (≤2 days) notifications, and remember which ids we've already
// celebrated in localStorage so a re-poll or revisit doesn't repeat. We do NOT
// mark them read — the bell keeps the persistent record; this is just the
// in-the-moment delight.

const LS_KEY = 'kcc:celebrated-achievement-notifs';
const RECENT_MS = 2 * 24 * 60 * 60 * 1000;

const PLAYER_LINES = [
  "You're on fire! 🔥",
  'Keep it up, champion!',
  'What a milestone!',
  'Brilliant work — onwards and upwards!',
  "That's the spirit!",
  'Another one for the trophy cabinet!',
];
const PARENT_LINES = [
  'Time to celebrate together!',
  "They're working hard — well done!",
  'Another proud moment!',
  'Give them a big cheer! 👏',
];

function loadCelebrated(): Set<number> {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? (raw as number[]) : []);
  } catch {
    return new Set();
  }
}

function persistCelebrated(set: Set<number>): void {
  try {
    // Cap so the list can't grow unbounded; keep the most recent ids.
    localStorage.setItem(LS_KEY, JSON.stringify([...set].slice(-300)));
  } catch {
    /* storage unavailable (private mode) — celebrate-once degrades gracefully */
  }
}

function congratsLine(n: AppNotification): string {
  const isParent = Boolean(n.payload?.child_name);
  const lines = isParent ? PARENT_LINES : PLAYER_LINES;
  return lines[n.id % lines.length];
}

export function AchievementCelebrations() {
  const navigate = useNavigate();
  const { data } = useNotificationsSummary();
  const markRead = useMarkNotificationsRead();

  const celebrated = useRef<Set<number>>(loadCelebrated());
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const items = data?.items;

  // Detect fresh achievement notifications and enqueue them.
  useEffect(() => {
    if (!items) return;
    const now = Date.now();
    const fresh = items.filter((n) => {
      if (n.type !== 'achievement' || n.read) return false;
      if (celebrated.current.has(n.id)) return false;
      const ts = Date.parse(n.created_at);
      return Number.isFinite(ts) && now - ts <= RECENT_MS;
    });
    if (fresh.length === 0) return;
    for (const n of fresh) celebrated.current.add(n.id);
    persistCelebrated(celebrated.current);
    // Oldest first so the queue celebrates in the order they were earned.
    const ordered = [...fresh].reverse();
    setQueue((prev) => [...prev, ...ordered]);
  }, [items]);

  const current = queue[0];

  // One confetti burst per popup shown.
  useEffect(() => {
    if (current) fireAchievementConfetti();
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null;

  const title =
    (typeof current.payload?.title === 'string' && current.payload.title) ||
    'a new achievement';
  const isParent = Boolean(current.payload?.child_name);
  const childName =
    typeof current.payload?.child_name === 'string'
      ? current.payload.child_name
      : null;
  const key =
    typeof current.payload?.achievement_key === 'string'
      ? current.payload.achievement_key
      : null;
  const Icon = (key && achievementById(key)?.icon) || Trophy;

  function dismiss() {
    setQueue((prev) => prev.slice(1));
  }

  function view() {
    markRead.mutate([current.id]);
    dismiss();
    navigate(notificationLink(current));
  }

  return createPortal(
    // Light, NON-dimming overlay so the confetti stays visible (Sam: dark modal
    // backdrops look unfinished). Click anywhere to dismiss.
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      data-testid="achievement-celebration"
    >
      <button
        type="button"
        aria-label="Dismiss celebration"
        className="absolute inset-0 cursor-default bg-navy/10"
        onClick={dismiss}
      />
      <div
        className={cn(
          'relative w-full max-w-sm overflow-hidden rounded-3xl border border-gold/40',
          'bg-navy/95 p-6 text-center shadow-2xl shadow-gold/20 ring-1 ring-gold/30',
          'animate-in fade-in zoom-in-95 duration-200',
        )}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate transition-colors hover:bg-white/5 hover:text-silver"
        >
          <X size={16} />
        </button>

        {/* Glowing badge */}
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gold/15 ring-4 ring-gold/30">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold/70 shadow-lg shadow-gold/40">
            <Icon size={28} className="text-navy" strokeWidth={2.2} aria-hidden="true" />
          </span>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gold">
          <PartyPopper size={14} aria-hidden="true" />
          {isParent ? `${childName ?? 'Your child'} earned an award` : 'Achievement unlocked'}
        </p>
        <h2 className="mt-1 text-2xl font-bold text-silver">{title}</h2>
        <p className="mt-2 text-sm text-slate">{congratsLine(current)}</p>

        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={view}
            data-testid="achievement-celebration-view"
            className="rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-gold/90"
          >
            {isParent ? 'See their progress' : 'View achievements'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-slate transition-colors hover:bg-white/5 hover:text-silver"
          >
            {queue.length > 1 ? `Next (${queue.length - 1})` : 'Nice!'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
