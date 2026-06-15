import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LogOut, Plus } from 'lucide-react';

import { useAuth } from '../../auth/useAuth';
import { cn } from '../../lib/cn';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { RoleBadge } from '../ui/Badge';
import { NAV_GROUPS_BY_ROLE } from './nav-config';
import { activeItem, quickCreateFor } from './nav-selectors';
import { NotificationBell } from './NotificationBell';
import { useNotificationsSummary } from './notifications.queries';

const COLLAPSE_KEY = 'kcc.sidebar.collapsed';

function UnreadDot() {
  const { data } = useNotificationsSummary();
  const unread = data?.unread_messages ?? 0;
  if (unread === 0) return null;
  return (
    <span
      data-testid="nav-messages-unread"
      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white"
    >
      {unread > 99 ? '99+' : unread}
    </span>
  );
}

// Desktop "New" menu — the quick-create launcher's counterpart. Transparent
// click-catcher (never dims the background, per the house rule).
function NewMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const actions = user ? quickCreateFor(user.role) : [];
  if (!user || actions.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="new-menu-trigger"
        className="flex items-center gap-2 rounded-xl bg-azure px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-azure/20 transition-colors hover:bg-azure/90"
      >
        <Plus size={16} /> New
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-2 w-56 origin-top-right animate-fade-in rounded-2xl border border-white/10 bg-navy/95 p-2 shadow-2xl backdrop-blur">
            {actions.map((a) => (
              <NavLink
                key={a.label}
                to={a.to}
                onClick={() => setOpen(false)}
                data-testid={`new-action-${a.label.toLowerCase().replace(/\s+/g, '-')}`}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate transition-colors hover:bg-white/5 hover:text-silver"
              >
                <a.icon size={18} className="text-azure" />
                {a.label}
              </NavLink>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Desktop chrome: a collapsible, grouped sidebar + a sticky top bar. Mounts only
// at the `lg` breakpoint (the selector decides), so it never coexists with the
// mobile shell.
export function AppShellDesktop() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem(COLLAPSE_KEY) === '1',
  );

  if (!user) return null; // guarded by RequireRole.

  const groups = NAV_GROUPS_BY_ROLE[user.role];
  const title = activeItem(groups, location.pathname)?.label ?? '';

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  function onLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-navy">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex flex-col border-r border-white/5 bg-navy/80 backdrop-blur transition-[width] duration-200',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <div className={cn('flex items-center py-5', collapsed ? 'justify-center px-2' : 'justify-between px-5')}>
          <NavLink to="/dashboard" aria-label="Karen Country Club — dashboard">
            <img
              src="/kcc-logo.png"
              alt="Karen Country Club"
              className={cn('w-auto', collapsed ? 'h-8' : 'h-10')}
            />
          </NavLink>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              data-testid="sidebar-collapse"
              className="rounded-lg p-1.5 text-slate hover:bg-white/5 hover:text-silver"
            >
              <ChevronLeft size={18} />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
            data-testid="sidebar-expand"
            className="mx-auto mb-2 rounded-lg p-1.5 text-slate hover:bg-white/5 hover:text-silver"
          >
            <ChevronRight size={18} />
          </button>
        )}

        {/* min-h-0 lets the nav scroll inside the flex column instead of pushing
            the sign-out block off-screen on long navs. */}
        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-2">
          {groups.map((group) => (
            <div key={group.heading} className="space-y-1">
              {collapsed ? (
                <div className="my-1 border-t border-white/5" aria-hidden="true" />
              ) : (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate/70">
                  {group.heading}
                </p>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl text-sm font-medium transition-all',
                      collapsed ? 'justify-center px-2 py-3' : 'px-4 py-2.5',
                      isActive
                        ? 'border border-azure/20 bg-azure/15 text-azure'
                        : 'text-slate hover:bg-white/5 hover:text-silver',
                    )
                  }
                >
                  <item.icon size={18} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {!collapsed && item.to === '/messages' && <UnreadDot />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-white/5 p-3">
          {collapsed ? (
            <NavLink
              to="/profile"
              title="My profile"
              data-testid="nav-profile"
              className="mb-2 flex justify-center rounded-xl py-1 transition-colors hover:bg-white/5"
            >
              <Avatar name={user.full_name || user.email} />
            </NavLink>
          ) : (
            <NavLink
              to="/profile"
              data-testid="nav-profile"
              className="mb-2 flex items-center gap-3 rounded-xl px-1 py-1 transition-colors hover:bg-white/5"
            >
              <Avatar name={user.full_name || user.email} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-silver">
                  {user.full_name || user.email}
                </p>
                <RoleBadge role={user.role} />
              </div>
            </NavLink>
          )}
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            onClick={onLogout}
            data-testid="sign-out-btn"
            title={collapsed ? 'Sign out' : undefined}
          >
            <LogOut size={16} /> {!collapsed && 'Sign out'}
          </Button>
        </div>
      </aside>

      <div className={cn('transition-[margin] duration-200', collapsed ? 'ml-16' : 'ml-64')}>
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-navy/80 px-6 py-3 backdrop-blur">
          <h1 className="text-lg font-bold text-silver">{title}</h1>
          <div className="ml-auto flex items-center gap-3">
            <NewMenu />
            <NotificationBell />
          </div>
        </header>

        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
