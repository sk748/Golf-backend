// Compact dashboard widget — the latest 3 announcements from the role-scoped
// feed, with a "View all" link to /announcements. Reuses the same
// useAnnouncements() hook the full page uses (one cache key, one poll). Real
// empty/loading/error states; no mock data. Dropped into every dashboard.

import { Link } from 'react-router-dom';
import { ArrowRight, Globe, Loader2, Megaphone } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { GlassCard } from '../../components/ui/GlassCard';
import { announcementDate, useAnnouncements } from './announcements.queries';

const PREVIEW_LIMIT = 3;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function AnnouncementsWidget({ className }: { className?: string }) {
  const feed = useAnnouncements();
  const items = (feed.data ?? []).slice(0, PREVIEW_LIMIT);

  return (
    <GlassCard className={className ?? 'p-5'} data-testid="announcements-widget">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-silver">
          <Megaphone size={16} className="text-azure" aria-hidden />
          Club announcements
        </h2>
        <Link
          to="/announcements"
          className="inline-flex items-center gap-1 text-xs font-medium text-azure transition hover:gap-2 hover:underline"
          data-testid="announcements-widget-view-all"
        >
          View all
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>

      <div className="mt-4">
        {feed.isLoading ? (
          <div
            className="flex items-center gap-2 text-sm text-slate"
            data-testid="announcements-widget-loading"
          >
            <Loader2 size={18} className="animate-spin text-azure" aria-hidden />
            Loading announcements…
          </div>
        ) : feed.isError ? (
          <p
            className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            role="alert"
            data-testid="announcements-widget-error"
          >
            {errorMessage(feed.error, 'Could not load announcements.')}
          </p>
        ) : items.length === 0 ? (
          <p
            className="text-sm text-slate"
            data-testid="announcements-widget-empty"
          >
            No announcements yet.
          </p>
        ) : (
          <ul
            className="flex flex-col gap-2"
            data-testid="announcements-widget-list"
          >
            {items.map((a) => {
              const when = announcementDate(a.published_at ?? a.created_at);
              return (
                <li key={a.id}>
                  <Link
                    to="/announcements"
                    className="glass-light flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-white/5"
                    data-testid={`announcements-widget-item-${a.id}`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-azure/15">
                      {a.is_external ? (
                        <Globe size={15} className="text-azure" aria-hidden />
                      ) : (
                        <Megaphone size={15} className="text-azure" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-silver">
                          {a.title}
                        </span>
                        {a.status === 'draft' ? (
                          <Badge tone="gold" shape="pill" className="shrink-0">
                            Draft
                          </Badge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate">
                        {a.body}
                      </span>
                      {when ? (
                        <span className="mt-0.5 block text-[11px] text-slate">
                          {a.author_name ?? 'Club staff'} · {when}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}
