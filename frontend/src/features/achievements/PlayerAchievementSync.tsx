import { useEffect, useRef } from 'react';

import { useAchievements } from './use-achievements';
import { useSyncAchievements } from './achievements.queries';

// Mounted once for the signed-in PLAYER (renders nothing). Evaluates the
// catalog predicates from the player's real stats and reports the EARNED keys
// to the backend whenever that set changes — which records new unlocks and
// (after the first baseline) raises the "achievement" notifications that drive
// the confetti + congratulations. Only the player evaluates their own stats, so
// this is the single source that tells the backend about catalog unlocks.
//
// Not mounted for other roles: it calls player-only endpoints (/api/juniors/me…).
export function PlayerAchievementSync() {
  const { achievements } = useAchievements();
  const sync = useSyncAchievements();
  const lastSig = useRef<string | null>(null);

  const earned = achievements.filter((a) => a.earned);
  const sig = earned
    .map((a) => a.id)
    .sort()
    .join(',');

  useEffect(() => {
    if (earned.length === 0) return; // stats not loaded yet / nothing earned
    if (sig === lastSig.current) return; // unchanged since last sync
    lastSig.current = sig;
    sync.mutate(earned.map((a) => ({ key: a.id, title: a.title })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return null;
}
