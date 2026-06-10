import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  Map,
  Medal,
  Globe,
  ListOrdered,
  UserCog,
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

// External results — admin/coach log off-club events (Faldo / US Kids / JGF …)
// that feed a junior's competitions-played / best-gross stats.
const externalResults: NavItem = {
  to: '/tournaments/external',
  label: 'External results',
  icon: Globe,
};

// Series / order-of-merit — admin manages; all roles can reach standings from a
// tournament that belongs to a series.
const series: NavItem = {
  to: '/series',
  label: 'Series',
  icon: ListOrdered,
};

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: [
    dashboard,
    { to: '/users', label: 'Users', icon: Users },
    { to: '/coach-assignments', label: 'Coaches', icon: UserCog },
    { to: '/audit-log', label: 'Audit log', icon: ScrollText },
    { to: '/courses', label: 'Courses', icon: Map },
    tournaments,
    series,
    externalResults,
  ],
  coach: [
    dashboard,
    { to: '/schedule', label: 'Schedule', icon: CalendarDays },
    { to: '/attendance', label: 'Attendance', icon: ClipboardCheck },
    { to: '/evaluations/new', label: 'Evaluations', icon: ClipboardList },
    tournaments,
    externalResults,
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
