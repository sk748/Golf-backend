import { cn } from '../../lib/cn';
import { dayLabel, toISODate } from '../../pages/coach/coach-dates';

// A Google-Calendar-style week view: a time grid with one column per day and
// each item positioned by its start/end time. Items without a time show in an
// "all day" strip; items without a date fall to an "unscheduled" list so nothing
// is ever silently dropped. Horizontally scrollable on small screens.
//
// Generic over a CalendarItem so the same grid renders coaching sessions,
// events, and tournaments. Colour is driven by `kind`; `onClick` makes a block
// interactive (e.g. open an event detail).

const HOUR_PX = 56;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 18;

// A single thing on the calendar, regardless of source. Times are "HH:MM[:SS]"
// or null (all-day); `date` is ISO YYYY-MM-DD or '' (unscheduled).
export interface CalendarItem {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  kind: 'event' | 'session' | 'tournament';
  status?: string;
  mandatory?: boolean;
  subtitle?: string;
  onClick?: () => void;
}

function parseMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function itemISODate(item: CalendarItem): string | null {
  return item.date ? item.date.slice(0, 10) : null;
}

function timeLabel(item: CalendarItem): string | null {
  const trim = (t: string | null) => (t ? t.slice(0, 5) : null);
  const start = trim(item.start_time);
  const end = trim(item.end_time);
  if (start && end) return `${start} – ${end}`;
  return start ?? null;
}

