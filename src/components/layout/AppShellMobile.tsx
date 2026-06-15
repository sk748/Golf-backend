import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, Plus, X } from 'lucide-react';

import { useAuth } from '../../auth/useAuth';
import { cn } from '../../lib/cn';
import { Avatar } from '../ui/Avatar';
import { NotificationBell } from './NotificationBell';
import { useNotificationsSummary } from './notifications.queries';
import { NAV_GROUPS_BY_ROLE } from './nav-config';
import { activeItem, bottomGroupsFor, quickCreateFor, type NavGroup } from './nav-selectors';

// Mobile chrome: a top bar + a group-tab bottom bar with a pop-up subgroup
// mini-bar, a center "+" quick-create launcher, and a floating chat bubble.
// Mounts only below the `lg` breakpoint (the selector decides).
export function AppShellMobile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: notif } = useNotificationsSummary();
  // Which group's mini-bar is open (multi-item groups only), and whether the
  // "+" launcher is open. At most one is open at a time.
  const [openGroup, setOpenGroup] = useState<NavGroup | null>(null);
  const [launcherOpen, setLauncherOpen] = useState(false);

  if (!user) return null; // guarded by RequireRole.

  const groups = NAV_GROUPS_BY_ROLE[user.role];
  const tabs = bottomGroupsFor(user.role);
  const actions = quickCreateFor(user.role);
  const active = activeItem(groups, location.pathname);
  const title = active?.label ?? '';
  const activeGroup = active ? groups.find((g) => g.items.some((i) => i.to === active.to)) : undefined;
  const unread = notif?.unread_messages ?? 0;

  function closeOverlays() {
    setOpenGroup(null);
    setLauncherOpen(false);
  }

  function onTabTap(group: NavGroup) {
    setLauncherOpen(false);
    if (group.items.length === 1) {
      setOpenGroup(null);
      navigate(group.items[0].to);
    } else {
      setOpenGroup((cur) => (cur?.heading === group.heading ? null : group));
    }
  }

  const overlayOpen = openGroup !== null || launcherOpen;

  return (
    <div className="min-h-screen bg-navy">
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-navy/80 px-4 py-3 backdrop-blur">
        <NavLink to="/dashboard" aria-label="Karen Country Club — dashboard">
          <img src="/kcc-logo.png" alt="Karen Country Club" className="h-8 w-auto" />
        </NavLink>
        <h1 className="truncate text-base font-bold text-silver">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <NavLink to="/profile" data-testid="nav-profile" aria-label="My profile">
            <Avatar name={user.full_name || user.email} />
          </NavLink>
          <NotificationBell />
        </div>
      </header>

      <main className="px-3 pb-28 pt-3">
        <Outlet />
      </main>

      {/* Transparent click-catcher — closes the mini-bar / launcher. Never dims
          the background (house rule). */}
      {overlayOpen && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={closeOverlays}
          className="fixed inset-0 z-30 cursor-default"
        />
      )}

      {/* "+" quick-create bubbles — stacked above the center button. */}
      {launcherOpen && actions.length > 0 && (
        <div className="fixed inset-x-0 bottom-24 z-40 flex flex-col items-center gap-2">
          {actions.map((a, idx) => (
            <NavLink
              key={a.label}
              to={a.to}
              onClick={closeOverlays}
              data-testid={`quick-create-${a.label.toLowerCase().replace(/\s+/g, '-')}`}
              style={{ animationDelay: `${idx * 40}ms` }}
              className="flex animate-fade-in-up items-center gap-2 rounded-full border border-white/10 bg-navy/95 py-2 pl-3 pr-4 text-sm font-semibold text-silver shadow-xl backdrop-blur"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-azure/20 text-azure">
                <a.icon size={16} />
              </span>
              {a.label}
            </NavLink>
          ))}
        </div>
      )}

      {/* Subgroup mini-bar — pops directly above the bottom bar. */}
      {openGroup && (
        <div
          data-testid="subgroup-bar"
          className="fixed inset-x-0 bottom-[4.5rem] z-40 mx-3 animate-fade-in-up rounded-2xl border border-white/10 bg-navy/95 p-2 shadow-2xl backdrop-blur"
        >
          <div className="flex items-center gap-2 overflow-x-auto">
            {openGroup.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeOverlays}
                data-testid={`subnav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors',
                    isActive ? 'bg-azure/15 text-azure' : 'text-slate hover:text-silver',
                  )
                }
              >
                <item.icon size={20} />
                <span className="max-w-16 truncate">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* Floating chat bubble — Messages lives here to save a tab slot. */}
      <NavLink
        to="/messages"
        aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
        data-testid="floating-chat"
        className="fixed bottom-24 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-azure text-white shadow-xl shadow-azure/30"
      >
        <MessageSquare size={20} />
        {unread > 0 && (
          <span
            data-testid="floating-chat-unread"
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </NavLink>

      {/* Bottom bar: 4 group tabs + center "+". */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-white/10 bg-navy/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {tabs.slice(0, 2).map((group) => (
          <GroupTab
            key={group.heading}
            group={group}
            active={activeGroup?.heading === group.heading}
            open={openGroup?.heading === group.heading}
            onTap={onTabTap}
          />
        ))}

        {/* Center "+" launcher */}
        <button
          type="button"
          onClick={() => {
            setOpenGroup(null);
            setLauncherOpen((v) => !v);
          }}
          aria-label={launcherOpen ? 'Close quick create' : 'Quick create'}
          data-testid="quick-create-trigger"
          className="relative -top-4 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-azure text-white shadow-xl shadow-azure/30 transition-transform active:scale-95"
        >
          <span className={cn('transition-transform', launcherOpen && 'rotate-45')}>
            {launcherOpen ? <X size={24} /> : <Plus size={24} />}
          </span>
        </button>

        {tabs.slice(2, 4).map((group) => (
          <GroupTab
            key={group.heading}
            group={group}
            active={activeGroup?.heading === group.heading}
            open={openGroup?.heading === group.heading}
            onTap={onTabTap}
          />
        ))}
      </nav>
    </div>
  );
}

function GroupTab({
  group,
  active,
  open,
  onTap,
}: {
  group: NavGroup;
  active: boolean;
  open: boolean;
  onTap: (g: NavGroup) => void;
}) {
  const Icon = group.icon;
  return (
    <button
      type="button"
      onClick={() => onTap(group)}
      data-testid={`tab-${group.heading.toLowerCase().replace(/\s+/g, '-')}`}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors',
        active || open ? 'text-azure' : 'text-slate',
      )}
    >
      <Icon size={22} />
      <span className="max-w-16 truncate">{group.heading}</span>
    </button>
  );
}
