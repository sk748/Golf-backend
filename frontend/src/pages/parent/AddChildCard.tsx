// AddChildCard — "Add your child": collapsible form where a PARENT creates
// their child's player account + junior profile in one go (build-phase-2
// decision 5), via POST /api/parents/me/children (standard envelope — errors
// surface through ApiError.message). Parent consent is implicit, so the new
// junior starts pending_staff and the club activates it. Mounted on the
// my-child page; also serves as the empty-state action for new parents.

import { useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, Loader2, UserPlus } from 'lucide-react';

import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { useCreateChildAccount } from './parent-children.queries';

const inputClass =
  'w-full rounded-xl bg-white/5 px-4 py-3 text-sm text-silver placeholder:text-slate/60 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-azure/60 disabled:opacity-50';
const labelClass = 'block text-sm font-semibold text-silver';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  dateOfBirth: '',
  gender: 'male',
};

export function AddChildCard({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const create = useCreateChildAccount();
  const [open, setOpen] = useState(defaultOpen);
  const [form, setForm] = useState(EMPTY_FORM);
  const [clientError, setClientError] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);

  const change = <K extends keyof typeof EMPTY_FORM>(
    key: K,
    value: string,
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setClientError(null);
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientError(null);

    if (!form.firstName.trim()) {
      setClientError("Please enter your child's first name.");
      return;
    }
    if (!form.email.trim()) {
      setClientError("Please enter an email for your child's login.");
      return;
    }
    if (form.password.length < 8) {
      setClientError('Password must be at least 8 characters.');
      return;
    }
    if (!form.dateOfBirth) {
      setClientError("Please enter your child's date of birth.");
      return;
    }

    const firstName = form.firstName.trim();
    create.mutate(
      {
        email: form.email.trim().toLowerCase(),
        password: form.password,
        first_name: firstName,
        ...(form.lastName.trim() ? { last_name: form.lastName.trim() } : {}),
        date_of_birth: form.dateOfBirth,
        gender: form.gender,
      },
      {
        onSuccess: () => {
          setCreatedName(firstName);
          setForm(EMPTY_FORM);
        },
      },
    );
  }

  const errorText = clientError
    ? clientError
    : create.isError
      ? create.error instanceof ApiError
        ? create.error.message
        : 'Could not create the account. Please try again.'
      : null;

  return (
    <GlassCard className="p-5 sm:p-6" data-testid="add-child-card">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="add-child-form"
        className="flex w-full items-center gap-2.5 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-azure/50"
        data-testid="add-child-toggle"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
          <UserPlus size={16} className="text-emerald-400" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-silver">
            Add your child
          </span>
          <span className="block text-xs text-slate">
            Create their account here — the club will review and activate it.
          </span>
        </span>
        <ChevronDown
          size={18}
          className={cn(
            'shrink-0 text-slate transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <form id="add-child-form" className="mt-5" onSubmit={onSubmit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="add-child-first-name">
                First name
              </label>
              <input
                id="add-child-first-name"
                type="text"
                required
                className={inputClass + ' mt-1.5'}
                value={form.firstName}
                onChange={(e) => change('firstName', e.target.value)}
                disabled={create.isPending}
                data-testid="add-child-first-name"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="add-child-last-name">
                Last name{' '}
                <span className="font-normal text-slate">(optional)</span>
              </label>
              <input
                id="add-child-last-name"
                type="text"
                className={inputClass + ' mt-1.5'}
                value={form.lastName}
                onChange={(e) => change('lastName', e.target.value)}
                disabled={create.isPending}
                data-testid="add-child-last-name"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="add-child-email">
                Email
              </label>
              <input
                id="add-child-email"
                type="email"
                autoComplete="off"
                required
                className={inputClass + ' mt-1.5'}
                value={form.email}
                onChange={(e) => change('email', e.target.value)}
                disabled={create.isPending}
                data-testid="add-child-email"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="add-child-password">
                Password
              </label>
              <input
                id="add-child-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className={inputClass + ' mt-1.5'}
                value={form.password}
                onChange={(e) => change('password', e.target.value)}
                disabled={create.isPending}
                data-testid="add-child-password"
              />
              <p className="mt-1 text-xs text-slate">
                This will be your child&apos;s own login. At least 8 characters.
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="add-child-dob">
                Date of birth
              </label>
              <input
                id="add-child-dob"
                type="date"
                required
                className={cn(inputClass, 'mt-1.5 [color-scheme:dark]')}
                value={form.dateOfBirth}
                onChange={(e) => change('dateOfBirth', e.target.value)}
                disabled={create.isPending}
                data-testid="add-child-dob"
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="add-child-gender">
                Gender
              </label>
              <select
                id="add-child-gender"
                className={inputClass + ' mt-1.5'}
                value={form.gender}
                onChange={(e) => change('gender', e.target.value)}
                disabled={create.isPending}
                data-testid="add-child-gender"
              >
                <option value="male" className="bg-navy">
                  Male
                </option>
                <option value="female" className="bg-navy">
                  Female
                </option>
              </select>
            </div>
          </div>

          {errorText ? (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-400"
              data-testid="add-child-error"
            >
              {errorText}
            </p>
          ) : null}

          {createdName && !errorText ? (
            <p
              className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-300"
              data-testid="add-child-success"
            >
              Account created — the club will review and activate it.{' '}
              {createdName} now shows below with an &quot;Awaiting club
              approval&quot; badge.
            </p>
          ) : null}

          <div className="mt-5">
            <Button
              type="submit"
              size="md"
              disabled={create.isPending}
              data-testid="add-child-submit"
            >
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden />
              )}
              {create.isPending ? 'Creating…' : 'Create account'}
            </Button>
          </div>
        </form>
      ) : null}
    </GlassCard>
  );
}
