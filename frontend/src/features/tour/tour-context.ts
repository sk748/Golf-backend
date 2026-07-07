import { createContext } from 'react';

import type { TourStep } from './tour-steps';

export interface TourContextValue {
  active: boolean;
  stepIndex: number;
  steps: TourStep[];
  // Start (or replay) the tour for the current role from step 0. Ignores the
  // "already seen" flag — this is the manual relaunch entry too.
  start(): void;
  next(): void;
  back(): void;
  // Close the tour and remember it as seen for this role + version.
  close(): void;
}

// Split context (value-only module) so the provider component can live in its
// own file with Fast Refresh intact — mirrors auth/auth-context.ts.
export const TourContext = createContext<TourContextValue | null>(null);
