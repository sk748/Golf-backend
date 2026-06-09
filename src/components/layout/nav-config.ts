import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  Map,
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

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: [
    dashboard,
    { to: '/users', label: 'Users', icon: Users },
    { to: '/audit-log', label: 'Audit log', icon: ScrollText },
    { to: '/courses', label: 'Courses', icon: Map },
  ],
  coach: [
    dashboard,
    { to: '/schedule', label: 'Schedule', icon: CalendarDays },
    { to: '/attendance', label: 'Attendance', icon: ClipboardCheck },
  ],
  committee: [
    dashboard,
    { to: '/evaluations', label: 'Evaluations', icon: ClipboardList },
  ],
  parent: [
    dashboard,
    { to: '/my-child', label: 'My child', icon: TrendingUp },
    { to: '/sessions', label: 'Coaching', icon: CalendarPlus },
  ],
  player: [
    dashboard,
    { to: '/progress', label: 'Progress', icon: BarChart3 },
    { to: '/achievements', label: 'Achievements', icon: Trophy },
  ],
};
