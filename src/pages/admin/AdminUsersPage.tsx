import { useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Loader2, UserPlus, X } from 'lucide-react';

import { useAuth } from '../../auth/useAuth';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { Role, User } from '../../types/api';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, RoleBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { fieldClass, labelClass } from '../auth/AuthShell';
import {
  useChangeRole,
  useCreateUser,
  useSetActive,
  useUsers,
  type UserFilters,
} from './admin-users.queries';

// All system roles (used by the per-row role selector + the role filter).
const ALL_ROLES: Role[] = ['admin', 'coach', 'committee', 'parent', 'player'];

// Admins only create staff accounts here (CLAUDE.md §4); players/parents come in
// through public registration.
const CREATABLE_ROLES: Extract<Role, 'coach' | 'committee'>[] = [
  'coach',
  'committee',
];

type StatusFilter = 'all' | 'active' | 'inactive';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
}

// Split "Ada Lovelace King" -> first_name "Ada", last_name "Lovelace King"
// (matches the first-token + rest convention used at registration).
function splitName(full: string): { first_name: string; last_name: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] ?? '',
    last_name: parts.slice(1).join(' '),
  };
}

export function AdminUsersPage() {
  const { user: me } = useAuth();

  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showCreate, setShowCreate] = useState(false);

  const filters: UserFilters = {
    role: roleFilter === 'all' ? undefined : roleFilter,
    is_active:
      statusFilter === 'all' ? undefined : statusFilter === 'active',
  };

  const usersQuery = useUsers(filters);
  const users = usersQuery.data ?? [];

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-silver">User management</h1>
          <p className="mt-1 text-sm text-slate">
            Create staff accounts, set roles, and manage access.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowCreate((v) => !v)}
          aria-expanded={showCreate}
          data-testid="open-create-user"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Create account
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateUserPanel onClose={() => setShowCreate(false)} />
      )}

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="filter-role" className={labelClass}>
            Role
          </label>
          <select
            id="filter-role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | Role)}
            className={fieldClass}
            data-testid="filter-role"
          >
            <option value="all">All roles</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-status" className={labelClass}>
            Status
          </label>
          <select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={fieldClass}
            data-testid="filter-status"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* List states */}
      <div className="mt-6">
        {usersQuery.isLoading ? (
          <div
            className="flex items-center justify-center gap-3 py-16 text-slate"
            data-testid="users-loading"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>Loading users…</span>
          </div>
        ) : usersQuery.isError ? (
          <GlassCard
            className="border border-red-500/30 bg-red-500/10 p-5"
            role="alert"
            data-testid="users-error"
          >
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="text-sm font-semibold">
                {errorMessage(
                  usersQuery.error,
                  'Could not load users. Please try again.',
                )}
              </span>
            </div>
          </GlassCard>
        ) : users.length === 0 ? (
          <GlassCard
            className="p-10 text-center text-slate"
            data-testid="users-empty"
          >
            No users match these filters.
          </GlassCard>
        ) : (
          <UserList users={users} meId={me?.id} />
        )}
      </div>
    </div>
  );
}

// ── Create panel ─────────────────────────────────────────────────────────────
function CreateUserPanel({ onClose }: { onClose: () => void }) {
  const createUser = useCreateUser();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] =
    useState<Extract<Role, 'coach' | 'committee'>>('coach');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(false);

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    const { first_name, last_name } = splitName(fullName);
    if (!first_name) {
      setFormError('Please enter a name.');
      return;
    }

    createUser.mutate(
      {
        email: email.trim().toLowerCase(),
        password,
        first_name,
        last_name,
        role,
      },
      {
        onSuccess: () => {
          setSuccess(true);
          setFullName('');
          setEmail('');
          setPassword('');
          setRole('coach');
          // Brief success flash, then close.
          window.setTimeout(onClose, 900);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            setFormError('That email is already registered.');
          } else {
            setFormError(
              errorMessage(err, 'Could not create the account. Please try again.'),
            );
          }
        },
      },
    );
  }

  return (
    <GlassCard className="mt-5 p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-silver">Create staff account</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close create form"
          className="rounded-lg p-1.5 text-slate transition-colors hover:bg-white/5 hover:text-silver focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4"
        noValidate
        data-testid="create-user-form"
      >
        {formError && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-400"
            data-testid="create-user-error"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {formError}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-400"
            data-testid="create-user-success"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Account created
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="create-name" className={labelClass}>
              Full name
            </label>
            <input
              id="create-name"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={fieldClass}
              data-testid="create-user-name"
            />
          </div>
          <div>
            <label htmlFor="create-email" className={labelClass}>
              Email
            </label>
            <input
              id="create-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
              data-testid="create-user-email"
            />
          </div>
          <div>
            <label htmlFor="create-password" className={labelClass}>
              Password
            </label>
            <input
              id="create-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
              data-testid="create-user-password"
            />
            <p className="mt-1 text-xs text-slate">At least 8 characters.</p>
          </div>
          <div>
            <label htmlFor="create-role" className={labelClass}>
              Role
            </label>
            <select
              id="create-role"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as Extract<Role, 'coach' | 'committee'>)
              }
              className={fieldClass}
              data-testid="create-user-role"
            >
              {CREATABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={createUser.isPending}
            data-testid="create-user-submit"
          >
            {createUser.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {createUser.isPending ? 'Creating…' : 'Create account'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={createUser.isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}

// ── List (desktop table + mobile cards) ──────────────────────────────────────
function UserList({ users, meId }: { users: User[]; meId?: string }) {
  return (
    <>
      {/* Desktop table */}
      <GlassCard className="hidden overflow-hidden md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate">
              <th scope="col" className="px-5 py-3 font-semibold">
                User
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Role
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Status
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Joined
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} user={u} isSelf={u.id === meId} />
            ))}
          </tbody>
        </table>
      </GlassCard>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {users.map((u) => (
          <UserCard key={u.id} user={u} isSelf={u.id === meId} />
        ))}
      </div>
    </>
  );
}

