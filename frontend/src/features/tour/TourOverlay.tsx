import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

import { cn } from '../../lib/cn';
import { useTour } from './useTour';

// Geometry constants.
const SPOTLIGHT_PAD = 8; // breathing room around the highlighted element
const CARD_GAP = 14; // distance from the target to the card
const VIEWPORT_MARGIN = 16; // keep the card this far from the screen edge
const CARD_WIDTH = 320; // matches w-80

// How long to keep polling for a step's target after navigating before we give
// up and centre the card. Pages load async (React Query), and a step may point
// at a sidebar item that doesn't exist on mobile — both resolve here.
const TARGET_WAIT_MS = 1800;
// Smooth glide for the spotlight + card between steps.
const MOVE_MS = 450;
const MOVE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface Pos {
  top: number;
  left: number;
}

// Pick the first side whose card placement fits the viewport; clamp into view.
// Returns null to mean "centre the card" (no target, or nothing fits).
function placeCard(
  rect: DOMRect | null,
  cardW: number,
  cardH: number,
  vw: number,
  vh: number,
  preferred: Side | 'auto',
): Pos | null {
  if (!rect) return null;

  const order: Side[] = ['bottom', 'right', 'top', 'left'];
  const sides: Side[] =
    preferred === 'auto' ? order : [preferred, ...order.filter((s) => s !== preferred)];

  const cx = rect.left + rect.width / 2 - cardW / 2;
  const cy = rect.top + rect.height / 2 - cardH / 2;
  const candidates: Record<Side, Pos> = {
    bottom: { top: rect.bottom + CARD_GAP, left: cx },
    top: { top: rect.top - CARD_GAP - cardH, left: cx },
    right: { top: cy, left: rect.right + CARD_GAP },
    left: { top: cy, left: rect.left - CARD_GAP - cardW },
  };

  const fits = (p: Pos) =>
    p.left >= VIEWPORT_MARGIN &&
    p.left + cardW <= vw - VIEWPORT_MARGIN &&
    p.top >= VIEWPORT_MARGIN &&
    p.top + cardH <= vh - VIEWPORT_MARGIN;

  for (const side of sides) {
    if (fits(candidates[side])) return candidates[side];
  }
  return null;
}

