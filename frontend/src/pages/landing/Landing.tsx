import { Link } from 'react-router-dom';
import { Crown, Flag, Sprout, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { HeroSlideshow } from '../../components/HeroSlideshow';
import { Button } from '../../components/ui/Button';
import { ScoreboardHero } from '../league/ScoreboardHero';
import { ClubNews } from './ClubNews';

// The four-band junior pathway (CLAUDE.md domain). Static marketing content for
// the public page — not API data.
const PATHWAY: { levels: string; name: string; focus: string; icon: LucideIcon }[] = [
  { levels: 'L1–3', name: 'Beginners', focus: 'Putting, chipping, full swing & etiquette', icon: Sprout },
  { levels: 'L4–5', name: 'Attaining Handicap', focus: 'Practice scores and a first official handicap', icon: Flag },
  { levels: 'L6–8', name: 'Intermediate & Advanced', focus: 'Competitive rounds & the Karen Junior Challenge', icon: Target },
  { levels: 'L9+', name: 'Enhanced / Elite', focus: 'Faldo, US Kids & scholarship pathways', icon: Crown },
];

// Pre-signup landing (shown at "/" when logged out). A single dynamic page: a
// full-bleed photo hero with the crest, CTAs and a live Club News panel side by
// side (so public announcements sit in the first viewport), over an animated
// junior-pathway band.
export function Landing() {
  return (
    <>
      <HeroSlideshow>
        {/* Hero body — no top bar; the hero CTAs below carry sign-in / register. */}
        <main className="relative flex flex-1 items-center">
          {/* Decorative glow orbs — purely cosmetic, paused for reduced motion. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 top-10 h-72 w-72 animate-pulse rounded-full bg-azure/20 blur-3xl motion-reduce:animate-none"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 animate-pulse rounded-full bg-gold/10 blur-3xl motion-reduce:animate-none"
          />

          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
            {/* Brand + CTAs */}
            <div className="text-center lg:text-left">
              <img
                src="/kcc-logo.png"
                alt=""
                aria-hidden
                className="mx-auto h-24 w-auto animate-fade-in-up drop-shadow-2xl sm:h-32 lg:mx-0"
              />
              <p className="animate-fade-in-up stagger-1 mt-6 text-[11px] font-bold uppercase tracking-[0.25em] text-azure sm:text-xs">
                Karen Country Club · Nairobi
              </p>
              <h1 className="animate-fade-in-up stagger-1 mt-3 text-4xl font-black leading-tight text-silver sm:text-5xl md:text-6xl">
                Junior Golf
                <br />
                Development Academy
              </h1>
              <p className="animate-fade-in-up stagger-2 mx-auto mt-5 max-w-xl text-base text-silver/80 sm:text-lg lg:mx-0">
                From a first swing to elite competition — every round, handicap,
                and milestone tracked along the pathway.
              </p>
              <div className="animate-fade-in-up stagger-3 mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link to="/register" data-testid="hero-get-started">
                  <Button variant="primary" size="lg" fullWidth>
                    Create account
                  </Button>
                </Link>
                <Link to="/login" data-testid="hero-sign-in">
                  <Button variant="secondary" size="lg" fullWidth>
                    Sign in
                  </Button>
                </Link>
              </div>
              <div className="animate-fade-in-up stagger-3 mt-6 flex items-center justify-center gap-5 text-xs text-silver/70 lg:justify-start">
                <span>
                  <span className="font-black text-silver">4</span> bands
                </span>
                <span className="h-3 w-px bg-white/20" />
                <span>
                  <span className="font-black text-silver">9</span> levels
                </span>
                <span className="h-3 w-px bg-white/20" />
                <span>one pathway</span>
              </div>
            </div>

            {/* Live public announcements — in the first viewport. */}
            <ClubNews />
          </div>
        </main>
      </HeroSlideshow>

      {/* Junior League scoreboard — public feed; self-hides when no current
          league. Full-width navy band (matches the sections around it); the
          inner column directly wraps the hero, so when the hero renders null it
          has no children and `empty:hidden` collapses the column and its top
          padding — leaving only the zero-height navy band, no dead gap. */}
      <div className="bg-navy px-6">
        <div className="mx-auto max-w-6xl pt-16 empty:hidden sm:pt-20">
          <ScoreboardHero source="public" />
        </div>
      </div>

      {/* The pathway band */}
      <section className="bg-navy px-6 py-16 sm:py-20" aria-labelledby="pathway-heading">
        <div className="mx-auto max-w-6xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-azure">The journey</p>
          <h2 id="pathway-heading" className="mt-2 text-2xl font-black text-silver sm:text-3xl">
            One pathway, four bands
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PATHWAY.map((band, i) => (
              <article
                key={band.levels}
                className="glass-light group rounded-2xl p-5 transition-all hover:-translate-y-1 hover:bg-white/[0.07]"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-azure/15 text-azure transition-colors group-hover:bg-azure/25">
                    <band.icon size={20} aria-hidden />
                  </span>
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold text-gold">
                    {band.levels}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-bold text-silver">{band.name}</h3>
                <p className="mt-1 text-sm text-slate">{band.focus}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
