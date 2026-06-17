// Achievement catalog — grounded in the Karen Junior Development Plan (ref/).
// Achievements auto-unlock from the player's REAL backend data (level, rounds,
// best gross, handicap, sessions, competitions). Locked ones render faded.
//
// Bands: Beginner L1-3 (min 12 sessions) · Attaining Handicap L4-5 (24) ·
// Intermediate/Advanced L6-8 (24, 2-3 comps/month, Karen Junior Challenge) ·
// Elite L9+ (HI <= 15, sub-84 rounds, Faldo Series).

import type { LucideIcon } from 'lucide-react';
import {
  Award,
  CalendarCheck,
  CalendarRange,
  CircleDot,
  Crown,
  Flag,
  Footprints,
  Gem,
  Medal,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';

export const TIER_LABEL: Record<Tier, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Elite',
};

export type AchievementCategory =
  | 'level'
  | 'sessions'
  | 'rounds'
  | 'scoring'
  | 'handicap'
  | 'competition'
  | 'league';

// Real player stats, computed from backend data (see use-achievements.ts).
export interface PlayerStats {
  currentLevel: number;
  hasHandicap: boolean;
  handicapIndex: number | null;
  bestHandicap: number | null; // lowest handicap_after on record
  roundsPlayed: number;
  bestGross: number | null; // lowest gross on record
  competitionsPlayed: number;
  sessionsAttended: number;
  handicapImproving: boolean; // most recent handicap lower than the previous
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string; // how it's earned — shown on the card
  category: AchievementCategory;
  tier: Tier;
  icon: LucideIcon;
  unlocked: (s: PlayerStats) => boolean;
  // Optional progress toward unlocking, for the meter on locked cards.
  progress?: (s: PlayerStats) => { current: number; target: number };
}

