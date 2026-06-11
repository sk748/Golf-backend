import confetti from 'canvas-confetti';

// Bright, multi-colour confetti anchored by the KCC gold + azure. A center pop
// plus two side cannons reads as a real celebration for the kids. Honours
// prefers-reduced-motion (mixed ages, accessibility) by skipping it entirely.
const COLORS = [
  '#E4B84B', // KCC gold
  '#F0D27A', // light gold
  '#4FA3E3', // KCC azure
  '#34D399', // emerald
  '#F472B6', // pink
  '#A78BFA', // violet
  '#FB923C', // orange
  '#FACC15', // yellow
  '#22D3EE', // cyan
  '#FFFFFF', // white sparkle
];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function fireAchievementConfetti(): void {
  if (prefersReducedMotion()) return;

  confetti({
    particleCount: 130,
    spread: 90,
    startVelocity: 48,
    origin: { y: 0.6 },
    colors: COLORS,
    zIndex: 100,
  });
  window.setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 65,
      origin: { x: 0, y: 0.7 },
      colors: COLORS,
      zIndex: 100,
    });
  }, 140);
  window.setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 65,
      origin: { x: 1, y: 0.7 },
      colors: COLORS,
      zIndex: 100,
    });
  }, 280);
}