function hourLabel(h: number): string {
  const period = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${period}`;
}

// Colour blocks by kind; a cancelled item overrides to red (the caller marks it
// via `status`). event=azure, session=emerald, tournament=gold.
function kindClasses(item: CalendarItem): string {
  if (item.status?.toLowerCase() === 'cancelled') {
    return 'border-red-500/40 bg-red-500/15 text-red-200';
  }
  switch (item.kind) {
    case 'session':
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100';
    case 'tournament':
      return 'border-gold/40 bg-gold/15 text-gold';
    case 'event':
    default:
      return 'border-azure/50 bg-azure/20 text-silver';
  }
}

export function WeekCalendar({ days, items }: { days: Date[]; items: CalendarItem[] }) {
  const timedByDay = new Map<string, CalendarItem[]>();
  const allDayByDay = new Map<string, CalendarItem[]>();
  const unscheduled: CalendarItem[] = [];

  for (const it of items) {
    const iso = itemISODate(it);
    if (!iso) {
      unscheduled.push(it);
      continue;
    }
    const target = parseMinutes(it.start_time) == null ? allDayByDay : timedByDay;
    target.set(iso, [...(target.get(iso) ?? []), it]);
  }

  // Fit the grid to the day's items, padded to a sensible default window.
  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;
  const starts = items.map((s) => parseMinutes(s.start_time)).filter((n): n is number => n != null);
  const ends = items.map((s) => parseMinutes(s.end_time)).filter((n): n is number => n != null);
  if (starts.length) {
    startHour = Math.min(startHour, Math.floor(Math.min(...starts) / 60));
    endHour = Math.max(endHour, Math.ceil(Math.max(...ends, ...starts.map((m) => m + 60)) / 60));
  }
  startHour = Math.max(6, startHour);
  endHour = Math.min(22, endHour);

  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);
  const bodyHeight = (endHour - startHour) * HOUR_PX;
  const cols = `3.25rem repeat(${days.length}, minmax(0, 1fr))`;
  const todayIso = toISODate(new Date());
  const hasAllDay = days.some((d) => (allDayByDay.get(toISODate(d)) ?? []).length > 0);

  return (
    <div className="overflow-x-auto" data-testid="week-calendar">
      <div className="min-w-[44rem]">
        {/* Day headers */}
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          <div />
          {days.map((d) => {
            const iso = toISODate(d);
            const isToday = iso === todayIso;
            return (
              <div key={iso} className="px-1 pb-2 text-center">
                <div
                  className={cn(
                    'inline-flex flex-col rounded-lg px-2 py-1 text-xs font-semibold',
                    isToday ? 'bg-azure/20 text-azure' : 'text-slate',
                  )}
                >
                  {dayLabel(d)}
                </div>
              </div>
            );
          })}
        </div>

        {/* All-day strip (only when something is all-day) */}
        {hasAllDay && (
          <div
            className="grid border-y border-white/10 py-1"
            style={{ gridTemplateColumns: cols }}
          >
            <div className="flex items-center justify-end pr-2 text-[10px] uppercase tracking-wide text-slate">
              All day
            </div>
            {days.map((d) => {
              const iso = toISODate(d);
              return (
                <div key={iso} className="space-y-1 px-1">
                  {(allDayByDay.get(iso) ?? []).map((it) => (
                    <CalendarBlock key={it.id} item={it} variant="chip" />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Time grid */}
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          {/* Hour gutter */}
          <div className="relative" style={{ height: bodyHeight }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] font-medium text-slate"
                style={{ top: (h - startHour) * HOUR_PX }}
              >
                {hourLabel(h)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d) => {
            const iso = toISODate(d);
            const isToday = iso === todayIso;
            const dayEvents = timedByDay.get(iso) ?? [];
            return (
              <div
                key={iso}
                className={cn('relative border-l border-white/5', isToday && 'bg-azure/[0.04]')}
                style={{ height: bodyHeight }}
                data-testid={`cal-day-${iso}`}
              >
                {/* Hour lines */}
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-white/5"
                    style={{ top: (h - startHour) * HOUR_PX }}
                  />
                ))}

                {/* Events */}
                {dayEvents.map((it) => {
                  const startMin = parseMinutes(it.start_time);
                  if (startMin == null) return null;
                  const endMin = parseMinutes(it.end_time) ?? startMin + 60;
                  const top = ((startMin - startHour * 60) / 60) * HOUR_PX;
                  const height = Math.max(((endMin - startMin) / 60) * HOUR_PX, 24);
                  return (
                    <CalendarBlock
                      key={it.id}
                      item={it}
                      variant="positioned"
                      style={{ top, height }}
                      showSubtitle={height > 52}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Unscheduled (no date) */}
        {unscheduled.length > 0 && (
          <div className="mt-3 border-t border-white/10 pt-3" data-testid="cal-unscheduled">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate">Unscheduled</p>
            <div className="flex flex-wrap gap-2">
              {unscheduled.map((it) => (
                <CalendarBlock key={it.id} item={it} variant="chip" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// One block in any of three placements: a small "chip" (all-day / unscheduled)
// or an absolutely-positioned grid block. Clickable when the item carries
// `onClick`; cancelled items strike through; mandatory items show a gold marker.
function CalendarBlock({
  item,
  variant,
  style,
  showSubtitle,
}: {
  item: CalendarItem;
  variant: 'chip' | 'positioned';
  style?: React.CSSProperties;
  showSubtitle?: boolean;
}) {
  const cancelled = item.status?.toLowerCase() === 'cancelled';
  const clickable = Boolean(item.onClick);
  const label = timeLabel(item);

  const common = cn(
    'overflow-hidden border text-left',
    kindClasses(item),
    clickable && 'transition-transform hover:brightness-110 active:scale-[0.98]',
  );

  const content = (
    <>
      <p className={cn('flex items-center gap-1 truncate font-bold', cancelled && 'line-through')}>
        {item.mandatory && (
          <span className="text-gold" title="Mandatory" aria-label="Mandatory">
            ●
          </span>
        )}
        <span className="truncate">{item.title}</span>
      </p>
      {variant === 'positioned' && label && (
        <p className="truncate text-[10px] opacity-80">{label}</p>
      )}
      {variant === 'positioned' && showSubtitle && item.subtitle && (
        <p className="mt-0.5 line-clamp-2 text-[10px] opacity-70">{item.subtitle}</p>
      )}
    </>
  );

  const className =
    variant === 'chip'
      ? cn(common, 'block w-full truncate rounded-md px-2 py-1 text-[11px] font-semibold')
      : cn(common, 'absolute inset-x-1 rounded-lg px-2 py-1 text-[11px]');

  if (clickable) {
    return (
      <button
        type="button"
        onClick={item.onClick}
        className={className}
        style={style}
        data-testid={`cal-item-${item.id}`}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={className} style={style} data-testid={`cal-item-${item.id}`}>
      {content}
    </div>
  );
}
