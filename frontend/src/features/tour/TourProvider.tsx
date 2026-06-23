import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../../auth/useAuth';
import { TourContext, type TourContextValue } from './tour-context';
import { TOUR_STEPS_BY_ROLE, TOUR_VERSION } from './tour-steps';

// Per-role + per-version localStorage key, following the existing kcc.* pattern
// (kcc.sidebar.collapsed, kcc.announcements.seen). Tour state is purely local —
// there is no backend "tour seen" concept, which is fine for an onboarding hint.
function seenKey(role: string): string {
  return `kcc.tour.${role}.${TOUR_VERSION}`;
}

function hasSeen(role: string): boolean {
  try {
    return localStorage.getItem(seenKey(role)) === 'done';
  } catch {
    return false; // storage unavailable (private mode) — treat as not seen.
  }
}

function markSeen(role: string): void {
  try {
    localStorage.setItem(seenKey(role), 'done');
  } catch {
    /* storage unavailable — auto-start will simply re-fire next session */
  }
}

// Let the dashboard + sidebar mount and entrance animations settle before the
// first-run tour pops, so the spotlight lands on a settled layout.
const AUTOSTART_DELAY_MS = 800;

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth();
  const role = user?.role;

  const steps = useMemo(() => (role ? TOUR_STEPS_BY_ROLE[role] ?? [] : []), [role]);

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // Guards the once-per-session auto-start so a re-render can't re-trigger it.
  const autoStarted = useRef(false);

  const start = useCallback(() => {
    if (steps.length === 0) return;
    setStepIndex(0);
    setActive(true);
  }, [steps.length]);

  const close = useCallback(() => {
    setActive(false);
    if (role) markSeen(role);
  }, [role]);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i >= steps.length - 1) {
        close();
        return i;
      }
      return i + 1;
    });
  }, [steps.length, close]);

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  // First-run auto-start: once per role + version, after auth resolves and the
  // shell has had a moment to paint.
  useEffect(() => {
    if (status !== 'authenticated' || !role || steps.length === 0) return;
    if (autoStarted.current) return;
    if (hasSeen(role)) {
      autoStarted.current = true;
      return;
    }
    autoStarted.current = true;
    const t = window.setTimeout(() => setActive(true), AUTOSTART_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [status, role, steps.length]);

  const value = useMemo<TourContextValue>(
    () => ({ active, stepIndex, steps, start, next, back, close }),
    [active, stepIndex, steps, start, next, back, close],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
