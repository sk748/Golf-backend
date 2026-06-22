import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Megaphone, Minus, X } from 'lucide-react';

import { useAnnouncements } from './announcements.queries';

// Remembers the last announcement the user dismissed, so closing the banner
// keeps it gone until a NEWER announcement is published.
const SEEN_KEY = 'kcc.dashboard.announcement.seen';

function readSeen(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(SEEN_KEY) ?? '';
}

// Top-of-dashboard banner for the newest announcement. Close hides it until the
// next new one; minimise collapses it to a thin pill. Never dims anything.
export function DashboardAnnouncementBanner() {
  const feed = useAnnouncements();
  const [dismissedId, setDismissedId] = useState(readSeen);
  const [minimized, setMinimized] = useState(false);

  // Most recent published item (feed is newest-first). Drafts aren't broadcast.
  const latest = (feed.data ?? []).find((a) => a.status !== 'draft');
  if (!latest) return null;

  const latestId = String(latest.id);
  if (latestId === dismissedId) return null; // closed, and nothing newer since.

  function close() {
    window.localStorage.setItem(SEEN_KEY, latestId);
    setDismissedId(latestId);
  }

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        data-testid="announcement-banner-pill"
        className="mb-4 flex w-full items-center gap-2 rounded-full border border-azure/20 bg-azure/10 px-4 py-2 text-left text-xs font-medium text-azure transition-colors hover:bg-azure/15"
      >
        <Megaphone size={14} aria-hidden />
        <span className="truncate">{latest.title}</span>
        <ChevronDown size={14} className="ml-auto shrink-0" aria-hidden />
      </button>
    );
  }

  return (
    <div
      data-testid="announcement-banner"
      className="mb-4 flex animate-fade-in items-start gap-3 rounded-2xl border border-azure/20 bg-azure/10 p-4"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-azure/20 text-azure">
        <Megaphone size={18} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-silver">{latest.title}</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-slate">{latest.body}</p>
        <Link
          to="/announcements"
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-azure transition-all hover:gap-2"
          data-testid="announcement-banner-view-all"
        >
          View all announcements
          <ArrowRight size={13} aria-hidden />
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setMinimized(true)}
          aria-label="Minimise announcement"
          data-testid="announcement-banner-minimise"
          className="rounded-lg p-1.5 text-slate transition-colors hover:bg-white/5 hover:text-silver"
        >
          <Minus size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss announcement"
          data-testid="announcement-banner-close"
          className="rounded-lg p-1.5 text-slate transition-colors hover:bg-white/5 hover:text-silver"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
