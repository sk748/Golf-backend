import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Reset scroll to the top on every route change, so a new page never opens at
// the previous page's scroll position. Keyed on pathname only — switching tabs
// within a page via ?query/#hash should not jump. useLayoutEffect runs before
// paint to avoid a visible jump.
export function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
