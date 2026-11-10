// The tutorial's own small store. It lives at module level so the tour can be
// started before the game shell is mounted (from the title screen or the menu),
// and its progress is remembered in localStorage.
import { useEffect, useState } from 'preact/hooks';
import { closeOverlay, getState, openOverlay, openPanel, selectRegion } from '../store';
import type { AppState } from '../store';
import { STEPS } from './steps';
import type { Baseline } from './steps';

export type TourStatus = 'new' | 'active' | 'done' | 'never';

export interface TourState {
  status: TourStatus;
  /** Index into STEPS of the step last shown. */
  step: number;
  /** The tour is on screen in this page session. */
  open: boolean;
  /** "Not now": the offer stays away until the page is loaded again in a new session. */
  snoozed: boolean;
  /** The "leave the tour?" prompt is showing. */
  asking: boolean;
  baseline: Baseline;
}

const KEY = 'bts.tutorial';
const SNOOZE_KEY = 'bts.tutorial.snooze';

function load(): { status: TourStatus; step: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { status?: TourStatus; step?: number } | null;
    if (raw && typeof raw.status === 'string' && ['new', 'active', 'done', 'never'].includes(raw.status)) {
      const step = Number.isFinite(raw.step) ? Math.max(0, Math.min(STEPS.length - 1, Number(raw.step))) : 0;
      return { status: raw.status, step };
    }
  } catch { /* storage unavailable: the tour simply starts fresh */ }
  return { status: 'new', step: 0 };
}

function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify({ status: tour.status, step: tour.step })); } catch { /* ignore */ }
}

function snoozedNow(): boolean {
  try { return sessionStorage.getItem(SNOOZE_KEY) === '1'; } catch { return false; }
}

const EMPTY: Baseline = { projects: [], leads: 0, round: 0, satisfied: false };
const saved = load();
let tour: TourState = { status: saved.status, step: saved.step, open: false, snoozed: snoozedNow(), asking: false, baseline: EMPTY };
const listeners = new Set<() => void>();

function set(patch: Partial<TourState>): void {
  tour = { ...tour, ...patch };
  listeners.forEach((l) => l());
}

export function getTour(): TourState {
  return tour;
}

export function useTour(): TourState {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => (n + 1) | 0);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return tour;
}

function hasParam(name: string): boolean {
  try { return new URLSearchParams(window.location.search).has(name); } catch { return false; }
}

/**
 * May the tour be offered unasked? Never to automated browsers (several teams'
 * scripts load the game), unless the page was opened with ?tutorial.
 */
export function offerAllowed(): boolean {
  if (hasParam('notutorial')) return false;
  try { if (localStorage.getItem('bts.tutorial.off') === '1') return false; } catch { /* ignore */ }
  if (typeof navigator !== 'undefined' && navigator.webdriver && !hasParam('tutorial')) return false;
  return true;
}

function baselineFor(index: number, s: AppState): Baseline {
  const obs = s.obs;
  const base: Baseline = {
    projects: obs ? obs.projects.map((p) => p.id) : [],
    leads: obs ? obs.knowledge.leads.length : 0,
    round: obs ? obs.round : 0,
    satisfied: false,
  };
  const step = STEPS[index];
  base.satisfied = !!(step?.done && obs && step.done(s, base));
  return base;
}

/** Put the interface in the state a step expects (never anything the player could not do). */
function prepare(index: number): void {
  const s = getState();
  const step = STEPS[index];
  if (!step || !s.obs || s.screen !== 'game') return;
  if (step.overlay === 'tech') {
    if (s.overlay !== 'tech') openOverlay('tech');
  } else if (s.overlay && step.key !== 'tree') closeOverlay();
  if (step.panel && s.panel !== step.panel) openPanel(step.panel);
  if (step.key === 'inspector' && s.selectedRegion === null) selectRegion(s.obs.civ.capital, true);
}

function enter(index: number): void {
  const i = Math.max(0, Math.min(STEPS.length - 1, index));
  prepare(i);
  set({ status: 'active', step: i, open: true, asking: false, baseline: baselineFor(i, getState()) });
  save();
}

/** Start (or restart) the guided tutorial from its first step. */
export function startTutorial(): void {
  enter(0);
}

/** Pick the tour up where it was left. */
export function resumeTutorial(): void {
  enter(tour.status === 'active' ? tour.step : 0);
}

/** The game shell appeared while the tour is open: make sure the step's setup has been applied. */
export function syncTutorial(): void {
  if (!tour.open) return;
  prepare(tour.step);
  set({ baseline: baselineFor(tour.step, getState()) });
}

export function nextStep(): void {
  if (!tour.open) return;
  if (tour.step >= STEPS.length - 1) {
    finishTutorial();
    return;
  }
  enter(tour.step + 1);
}

export function prevStep(): void {
  if (tour.open && tour.step > 0) enter(tour.step - 1);
}

export function askSkip(asking: boolean): void {
  if (tour.open) set({ asking });
}

export function finishTutorial(): void {
  const s = getState();
  if (s.overlay === 'tech' && STEPS[tour.step]?.overlay === 'tech') closeOverlay();
  set({ status: 'done', open: false, asking: false, step: 0 });
  save();
}

/** Leave the tour for now; it can be restarted from the menu. */
export function skipTutorial(): void {
  finishTutorial();
}

export function snoozeOffer(): void {
  try { sessionStorage.setItem(SNOOZE_KEY, '1'); } catch { /* ignore */ }
  set({ snoozed: true });
}

export function neverOffer(): void {
  set({ status: 'never', open: false });
  save();
}
