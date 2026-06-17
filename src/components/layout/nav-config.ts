import {
  Award,
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
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  ScrollText,
  TrendingUp,
  Trophy,
  Users,
  CalendarRange,
  Target,
  Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '../../types/api';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

// A labelled cluster of related destinations. Items within a group are ordered
// by likely use-case (most-reached first); groups appear in the sidebar in
// array order, with Overview pinned first. `mobileTabRank`, when set, makes the
// group eligible for the mobile bottom tab bar — the four lowest ranks become
// the tabs (see nav-selectors.bottomGroupsFor).
export interface NavGroup {
  heading: string;
  icon: LucideIcon;
  items: NavItem[];
  mobileTabRank?: number;
}

// ---- Shared destinations (same route/label across the roles that see them) ----

const dashboard: NavItem = { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard };
// Events / calendar — shared week view; every role sees it, right after Dashboard.
const calendar: NavItem = { to: '/calendar', label: 'Calendar', icon: CalendarDays };

// Tournaments — shared read-only list/detail; every role sees it.
const tournaments: NavItem = { to: '/tournaments', label: 'Tournaments', icon: Medal };
// External results — admin/coach log off-club events (Faldo / US Kids / JGF …)
// that feed a junior's competitions-played / best-gross stats.
const externalResults: NavItem = { to: '/tournaments/external', label: 'External results', icon: Globe };
// Series / order-of-merit — all roles reach standings; admin manages.
const series: NavItem = { to: '/series', label: 'Series', icon: ListOrdered };
// Junior League — shared read-only overview (standings + fixtures); every role.
const league: NavItem = { to: '/league', label: 'Junior League', icon: Trophy };
// Junior League management — staff (admin/coach/committee) run the league
// (leagues, teams, fixtures, pairings + results). Route-gated to staff.
const leagueManage: NavItem = { to: '/league/manage', label: 'Manage league', icon: Settings };

// Rounds — players log their own (pending until verified); staff log for any
// junior and clear the verification queue.
const logRound: NavItem = { to: '/log-round', label: 'Log round', icon: Flag };
const verifyRounds: NavItem = { to: '/verify-rounds', label: 'Verify rounds', icon: ShieldCheck };

// Staff junior browser — full profiles (committee sees everything; admin and
// committee edit; coaches read).
const juniors: NavItem = { to: '/juniors', label: 'Juniors', icon: Users };

// Group training sessions — coach publishes + approves; parents/players book.
const groupSessions: NavItem = { to: '/coach-sessions', label: 'Group sessions', icon: CalendarPlus };
const bookSession: NavItem = { to: '/book-session', label: 'Book session', icon: CalendarPlus };

// Social phase — chat + club announcements, every role.
const messages: NavItem = { to: '/messages', label: 'Messages', icon: MessageSquare };
const announcements: NavItem = { to: '/announcements', label: 'Announcements', icon: Megaphone };
// Quarterly clinic timetable (group sessions by band + age group) — staff see
// the whole schedule; players/parents see bookable clinics (scoped server-side).
const timetable: NavItem = { to: '/timetable', label: 'Timetable', icon: CalendarRange };

// Communication is identical for every role, so define it once.
const communicationGroup: NavGroup = {
  heading: 'Communication',
  icon: MessageSquare,
  items: [messages, announcements],
};

// Per-role grouped nav. Group array order = sidebar order (Overview first);
// `mobileTabRank` picks the four mobile bottom tabs per role.
export const NAV_GROUPS_BY_ROLE: Record<Role, NavGroup[]> = {
  admin: [
    { heading: 'Overview', icon: LayoutDashboard, items: [dashboard, calendar] },
    {
      heading: 'People',
      icon: Users,
      mobileTabRank: 0,
      items: [
        { to: '/users', label: 'Users', icon: Users },
        juniors,
        { to: '/coach-assignments', label: 'Coaches', icon: UserCog },
        { to: '/import', label: 'Import juniors', icon: Upload },
      ],
    },
    {
      heading: 'Programme',
      icon: CalendarDays,
      mobileTabRank: 1,
      items: [
        { to: '/evaluations', label: 'Evaluations', icon: ClipboardList },
        { to: '/schedule', label: 'Schedules', icon: CalendarDays },
        groupSessions,
        timetable,
      ],
    },
    {
      heading: 'Competitions',
      icon: Medal,
      mobileTabRank: 2,
      items: [tournaments, league, leagueManage, series, logRound, verifyRounds, externalResults],
    },
    communicationGroup,
    {
      heading: 'Reference & Reporting',
      icon: Settings,
      mobileTabRank: 3,
      items: [
        { to: '/courses', label: 'Courses', icon: Map },
        { to: '/admin/benchmarks', label: 'Benchmarks', icon: Target },
        { to: '/admin/badges', label: 'Badges', icon: Award },
        { to: '/moderation', label: 'Moderation', icon: ShieldAlert },
        { to: '/audit-log', label: 'Audit log', icon: ScrollText },
      ],
    },
  ],
  coach: [
    { heading: 'Overview', icon: LayoutDashboard, mobileTabRank: 3, items: [dashboard, calendar] },
    { heading: 'People', icon: Users, mobileTabRank: 1, items: [juniors] },
    {
      heading: 'Programme',
      icon: CalendarDays,
      mobileTabRank: 0,
      items: [
        { to: '/attendance', label: 'Attendance', icon: ClipboardCheck },
        { to: '/schedule', label: 'Schedule', icon: CalendarDays },
        { to: '/evaluations/new', label: 'Evaluations', icon: ClipboardList },
        groupSessions,
        timetable,
      ],
    },
    {
      heading: 'Competitions',
      icon: Medal,
      mobileTabRank: 2,
      items: [tournaments, league, leagueManage, series, logRound, verifyRounds, externalResults],
    },
    communicationGroup,
  ],
  committee: [
    { heading: 'Overview', icon: LayoutDashboard, mobileTabRank: 3, items: [dashboard, calendar] },
    {
      heading: 'People',
      icon: Users,
      mobileTabRank: 1,
      items: [juniors, { to: '/import', label: 'Import juniors', icon: Upload }],
    },
    {
      heading: 'Programme',
      icon: CalendarDays,
      mobileTabRank: 0,
      items: [
        { to: '/evaluations', label: 'Evaluations', icon: ClipboardList },
        { to: '/schedule', label: 'Schedules', icon: CalendarDays },
        timetable,
      ],
    },
    {
      heading: 'Competitions',
      icon: Medal,
      mobileTabRank: 2,
      items: [tournaments, league, leagueManage, series, verifyRounds],
    },
    communicationGroup,
  ],
  parent: [
    { heading: 'Overview', icon: LayoutDashboard, mobileTabRank: 1, items: [dashboard, calendar] },
    {
      heading: 'My family',
      icon: Users,
      mobileTabRank: 0,
      items: [
        { to: '/my-child', label: 'My child', icon: TrendingUp },
        { to: '/sessions', label: 'Coaching', icon: CalendarPlus },
      ],
    },
    { heading: 'Programme', icon: CalendarDays, mobileTabRank: 3, items: [timetable] },
    { heading: 'Competitions', icon: Medal, mobileTabRank: 2, items: [tournaments, league, series] },
    communicationGroup,
  ],
  player: [
    { heading: 'Overview', icon: LayoutDashboard, mobileTabRank: 1, items: [dashboard, calendar] },
    {
      heading: 'My golf',
      icon: Flag,
      mobileTabRank: 0,
      items: [
        { to: '/progress', label: 'Progress', icon: BarChart3 },
        { to: '/achievements', label: 'Achievements', icon: Trophy },
        logRound,
      ],
    },
    {
      heading: 'Programme',
      icon: CalendarDays,
      mobileTabRank: 2,
      items: [bookSession, timetable],
    },
    { heading: 'Competitions', icon: Medal, mobileTabRank: 3, items: [tournaments, league, series] },
    communicationGroup,
  ],
};

// Flatten a role's groups into a single ordered NavItem list (active-route
// resolution, "all destinations").
export function flattenNav(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((g) => g.items);
}
