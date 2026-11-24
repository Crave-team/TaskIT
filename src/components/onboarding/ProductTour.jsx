import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTour } from '../../context/TourContext';
import Button from '../common/Button';

const PAD = 8; // breathing room between the target and its highlight
const GAP = 18; // distance from the highlight to the card (room for the arrow)
const MARGIN = 12; // minimum distance from the screen edge
const ARROW = 12; // arrow square size
const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/**
 * Places the card next to the target and works out where the arrow must sit so it
 * points at the middle of the target even when the card had to be nudged to stay
 * on screen. If the wanted side has no room, the opposite (then the other) side is used.
 * `placement` is where the CARD goes relative to the target.
 */
function layoutFor(rect, placement, size, vw, vh) {
  const hl = { // the highlighted box (target + padding)
    top: rect.top - PAD, left: rect.left - PAD, right: rect.right + PAD, bottom: rect.bottom + PAD,
  };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const fits = (p) => {
    if (p === 'left') return hl.left - GAP - size.w >= MARGIN;
    if (p === 'right') return hl.right + GAP + size.w <= vw - MARGIN;
    if (p === 'top') return hl.top - GAP - size.h >= MARGIN;
    return hl.bottom + GAP + size.h <= vh - MARGIN;
  };
  const order = [placement, OPPOSITE[placement], ...['bottom', 'top', 'left', 'right'].filter((p) => p !== placement && p !== OPPOSITE[placement])];
  const side = order.find(fits) || placement;

  let left;
  let top;
  if (side === 'left' || side === 'right') {
    left = side === 'left' ? hl.left - GAP - size.w : hl.right + GAP;
    top = clamp(cy - size.h / 2, MARGIN, Math.max(MARGIN, vh - size.h - MARGIN));
  } else {
    top = side === 'top' ? hl.top - GAP - size.h : hl.bottom + GAP;
    left = clamp(cx - size.w / 2, MARGIN, Math.max(MARGIN, vw - size.w - MARGIN));
  }
  left = clamp(left, MARGIN, Math.max(MARGIN, vw - size.w - MARGIN));
  top = clamp(top, MARGIN, Math.max(MARGIN, vh - size.h - MARGIN));

  // Arrow sits on the card edge that faces the target, aimed at the target's centre.
  const vertical = side === 'left' || side === 'right';
  const along = vertical ? clamp(cy - top, 22, size.h - 22) : clamp(cx - left, 22, size.w - 22);
  return { left, top, edge: OPPOSITE[side], along, vertical };
}

/**
 * Global, route-aware guided tour. Dims the page, cuts out the current step's target and
 * wraps it in a pulsing brand-green ring so it is obvious which button is being explained;
 * a card with an arrow aimed at that exact spot carries the explanation. Steps without a
 * target (welcome / finish, or a page element that isn't on screen) show a centred card.
 */
