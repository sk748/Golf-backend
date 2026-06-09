import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface FullPageMessageProps {
  children: ReactNode;
  // Show a spinner (loading) vs. a plain status message.
  spinner?: boolean;
}

// Centered full-viewport message — used for loading and simple status screens.
export function FullPageMessage({ children, spinner = true }: FullPageMessageProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-navy px-4 text-center text-slate">
      {spinner && <Loader2 size={24} className="animate-spin text-azure" />}
      <p className="text-sm">{children}</p>
    </div>
  );
}
