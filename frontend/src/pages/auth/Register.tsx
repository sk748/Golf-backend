import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

import { useAuth } from '../../auth/useAuth';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { RegisterableRole, RegisterPayload } from '../../types/api';
import { Button } from '../../components/ui/Button';
import { AuthShell, fieldClass, labelClass } from './AuthShell';

// Signup-chain fields (build-phase-2 decisions 5+7). The locked RegisterPayload
// in src/types/api.ts doesn't carry these yet, so we widen it feature-locally —
// the extension is structurally assignable where register() expects the locked
// type, no unsafe cast needed. Backend: app/auth/controllers.py register_user.
interface SignupChainRegisterPayload extends RegisterPayload {
  // Parents: their own KCC club membership number (unique; optional).
  membership_number?: string;
  // Players: REQUIRED — links the new account to the parent for approval.
  parent_membership_number?: string;
}

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
  // Signup chain: parents may share their club number; players must link to one.
  const [membershipNumber, setMembershipNumber] = useState('');
  const [parentMembershipNumber, setParentMembershipNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // A freshly registered player is signed in but their junior profile starts
  // pending_parent — show the "awaiting approval" notice before moving on.
  const [playerPending, setPlayerPending] = useState(false);

  // Give the player a moment to read the notice, then continue as signed in.
  useEffect(() => {
    if (!playerPending) return;
    const timer = setTimeout(() => navigate('/', { replace: true }), 4000);
    return () => clearTimeout(timer);
  }, [playerPending, navigate]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    // The backend requires this to link the junior to a parent — catch it
    // client-side so the player gets a friendly prompt before the round-trip.
    if (role === 'player' && !parentMembershipNumber.trim()) {
      setError("Please enter your parent's club membership number.");
      return;
    }

    const payload: SignupChainRegisterPayload = {
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
    if (role === 'player') {
      payload.parent_membership_number = parentMembershipNumber.trim();
    } else if (role === 'parent' && membershipNumber.trim()) {
      payload.membership_number = membershipNumber.trim();
    }

    setSubmitting(true);
    try {
      await register(payload);
      if (role === 'player') {
        // Logged in (existing behaviour) — but the account awaits approval.
        setPlayerPending(true);
      } else {
        navigate('/', { replace: true });
      }
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

  if (playerPending) {
    return (
      <AuthShell title="Welcome to the academy" subtitle="One more step before tee-off.">
        <div
          className="rounded-xl bg-emerald-500/10 p-4 text-center"
          role="status"
          data-testid="register-player-pending"
        >
          <CheckCircle2
            size={28}
            className="mx-auto text-emerald-400"
            aria-hidden
          />
          <p className="mt-3 text-sm font-bold text-silver">
            Your account has been created.
          </p>
          <p className="mt-1 text-sm text-slate">
            Your account is awaiting your parent&apos;s approval. Once they (and
            the club) approve it, everything unlocks.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="lg"
          fullWidth
          className="mt-4"
          onClick={() => navigate('/', { replace: true })}
          data-testid="register-pending-continue"
        >
          Continue
        </Button>
      </AuthShell>
    );
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

        {role === 'parent' && (
          <div>
            <label htmlFor="membershipNumber" className={labelClass}>
              Club membership number{' '}
              <span className="font-normal text-slate">(optional)</span>
            </label>
            <input
              id="membershipNumber"
              type="text"
              autoComplete="off"
              value={membershipNumber}
              onChange={(e) => setMembershipNumber(e.target.value)}
              className={fieldClass}
              data-testid="register-membership-number"
            />
            <p className="mt-1 text-xs text-slate">
              Your KCC membership number — your child will use it to link their
              account to you.
            </p>
          </div>
        )}

        {role === 'player' && (
          <div>
            <label htmlFor="parentMembershipNumber" className={labelClass}>
              Parent&apos;s club membership number
            </label>
            <input
              id="parentMembershipNumber"
              type="text"
              autoComplete="off"
              required
              value={parentMembershipNumber}
              onChange={(e) => setParentMembershipNumber(e.target.value)}
              className={fieldClass}
              data-testid="register-parent-membership-number"
            />
            <p className="mt-1 text-xs text-slate">
              Ask your parent — this links your account to them for approval.
            </p>
          </div>
        )}

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
