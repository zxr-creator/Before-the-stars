// The guided tutorial: an offer card on the first match, then a sequence of
// coach marks anchored to real interface elements. Nothing here ever takes a
// click away from the game: the spotlight is purely visual, and only the small
// callout card is interactive.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../icons';
import { cx } from '../ui';
import { openOverlay, useApp } from '../store';
import type { AppState } from '../store';
import { t, useLocale } from '../i18n';
import {
  askSkip, finishTutorial, neverOffer, nextStep, offerAllowed, prevStep, resumeTutorial, skipTutorial, snoozeOffer,
  startTutorial, syncTutorial, useTour,
} from './state';
import { STEPS, stepStrings } from './steps';
import type { Side, Step } from './steps';
import { topicStrings } from './topics';
import './tutorial.css';

export { startTutorial } from './state';

interface Box { x: number; y: number; w: number; h: number }

declare global {
  interface Window { __btsTutorialStrings?: () => string[] }
}
if (typeof window !== 'undefined') window.__btsTutorialStrings = () => [...stepStrings(), ...topicStrings()];

function visibleBox(el: Element): Box | null {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  if (r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Where the step points: an element, the capital on the map, or nothing. */
function findAnchor(step: Step, s: AppState): Box | null {
  if (step.capital && s.obs) {
    const canvas = document.querySelector('[data-testid="map-canvas"]');
    const cb = canvas ? visibleBox(canvas) : null;
    let c: [number, number] | null = null;
    // The map renderer's test hook is optional (the map may be replaced behind the same component).
    const atlas = (window as unknown as { __atlas?: { regionScreenCenter?: (id: number) => [number, number] | null } }).__atlas;
    try { c = atlas?.regionScreenCenter?.(s.obs.civ.capital) ?? null; } catch { c = null; }
    if (c && cb && c[0] > cb.x + 20 && c[0] < cb.x + cb.w - 20 && c[1] > cb.y + 20 && c[1] < cb.y + cb.h - 20) {
      // Only when nothing of ours covers that spot.
      const top = document.elementFromPoint(c[0], c[1]);
      if (top && (top === canvas || top.closest('.map-view'))) return { x: c[0] - 46, y: c[1] - 46, w: 92, h: 92 };
    }
    return null;
  }
  for (const sel of step.anchors ?? []) {
    const el = document.querySelector(sel);
    const box = el ? visibleBox(el) : null;
    if (box) return box;
  }
  return null;
}

function same(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1;
}

function useAnchor(step: Step | null, s: AppState): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  const live = useRef({ step, s });
  live.current = { step, s };
  const last = useRef<Box | null>(null);
  useEffect(() => {
    const measure = () => {
      const cur = live.current;
      const next = cur.step ? findAnchor(cur.step, cur.s) : null;
      if (!same(next, last.current)) {
        last.current = next;
        setBox(next);
      }
    };
    measure();
    const timer = setInterval(measure, 140);
    window.addEventListener('resize', measure);
    return () => { clearInterval(timer); window.removeEventListener('resize', measure); };
  }, [step?.key]);
  return box;
}

const GAP = 16;
const EDGE = 12;
const TOPBAR = 56;

/** Place the callout beside the anchor, on the first side where it fits; never over it. */
function place(anchor: Box | null, step: Step, cw: number, ch: number, vw: number, vh: number): { x: number; y: number; side: Side | 'center' | 'low' } {
  // Keep clear of the top bar unless the step is about the top bar itself.
  const top = anchor && anchor.y < TOPBAR ? EDGE : Math.min(TOPBAR + 8, Math.max(EDGE, vh - ch - EDGE));
  const clampX = (x: number) => Math.max(EDGE, Math.min(vw - cw - EDGE, x));
  const clampY = (y: number) => Math.max(top, Math.min(vh - ch - EDGE, y));
  if (!anchor) {
    // An explanation with nothing to point at sits in the middle; an instruction keeps out of the way.
    if (step.mode === 'info') return { x: clampX((vw - cw) / 2), y: clampY((vh - ch) / 2 - 20), side: 'center' };
    return { x: clampX((vw - cw) / 2), y: clampY(vh - ch - 150), side: 'low' };
  }
  const cx0 = anchor.x + anchor.w / 2;
  const cy0 = anchor.y + anchor.h / 2;
  const tries: Side[] = [];
  for (const sd of [step.side ?? 'right', 'right', 'left', 'bottom', 'top'] as Side[]) if (sd !== 'inside' && !tries.includes(sd)) tries.push(sd);
  if (step.side !== 'inside') {
    for (const sd of tries) {
      if (sd === 'right' && anchor.x + anchor.w + GAP + cw + EDGE <= vw) return { x: anchor.x + anchor.w + GAP, y: clampY(cy0 - ch / 2), side: sd };
      if (sd === 'left' && anchor.x - GAP - cw - EDGE >= 0) return { x: anchor.x - GAP - cw, y: clampY(cy0 - ch / 2), side: sd };
      if (sd === 'bottom' && anchor.y + anchor.h + GAP + ch + EDGE <= vh) return { x: clampX(cx0 - cw / 2), y: anchor.y + anchor.h + GAP, side: sd };
      if (sd === 'top' && anchor.y - GAP - ch - top >= 0) return { x: clampX(cx0 - cw / 2), y: anchor.y - GAP - ch, side: sd };
    }
  }
  // The anchor fills the screen (an overlay): tuck the card into its lower right corner.
  return { x: clampX(anchor.x + anchor.w - cw - 28), y: clampY(anchor.y + anchor.h - ch - 28), side: 'inside' };
}

function Callout({ step, index, anchor, done, satisfied, asking, extra }: { step: Step; index: number; anchor: Box | null; done: boolean; satisfied: boolean; asking: boolean; extra?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 372, h: 230 });
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (Math.abs(w - size.w) > 1 || Math.abs(h - size.h) > 1) setSize({ w, h });
  });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  // Explanations own the keyboard; instructions leave every game key alone.
  const modal = step.mode === 'info' || asking;
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (asking) {
        if (e.key === 'Escape') askSkip(false);
        else if (e.key === 'Enter') skipTutorial();
        else return;
      } else if (e.key === 'Escape') askSkip(true);
      else if (e.key === 'Enter' || e.key === 'ArrowRight') nextStep();
      else if (e.key === 'ArrowLeft') prevStep();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, asking]);

  const pos = place(anchor, step, size.w, size.h, vp.w, vp.h);
  const last = index === STEPS.length - 1;
  const isDo = step.mode === 'do';
  // The little pointer on the card's edge, aimed at the anchor's centre.
  let pointer: { left?: string; top?: string } | null = null;
  if (anchor && (pos.side === 'right' || pos.side === 'left')) {
    pointer = { top: Math.max(18, Math.min(size.h - 18, anchor.y + anchor.h / 2 - pos.y)) + 'px' };
  } else if (anchor && (pos.side === 'top' || pos.side === 'bottom')) {
    pointer = { left: Math.max(22, Math.min(size.w - 22, anchor.x + anchor.w / 2 - pos.x)) + 'px' };
  }

  return (
    <div ref={ref} class={cx('tut-card', 'is-' + pos.side, isDo && 'is-do', done && 'is-done')} role="dialog" aria-label={t(step.title)}
      data-testid="tutorial-card" data-step={step.key} data-tutorial-modal={modal ? '' : undefined}
      style={{ left: Math.round(pos.x) + 'px', top: Math.round(pos.y) + 'px' }}>
      {pointer ? <span class="tut-pointer" style={pointer} aria-hidden="true" /> : null}
      <header class="tut-head">
        <span class="tut-crest" aria-hidden="true"><Icon name={step.icon} size={17} /></span>
        <div class="tut-heading">
          <span class="tut-kicker">{t('Guided tour')} · {t('Step {n} of {m}', { n: index + 1, m: STEPS.length })}</span>
          <h3>{t(step.title)}</h3>
        </div>
        <button type="button" class="tut-x" aria-label={t('Leave the tour')} title={t('Leave the tour')} data-testid="tutorial-skip" onClick={() => askSkip(true)}>
          <Icon name="close" size={13} />
        </button>
      </header>
      {asking ? (
        <div class="tut-body tut-ask" data-testid="tutorial-ask">
          <p><b>{t('Leave the guided tour?')}</b></p>
          <p>{t('You can restart it at any time from the game menu, and the Almanac (key ?) covers the same ground.')}</p>
          <div class="tut-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-testid="tutorial-ask-stay" onClick={() => askSkip(false)}><span>{t('Keep going')}</span></button>
            <button type="button" class="btn btn-primary btn-sm" data-testid="tutorial-ask-leave" onClick={skipTutorial}><span>{t('Leave the tour')}</span></button>
          </div>
        </div>
      ) : (
        <>
          <div class="tut-body">
            {step.body.map((p) => <p>{t(p)}</p>)}
            {extra ? <p><b>{extra}</b></p> : null}
            {step.hint ? (
              <p class={cx('tut-hint', done && 'is-done')}>
                <span class="tut-hint-mark" aria-hidden="true"><Icon name={done ? 'check' : 'right'} size={12} /></span>
                <span>{done ? (satisfied ? t('Already done. Carry on.') : t('Done.')) : t(step.hint)}</span>
              </p>
            ) : null}
          </div>
          <div class="tut-progress" aria-hidden="true"><span style={{ width: (((index + 1) / STEPS.length) * 100).toFixed(1) + '%' }} /></div>
          <div class="tut-actions">
            <button type="button" class="linklike is-quiet" data-testid="tutorial-leave" onClick={() => askSkip(true)}>{t('Skip the tour')}</button>
            <span class="spacer" />
            {index > 0 ? <button type="button" class="btn btn-ghost btn-sm" data-testid="tutorial-back" onClick={prevStep}><Icon name="left" size={12} /><span>{t('Back')}</span></button> : null}
            {last ? (
              <>
                <button type="button" class="btn btn-default btn-sm" data-testid="tutorial-almanac" onClick={() => { finishTutorial(); openOverlay('almanac'); }}><Icon name="almanac" size={13} /><span>{t('Open the Almanac')}</span></button>
                <button type="button" class="btn btn-primary btn-sm" data-testid="tutorial-next" onClick={finishTutorial}><span>{t('Finish')}</span></button>
              </>
            ) : (
              <button type="button" class={cx('btn', 'btn-sm', isDo && !done ? 'btn-default' : 'btn-primary')} data-testid="tutorial-next" onClick={nextStep}>
                <span>{isDo && !done ? t('Skip this step') : t('Next')}</span><Icon name="right" size={12} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function TutorialLayer() {
  const s = useApp();
  const tour = useTour();
  useLocale();
  const inGame = s.screen === 'game' && !!s.obs && s.mode === 'play' && s.boot === 'ready';
  const showing = inGame && tour.open && !s.menuOpen && s.handover === null && s.overlay !== 'almanac' && s.overlay !== 'ledger';
  const step = showing ? STEPS[tour.step] ?? null : null;
  const anchor = useAnchor(step, s);
  const done = !!(step?.done && s.obs && step.done(s, tour.baseline));

  // The shell may mount after the tour was started (from the title screen): set the step up now.
  useEffect(() => {
    if (inGame && tour.open) syncTutorial();
  }, [inGame]);

  // A step the player has just completed moves on by itself after a beat.
  const auto = done && !tour.baseline.satisfied && !tour.asking;
  useEffect(() => {
    if (!step || !auto) return;
    const timer = setTimeout(nextStep, 1100);
    return () => clearTimeout(timer);
  }, [step?.key, auto]);

  if (step) {
    const pad = step.capital ? 0 : 6;
    const hole = anchor ? { left: anchor.x - pad + 'px', top: anchor.y - pad + 'px', width: anchor.w + pad * 2 + 'px', height: anchor.h + pad * 2 + 'px' } : null;
    return (
      <div class="tutorial" data-testid="tutorial" data-mode={step.mode}>
        {step.mode === 'info'
          ? (hole ? <div class="tut-hole" style={hole} aria-hidden="true" /> : <div class="tut-dim" aria-hidden="true" />)
          : (hole ? <div class={cx('tut-ring', step.capital && 'is-round', done && 'is-done')} style={hole} aria-hidden="true" /> : null)}
        <Callout step={step} index={tour.step} anchor={anchor} done={done} satisfied={tour.baseline.satisfied} asking={tour.asking} key={step.key}
          extra={step.key === 'objective' && s.obs?.objectives.victory ? t('Yours has already been revealed: read it in the Objectives panel.') : null} />
      </div>
    );
  }

  // The offer: small, never modal, and never shown to automated browsers.
  const offer = inGame && !tour.open && (tour.status === 'new' || tour.status === 'active') && !tour.snoozed
    && !s.menuOpen && !s.overlay && !s.pick && s.handover === null && s.obs!.phase !== 'finished' && offerAllowed();
  if (!offer) return null;
  const resuming = tour.status === 'active' && tour.step > 0;
  return (
    <div class="tutorial">
      <div class="tut-offer" role="region" aria-label={t('Guided tour')} data-testid="tutorial-offer">
        <span class="tut-crest" aria-hidden="true"><Icon name="compass" size={18} /></span>
        <div class="tut-offer-text">
          <b>{resuming ? t('Pick up the guided tour?') : t('First time here? Take the guided tour.')}</b>
          <span>{resuming ? t('You stopped at step {n} of {m}.', { n: tour.step + 1, m: STEPS.length }) : t('A few minutes, on your own match, and you can leave at any step.')}</span>
        </div>
        <div class="tut-offer-actions">
          <button type="button" class="btn btn-primary btn-sm" data-testid="tutorial-start" onClick={resuming ? resumeTutorial : startTutorial}><span>{resuming ? t('Resume') : t('Start the tour')}</span></button>
          {resuming ? <button type="button" class="btn btn-default btn-sm" data-testid="tutorial-restart" onClick={startTutorial}><span>{t('Start over')}</span></button> : null}
          <button type="button" class="btn btn-ghost btn-sm" data-testid="tutorial-later" onClick={snoozeOffer}><span>{t('Not now')}</span></button>
          <button type="button" class="linklike is-quiet" data-testid="tutorial-never" onClick={neverOffer}>{t('Never')}</button>
        </div>
      </div>
    </div>
  );
}