export default function ProductTour() {
  const { open, step, stepIndex, totalSteps, next, prev, skip, finish } = useTour();
  const [rect, setRect] = useState(null);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [size, setSize] = useState({ w: 340, h: 200 });
  const cardRef = useRef(null);

  // Find the step's target (waiting for the page to render after a route change) and keep it measured.
  useEffect(() => {
    setRect(null);
    if (!open || !step?.selector) return undefined;

    let cancelled = false;
    let attempts = 0;
    let rafId;
    let intervalId;
    let scrolled = false;

    const measure = () => {
      const el = document.querySelector(step.selector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      setRect((prev) => (prev && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5 ? prev : r));
    };

    const tryFind = () => {
      if (cancelled) return;
      const el = document.querySelector(step.selector);
      if (el && el.getBoundingClientRect().width > 0) {
        if (!scrolled) {
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
          scrolled = true;
        }
        measure();
        // Re-measure while layout settles (route transitions, images, fonts) and on any later shift.
        intervalId = setInterval(measure, 200);
      } else if (attempts < 150) {
        attempts += 1;
        rafId = requestAnimationFrame(tryFind);
      }
    };
    tryFind();

    const onChange = () => { setView({ w: window.innerWidth, h: window.innerHeight }); measure(); };
    window.addEventListener('resize', onChange);
    document.addEventListener('scroll', onChange, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      clearInterval(intervalId);
      window.removeEventListener('resize', onChange);
      document.removeEventListener('scroll', onChange, true);
    };
  }, [open, step]);

  // Measure the card so the layout can keep it (and its arrow) exactly aligned.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w !== size.w || h !== size.h) setSize({ w, h });
  });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') skip();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, skip, next, prev]);

  if (!open || !step) return null;

  const targeted = Boolean(step.selector && rect && step.placement !== 'center');
  const isLast = stepIndex === totalSteps - 1;
  const cardW = Math.min(340, view.w - MARGIN * 2);
  const layout = targeted ? layoutFor(rect, step.placement, { w: cardW, h: size.h }, view.w, view.h) : null;
  const waiting = Boolean(step.selector) && !rect; // target not on screen (yet)

  const arrowStyle = layout && (layout.vertical
    ? { top: layout.along - ARROW / 2 }
    : { left: layout.along - ARROW / 2 });
  const arrowEdge = layout && {
    top: { top: -ARROW / 2 }, bottom: { bottom: -ARROW / 2 }, left: { left: -ARROW / 2 }, right: { right: -ARROW / 2 },
  }[layout.edge];
  // Only the two borders that face the target stay visible, so the arrow looks like part of the card.
  const arrowBorder = layout && {
    top: 'border-l border-t', bottom: 'border-r border-b', left: 'border-l border-b', right: 'border-r border-t',
  }[layout.edge];

  const card = (
    <div
      ref={cardRef}
      style={{ width: cardW }}
      className="relative bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-2xl shadow-elevated p-4 animate-[popIn_220ms_cubic-bezier(0.22,1,0.36,1)]"
    >
      {layout && (
        <span
          aria-hidden="true"
          style={{ ...arrowEdge, ...arrowStyle, width: ARROW, height: ARROW }}
          className={`absolute rotate-45 bg-surface-card dark:bg-surface-darkcard border-brand-600/60 ${arrowBorder}`}
        />
      )}

      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-fluid-xs font-semibold text-brand-600 dark:text-brand-300">
          Step {stepIndex + 1} of {totalSteps}
        </span>
        <button
          onClick={skip}
          aria-label="Close tour"
          className="p-1 -m-1 rounded-md text-ink-500 hover:bg-ink-500/10 dark:hover:bg-white/10 transition-colors shrink-0"
        >
          <X size={15} />
        </button>
      </div>
      <div className="h-1 rounded-full bg-ink-500/10 dark:bg-white/10 mb-3 overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-brand-600 transition-all duration-300" style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }} />
      </div>

      <h3 className="font-display font-semibold text-fluid-base text-ink-900 dark:text-white mb-1">{step.title}</h3>
      <p className="text-fluid-sm text-ink-700 dark:text-ink-300 leading-snug">{step.body}</p>
      {waiting && <p className="mt-2 text-fluid-xs text-ink-500">This part isn’t on screen right now — you’ll find it as described above.</p>}

      <div className="flex items-center justify-between gap-2 mt-4">
        <button onClick={skip} className="text-fluid-xs text-ink-500 hover:text-ink-900 dark:hover:text-white transition-colors">
          Skip tour
        </button>
        <div className="flex items-center gap-2">
          {stepIndex > 0 && (
            <Button variant="secondary" size="sm" icon={<ChevronLeft size={14} />} onClick={prev}>Back</Button>
          )}
          <Button size="sm" onClick={isLast ? finish : next}>
            {isLast ? 'Finish' : <>Next <ChevronRight size={14} /></>}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Click-blocker so the page underneath can't be used mid-tour. */}
      <div className="absolute inset-0" />

      {targeted ? (
        <>
          {/* dimmed page with a cut-out exactly over the target */}
          <div
            aria-hidden="true"
            className="fixed rounded-2xl pointer-events-none transition-all duration-200 ease-out"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              boxShadow: '0 0 0 9999px rgba(10,12,15,0.66)',
            }}
          />
          {/* glowing, pulsing ring that marks the thing being explained */}
          <div
            aria-hidden="true"
            data-tour-ring
            className="fixed rounded-2xl pointer-events-none border-2 border-brand-500 animate-[tourPulse_1.6s_ease-out_infinite] transition-all duration-200 ease-out"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
            }}
          />
          <div className="fixed" style={{ top: layout.top, left: layout.left }}>{card}</div>
        </>
      ) : (
        <>
          <div className="fixed inset-0 bg-ink-900/65 pointer-events-none" />
          <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto">{card}</div>
          </div>
        </>
      )}
    </div>
  );
}
