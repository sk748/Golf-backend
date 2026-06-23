import { HelpCircle } from 'lucide-react';

import { useTour } from './useTour';

// Top-bar affordance to (re)play the role's guided tour at any time. Lives in
// both shells' headers next to the notification bell.
export function TourLaunchButton() {
  const { start, steps } = useTour();
  if (steps.length === 0) return null;

  return (
    <button
      type="button"
      onClick={start}
      data-testid="tour-launch"
      aria-label="Take a tour"
      title="Take a tour"
      className="rounded-xl p-2 text-slate transition-colors hover:bg-white/5 hover:text-silver"
    >
      <HelpCircle size={20} />
    </button>
  );
}
