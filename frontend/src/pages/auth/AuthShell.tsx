import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Shared field styles for the auth forms (kept in one place for consistency).
export const labelClass = 'mb-1.5 block text-sm font-medium text-silver/90';
export const fieldClass =
  'block w-full rounded-xl border border-white/10 bg-navy px-4 py-3 text-silver placeholder:text-slate outline-none transition-colors focus:border-azure';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

// Centered glass card on the navy canvas, used by Login and Register.
export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy px-4 py-10">
      {/* Subtle azure glow */}
      <div className="pointer-events-none absolute -top-1/4 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-azure/10 blur-[120px]" />

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link to="/" aria-label="Karen Country Club home">
            <img src="/kcc-logo.png" alt="Karen Country Club" className="h-14 w-auto" />
          </Link>
          <h1 className="mt-3 text-2xl font-black text-silver">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate">{subtitle}</p>}
        </div>
        <div className="glass rounded-2xl p-6 sm:p-7">{children}</div>
      </div>
    </div>
  );
}
