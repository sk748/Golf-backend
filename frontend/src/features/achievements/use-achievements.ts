import { useMemo } from 'react';

import { useAuth } from '../../auth/useAuth';
import {
  useMyJunior,
  useJuniorProgress,
  useMyFeedback,
} from '../../pages/player/player-progress.queries';
import { useRounds, useHandicapHistory } from '../../pages/player/player-games.queries';
import type { Round } from '../../types/api';
import {
  evaluateAchievements,
  type EvaluatedAchievement,
  type PlayerStats,
} from './catalog';

export interface AchievementsResult {
  stats: PlayerStats | null;
  achievements: EvaluatedAchievement[];
  earnedCount: number;
  total: number;
  currentLevel: number;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  noProfile: boolean; // player has no junior profile yet
}

// Computes the player's achievements from their REAL backend data. Locked vs
// earned is derived here; nothing is fabricated.
export function useAchievements(): AchievementsResult {
  const { user } = useAuth();
  const junior = useMyJunior();
  const progress = useJuniorProgress(junior.data?.id);
  const feedback = useMyFeedback();
  const rounds = useRounds();
  const history = useHandicapHistory(user?.id ?? '');

  const stats = useMemo<PlayerStats | null>(() => {
    if (!junior.data) return null;

    // Anti-gaming: only VERIFIED rounds count toward rounds/scoring achievements.
    // Player-entered scorecards start `pending` until a coach/admin/committee
    // verifies them, so a self-logged fake score can't unlock an achievement
    // (or fire confetti / notify the parent) before sign-off. `status` is on the
    // API payload but not yet on the locked Round type — widen locally rather
    // than edit src/types/api.ts (locked-type drift, flagged for the sync pass).
    const roundList = (rounds.data ?? []).filter(
      (r) => (r as Round & { status?: string }).status === 'verified',
    );
    const grosses = roundList
      .map((r) => r.gross_score)
      .filter((g): g is number => typeof g === 'number');

    const hist = history.data ?? [];
    const handicaps = hist
      .map((r) => r.handicap_after)
      .filter((h): h is number => typeof h === 'number');

    // Latest handicap lower than the one before it.
    let improving = false;
    if (handicaps.length >= 2) {
      improving = handicaps[handicaps.length - 1] < handicaps[handicaps.length - 2];
    }

    const handicapIndex = junior.data.handicap_index ?? user?.current_hcp_index ?? null;
    const bestHandicap =
      handicaps.length > 0
        ? Math.min(...handicaps, ...(handicapIndex != null ? [handicapIndex] : []))
        : handicapIndex;

    return {
      currentLevel: junior.data.current_level,
      hasHandicap: junior.data.has_handicap || handicapIndex != null,
      handicapIndex,
      bestHandicap,
      roundsPlayed: roundList.length,
      bestGross: grosses.length > 0 ? Math.min(...grosses) : null,
      competitionsPlayed: feedback.data?.competitions_played ?? 0,
      sessionsAttended:
        progress.data?.attendance.present ?? feedback.data?.attendance_count ?? 0,
      handicapImproving: improving,
    };
  }, [junior.data, rounds.data, history.data, feedback.data, progress.data, user]);

  const achievements = useMemo(
    () => (stats ? evaluateAchievements(stats) : []),
    [stats],
  );

  const noProfile = junior.isError; // /api/juniors/me 404s when no profile

  return {
    stats,
    achievements,
    earnedCount: achievements.filter((a) => a.earned).length,
    total: achievements.length,
    currentLevel: junior.data?.current_level ?? 0,
    isLoading: junior.isLoading || rounds.isLoading || history.isLoading,
    isError: junior.isError,
    error: junior.error,
    noProfile,
  };
}
