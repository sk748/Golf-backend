import confetti from 'canvas-confetti';

// KCC palette confetti — gold/azure/silver. A center pop plus two side cannons
// reads as celebratory without being garish. Honours prefers-reduced-motion
// (mixed ages, accessibility) by skipping the animation entirely.
const COLORS = ['#E4B84B', '#F0D27A', '#4FA3E3', '#9FC6EC', '#FFFFFF'];

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
    particleCount: 90,
    spread: 75,
    startVelocity: 45,
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
