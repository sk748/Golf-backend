import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { cn } from '../../lib/cn';

interface AttentionBandProps {
  icon: LucideIcon;
  // Small uppercase context label, e.g. "Your next milestone", "Pending approvals".
  eyebrow: string;
  headline: ReactNode;
  subline?: string;
  ctaLabel: string;
  // Where the whole band navigates. The band IS the navigation.
  to: string;
  // Optional progress meter: renders a row of `total` pill segments with the
  // first `current` filled.
  meter?: { current: number; total: number };
  testId?: string;
}

// Dashboard primitive: a full-width "what needs your attention" band that sits
// at the top of a role dashboard and links to the one place to act on it.
export function AttentionBand({
  icon: Icon,
  eyebrow,
  headline,
  subline,
  ctaLabel,
  to,
  meter,
  testId,
}: AttentionBandProps) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className={cn(
        'group block rounded-2xl border border-azure/40 bg-gradient-to-br from-azure/20 via-azure/10 to-transparent p-6 transition-all',
        'hover:-translate-y-0.5 hover:border-azure/70 hover:shadow-lg hover:shadow-azure/10',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/60',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-azure/25">
            <Icon size={24} className="text-azure" aria-hidden />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
              {eyebrow}
            </p>
            <p className="mt-1 text-xl font-black text-silver sm:text-2xl">
              {headline}
            </p>
            {subline && <p className="mt-1 text-sm text-slate">{subline}</p>}
          </div>
        </div>
        <span
          className="inline-flex items-center gap-2 rounded-xl bg-azure px-4 py-2 text-sm font-bold text-navy transition group-hover:gap-3"
        >
          {ctaLabel}
          <ArrowRight size={18} aria-hidden />
        </span>
      </div>

      {meter && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs font-bold text-slate">
            <span>
              <span className="text-silver">{meter.current}</span> of {meter.total}
            </span>
          </div>
          <div className="mt-2 flex gap-1.5">
            {Array.from({ length: meter.total }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'h-2 flex-1 rounded-full transition-colors',
                  i < meter.current ? 'bg-azure' : 'bg-white/10',
                )}
              />
            ))}
          </div>
        </div>
      )}
    </Link>
  );
}