const pct = (current: number, target: number) => ({
  current: Math.max(0, current),
  target,
});

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  level: 'Levels',
  sessions: 'Sessions',
  rounds: 'Rounds played',
  scoring: 'Scoring',
  handicap: 'Handicap',
  competition: 'Competition',
  league: 'Junior League',
};

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Level / progression (one per level, tiered by band) ───────────────────
  { id: 'lvl-1', title: 'First Tee', description: 'Join the academy at Level 1.', category: 'level', tier: 'bronze', icon: Footprints, unlocked: (s) => s.currentLevel >= 1 },
  { id: 'lvl-2', title: 'Putting Green Pro', description: 'Reach Level 2.', category: 'level', tier: 'bronze', icon: CircleDot, unlocked: (s) => s.currentLevel >= 2, progress: (s) => pct(s.currentLevel, 2) },
  { id: 'lvl-3', title: 'Short-Game Starter', description: 'Reach Level 3.', category: 'level', tier: 'bronze', icon: Target, unlocked: (s) => s.currentLevel >= 3, progress: (s) => pct(s.currentLevel, 3) },
  { id: 'lvl-4', title: 'Handicap Hopeful', description: 'Reach Level 4 — Attaining Handicap.', category: 'level', tier: 'silver', icon: Flag, unlocked: (s) => s.currentLevel >= 4, progress: (s) => pct(s.currentLevel, 4) },
  { id: 'lvl-5', title: 'Card Carrier', description: 'Reach Level 5.', category: 'level', tier: 'silver', icon: Medal, unlocked: (s) => s.currentLevel >= 5, progress: (s) => pct(s.currentLevel, 5) },
  { id: 'lvl-6', title: 'Into the Arena', description: 'Reach Level 6 — Intermediate.', category: 'level', tier: 'gold', icon: Trophy, unlocked: (s) => s.currentLevel >= 6, progress: (s) => pct(s.currentLevel, 6) },
  { id: 'lvl-7', title: 'Sharpshooter', description: 'Reach Level 7.', category: 'level', tier: 'gold', icon: Star, unlocked: (s) => s.currentLevel >= 7, progress: (s) => pct(s.currentLevel, 7) },
  { id: 'lvl-8', title: 'Advanced Player', description: 'Reach Level 8.', category: 'level', tier: 'gold', icon: Award, unlocked: (s) => s.currentLevel >= 8, progress: (s) => pct(s.currentLevel, 8) },
  { id: 'lvl-9', title: 'Elite Junior', description: 'Reach Level 9 — Enhanced / Elite.', category: 'level', tier: 'platinum', icon: Crown, unlocked: (s) => s.currentLevel >= 9, progress: (s) => pct(s.currentLevel, 9) },

  // ── Sessions / attendance (band minimums 12 & 24, plus fill-ins + Superstar) ─
  { id: 'ses-1', title: 'First Session', description: 'Attend your first coaching session.', category: 'sessions', tier: 'bronze', icon: CalendarCheck, unlocked: (s) => s.sessionsAttended >= 1, progress: (s) => pct(s.sessionsAttended, 1) },
  { id: 'ses-6', title: 'Warming Up', description: 'Attend 6 coaching sessions.', category: 'sessions', tier: 'bronze', icon: CalendarCheck, unlocked: (s) => s.sessionsAttended >= 6, progress: (s) => pct(s.sessionsAttended, 6) },
  { id: 'ses-12', title: 'Committed', description: 'Attend 12 coaching sessions.', category: 'sessions', tier: 'bronze', icon: CalendarCheck, unlocked: (s) => s.sessionsAttended >= 12, progress: (s) => pct(s.sessionsAttended, 12) },
  { id: 'ses-18', title: 'In the Groove', description: 'Attend 18 coaching sessions.', category: 'sessions', tier: 'silver', icon: CalendarRange, unlocked: (s) => s.sessionsAttended >= 18, progress: (s) => pct(s.sessionsAttended, 18) },
  { id: 'ses-24', title: 'Dedicated', description: 'Attend 24 coaching sessions.', category: 'sessions', tier: 'silver', icon: CalendarRange, unlocked: (s) => s.sessionsAttended >= 24, progress: (s) => pct(s.sessionsAttended, 24) },
  { id: 'ses-36', title: 'Relentless', description: 'Attend 36 coaching sessions.', category: 'sessions', tier: 'gold', icon: CalendarRange, unlocked: (s) => s.sessionsAttended >= 36, progress: (s) => pct(s.sessionsAttended, 36) },
  { id: 'ses-50', title: 'Superstar', description: 'Attend 50 coaching sessions.', category: 'sessions', tier: 'platinum', icon: Star, unlocked: (s) => s.sessionsAttended >= 50, progress: (s) => pct(s.sessionsAttended, 50) },

  // ── Rounds played ─────────────────────────────────────────────────────────
  { id: 'rd-1', title: 'First Round', description: 'Log your first round.', category: 'rounds', tier: 'bronze', icon: Flag, unlocked: (s) => s.roundsPlayed >= 1, progress: (s) => pct(s.roundsPlayed, 1) },
  { id: 'rd-5', title: 'Getting Regular', description: 'Play 5 rounds.', category: 'rounds', tier: 'bronze', icon: CalendarCheck, unlocked: (s) => s.roundsPlayed >= 5, progress: (s) => pct(s.roundsPlayed, 5) },
  { id: 'rd-10', title: 'Seasoned', description: 'Play 10 rounds.', category: 'rounds', tier: 'silver', icon: CalendarRange, unlocked: (s) => s.roundsPlayed >= 10, progress: (s) => pct(s.roundsPlayed, 10) },
  { id: 'rd-25', title: 'Course Veteran', description: 'Play 25 rounds.', category: 'rounds', tier: 'gold', icon: Award, unlocked: (s) => s.roundsPlayed >= 25, progress: (s) => pct(s.roundsPlayed, 25) },

  // ── Scoring milestones — incremental ladder down to Breaking 50 ────────────
  // NOTE: Round has no holes-played field, so bestGross isn't 9- vs 18-hole
  // distinguished; the very low tiers (50-70) are aspirational/elite goals that
  // simply stay faded/locked for most players.
  { id: 'sc-120', title: 'Breaking 120', description: 'Card a round under 120.', category: 'scoring', tier: 'bronze', icon: Target, unlocked: (s) => s.bestGross != null && s.bestGross < 120 },
  { id: 'sc-110', title: 'Breaking 110', description: 'Card a round under 110.', category: 'scoring', tier: 'bronze', icon: Target, unlocked: (s) => s.bestGross != null && s.bestGross < 110 },
  { id: 'sc-100', title: 'Breaking 100', description: 'Card a round under 100.', category: 'scoring', tier: 'silver', icon: Target, unlocked: (s) => s.bestGross != null && s.bestGross < 100 },
  { id: 'sc-90', title: 'Breaking 90', description: 'Break 90 in a round.', category: 'scoring', tier: 'silver', icon: Zap, unlocked: (s) => s.bestGross != null && s.bestGross < 90 },
  { id: 'sc-84', title: 'Sub-84 Star', description: 'Card 84 or better — the Elite mark.', category: 'scoring', tier: 'gold', icon: Sparkles, unlocked: (s) => s.bestGross != null && s.bestGross <= 84 },
  { id: 'sc-80', title: 'Breaking 80', description: 'Card a round under 80.', category: 'scoring', tier: 'gold', icon: Zap, unlocked: (s) => s.bestGross != null && s.bestGross < 80 },
  { id: 'sc-70', title: 'Breaking 70', description: 'Card a round under 70.', category: 'scoring', tier: 'platinum', icon: Star, unlocked: (s) => s.bestGross != null && s.bestGross < 70 },
  { id: 'sc-60', title: 'Breaking 60', description: 'Card a round under 60.', category: 'scoring', tier: 'platinum', icon: Gem, unlocked: (s) => s.bestGross != null && s.bestGross < 60 },
  { id: 'sc-50', title: 'Breaking 50', description: 'Card a round under 50 — legendary.', category: 'scoring', tier: 'platinum', icon: Crown, unlocked: (s) => s.bestGross != null && s.bestGross < 50 },

  // ── Handicap (Elite target: HI <= 15) ─────────────────────────────────────
  { id: 'hc-earned', title: 'Handicap Earned', description: 'Earn your first official handicap.', category: 'handicap', tier: 'silver', icon: Medal, unlocked: (s) => s.hasHandicap },
  { id: 'hc-20', title: 'Under 20', description: 'Get your handicap index below 20.', category: 'handicap', tier: 'gold', icon: TrendingDown, unlocked: (s) => s.bestHandicap != null && s.bestHandicap < 20 },
  { id: 'hc-15', title: 'Single Focus', description: 'Reach a handicap index of 15 or lower.', category: 'handicap', tier: 'platinum', icon: Gem, unlocked: (s) => s.bestHandicap != null && s.bestHandicap <= 15 },
  { id: 'hc-trend', title: 'On the Up', description: 'Lower your handicap on your latest round.', category: 'handicap', tier: 'bronze', icon: TrendingDown, unlocked: (s) => s.handicapImproving },

  // ── Competition (L6-8 / Elite expectations) — fill-ins + top tier ─────────
  { id: 'cmp-1', title: 'Challenger', description: 'Play your first competition.', category: 'competition', tier: 'bronze', icon: Trophy, unlocked: (s) => s.competitionsPlayed >= 1, progress: (s) => pct(s.competitionsPlayed, 1) },
  { id: 'cmp-3', title: 'Tournament Tough', description: 'Play 3 competitions.', category: 'competition', tier: 'silver', icon: Trophy, unlocked: (s) => s.competitionsPlayed >= 3, progress: (s) => pct(s.competitionsPlayed, 3) },
  { id: 'cmp-5', title: 'Seasoned Competitor', description: 'Play 5 competitions.', category: 'competition', tier: 'gold', icon: Trophy, unlocked: (s) => s.competitionsPlayed >= 5, progress: (s) => pct(s.competitionsPlayed, 5) },
  { id: 'cmp-10', title: 'Road Warrior', description: 'Play 10 competitions.', category: 'competition', tier: 'platinum', icon: Medal, unlocked: (s) => s.competitionsPlayed >= 10, progress: (s) => pct(s.competitionsPlayed, 10) },
  { id: 'cmp-20', title: 'Circuit Star', description: 'Play 20 competitions.', category: 'competition', tier: 'platinum', icon: Crown, unlocked: (s) => s.competitionsPlayed >= 20, progress: (s) => pct(s.competitionsPlayed, 20) },

  // ── Junior League (inter-club team play) — green-toned team awards ─────────
  // Awarded from the backend's AchievementUnlock/sync against league results;
  // auto-unlock DETECTION from PlayerStats is out of scope for this pass, so the
  // unlocked() predicate stays false (they surface via a featured/synced award
  // and resolve their title/icon through achievementById).
  { id: 'league_participant', title: 'League Debut', description: 'Represented the club in the Junior League.', category: 'league', tier: 'silver', icon: Users, unlocked: () => false },
  { id: 'league_runner_up', title: 'League Runners-Up', description: 'Junior League runners-up.', category: 'league', tier: 'gold', icon: Medal, unlocked: () => false },
  { id: 'league_champion', title: 'League Champions', description: 'Junior League champions.', category: 'league', tier: 'platinum', icon: Trophy, unlocked: () => false },
];

// Lookup by catalog id (the `achievement_key` the backend stores for a featured
// award). Used by the chat chip to resolve a key -> title / icon / description.
const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_BY_ID[id];
}

export interface EvaluatedAchievement extends AchievementDef {
  earned: boolean;
  progressNow: number | null;
  progressTarget: number | null;
}

export function evaluateAchievements(stats: PlayerStats): EvaluatedAchievement[] {
  return ACHIEVEMENTS.map((a) => {
    const earned = a.unlocked(stats);
    const p = !earned && a.progress ? a.progress(stats) : null;
    return {
      ...a,
      earned,
      progressNow: p ? Math.min(p.current, p.target) : null,
      progressTarget: p ? p.target : null,
    };
  });
}
