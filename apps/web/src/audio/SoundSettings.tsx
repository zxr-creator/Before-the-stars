// Sound settings: volumes, mute, title music and interface sounds. Shown in the game menu
// and, from the title screen, in a small panel opened by the Sound button.
import { useEffect, useState } from 'preact/hooks';
import { t, useLocale } from '../i18n';
import { cx } from '../ui';
import { setAudioSettings, useAudioSettings, type AudioSettings } from './settings';
import { audioStatus, subscribeAudioStatus, toggleMute, type AudioStatus } from './index';
import './audio.css';

function useAudioStatus(): AudioStatus {
  const [, force] = useState(0);
  useEffect(() => subscribeAudioStatus(() => force((n) => (n + 1) | 0)), []);
  return audioStatus();
}

export function Speaker({ muted, size = 16 }: { muted: boolean; size?: number }) {
  return (
    <svg class="snd-icon" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" />
      {muted ? <path d="m13 7.5 5 5M18 7.5l-5 5" /> : <><path d="M13 7.2a4 4 0 0 1 0 5.6" /><path d="M15.300 5a7.200 7.200 0 0 1 0 10" /></>}
    </svg>
  );
}

function Slider({ label, value, disabled, onInput, testid }: { label: string; value: number; disabled?: boolean; onInput: (v: number) => void; testid: string }) {
  return (
    <label class={cx('snd-slider', disabled && 'is-off')}>
      <span class="snd-label">{label}</span>
      <input type="range" min={0} max={100} step={1} value={Math.round(value * 100)} disabled={disabled} aria-label={label} data-testid={testid}
        onInput={(e) => onInput(Number((e.target as HTMLInputElement).value) / 100)} />
      <span class="snd-val">{Math.round(value * 100)}</span>
    </label>
  );
}

function Check({ label, checked, onChange, testid }: { label: string; checked: boolean; onChange: (v: boolean) => void; testid: string }) {
  return (
    <label class="snd-check">
      <input type="checkbox" checked={checked} data-testid={testid} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span>{label}</span>
    </label>
  );
}

export function SoundSettings({ dark }: { dark?: boolean }) {
  useLocale();
  const s = useAudioSettings();
  const st = useAudioStatus();
  const set = (p: Partial<AudioSettings>) => setAudioSettings(p);
  const note = st === 'unavailable' ? t('This browser offers no Web Audio, so the game is silent.')
    : st === 'error' ? t('The sound could not be started.')
    : s.muted ? t('Muted. Press M to turn the sound back on.')
    : st === 'idle' ? t('Sound starts after your first click or key press.')
    : st === 'loading' ? t('Starting the sound…')
    : t('The music is composed by the game as you play, and follows your civilization through the ages.');
  return (
    <div class={cx('snd', dark && 'is-dark')} data-testid="sound-settings">
      <div class="snd-head">
        <button type="button" class={cx('snd-mute', s.muted && 'is-muted')} aria-pressed={s.muted} data-testid="sound-mute"
          title={s.muted ? t('Turn the sound on (M)') : t('Mute (M)')} onClick={() => toggleMute()}>
          <Speaker muted={s.muted} />
          <span>{s.muted ? t('Sound off') : t('Sound on')}</span>
          <kbd>M</kbd>
        </button>
      </div>
      <Slider label={t('Master volume')} value={s.master} disabled={s.muted} testid="sound-master" onInput={(v) => set({ master: v })} />
      <Slider label={t('Music')} value={s.music} disabled={s.muted} testid="sound-music" onInput={(v) => set({ music: v })} />
      <Slider label={t('Effects')} value={s.effects} disabled={s.muted || !s.uiSounds} testid="sound-effects" onInput={(v) => set({ effects: v })} />
      <Check label={t('Music on the title screen too')} checked={s.titleMusic} testid="sound-title-music" onChange={(v) => set({ titleMusic: v })} />
      <Check label={t('Interface sounds (end of round, orders, notices)')} checked={s.uiSounds} testid="sound-ui" onChange={(v) => set({ uiSounds: v })} />
      <p class="snd-note" role="status">{note}</p>
    </div>
  );
}

/** The title screen's Sound button and its panel. */
export function SoundButton() {
  useLocale();
  const s = useAudioSettings();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <span class="snd-anchor">
      <button type="button" class={cx('snd-title-btn', open && 'is-active')} aria-expanded={open} data-testid="title-sound" onClick={() => setOpen(!open)}>
        <Speaker muted={s.muted} /> {t('Sound')}
      </button>
      {open ? (
        <div class="snd-pop" role="dialog" aria-label={t('Sound')} data-testid="title-sound-pane">
          <SoundSettings dark />
        </div>
      ) : null}
    </span>
  );
}
