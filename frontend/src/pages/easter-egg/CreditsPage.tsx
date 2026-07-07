import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Code2,
  Coffee,
  Flag,
  PartyPopper,
  Server,
  Sparkles,
} from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { fireAchievementConfetti } from '../../features/achievements/confetti';

// The hidden "19th hole" — reached only via the Konami code (↑↑↓↓←→←→ B A).
// A warm, golf-themed thank-you to the people who built the platform. Public
// (no auth) so the code works from anywhere, even the login screen.
interface Dev {
  name: string;
  title: string;
  blurb: string;
  Icon: typeof Code2;
}

const DEVS: Dev[] = [
  {
    name: 'Sam Kinuthia',
    title: 'Product Lead & Frontend Architect',
    blurb:
      "Turns 'wouldn't it be cool if…' into shipped features. Designed the role-shaped app, sweated every pixel, and kept the whole thing pointed at the kids on the range.",
    Icon: Code2,
  },
  {
    name: 'Danie Mungai',
    title: 'Backend Engineer',
    blurb:
      'Keeper of the WHS engine, the handicap math, and a database that never sleeps. If a number is right, Danie is why.',
    Icon: Server,
  },
];

export function CreditsPage() {
  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy px-4 py-12"
      data-testid="credits-page"
    >
      {/* Soft golf-green glow behind the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl"
      />

      <div className="relative w-full max-w-2xl animate-fade-in-up">
        {/* Bouncing flag-in-the-hole crest. */}
        <div className="mb-6 flex justify-center">
          <span className="flex h-16 w-16 animate-bounce items-center justify-center rounded-full bg-gold/15 ring-2 ring-gold/40">
            <Flag size={30} className="text-gold" />
          </span>
        </div>

        <div className="text-center">
          <p className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.3em] text-azure">
            <Sparkles size={14} /> You found the secret
          </p>
          <h1 className="mt-2 text-4xl font-black text-silver sm:text-5xl">
            The 19th Hole
          </h1>
          <p className="mt-3 text-sm text-slate">
            Pull up a chair at the clubhouse bar — this little corner is for the
            two who built the place. Brewed with{' '}
            <Coffee size={14} className="inline align-text-bottom text-gold" />{' '}
            and far too many range sessions.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {DEVS.map((dev) => (
            <GlassCard
              key={dev.name}
              className="p-5 ring-1 ring-gold/30"
              data-testid={`credit-${dev.name.split(' ')[0].toLowerCase()}`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-azure/15 ring-1 ring-azure/30">
                <dev.Icon size={22} className="text-azure" />
              </span>
              <h2 className="mt-3 text-lg font-black text-silver">{dev.name}</h2>
              <p className="text-sm font-bold text-gold">{dev.title}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate">
                {dev.blurb}
              </p>
            </GlassCard>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Button
            variant="gold"
            onClick={() => fireAchievementConfetti()}
            data-testid="credits-confetti"
          >
            <PartyPopper size={18} /> Do it again!
          </Button>
          <Link to="/">
            <Button variant="ghost" size="sm" data-testid="credits-back">
              <ArrowLeft size={16} /> Back to safety
            </Button>
          </Link>
          <p className="mt-2 font-mono text-[10px] tracking-widest text-slate/50">
            ↑ ↑ ↓ ↓ ← → ← → B A
          </p>
        </div>
      </div>
    </div>
  );
}
