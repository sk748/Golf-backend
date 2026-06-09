import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  Map,
  Medal,
  ScrollText,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
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

// Tournaments — shared read-only list/detail; every role sees it.
const tournaments: NavItem = {
  to: '/tournaments',
  label: 'Tournaments',
  icon: Medal,
};

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: [
    dashboard,
    { to: '/users', label: 'Users', icon: Users },
    { to: '/audit-log', label: 'Audit log', icon: ScrollText },
    { to: '/courses', label: 'Courses', icon: Map },
    tournaments,
  ],
  coach: [
    dashboard,
    { to: '/schedule', label: 'Schedule', icon: CalendarDays },
    { to: '/attendance', label: 'Attendance', icon: ClipboardCheck },
    tournaments,
  ],
  committee: [
    dashboard,
    { to: '/evaluations', label: 'Evaluations', icon: ClipboardList },
    tournaments,
  ],
  parent: [
    dashboard,
    { to: '/my-child', label: 'My child', icon: TrendingUp },
    { to: '/sessions', label: 'Coaching', icon: CalendarPlus },
    tournaments,
  ],
  player: [
    dashboard,
    { to: '/progress', label: 'Progress', icon: BarChart3 },
    { to: '/achievements', label: 'Achievements', icon: Trophy },
    tournaments,
  ],
};
