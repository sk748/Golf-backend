import {
  CalendarPlus,
  ClipboardCheck,
  FilePlus2,
  Flag,
  Megaphone,
  Trophy,
  Upload,
  UserPlus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { Role } from '../../types/api';
import { NAV_GROUPS_BY_ROLE, flattenNav, type NavGroup, type NavItem } from './nav-config';

export { flattenNav };
export type { NavGroup, NavItem };

// Resolve the nav item that owns the current path, longest-match-wins so
// `/tournaments/external` highlights External results, not Tournaments. Matching
// on a `/` boundary keeps `/series` from claiming `/series-archive`-style paths.
export function activeItem(groups: NavGroup[], pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  let bestLen = -1;
  for (const item of flattenNav(groups)) {
    const matches = pathname === item.to || pathname.startsWith(item.to + '/');
    if (matches && item.to.length > bestLen) {
      best = item;
      bestLen = item.to.length;
    }
  }
  return best;
}

// The four mobile bottom-tab groups for a role: the lowest `mobileTabRank`s.
// Tapping a multi-item group pops its items in a secondary mini-bar; a
// single-item group navigates directly.
export function bottomGroupsFor(role: Role): NavGroup[] {
  return NAV_GROUPS_BY_ROLE[role]
    .filter((g) => g.mobileTabRank !== undefined)
    .slice()
    .sort((a, b) => (a.mobileTabRank ?? 0) - (b.mobileTabRank ?? 0))
    .slice(0, 4);
}

// A thing this role can *initiate* — surfaced as the mobile "+" launcher bubbles
// and the desktop "New" menu. Only routes the role's guard allows appear here.
export interface QuickCreateAction {
  to: string;
  label: string;
  icon: LucideIcon;
}

const QUICK_CREATE_BY_ROLE: Record<Role, QuickCreateAction[]> = {
  admin: [
    { to: '/users', label: 'Create user', icon: UserPlus },
    { to: '/calendar', label: 'New event', icon: CalendarPlus },
    { to: '/tournaments/new', label: 'Create tournament', icon: Trophy },
    { to: '/announcements', label: 'New announcement', icon: Megaphone },
    { to: '/import', label: 'Import juniors', icon: Upload },
  ],
  coach: [
    { to: '/attendance', label: 'Take attendance', icon: ClipboardCheck },
    { to: '/calendar', label: 'New event', icon: CalendarPlus },
    { to: '/log-round', label: 'Log round', icon: Flag },
    { to: '/coach-sessions', label: 'New session', icon: CalendarPlus },
    { to: '/evaluations/new', label: 'New evaluation', icon: FilePlus2 },
    { to: '/tournaments/new', label: 'Create tournament', icon: Trophy },
  ],
  committee: [
    { to: '/calendar', label: 'New event', icon: CalendarPlus },
    { to: '/import', label: 'Import juniors', icon: Upload },
  ],
  parent: [
    { to: '/sessions', label: 'Request session', icon: CalendarPlus },
    { to: '/tournaments', label: 'Register for tournament', icon: Trophy },
  ],
  player: [
    { to: '/log-round', label: 'New score', icon: Flag },
    { to: '/book-session', label: 'Book session', icon: CalendarPlus },
  ],
};

export function quickCreateFor(role: Role): QuickCreateAction[] {
  return QUICK_CREATE_BY_ROLE[role];
}
