import { useEffect, useRef } from 'react';

// The classic Konami code: ↑ ↑ ↓ ↓ ← → ← → B A.
const SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const;

// Fires `onUnlock` when the Konami code is entered. Tracks progress in a ref so
// re-renders don't reset it; keeps the callback in a ref so callers can pass an
// inline closure without re-binding the listener. Keystrokes inside text fields
// are ignored (and reset progress) so typing "ba…" in a message never trips it.
export function useKonamiCode(onUnlock: () => void): void {
  const posRef = useRef(0);
  const cbRef = useRef(onUnlock);
  cbRef.current = onUnlock;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        posRef.current = 0;
        return;
      }

      // Single chars compare case-insensitively (B/A); named keys as-is.
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (key === SEQUENCE[posRef.current]) {
        posRef.current += 1;
        if (posRef.current === SEQUENCE.length) {
          posRef.current = 0;
          cbRef.current();
        }
      } else {
        // Wrong key: restart — but let this key seed a fresh attempt.
        posRef.current = key === SEQUENCE[0] ? 1 : 0;
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
