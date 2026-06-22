import { useAuth } from '../../auth/useAuth';
import { useIsDesktop } from '../../hooks/useBreakpoint';
import { PlayerAchievementSync } from '../../features/achievements/PlayerAchievementSync';
import { AppShellDesktop } from './AppShellDesktop';
import { AppShellMobile } from './AppShellMobile';
import { MessageToast } from './MessageToast';
import { AchievementCelebrations } from './AchievementCelebrations';

// Shell selector. Reads the device class once and mounts EXACTLY ONE device
// shell — a CSS `hidden lg:block` split would double-mount the notification
// poll and PlayerAchievementSync. Cross-cutting chrome (toasts, celebrations,
// the achievement sync) is hosted here, outside the shells, so it survives a
// breakpoint crossing without remounting.
export function AppShell() {
  const { user } = useAuth();
  const isDesktop = useIsDesktop();

  if (!user) return null; // guarded by RequireRole.

  return (
    <>
      {isDesktop ? <AppShellDesktop /> : <AppShellMobile />}

      {/* Live message banners — portals to document.body, anchored top-right. */}
      <MessageToast />
      {/* Confetti + congratulations popup when an achievement notification
          arrives (player's own or, for a parent, their child's). */}
      <AchievementCelebrations />
      {user.role === 'player' && <PlayerAchievementSync />}
    </>
  );
}
