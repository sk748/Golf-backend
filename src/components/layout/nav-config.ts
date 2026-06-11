import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  ClipboardList,
  Flag,
  LayoutDashboard,
  Map,
  Medal,
  Globe,
  ListOrdered,
  Megaphone,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
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

// Rounds — players log their own (pending until verified); staff log for any
// junior and clear the verification queue.
const logRound: NavItem = {
  to: '/log-round',
  label: 'Log round',
  icon: Flag,
};
const verifyRounds: NavItem = {
  to: '/verify-rounds',
  label: 'Verify rounds',
  icon: ShieldCheck,
};

// Staff junior browser — full profiles (committee sees everything; admin and
// committee edit; coaches read).
const juniors: NavItem = {
  to: '/juniors',
  label: 'Juniors',
  icon: Users,
};

// Group training sessions — coach publishes + approves; parents/players book.
const groupSessions: NavItem = {
  to: '/coach-sessions',
  label: 'Group sessions',
  icon: CalendarPlus,
};
const bookSession: NavItem = {
  to: '/book-session',
  label: 'Book session',
  icon: CalendarPlus,
};

// Social phase — chat + club announcements, every role.
const messages: NavItem = {
  to: '/messages',
  label: 'Messages',
  icon: MessageSquare,
};
const announcements: NavItem = {
  to: '/announcements',
  label: 'Announcements',
  icon: Megaphone,
};

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: [
    dashboard,
    messages,
    announcements,
    { to: '/users', label: 'Users', icon: Users },
    juniors,
    { to: '/coach-assignments', label: 'Coaches', icon: UserCog },
    { to: '/evaluations', label: 'Evaluations', icon: ClipboardList },
    { to: '/schedule', label: 'Schedules', icon: CalendarDays },
    { to: '/moderation', label: 'Moderation', icon: ShieldAlert },
    { to: '/audit-log', label: 'Audit log', icon: ScrollText },
    { to: '/courses', label: 'Courses', icon: Map },
    groupSessions,
    logRound,
    verifyRounds,
    tournaments,
    series,
    externalResults,
  ],
  coach: [
    dashboard,
    messages,
    announcements,
    juniors,
    { to: '/schedule', label: 'Schedule', icon: CalendarDays },
    { to: '/attendance', label: 'Attendance', icon: ClipboardCheck },
    { to: '/evaluations/new', label: 'Evaluations', icon: ClipboardList },
    groupSessions,
    logRound,
    verifyRounds,
    tournaments,
    series,
    externalResults,
  ],
  committee: [
    dashboard,
    messages,
    announcements,
    juniors,
    { to: '/evaluations', label: 'Evaluations', icon: ClipboardList },
    { to: '/schedule', label: 'Schedules', icon: CalendarDays },
    verifyRounds,
    tournaments,
    series,
  ],
  parent: [
    dashboard,
    messages,
    announcements,
    { to: '/my-child', label: 'My child', icon: TrendingUp },
    { to: '/sessions', label: 'Coaching', icon: CalendarPlus },
    tournaments,
    series,
  ],
  player: [
    dashboard,
    messages,
    announcements,
    { to: '/progress', label: 'Progress', icon: BarChart3 },
    { to: '/achievements', label: 'Achievements', icon: Trophy },
    logRound,
    bookSession,
    tournaments,
    series,
  ],
};
