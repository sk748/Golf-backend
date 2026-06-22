import type { LucideIcon } from 'lucide-react';
import { Lock } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { Tier } from './catalog';

// Tiered medallion: a gradient ring around a navy disc with the achievement's
// glyph. Locked achievements render faded + grayscale with a small lock.
const TIER: Record<Tier, { ring: string; glyph: string; label: string }> = {
  bronze: { ring: 'from-amber-500 to-amber-800', glyph: 'text-amber-300', label: 'Bronze' },
  silver: { ring: 'from-slate-200 to-slate-500', glyph: 'text-slate-100', label: 'Silver' },
  gold: { ring: 'from-amber-300 to-yellow-600', glyph: 'text-amber-200', label: 'Gold' },
  platinum: { ring: 'from-cyan-300 to-azure', glyph: 'text-cyan-100', label: 'Elite' },
};

const SIZES = {
  sm: { box: 'h-12 w-12', glyph: 18 },
  md: { box: 'h-16 w-16', glyph: 24 },
  lg: { box: 'h-20 w-20', glyph: 30 },
};

interface AchievementIconProps {
  icon: LucideIcon;
  tier: Tier;
  earned: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}

export function AchievementIcon({
  icon: Icon,
  tier,
  earned,
  size = 'md',
  className,
}: AchievementIconProps) {
  const t = TIER[tier];
  const s = SIZES[size];

  return (
    <div className={cn('relative inline-flex', className)} aria-hidden="true">
      <div
        className={cn(
          'rounded-full bg-gradient-to-br p-[3px] transition',
          t.ring,
          earned ? 'shadow-lg' : 'opacity-40 grayscale',
        )}
      >
        <div className={cn('flex items-center justify-center rounded-full bg-navy', s.box)}>
          <Icon size={s.glyph} className={cn(earned ? t.glyph : 'text-slate')} />
        </div>
      </div>
      {!earned && (
        <span className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-navy p-1 ring-1 ring-white/10">
          <Lock size={12} className="text-slate" />
        </span>
      )}
    </div>
  );
}
