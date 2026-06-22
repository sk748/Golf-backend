import { Link } from 'react-router-dom';

import { HeroSlideshow } from '../../components/HeroSlideshow';
import { Button } from '../../components/ui/Button';
import { ClubNews } from './ClubNews';

// Pre-signup landing page (shown at "/" when logged out). Full-bleed photo
// slideshow of the course + clubhouse with the academy hero and auth CTAs,
// followed by the public Club News section (which hides itself when there is
// no published external news — the hero must stand alone).
export function Landing() {
  return (
    <>
      <HeroSlideshow>
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
          <img
            src="/kcc-logo.png"
            alt="Karen Country Club"
            className="h-10 w-auto drop-shadow-lg sm:h-12"
          />
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link to="/login" data-testid="nav-sign-in">
              <Button variant="secondary" size="sm">
                Sign in
              </Button>
            </Link>
            <Link to="/register" data-testid="nav-get-started">
              <Button variant="primary" size="sm">
                Get started
              </Button>
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
          <p className="animate-fade-in-up text-[11px] font-bold uppercase tracking-[0.25em] text-azure sm:text-xs">
            Karen Country Club
          </p>
          <h1 className="animate-fade-in-up stagger-1 mt-3 max-w-3xl text-4xl font-black leading-tight text-silver sm:text-5xl md:text-6xl">
            Junior Golf Development Academy
          </h1>
          <p className="animate-fade-in-up stagger-2 mt-5 max-w-xl text-base text-silver/80 sm:text-lg">
            From a first swing to elite competition — every round, handicap, and
            milestone tracked along the pathway.
          </p>
          <div className="animate-fade-in-up stagger-3 mt-8 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
            <Link to="/register" className="sm:w-auto" data-testid="hero-get-started">
              <Button variant="primary" size="lg" fullWidth>
                Create account
              </Button>
            </Link>
            <Link to="/login" className="sm:w-auto" data-testid="hero-sign-in">
              <Button variant="secondary" size="lg" fullWidth>
                Sign in
              </Button>
            </Link>
          </div>
        </main>
      </HeroSlideshow>

      <ClubNews />
    </>
  );
}
