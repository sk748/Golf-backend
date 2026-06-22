import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, LogOut } from 'lucide-react';

import { useAuth } from '../../auth/useAuth';
import { ApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { RoleBadge } from '../../components/ui/Badge';
import { useUpdateProfile, useChangePassword } from './profile.queries';

const inputClass =
  'w-full rounded-xl border border-white/10 bg-navy/60 px-3 py-2.5 text-sm text-silver placeholder:text-slate/60 focus:border-azure focus:outline-none focus:ring-1 focus:ring-azure';

const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate';

export function ProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const update = useUpdateProfile();
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saved, setSaved] = useState(false);

  if (!user) return null; // guarded by RequireRole.

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    update.mutate(
      {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
      },
      {
        onSuccess: (next) => {
          updateUser(next);
          setSaved(true);
        },
      },
    );
  }

  const errorMsg =
    update.error instanceof ApiError ? update.error.message : update.isError ? 'Could not save your profile.' : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-silver">My profile</h1>
        <p className="mt-1 text-sm text-slate">Update your name and contact details.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6" data-testid="profile-form">
        <GlassCard className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="first_name" className={labelClass}>
                First name
              </label>
              <input
                id="first_name"
                className={inputClass}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
                data-testid="profile-first-name"
              />
            </div>
            <div>
              <label htmlFor="last_name" className={labelClass}>
                Last name
              </label>
              <input
                id="last_name"
                className={inputClass}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
                data-testid="profile-last-name"
              />
            </div>
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              placeholder="Optional"
              data-testid="profile-phone"
            />
          </div>
        </GlassCard>

        {/* Read-only account facts — changed by an admin, not here. */}
        <GlassCard className="space-y-3 p-5 sm:p-6">
          <h2 className="text-sm font-bold text-silver">Account</h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className={labelClass}>Email</dt>
              <dd className="text-sm text-silver">{user.email}</dd>
            </div>
            <div>
              <dt className={labelClass}>Role</dt>
              <dd>
                <RoleBadge role={user.role} />
              </dd>
            </div>
          </dl>
          <p className="text-xs text-slate">
            Email and role are managed by a club administrator.
          </p>
        </GlassCard>

        {errorMsg && (
          <p
            role="alert"
            className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
            data-testid="profile-error"
          >
            {errorMsg}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={update.isPending} data-testid="profile-save">
            {update.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Saving…
              </>
            ) : (
              'Save changes'
            )}
          </Button>
          {saved && !update.isPending && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-400" data-testid="profile-saved">
              <Check size={16} /> Saved
            </span>
          )}
        </div>
      </form>

      {/* Self-service password change (no email needed — the user knows their
          current password). Separate form so it submits independently. */}
      <ChangePasswordCard />

      {/* Sign out — the primary place to end a session (the mobile shell has no
          sidebar). */}
      <div className="mt-8 border-t border-white/5 pt-6">
        <Button
          variant="ghost"
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
          data-testid="profile-sign-out"
        >
          <LogOut size={16} /> Sign out
        </Button>
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  function reset() {
    setDone(false);
    setClientError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    setClientError(null);
    if (next.length < 8) {
      setClientError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setClientError('New password and confirmation do not match.');
      return;
    }
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          setDone(true);
          setCurrent('');
          setNext('');
          setConfirm('');
        },
      },
    );
  }

  const serverError =
    change.error instanceof ApiError
      ? change.error.message
      : change.isError
        ? 'Could not change your password.'
        : null;
  const errorMsg = clientError ?? serverError;

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" data-testid="change-password-form">
      <GlassCard className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="text-sm font-bold text-silver">Change password</h2>
          <p className="mt-1 text-xs text-slate">
            Choose a new password of at least 8 characters.
          </p>
        </div>
        <div>
          <label htmlFor="current_password" className={labelClass}>
            Current password
          </label>
          <input
            id="current_password"
            type="password"
            className={inputClass}
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              reset();
            }}
            autoComplete="current-password"
            required
            data-testid="cp-current"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new_password" className={labelClass}>
              New password
            </label>
            <input
              id="new_password"
              type="password"
              className={inputClass}
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
                reset();
              }}
              autoComplete="new-password"
              required
              minLength={8}
              data-testid="cp-new"
            />
          </div>
          <div>
            <label htmlFor="confirm_password" className={labelClass}>
              Confirm new password
            </label>
            <input
              id="confirm_password"
              type="password"
              className={inputClass}
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                reset();
              }}
              autoComplete="new-password"
              required
              minLength={8}
              data-testid="cp-confirm"
            />
          </div>
        </div>
      </GlassCard>

      {errorMsg && (
        <p
          role="alert"
          className="rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
          data-testid="cp-error"
        >
          {errorMsg}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={change.isPending} data-testid="cp-save">
          {change.isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Updating…
            </>
          ) : (
            'Update password'
          )}
        </Button>
        {done && !change.isPending && (
          <span
            className="flex items-center gap-1.5 text-sm font-medium text-emerald-400"
            data-testid="cp-done"
          >
            <Check size={16} /> Password updated
          </span>
        )}
      </div>
    </form>
  );
}
