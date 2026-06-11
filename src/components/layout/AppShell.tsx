import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';

import { useAuth } from '../../auth/useAuth';
import { cn } from '../../lib/cn';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { RoleBadge } from '../ui/Badge';
import { NAV_BY_ROLE } from './nav-config';
import { NotificationBell } from './NotificationBell';
import { useNotificationsSummary } from './notifications.queries';

// Unread-chat count on the Messages nav item. Its own component so the
// notifications poll only runs once the shell is rendering for a signed-in
// user (the query key is shared with the bell, so TanStack dedupes the fetch).
function MessagesUnreadBadge() {
  const { data } = useNotificationsSummary();
  const unread = data?.unread_messages ?? 0;
  if (unread === 0) return null;
  return (
    <span
      data-testid="nav-messages-unread"
      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-azure px-1.5 text-xs font-bold text-navy"
    >
      {unread > 99 ? '99+' : unread}
    </span>
  );
}

// App chrome for signed-in users: per-role sidebar + sticky top bar, with the
// active page rendered into <Outlet/>. Each role gets its own nav (and, as we
// build them, its own distinct pages).
export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!user) return null; // guarded by RequireRole.

  const items = NAV_BY_ROLE[user.role];
  const active = items.find((i) => location.pathname.startsWith(i.to));
  const title = active?.label ?? '';

  function onLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <NavLink to="/dashboard" onClick={() => setDrawerOpen(false)}>
          <img src="/kcc-logo.png" alt="Karen Country Club" className="h-10 w-auto" />
        </NavLink>
      </div>

      {/* min-h-0 lets the nav shrink inside the flex column so it scrolls
          instead of pushing the sign-out block off-screen on long navs. */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setDrawerOpen(false)}
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all',
                isActive
                  ? 'border border-azure/20 bg-azure/15 text-azure'
                  : 'text-slate hover:bg-white/5 hover:text-silver',
              )
            }
          >
            <item.icon size={18} />
            {item.label}
            {item.to === '/messages' && <MessagesUnreadBadge />}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/5 p-3">
        <div className="mb-2 flex items-center gap-3 px-1">
          <Avatar name={user.full_name || user.email} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-silver">
              {user.full_name || user.email}
            </p>
            <RoleBadge role={user.role} />
          </div>
        </div>
        <Button variant="ghost" size="sm" fullWidth onClick={onLogout} data-testid="sign-out-btn">
          <LogOut size={16} /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-navy">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/5 bg-navy/80 backdrop-blur lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-white/10 bg-navy">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 rounded-lg p-2 text-slate hover:bg-white/5 hover:text-silver"
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:ml-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/5 bg-navy/80 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            data-testid="nav-toggle"
            className="rounded-lg p-2 text-slate hover:bg-white/5 hover:text-silver lg:hidden"
          >
            <Menu size={20} />
          </button>
          <h1 className="text-lg font-bold text-silver">{title}</h1>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>

        <main className="p-3 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
