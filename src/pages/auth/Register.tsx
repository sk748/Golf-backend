import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/useAuth';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { RegisterableRole, RegisterPayload } from '../../types/api';
import { Button } from '../../components/ui/Button';
import { AuthShell, fieldClass, labelClass } from './AuthShell';

// Public registration only creates player or parent accounts (CLAUDE.md §4).
const ROLE_OPTIONS: { value: RegisterableRole; label: string; hint: string }[] = [
  { value: 'player', label: 'Junior golfer', hint: "I'm a player in the academy." },
  { value: 'parent', label: 'Parent / guardian', hint: 'I manage my child’s account.' },
];

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState<RegisterableRole>('player');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    const payload: RegisterPayload = {
      email: email.trim().toLowerCase(),
      password,
      full_name: fullName.trim(),
      role,
    };
    // Players: include DOB + gender so the backend bootstraps a junior profile.
    if (role === 'player' && dateOfBirth) {
      payload.date_of_birth = dateOfBirth;
      payload.gender = gender;
    }

    setSubmitting(true);
    try {
      await register(payload);
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Join the Junior Golf Academy.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-400"
            data-testid="auth-error"
          >
            {error}
          </p>
        )}

        <fieldset>
          <legend className={labelClass}>I am a…</legend>
          <div className="grid grid-cols-2 gap-2">
            {ROLE_OPTIONS.map((opt) => {
              const selected = role === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setRole(opt.value)}
                  aria-pressed={selected}
                  data-testid={`role-option-${opt.value}`}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-left transition-all',
                    selected
                      ? 'border-azure/40 bg-azure/15'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/5',
                  )}
                >
                  <span className="block text-sm font-bold text-silver">
                    {opt.label}
                  </span>
                  <span className="block text-xs text-slate">{opt.hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="fullName" className={labelClass}>
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={fieldClass}
            data-testid="register-name"
          />
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
            data-testid="register-email"
          />
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
            data-testid="register-password"
          />
          <p className="mt-1 text-xs text-slate">At least 8 characters.</p>
        </div>

        {role === 'player' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="dob" className={labelClass}>
                Date of birth
              </label>
              <input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className={cn(fieldClass, '[color-scheme:dark]')}
                data-testid="register-dob"
              />
            </div>
            <div>
              <label htmlFor="gender" className={labelClass}>
                Gender
              </label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                className={fieldClass}
                data-testid="register-gender"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          disabled={submitting}
          data-testid="auth-submit-btn"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-azure hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
