import { LayoutDashboard, Map, ScrollText, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '../../types/api';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

// Per-role sidebar. Each role's nav is intentionally distinct and grows as that
// role's pages are built. Only link to routes that actually exist.
const dashboard: NavItem = {
  to: '/dashboard',
  label: 'Dashboard',
  icon: LayoutDashboard,
};

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: [
    dashboard,
    { to: '/users', label: 'Users', icon: Users },
    { to: '/audit-log', label: 'Audit log', icon: ScrollText },
    { to: '/courses', label: 'Courses', icon: Map },
  ],
  coach: [dashboard],
  committee: [dashboard],
  parent: [dashboard],
  player: [dashboard],
};
