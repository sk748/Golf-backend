// ───────────────────────────────────────────────────────────────────────────
// DEV-ONLY quick login. Click a role to fill the form and sign in with a seeded
// account (see scripts that seeded karen_db). Renders ONLY in dev builds
// (import.meta.env.DEV) so it never reaches staging/production.
//
// TO REMOVE before staging: delete this file and its <DevQuickLogin/> usage in
// Login.tsx (one import + one element). The seeded accounts live in the dev DB,
// not in code.
// ───────────────────────────────────────────────────────────────────────────
import type { Role } from '../../types/api';
import { RoleBadge } from '../../components/ui/Badge';

const DEMO_PASSWORD = 'password123';

const DEMO_ACCOUNTS: { role: Role; email: string }[] = [
  { role: 'admin', email: 'admin@kcc.test' },
  { role: 'coach', email: 'coach@kcc.test' },
  { role: 'committee', email: 'committee@kcc.test' },
  { role: 'parent', email: 'parent@kcc.test' },
  { role: 'player', email: 'player@kcc.test' },
];

interface DevQuickLoginProps {
  // Fills the form and runs the real login (auth is exercised, not skipped).
  onPick: (email: string, password: string) => void;
}

export function DevQuickLogin({ onPick }: DevQuickLoginProps) {
  if (!import.meta.env.DEV) return null;

  return (
    <div
      className="mt-6 rounded-xl border border-dashed border-white/15 p-3"
      data-testid="dev-quick-login"
    >
      <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate">
        Dev quick login
      </p>
      <div className="flex flex-col gap-1.5">
        {DEMO_ACCOUNTS.map((acc) => (
          <button
            key={acc.role}
            type="button"
            onClick={() => onPick(acc.email, DEMO_PASSWORD)}
            data-testid={`quick-login-${acc.role}`}
            className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-left transition-colors hover:border-azure/40 hover:bg-white/[0.06]"
          >
            <span className="font-mono text-xs text-silver/90">{acc.email}</span>
            <RoleBadge role={acc.role} />
          </button>
        ))}
      </div>
    </div>
  );
}
