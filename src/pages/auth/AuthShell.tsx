import type { ReactNode } from 'react';

// Shared field styles for the auth forms (kept in one place for consistency).
export const labelClass = 'mb-1 block text-sm font-medium text-stone-700';
export const fieldClass =
  'block w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900 shadow-sm outline-none focus:border-green-700 focus:ring-2 focus:ring-green-700/30';
export const primaryButtonClass =
  'w-full rounded-md bg-green-800 px-4 py-2.5 font-medium text-white shadow-sm transition hover:bg-green-900 focus:outline-none focus:ring-2 focus:ring-green-700/40 disabled:opacity-60';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

// Centered card layout used by Login and Register.
export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Karen Country Club
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-stone-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-stone-600">{subtitle}</p>}
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
          {children}
        </div>
      </div>
    </div>
  );
}
