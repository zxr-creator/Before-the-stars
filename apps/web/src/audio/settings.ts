// Sound settings, remembered in this browser (localStorage; a blocked storage only means
// the settings last until the page is closed).
import { useEffect, useState } from 'preact/hooks';

export interface AudioSettings {
  /** 0..1 each; the engine applies a squared (perceptual) curve. */
  master: number;
  music: number;
  effects: number;
  muted: boolean;
  /** Also play music on the title and setup screens (otherwise only in a match). */
  titleMusic: boolean;
  /** Short interface sounds: end of round, order accepted or refused, notifications. */
  uiSounds: boolean;
}

export const AUDIO_DEFAULTS: AudioSettings = { master: 0.8, music: 0.7, effects: 0.6, muted: false, titleMusic: true, uiSounds: true };
const KEY = 'bts.audio';

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

function load(): AudioSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AudioSettings> | null;
    if (!v || typeof v !== 'object') return { ...AUDIO_DEFAULTS };
    return {
      master: num(v.master, AUDIO_DEFAULTS.master),
      music: num(v.music, AUDIO_DEFAULTS.music),
      effects: num(v.effects, AUDIO_DEFAULTS.effects),
      muted: typeof v.muted === 'boolean' ? v.muted : AUDIO_DEFAULTS.muted,
      titleMusic: typeof v.titleMusic === 'boolean' ? v.titleMusic : AUDIO_DEFAULTS.titleMusic,
      uiSounds: typeof v.uiSounds === 'boolean' ? v.uiSounds : AUDIO_DEFAULTS.uiSounds,
    };
  } catch {
    return { ...AUDIO_DEFAULTS };
  }
}

let current: AudioSettings = load();
const listeners = new Set<() => void>();

export function getAudioSettings(): AudioSettings {
  return current;
}

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* not remembered */ }
  listeners.forEach((l) => l());
}

export function subscribeAudioSettings(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useAudioSettings(): AudioSettings {
  const [, force] = useState(0);
  useEffect(() => subscribeAudioSettings(() => force((n) => (n + 1) | 0)), []);
  return current;
}
