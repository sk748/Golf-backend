// Local date helpers for the coach pages. Week params are Monday week-starts in
// ISO YYYY-MM-DD (CLAUDE.md §5). No date library is in the project, so these are
// small, dependency-free, and operate in local time (the club's timezone).

// Format a Date as ISO YYYY-MM-DD in local time.
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// The Monday (week-start) for a given date, as a Date at local midnight.
export function mondayOf(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = copy.getDay(); // 0 = Sun ... 6 = Sat
  const delta = dow === 0 ? -6 : 1 - dow; // shift back to Monday
  copy.setDate(copy.getDate() + delta);
  return copy;
}

// Monday week-start of the current week, ISO.
export function currentWeekStart(): string {
  return toISODate(mondayOf(new Date()));
}

// Shift an ISO week-start by a number of weeks (e.g. -1 / +1), ISO.
export function shiftWeek(weekStartISO: string, weeks: number): string {
  const d = parseISODate(weekStartISO);
  d.setDate(d.getDate() + weeks * 7);
  return toISODate(mondayOf(d));
}

// Parse an ISO YYYY-MM-DD into a local-midnight Date (avoids UTC offset drift
// that `new Date('YYYY-MM-DD')` introduces).
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// The seven local-midnight Dates of the week beginning at the given ISO Monday.
export function weekDays(weekStartISO: string): Date[] {
  const start = parseISODate(weekStartISO);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}

// "Mon 9 Jun" style label for a day header.
export function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// "9 Jun – 15 Jun" style label for a week range.
export function weekRangeLabel(weekStartISO: string): string {
  const days = weekDays(weekStartISO);
  const start = days[0];
  const end = days[6];
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// A session's ISO date from the backend `date` column. Returns null when absent.
export function sessionISODate(
  s: { date?: string | null },
): string | null {
  if (s.date) return s.date.slice(0, 10);
  return null;
}

// "HH:MM" time label from a session's `start_time` / `end_time` columns.
export function sessionTimeLabel(s: {
  start_time?: string | null;
  end_time?: string | null;
}): string | null {
  const trim = (t?: string | null) => (t ? t.slice(0, 5) : null);
  const start = trim(s.start_time);
  const end = trim(s.end_time);
  if (start && end) return `${start} – ${end}`;
  return start ?? null;
}