// Shared mutation wiring + control rendering for a single user.
function useRowControls(user: User, isSelf: boolean) {
  const changeRole = useChangeRole();
  const setActive = useSetActive();

  const onRoleChange = (role: Role) => {
    if (role === user.role) return;
    changeRole.mutate({ id: user.id, role });
  };
  const onToggleActive = () => {
    setActive.mutate({ id: user.id, is_active: !user.is_active });
  };

  const roleDisabled = isSelf || changeRole.isPending;
  const toggleDisabled = isSelf || setActive.isPending;

  return {
    changeRole,
    setActive,
    onRoleChange,
    onToggleActive,
    roleDisabled,
    toggleDisabled,
  };
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="emerald">Active</Badge>
  ) : (
    <Badge tone="slate">Inactive</Badge>
  );
}

const roleSelectClass =
  'rounded-lg border border-white/10 bg-navy px-2.5 py-1.5 text-xs text-silver outline-none transition-colors focus:border-azure disabled:opacity-50';

function UserRow({ user, isSelf }: { user: User; isSelf: boolean }) {
  const {
    changeRole,
    setActive,
    onRoleChange,
    onToggleActive,
    roleDisabled,
    toggleDisabled,
  } = useRowControls(user, isSelf);

  return (
    <tr
      className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]"
      data-testid={`user-row-${user.id}`}
    >
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.full_name || user.email} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold text-silver">
                {user.full_name || '—'}
              </span>
              {isSelf && (
                <Badge tone="azure" shape="pill" className="shrink-0">
                  You
                </Badge>
              )}
            </div>
            <div className="truncate text-xs text-slate">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        <RoleBadge role={user.role} />
      </td>
      <td className="px-5 py-4">
        <StatusBadge active={user.is_active} />
      </td>
      <td className="px-5 py-4 text-slate">{formatDate(user.created_at)}</td>
      <td className="px-5 py-4">
        <div className="flex items-center justify-end gap-2">
          <label className="sr-only" htmlFor={`role-select-${user.id}`}>
            Change role for {user.full_name || user.email}
          </label>
          <select
            id={`role-select-${user.id}`}
            value={user.role}
            disabled={roleDisabled}
            onChange={(e) => onRoleChange(e.target.value as Role)}
            className={roleSelectClass}
            data-testid={`role-select-${user.id}`}
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
          <Button
            variant={user.is_active ? 'danger' : 'ghost'}
            size="sm"
            disabled={toggleDisabled}
            onClick={onToggleActive}
            data-testid={`toggle-active-${user.id}`}
          >
            {setActive.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            )}
            {user.is_active ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
        {(changeRole.isError || setActive.isError) && (
          <p className="mt-1 text-right text-xs text-red-400" role="alert">
            {errorMessage(
              changeRole.error ?? setActive.error,
              'Action failed.',
            )}
          </p>
        )}
      </td>
    </tr>
  );
}

function UserCard({ user, isSelf }: { user: User; isSelf: boolean }) {
  const {
    changeRole,
    setActive,
    onRoleChange,
    onToggleActive,
    roleDisabled,
    toggleDisabled,
  } = useRowControls(user, isSelf);

  return (
    <GlassCard className="p-4" data-testid={`user-row-${user.id}`}>
      <div className="flex items-start gap-3">
        <Avatar name={user.full_name || user.email} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-silver">
              {user.full_name || '—'}
            </span>
            {isSelf && (
              <Badge tone="azure" shape="pill" className="shrink-0">
                You
              </Badge>
            )}
          </div>
          <div className="truncate text-xs text-slate">{user.email}</div>
        </div>
        <StatusBadge active={user.is_active} />
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-slate">
        <RoleBadge role={user.role} />
        <span>Joined {formatDate(user.created_at)}</span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <label className="sr-only" htmlFor={`role-select-${user.id}`}>
          Change role for {user.full_name || user.email}
        </label>
        <select
          id={`role-select-${user.id}`}
          value={user.role}
          disabled={roleDisabled}
          onChange={(e) => onRoleChange(e.target.value as Role)}
          className={cn(roleSelectClass, 'flex-1')}
          data-testid={`role-select-${user.id}`}
        >
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>
        <Button
          variant={user.is_active ? 'danger' : 'ghost'}
          size="sm"
          disabled={toggleDisabled}
          onClick={onToggleActive}
          data-testid={`toggle-active-${user.id}`}
        >
          {setActive.isPending && (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          )}
          {user.is_active ? 'Deactivate' : 'Activate'}
        </Button>
      </div>
      {(changeRole.isError || setActive.isError) && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {errorMessage(changeRole.error ?? setActive.error, 'Action failed.')}
        </p>
      )}
    </GlassCard>
  );
}
