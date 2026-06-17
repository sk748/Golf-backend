import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import type { Role } from '../../types/api';

// Semantic colour tones reused across role + status badges.
type Tone = 'azure' | 'gold' | 'emerald' | 'red' | 'violet' | 'slate';

const tones: Record<Tone, string> = {
  azure: 'bg-azure/15 text-azure',
  gold: 'bg-gold/15 text-gold',
  emerald: 'bg-emerald-500/15 text-emerald-400',
  red: 'bg-red-500/15 text-red-400',
  violet: 'bg-violet-500/15 text-violet-400',
  slate: 'bg-slate/15 text-slate',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  // 'pill' = the small uppercase tracking-widest treatment used for role tags.
  shape?: 'pill' | 'default';
}

export function Badge({ tone = 'azure', shape = 'default', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg font-bold',
        shape === 'pill'
          ? 'text-[10px] tracking-widest uppercase px-2 py-1'
          : 'text-xs px-2 py-1',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}

// Real system has 5 roles. The design doc only specifies 4 (and calls player
// "STUDENT"); per the build contract we keep the real roles and assign player
// the azure "student" treatment, with committee given its own (violet).
const ROLE_TONE: Record<Role, Tone> = {
  admin: 'red',
  coach: 'gold',
  committee: 'violet',
  parent: 'emerald',
  player: 'azure',
};

// Compact, capitalised label for the badge pill (tight spaces). The full
// "Junior Golf Committee" name is used where space allows (dashboards, tables).
const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  coach: 'Coach',
  committee: 'Committee',
  parent: 'Parent',
  player: 'Player',
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <Badge tone={ROLE_TONE[role]} shape="pill" className={className} data-testid={`role-badge-${role}`}>
      {ROLE_LABEL[role]}
    </Badge>
  );
}
