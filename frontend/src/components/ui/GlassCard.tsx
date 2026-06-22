import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  // 'light' is the secondary/nested treatment.
  tone?: 'default' | 'light';
}

export function GlassCard({ tone = 'default', className, ...rest }: GlassCardProps) {
  return (
    <div
      className={cn(
        tone === 'light' ? 'glass-light' : 'glass',
        'rounded-2xl',
        className,
      )}
      {...rest}
    />
  );
}
