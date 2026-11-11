// Music and interface sound: the small part that loads with the page.
//
// Nothing audible is created before the player's first click, tap or key press: browsers
// and the desktop web views (WKWebView, WebView2) only let audio start from a gesture.
// On that gesture the AudioContext is created and resumed inside the event handler (what
// Safari/WKWebView require), and the engine — composer, instruments, conductor, about
// 30 kB — is fetched as a separate chunk. Every later gesture also resumes a context the
// system suspended. Without Web Audio the game is simply silent; nothing here throws.
//
// From then on this module watches the store and the settings and tells the engine what
// to play: the title theme, or the era of the civilization on screen in peace or war,
// with stings for major moments and the end of the match, and short interface sounds.
// M mutes and unmutes anywhere (except while typing). A hidden tab fades out and the
// context is suspended until the page is visible again.
import { getState, subscribe, type AppState } from '../store';
import { getAudioSettings, setAudioSettings, subscribeAudioSettings } from './settings';
import { musicTarget, type MusicTarget } from './era';
import type { MusicEngine, SfxKind, StingKind } from './engine';

export type AudioStatus = 'idle' | 'loading' | 'running' | 'unavailable' | 'error';

let status: AudioStatus = 'idle';
let ctx: AudioContext | null = null;
let engine: MusicEngine | null = null;
let installed = false;
let forced: MusicTarget | null | undefined;
const statusListeners = new Set<() => void>();

