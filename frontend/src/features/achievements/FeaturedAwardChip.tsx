// The small gold award chip a player shows off next to their name in chat.
// Players are the only senders who carry a featured award. Hovering (mouse),
// focusing (keyboard), or tapping (touch) reveals a quiet card with the award's
// title + description. Kept subtle so it never bloats the message bubble.

import { useState } from 'react';
import { Award } from 'lucide-react';

import { cn } from '../../lib/cn';
import { achievementById } from './catalog';
import type { FeaturedAward } from '../../pages/messages/messages.queries';

interface ResolvedAward {
  title: string;
  description: string;
  Icon: typeof Award;
}

// Resolve a tagged-union award into its display title/description/icon.
// Achievements are looked up from the catalog by key; staff badges carry their
// own name + description on the wire. Returns null for an unknown achievement
// key (e.g. a retired catalog id) so the chip simply doesn't render.
function resolveAward(award: FeaturedAward): ResolvedAward | null {
  if (award.source === 'achievement') {
    const def = achievementById(award.key);
    if (!def) return null;
    return { title: def.title, description: def.description, Icon: def.icon };
  }
  return { title: award.name, description: award.description, Icon: Award };
}

export function FeaturedAwardChip({
  award,
  className,
}: {
  award: FeaturedAward;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const resolved = resolveAward(award);
  if (!resolved) return null;
  const { title, description, Icon } = resolved;

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      data-testid="featured-award-chip"
    >
      <button
        type="button"
        // Tap-to-toggle on touch; focus opens the card for keyboard users.
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={`Award: ${title}`}
        className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-gold transition-colors hover:bg-gold/25 focus:outline-none focus-visible:ring-1 focus-visible:ring-gold"
      >
        <Icon size={11} aria-hidden />
        <span className="max-w-[8rem] truncate">{title}</span>
      </button>

      {open ? (
        <span
          role="tooltip"
          className="absolute bottom-full left-0 z-20 mb-1 w-52 rounded-xl border border-gold/30 bg-navy p-3 text-left shadow-xl"
          data-testid="featured-award-card"
        >
          <span className="flex items-center gap-1.5 text-xs font-black text-gold">
            <Icon size={13} aria-hidden />
            {title}
          </span>
          <span className="mt-1 block text-[11px] leading-snug text-slate">
            {description}
          </span>
        </span>
      ) : null}
    </span>
  );
}
