// Server-side record of a player's catalog-achievement unlocks. The predicates
// live on the frontend (use-achievements.ts), so the app REPORTS the earned
// keys and the backend records the first time each is seen — giving a real
// unlocked_at (the "most recent" glow) and the moment to congratulate the
// player + notify their parent. All I/O via the shared api client (CLAUDE.md §2).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';

export interface AchievementUnlock {
  key: string;
  unlocked_at: string | null;
}

export interface SyncAchievementsResult {
  newly_unlocked: string[];
  unlocked: AchievementUnlock[];
}

// What the player's app reports as currently EARNED (key + display title so the
// backend can put the title in the parent's notification without the catalog).
export interface EarnedAchievementInput {
  key: string;
  title: string;
}

// GET /api/juniors/me/achievements — recorded unlocks (oldest→newest). Player
// only; gated by `enabled` so non-players never request it.
export function useAchievementUnlocks(
  enabled = true,
): UseQueryResult<AchievementUnlock[]> {
  return useQuery({
    queryKey: ['achievement-unlocks', 'me'],
    queryFn: async () =>
      (
        await api.get<{ unlocked: AchievementUnlock[] }>(
          '/api/juniors/me/achievements',
        )
      ).unlocked,
    enabled,
    staleTime: 60_000,
  });
}

// POST /api/juniors/me/achievements/sync — record newly-earned keys. Invalidates
// the bell (new self/parent "achievement" notifications drive the celebration)
// and the unlocks query (for the glow).
export function useSyncAchievements(): UseMutationResult<
  SyncAchievementsResult,
  Error,
  EarnedAchievementInput[]
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (achievements: EarnedAchievementInput[]) =>
      api.post<SyncAchievementsResult>('/api/juniors/me/achievements/sync', {
        achievements,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({
        queryKey: ['achievement-unlocks', 'me'],
      });
    },
  });
}