type ACtor = typeof AudioContext;
function audioCtor(): ACtor | null {
  const w = window as unknown as { AudioContext?: ACtor; webkitAudioContext?: ACtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function setStatus(s: AudioStatus): void {
  if (s === status) return;
  status = s;
  statusListeners.forEach((l) => l());
}

export function audioStatus(): AudioStatus {
  return status;
}

export function subscribeAudioStatus(l: () => void): () => void {
  statusListeners.add(l);
  return () => { statusListeners.delete(l); };
}

// --- start on a gesture ---------------------------------------------------------------------

function onGesture(): void {
  const st = getAudioSettings();
  if (ctx) {
    if (ctx.state === 'suspended' && !st.muted && !document.hidden) void ctx.resume().catch(() => {});
    return;
  }
  // a muted player never pays for audio; unmuting (M or the settings) is itself a gesture
  if (st.muted || status === 'unavailable' || status === 'error') return;
  const AC = audioCtor();
  if (!AC) { setStatus('unavailable'); return; }
  try {
    ctx = new AC({ latencyHint: 'playback' });
    void ctx.resume().catch(() => {});
  } catch {
    ctx = null;
    setStatus('unavailable');
    return;
  }
  setStatus('loading');
  const c = ctx;
  import('./engine').then((m) => {
    engine = m.createEngine(c);
    setStatus('running');
    applySettings();
    engine.setHidden(document.hidden);
    lastTargetKey = '';
    update(true);
  }).catch(() => {
    setStatus('error');
    void c.close().catch(() => {});
    ctx = null;
  });
}

// --- settings --------------------------------------------------------------------------------

function applySettings(): void {
  const s = getAudioSettings();
  if (!engine) {
    // unmuted before any sound was made: the click that did it starts the audio
    return;
  }
  engine.setVolumes({ master: s.master, music: s.music, effects: s.uiSounds ? s.effects : 0, muted: s.muted });
  lastTargetKey = '';
  update(false);
}

export function toggleMute(): void {
  setAudioSettings({ muted: !getAudioSettings().muted });
  // the key press or click that unmuted is the gesture that may start the audio
  if (!getAudioSettings().muted) onGesture();
}

// --- following the game ---------------------------------------------------------------------

let lastTargetKey = '';
let seen: {
  match: string | null; seat: number | null; round: number | null; outcome: boolean; banners: Set<number>; toast: number;
} = { match: null, seat: null, round: null, outcome: false, banners: new Set(), toast: 0 };
let quietUntil = 0;
let lastObs: unknown = null;
let lastSpec: unknown = null;
let lastScreen = '';
let cachedTarget: MusicTarget | null = null;

function target(s: AppState): MusicTarget | null {
  if (forced !== undefined) return forced;
  const titleMusic = getAudioSettings().titleMusic;
  const key = `${s.boot}|${s.screen}|${s.mode}|${s.viewAs}|${titleMusic}`;
  if (s.obs !== lastObs || s.spectator !== lastSpec || key !== lastScreen) {
    lastObs = s.obs;
    lastSpec = s.spectator;
    lastScreen = key;
    cachedTarget = musicTarget(s, titleMusic);
  }
  return cachedTarget;
}

function update(initial: boolean): void {
  const s = getState();
  const tg = target(s);
  const k = tg ? `${tg.key}|${tg.mood}|${tg.intensity.toFixed(2)}` : 'none';
  if (engine && k !== lastTargetKey) {
    lastTargetKey = k;
    engine.setTarget(tg ? { key: tg.key, mood: tg.mood, intensity: tg.intensity } : null);
  }
  events(s, initial);
}

/** Stings and interface sounds for what just happened. */
function events(s: AppState, initial: boolean): void {
  const obs = s.mode === 'observe' && s.viewAs === null ? null : s.obs;
  const match = obs?.match_id ?? s.spectator?.match_id ?? null;
  const seat = obs ? obs.seat : null;
  const round = obs?.round ?? s.spectator?.round ?? null;
  const outcome = !!(obs ? obs.outcome : s.spectator?.outcome);
  const sameMatch = match !== null && match === seen.match && seat === seen.seat;
  let sting: StingKind | null = null;
  let sfx: SfxKind | null = null;
  if (sameMatch && !initial) {
    if (outcome && !seen.outcome) {
      const won = obs ? obs.outcome?.winner === obs.seat : true;
      sting = won ? 'victory' : 'defeat';
    } else if (s.banners.some((b) => !seen.banners.has(b.id))) {
      sting = 'moment';
    } else if (round !== null && seen.round !== null && round > seen.round && s.mode === 'play') {
      sfx = 'round';
    }
  }
  const newest = s.toasts.length ? s.toasts[s.toasts.length - 1] : null;
  if (!sfx && !sting && newest && newest.id > seen.toast && !initial) {
    sfx = newest.tone === 'ok' ? 'accept' : newest.tone === 'bad' ? 'reject' : 'notify';
  }
  seen = {
    match, seat, round, outcome,
    banners: new Set(s.banners.map((b) => b.id)),
    toast: Math.max(seen.toast, ...s.toasts.map((x) => x.id)),
  };
  if (!engine) return;
  const now = performance.now();
  if (sting) {
    engine.sting(sting);
    quietUntil = now + 2500;
  } else if (sfx && now >= quietUntil && getAudioSettings().uiSounds) {
    engine.sfx(sfx);
  }
}

// --- install ---------------------------------------------------------------------------------

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Wire the audio to the page. Idempotent; safe without Web Audio. */
export function installAudio(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  if (!audioCtor()) status = 'unavailable';
  const opts = { capture: true, passive: true } as AddEventListenerOptions;
  window.addEventListener('pointerdown', onGesture, opts);
  window.addEventListener('touchend', onGesture, opts);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      if (!isTyping(e) && !e.metaKey && !e.ctrlKey && !e.altKey) { toggleMute(); return; }
    }
    onGesture();
  }, { capture: true });
  document.addEventListener('visibilitychange', () => engine?.setHidden(document.hidden));
  subscribeAudioSettings(applySettings);
  subscribe(() => update(false));
  update(true);
  (window as unknown as { __btsAudio?: unknown }).__btsAudio = {
    status: () => status,
    stats: () => (engine ? engine.stats() : null),
    contextState: () => ctx?.state ?? null,
    /** Tests: play this target instead of the game's (undefined restores the game's). */
    force: (t: MusicTarget | null | undefined) => { forced = t; lastTargetKey = ''; update(false); },
    sting: (k: StingKind) => engine?.sting(k),
  };
}
