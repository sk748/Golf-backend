// Participant type — the three programme entry routes for juniors at Karen CC.
// Billed separately (deferred Phase 7+) but tracked from day one so the data
// model never blocks it. This file is the single source of truth for labels,
// display helpers, and the two shared UI controls (badge + select).
//
// Rules:
// - "registered_junior" is the default for every new junior (public + staff).
// - Parents can set it on CREATE (POST /api/parents/me/children / POST /api/juniors).
// - Only staff can EDIT it after creation (PUT /api/juniors/:id; parents get 403).
// - The browser filter hits GET /api/juniors?participant_type=.

import { type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// ── Value / label list ────────────────────────────────────────────────────────

export type ParticipantTypeValue =
  | 'registered_junior'
  | 'club_beginner'
  | 'karen_academy';

export interface ParticipantTypeOption {
  value: ParticipantTypeValue;
  label: string;
}

export const PARTICIPANT_TYPES: ParticipantTypeOption[] = [
  { value: 'registered_junior', label: 'Registered Karen Junior' },
  { value: 'club_beginner', label: 'Club Beginner' },
  { value: 'karen_academy', label: 'Karen Academy / School' },
];

export function participantLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return (
    PARTICIPANT_TYPES.find((o) => o.value === value)?.label ?? value
  );
}

// ── Tone map for the badge ────────────────────────────────────────────────────
// registered_junior → azure (the standard programme blue)
// club_beginner     → emerald (club-green feel)
// karen_academy     → gold   (academy / school distinction)

type Tone = 'azure' | 'emerald' | 'gold';

const PARTICIPANT_TONE: Record<string, Tone> = {
  registered_junior: 'azure',
  club_beginner: 'emerald',
  karen_academy: 'gold',
};

const toneCls: Record<Tone, string> = {
  azure: 'bg-azure/15 text-azure',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  gold: 'bg-gold/15 text-gold',
};

// ── ParticipantTypeBadge ──────────────────────────────────────────────────────
// Small pill badge in the KCC colour system. Import from this file; don't build
// ad-hoc inline badges that drift from these colours.

interface ParticipantTypeBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  type: string | null | undefined;
}

export function ParticipantTypeBadge({
  type,
  className,
  ...rest
}: ParticipantTypeBadgeProps) {
  if (!type) return null;
  const tone: Tone = PARTICIPANT_TONE[type] ?? 'azure';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-widest',
        toneCls[tone],
        className,
      )}
      {...rest}
    >
      {participantLabel(type)}
    </span>
  );
}

// ── ParticipantTypeSelect ─────────────────────────────────────────────────────
// Styled <select> that matches the KCC form selects (same ring + navy bg as
// AddChildCard / JuniorProfilePage inputs). Wrap in a <div> with a <label>
// at the call site for full accessibility.

interface ParticipantTypeSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  // 'full' includes all three types (default — for staff).
  // 'all' is identical to 'full' (alias kept for legibility at call sites).
  include?: 'full' | 'all';
  'data-testid'?: string;
}

// Shared input style (mirrors AddChildCard inputClass to keep forms consistent).
const selectClass =
  'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50';

export function ParticipantTypeSelect({
  id,
  value,
  onChange,
  disabled = false,
  className,
  'data-testid': testId,
}: ParticipantTypeSelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(selectClass, className)}
      data-testid={testId}
    >
      {PARTICIPANT_TYPES.map((o) => (
        <option key={o.value} value={o.value} className="bg-navy">
          {o.label}
        </option>
      ))}
    </select>
  );
}