export function TourOverlay() {
  const { active, stepIndex, steps, next, back, close } = useTour();
  const step = active ? steps[stepIndex] : undefined;

  const navigate = useNavigate();
  const location = useLocation();

  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  // Honour the OS "reduce motion" setting — disable the glide transitions.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Re-measure the current target (used by scroll/resize so the spotlight stays
  // glued). Leaves rect untouched if the element has gone — the step-change
  // effect owns the "give up and centre" decision.
  const measure = useCallback(() => {
    if (!step) return;
    if (!step.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(step.target);
    if (el) setRect(el.getBoundingClientRect());
  }, [step]);

  // On each step: navigate to the step's page if needed, then poll for the
  // target (it may mount after the page's data loads) and measure it. Falls back
  // to a centred card if the target never appears (e.g. a sidebar item on
  // mobile). Retains the previous spotlight while staying on the same page so
  // consecutive steps glide; clears it when changing page to avoid a stale
  // spotlight hovering over the wrong screen.
  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false;

    const needsNav = step.path != null && location.pathname !== step.path;
    if (needsNav) {
      navigate(step.path!);
      setRect(null); // centre while the new page comes in
    }

    const start = performance.now();
    let settleTimer = 0;

    const tick = () => {
      if (cancelled) return;
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(step.target);
      if (el) {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        setRect(el.getBoundingClientRect());
        // Re-measure once the smooth scroll has likely settled.
        settleTimer = window.setTimeout(() => {
          if (cancelled) return;
          const again = document.querySelector<HTMLElement>(step.target);
          if (again) setRect(again.getBoundingClientRect());
        }, 350);
        return;
      }
      if (performance.now() - start > TARGET_WAIT_MS) {
        setRect(null); // give up gracefully → centred card
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };
    let raf = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(settleTimer);
    };
  }, [active, step, navigate, location.pathname]);

  // Keep the spotlight glued to the target as the user scrolls/resizes.
  useEffect(() => {
    if (!active) return;
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [active, measure]);

  // Position the card from the measured target + the card's own size.
  useLayoutEffect(() => {
    if (!active) return;
    const cardH = cardRef.current?.offsetHeight ?? 200;
    setPos(placeCard(rect, CARD_WIDTH, cardH, window.innerWidth, window.innerHeight, step?.placement ?? 'auto'));
  }, [active, rect, step, stepIndex]);

  // Keyboard: Esc closes, arrows/Enter navigate.
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, next, back, close]);

  if (!active || !step) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const centred = pos === null;
  const glide = reduceMotion ? undefined : `top ${MOVE_MS}ms ${MOVE_EASE}, left ${MOVE_MS}ms ${MOVE_EASE}`;

  return createPortal(
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* Click blocker — keeps focus on the tour; clicks here do nothing (use the
          controls or Esc to leave). Transparent: the dim comes from the spotlight
          box-shadow so an untargeted step stays light, per the house no-heavy-dim
          preference. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => {}}
        className="absolute inset-0 cursor-default"
      />

      {/* Spotlight: a single element whose huge box-shadow paints the dim AND
          punches the cutout in one go. When there's no target it's hidden and the
          card simply centres. */}
      {rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-2xl transition-all motion-reduce:transition-none"
          style={{
            top: rect.top - SPOTLIGHT_PAD,
            left: rect.left - SPOTLIGHT_PAD,
            width: rect.width + SPOTLIGHT_PAD * 2,
            height: rect.height + SPOTLIGHT_PAD * 2,
            transitionDuration: reduceMotion ? undefined : `${MOVE_MS}ms`,
            transitionTimingFunction: reduceMotion ? undefined : MOVE_EASE,
            // First shadow = the azure highlight ring; second = the dim that fills
            // the rest of the screen, leaving this element as the bright cutout.
            boxShadow: '0 0 0 2px rgba(0, 130, 205, 0.7), 0 0 0 9999px rgba(1, 35, 73, 0.72)',
          }}
        />
      )}
      {/* No-target step: a soft full-screen dim so the centred card reads. */}
      {!rect && <div aria-hidden="true" className="absolute inset-0 bg-navy/72 transition-opacity duration-300" />}

      {/* Step card */}
      <div
        ref={cardRef}
        data-testid="tour-card"
        className={cn(
          'absolute w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-azure/30 bg-navy/95 p-5 shadow-2xl ring-1 ring-azure/20 backdrop-blur',
          'animate-fade-in',
        )}
        style={
          centred
            ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
            : { top: pos.top, left: pos.left, transition: glide }
        }
      >
        <button
          type="button"
          onClick={close}
          aria-label="End tour"
          data-testid="tour-close"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate transition-colors hover:bg-white/5 hover:text-silver"
        >
          <X size={16} />
        </button>

        {/* Keyed by step so the text gently cross-fades as you advance. */}
        <div key={stepIndex} className={cn(!reduceMotion && 'animate-fade-in')}>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-azure">
            Step {stepIndex + 1} of {steps.length}
          </p>
          <h2 className="mt-1 pr-6 text-lg font-black text-silver">{step.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate">{step.body}</p>
        </div>

        {/* Progress dots */}
        <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === stepIndex ? 'w-5 bg-azure' : 'w-1.5 bg-white/15',
              )}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={close}
            data-testid="tour-skip"
            className="text-xs font-semibold text-slate transition-colors hover:text-silver"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={back}
                data-testid="tour-back"
                className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate transition-colors hover:bg-white/5 hover:text-silver"
              >
                <ArrowLeft size={15} /> Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              data-testid="tour-next"
              className="inline-flex items-center gap-1 rounded-xl bg-azure px-4 py-2 text-sm font-bold text-navy transition-colors hover:bg-azure/90"
            >
              {isLast ? 'Done' : 'Next'}
              {!isLast && <ArrowRight size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
