// Public "Club News" section on the logged-out landing page — published
// EXTERNAL announcements from GET /api/public/announcements (no auth; the api
// client just has no token to attach). The landing page must look complete
// with zero announcements, so this renders NOTHING while loading, on error,
// or when the list is empty — the hero stands alone.

import { usePublicAnnouncements } from '../announcements/announcements.queries';

function newsDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function ClubNews() {
  const news = usePublicAnnouncements();
  const items = news.data ?? [];

  // Hidden entirely unless there is real news to show.
  if (news.isLoading || news.isError || items.length === 0) return null;

  return (
    <section
      className="bg-navy px-6 py-16 sm:py-20"
      aria-labelledby="club-news-heading"
      data-testid="club-news"
    >
      <div className="mx-auto max-w-3xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-azure">
          From the club
        </p>
        <h2
          id="club-news-heading"
          className="mt-2 text-2xl font-black text-silver sm:text-3xl"
        >
          Club News
        </h2>

        <ul className="mt-8 flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id}>
              <article
                className="glass rounded-2xl p-5 sm:p-6"
                data-testid={`club-news-${item.id}`}
              >
                <h3 className="text-lg font-bold text-silver">{item.title}</h3>
                {newsDate(item.published_at) ? (
                  <p className="mt-1 text-xs text-slate">
                    {newsDate(item.published_at)}
                  </p>
                ) : null}
                <p className="mt-3 whitespace-pre-wrap text-sm text-silver/85">
                  {item.body}
                </p>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
