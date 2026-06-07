import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/useAuth';
import type { Role } from '../../types/api';

// Phase 0 placeholder. Each role's real dashboard is built in Phase 1 (and its
// design is reviewed with the product owner first, per WORKING_AGREEMENT). For
// now this just proves a signed-in user is routed to a role-shaped landing.
const ROLE_LANDING: Record<Role, { title: string; blurb: string }> = {
  admin: {
    title: 'Club administration',
    blurb: 'Club-wide stats, user management, and reference data arrive in Phase 1.',
  },
  committee: {
    title: 'Programme oversight',
    blurb: 'Read-across visibility and evaluation counter-signing arrive in Phase 3.',
  },
  coach: {
    title: 'Your juniors',
    blurb: 'Your roster, attendance, evaluations, and weekly schedule arrive in Phases 3–4.',
  },
  parent: {
    title: 'Your child',
    blurb: "Your child's profile, progress, and session requests arrive in Phases 3–4.",
  },
  player: {
    title: 'Your golf',
    blurb: 'Your scores, handicap, and progress against your level arrive in Phase 2.',
  },
};

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null; // guarded by RequireRole; satisfies the type checker.

  const landing = ROLE_LANDING[user.role];

  function onLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-green-800">
            Karen Golf — Junior Development
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-600">{user.full_name}</span>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium capitalize text-stone-700">
              {user.role}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition hover:bg-stone-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-stone-900">{landing.title}</h1>
        <p className="mt-2 text-stone-600">
          Signed in as {user.email}. {landing.blurb}
        </p>

        <dl className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
            <dt className="text-xs uppercase tracking-wide text-stone-500">Role</dt>
            <dd className="mt-1 text-lg font-medium capitalize text-stone-900">
              {user.role}
            </dd>
          </div>
          <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
            <dt className="text-xs uppercase tracking-wide text-stone-500">
              Membership
            </dt>
            <dd className="mt-1 text-lg font-medium capitalize text-stone-900">
              {user.membership_type}
            </dd>
          </div>
          <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200">
            <dt className="text-xs uppercase tracking-wide text-stone-500">
              Handicap index
            </dt>
            <dd className="mt-1 text-lg font-medium text-stone-900">
              {user.current_hcp_index ?? '—'}
            </dd>
          </div>
        </dl>
      </main>
    </div>
  );
}
