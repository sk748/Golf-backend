import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

import { cn } from '../../lib/cn';

type FeatureTone = 'default' | 'azure' | 'gold';

interface FeatureCardProps {
  // The feature area this card represents (e.g. "Evaluations", "My juniors").
  label: string;
  icon: LucideIcon;
  // Hero figure for the area (e.g. a handicap index or a count). Optional —
  // some areas are headline-only.
  stat?: ReactNode;
  // One-line status that doubles as a call to action ("3 awaiting your signature").
  headline: string;
  // Where the whole card navigates. The card IS the navigation.
  to: string;
  tone?: FeatureTone;
  testId?: string;
}

const toneStat: Record<FeatureTone, string> = {
  default: 'text-silver',
  azure: 'text-azure',
  gold: 'text-gold',
};

// Dashboard primitive: an at-a-glance stat + headline for one feature area that
// is itself a navigation target. Clicking anywhere routes to the feature, so the
// dashboard works as a navigation hub alongside the nav bars.
export function FeatureCard({
  label,
  icon: Icon,
  stat,
  headline,
  to,
  tone = 'default',
  testId,
}: FeatureCardProps) {
  return (
    <Link
      to={to}
      data-testid={testId ?? `feature-card-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className="glass-light group flex flex-col rounded-2xl p-5 transition-all hover:bg-white/5 hover:ring-1 hover:ring-azure/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-azure/15 text-azure">
          <Icon size={18} aria-hidden />
        </span>
        <span className="text-sm font-semibold text-silver">{label}</span>
        <ArrowUpRight
          size={16}
          className="ml-auto text-slate transition-colors group-hover:text-azure"
          aria-hidden
        />
      </div>
      {stat !== undefined && (
        <p className={cn('mt-3 text-3xl font-black tabular-nums', toneStat[tone])}>{stat}</p>
      )}
      <p className={cn('text-sm text-slate', stat !== undefined ? 'mt-1' : 'mt-3')}>{headline}</p>
    </Link>
  );
}
