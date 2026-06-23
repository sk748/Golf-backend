import { FeaturedAwardChip } from '../../features/achievements/FeaturedAwardChip';
import { useMyFeaturedAward } from '../../pages/player/featured-award.queries';

// The player's chosen "show-off" award, surfaced in the top bar next to the
// page title — the same chip they carry next to their name in chat, so their
// badge follows them around the app. Renders nothing until the player has
// featured one (or while it resolves). Player-only: callers gate on role, and
// it reads the player-scoped junior profile, so only mount it for players.
//
// The tooltip card opens DOWNWARD here (`placement="bottom"`) so it isn't
// clipped off the top of the viewport from the sticky header.
export function HeaderFeaturedAward() {
  const award = useMyFeaturedAward();
  if (!award) return null;

  return (
    <span data-testid="header-featured-award" className="min-w-0 shrink">
      <FeaturedAwardChip award={award} placement="bottom" />
    </span>
  );
}
