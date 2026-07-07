// The "featured award" a player shows off next to their name in chat. A player
// may feature ONE thing: an earned achievement (by its catalog key) or a
// staff-issued badge (by id) — or clear it. All server reads/writes go through
// the shared api client; the mutation invalidates the junior query so both the
// Achievements picker and the chat chip reflect the change.
//
// NOTE: the locked JuniorProfile type (src/types/api.ts) does not yet carry the
// featured_* fields the backend now returns. Rather than loosen the locked type
// we read them through a narrow, honest accessor here.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api';
import type { JuniorProfile } from '../../types/api';
import { useBadges } from '../../features/badges/badges.queries';
import { useMyJunior } from './player-progress.queries';
import type { FeaturedAward } from '../messages/messages.queries';

// The featured-award fields the backend adds to the junior profile + the PUT
// response. Kept local until the locked types catch up.
export interface FeaturedAwardFields {
  featured_badge_id: number | null;
  featured_achievement_key: string | null;
}

// Read the featured-award fields off a junior profile without widening the
// locked type. Returns nulls when the profile is absent.
export function featuredAwardOf(
  junior: JuniorProfile | undefined,
): FeaturedAwardFields {
  const j = junior as (JuniorProfile & Partial<FeaturedAwardFields>) | undefined;
  return {
    featured_badge_id: j?.featured_badge_id ?? null,
    featured_achievement_key: j?.featured_achievement_key ?? null,
  };
}

// Resolve the CURRENT player's featured award into the tagged union the chip
// renders, or null when nothing is featured (or while the data resolves). A
// featured achievement carries only its key; a featured badge is joined to the
// catalog for its name/description (so the same chip works in chat and chrome).
// Player-only: it reads the player-scoped junior profile, so only mount the
// caller for players.
export function useMyFeaturedAward(): FeaturedAward | null {
  const junior = useMyJunior();
  const badges = useBadges();
  const { featured_badge_id, featured_achievement_key } = featuredAwardOf(
    junior.data,
  );

  if (featured_achievement_key) {
    return { source: 'achievement', key: featured_achievement_key };
  }
  if (featured_badge_id != null) {
    const def = badges.data?.find((b) => b.id === featured_badge_id);
    // Catalog not loaded yet, or the badge was retired — render nothing.
    if (!def) return null;
    return {
      source: 'badge',
      id: def.id,
      name: def.name,
      description: def.description ?? '',
    };
  }
  return null;
}

// PUT /api/juniors/:id/featured-badge — body is exactly ONE of:
//   { achievement_key } | { achievement_key: null }
//   { badge_id }        | { badge_id: null }
// The player may only set their OWN (junior.user_id === them — enforced server
// side). Returns { junior_id, featured_badge_id, featured_achievement_key }.
export type FeaturedAwardBody =
  | { achievement_key: string | null }
  | { badge_id: number | null };

interface FeaturedAwardResponse extends FeaturedAwardFields {
  junior_id: number;
}

// `juniorId` is the player's own junior profile id (from useMyJunior().data.id).
export function useSetFeaturedAward(): UseMutationResult<
  FeaturedAwardResponse,
  Error,
  { juniorId: number; body: FeaturedAwardBody }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ juniorId, body }) =>
      api.put<FeaturedAwardResponse>(
        `/api/juniors/${juniorId}/featured-badge`,
        body,
      ),
    onSuccess: () => {
      // Re-pull the profile so the picker's active state AND the chat chip (the
      // sender's featured_badge) both reflect the new choice.
      void qc.invalidateQueries({ queryKey: ['juniors', 'me'] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
