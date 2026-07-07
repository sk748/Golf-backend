import { useEffect, useState } from 'react';

// Subscribe to a CSS media query. SSR-safe: defaults to `false` until mounted,
// then syncs on mount and on every change. This is the single source of device
// class — the shell selector reads it so exactly one shell mounts at a time
// (a CSS `hidden lg:block` split would double-mount the notification poll).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange(); // sync in case the query changed between render and effect
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

// Desktop = Tailwind `lg` breakpoint (min-width: 1024px), the existing split
// point the responsive shell already used.
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

// Honour the user's reduced-motion preference so we can gate non-essential
// animation (mini-bar slide, launcher bubbles, banner) without per-component CSS.
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
