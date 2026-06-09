// Small date/label display helpers for the committee pages. Dates are ISO
// YYYY-MM-DD; monthly evaluation params use the first of the month (CLAUDE.md §5).
// No domain math — formatting only.

// First-of-month ISO string for the given Date (defaults to today), UTC-safe.
export function monthStart(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function currentMonthStart(): string {
  return monthStart();
}

// The last `count` month-starts, newest first (for a month picker).
export function monthOptions(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    out.push(monthStart(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return out;
}

// "2026-06-01" -> "June 2026".
export function formatMonth(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

// "2026-06-09" -> "9 Jun 2026" (for sign-off dates).
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

// Enum -> human label.
const ASSESSMENT_LABELS: Record<string, string> = {
  below_expectation: 'Below expectation',
  meeting_expectation: 'Meeting expectation',
  exceeding_expectation: 'Exceeding expectation',
};
export function assessmentLabel(value: string): string {
  return ASSESSMENT_LABELS[value] ?? value;
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  continue_level: 'Continue at level',
  move_next_level: 'Move to next level',
};
export function recommendationLabel(value: string): string {
  return RECOMMENDATION_LABELS[value] ?? value;
}
