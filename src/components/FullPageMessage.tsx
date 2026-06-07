import type { ReactNode } from 'react';

// Centered full-viewport message — used for loading and simple status screens.
export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 text-center text-stone-600">
      <p className="text-sm">{children}</p>
    </div>
  );
}
