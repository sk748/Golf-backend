// Public "Latest from the club" panel on the logged-out landing page —
// published EXTERNAL announcements from GET /api/public/announcements (no auth;
// the api client just has no token to attach). This is now a first-class hero
// element, so unlike a hidden-when-empty section it ALWAYS renders a frame with
// a real loading / empty / error state.

import { ArrowRight, CalendarDays, Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';

import { usePublicAnnouncements } from '../announcements/announcements.queries';

const PANEL_LIMIT = 4;

function newsDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ClubNews() {
  const news = usePublicAnnouncements();
  const items = (news.data ?? []).slice(0, PANEL_LIMIT);

  return (
    <div
      className="glass animate-fade-in-up stagger-2 flex max-h-[28rem] flex-col rounded-3xl p-6 sm:p-7"
      data-testid="club-news"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-azure/20 text-azure">
          <Megaphone size={18} aria-hidden />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">From the club</p>
          <h2 className="text-lg font-black text-silver">Latest news</h2>
        </div>
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
        {news.isLoading ? (
          <div className="flex flex-col gap-3" data-testid="club-news-loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass-light h-16 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : news.isError ? (
          <p className="text-sm text-slate" data-testid="club-news-error">
            Club news is unavailable right now.
          </p>
        ) : items.length === 0 ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center"
            data-testid="club-news-empty"
          >
            <Megaphone size={28} className="text-slate/50" aria-hidden />
            <p className="text-sm font-medium text-silver">No club news yet</p>
            <p className="max-w-xs text-xs text-slate">
              Tournament results and academy updates will appear here. Check back soon.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="club-news-list">
            {items.map((item) => (
              <li key={item.id}>
                <article
                  className="glass-light rounded-2xl p-4 transition-colors hover:bg-white/[0.07]"
                  data-testid={`club-news-${item.id}`}
                >
                  {newsDate(item.published_at) ? (
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate">
                      <CalendarDays size={12} aria-hidden />
                      {newsDate(item.published_at)}
                    </p>
                  ) : null}
                  <h3 className="mt-1 text-sm font-bold text-silver">{item.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-silver/75">
                    {item.body}
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        to="/register"
        className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-azure transition-all hover:gap-2"
        data-testid="club-news-cta"
      >
        Join the academy to follow along
        <ArrowRight size={13} aria-hidden />
      </Link>
    </div>
  );
}
