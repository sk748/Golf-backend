// Minimal className joiner — keeps conditional class logic readable without
// pulling in a dependency. Falsy values are dropped.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
