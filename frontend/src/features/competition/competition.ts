// Competition type constants and display helpers.
// This file contains only labels and metadata — no scoring math.

export type CompetitionType =
  | 'karen_junior_challenge'
  | 'faldo_series'
  | 'us_kids'
  | 'jgf'
  | 'karen_strokeplay'
  | 'main_league'
  | 'other';

export interface CompetitionTypeOption {
  value: CompetitionType;
  label: string;
}

export const COMPETITION_TYPES: CompetitionTypeOption[] = [
  { value: 'karen_junior_challenge', label: 'Karen Junior Challenge' },
  { value: 'faldo_series', label: 'Faldo Series' },
  { value: 'us_kids', label: 'US Kids' },
  { value: 'jgf', label: 'JGF' },
  { value: 'karen_strokeplay', label: 'Karen Strokeplay' },
  { value: 'main_league', label: 'Main League' },
  { value: 'other', label: 'Other' },
];

const COMPETITION_LABEL_MAP: Record<CompetitionType, string> = {
  karen_junior_challenge: 'Karen Junior Challenge',
  faldo_series: 'Faldo Series',
  us_kids: 'US Kids',
  jgf: 'JGF',
  karen_strokeplay: 'Karen Strokeplay',
  main_league: 'Main League',
  other: 'Other',
};

// Returns a human-readable label for a competition_type value. Falls back to a
// prettified version of the raw string for unknown values (future-proofing).
export function competitionLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return COMPETITION_LABEL_MAP[value as CompetitionType] ?? prettify(value);
}

function prettify(value: string): string {
  return value.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase());
}
