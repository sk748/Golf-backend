import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

// Auto-collect every image dropped into src/assets/landing/ — adding more
// later is just dropping a file in that folder, no code change. Sorted by
// filename for a stable order (hence the 01-/02- prefixes).
const modules = import.meta.glob('../assets/landing/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const slides = Object.keys(modules)
  .sort()
  .map((key) => modules[key]);

interface HeroSlideshowProps {
  children?: ReactNode;
  intervalMs?: number;
}

// Full-bleed photo hero: rotating background images + a navy scrim for
// legibility, with foreground content rendered above.
export function HeroSlideshow({ children, intervalMs = 6000 }: HeroSlideshowProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % slides.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [intervalMs]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-navy">
      {/* Rotating images */}
      {slides.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out motion-reduce:transition-none',
            i === index ? 'opacity-100' : 'opacity-0',
          )}
        />
      ))}

      {/* Navy scrim for text contrast (WCAG AA over photography) */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy/80 via-navy/65 to-navy/95" />

      {/* Foreground content */}
      <div className="relative z-10 flex min-h-screen flex-col">{children}</div>

      {/* Slide indicators */}
      {slides.length > 1 && (
        <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-2">
          {slides.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show slide ${i + 1}`}
              aria-current={i === index}
              data-testid={`slide-dot-${i}`}
              className={cn(
                'h-2 rounded-full transition-all',
                i === index ? 'w-6 bg-azure' : 'w-2 bg-white/40 hover:bg-white/70',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
