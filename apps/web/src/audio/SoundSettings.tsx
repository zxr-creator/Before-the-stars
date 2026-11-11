// Sound settings: volumes, mute, the music source (recordings, the composed score, or
// both), what is playing, title music, interface sounds, and the credits of every
// recording with its licence. Shown in the game menu and, from the title screen, in a
// small panel opened by the Sound button.
import { useEffect, useState } from 'preact/hooks';
import { t, useLocale } from '../i18n';
import { cx } from '../ui';
import { setAudioSettings, useAudioSettings, type AudioSettings, type MusicSource } from './settings';
import { audioStatus, subscribeAudioStatus, toggleMute, type AudioStatus } from './index';
import { useNowPlaying } from './playing';
import { trackLine } from './NowPlaying';
import type { TrackInfo } from './engine/tracks';
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

const ERA_HEADINGS: [string, string][] = [
  ['title', 'Title screen'], ['ancient', 'Ancient era'], ['classical', 'Classical era'], ['earlyModern', 'Early modern era'],
  ['industrial', 'Industrial era'], ['modern', 'Modern era'], ['space', 'Space age'],
];

/** Every recording, by era, with performer, licence and source page. Loaded when opened. */
export function MusicCredits() {
  useLocale();
  const [tracks, setTracks] = useState<TrackInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    import('./engine/tracks').then((m) => { if (live) setTracks(m.RECORDED_TRACKS); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  if (failed) return <p class="snd-note">{t('The list of recordings could not be loaded.')}</p>;
  if (!tracks) return <p class="snd-note">{t('Loading…')}</p>;
  return (
    <div class="snd-credits" data-testid="sound-credits">
      <p>{t('Every recording here is in the public domain or dedicated to it (CC0): both the music and the performance. Each licence is as stated on the source page.')}</p>
      {ERA_HEADINGS.map(([era, heading]) => {
        const list = tracks.filter((x) => x.eras[0] === era);
        if (!list.length) return null;
        return (
          <section key={era}>
            <h4>{t(heading)}</h4>
            <ul>
              {list.map((x) => (
                <li key={x.id} data-testid="sound-credit">
                  <span class="snd-cr-title">{t(x.title)}{x.moods.includes('war') ? <> · {t('war music')}</> : null}</span>
                  <span>{t('{composer}; performed by {performer}', { composer: t(x.composer), performer: t(x.performer) })}</span>
                  <span class="snd-cr-meta">
                    {t(x.license)} · <a href={x.source} target="_blank" rel="noopener noreferrer">{t('source')}</a>
                    {x.excerpt ? <> · {t('excerpt')}</> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const SOURCES: [MusicSource, string][] = [['recorded', 'Recorded music'], ['generated', 'Generated score'], ['both', 'Both, in turn']];

export function SoundSettings({ dark, compact }: { dark?: boolean; compact?: boolean }) {
  useLocale();
  const s = useAudioSettings();
  const st = useAudioStatus();
  const playing = useNowPlaying();
  const [more, setMore] = useState(!compact);
  const [credits, setCredits] = useState(false);
  const set = (p: Partial<AudioSettings>) => setAudioSettings(p);
  const note = st === 'unavailable' ? t('This browser offers no Web Audio, so the game is silent.')
    : st === 'error' ? t('The sound could not be started.')
    : s.muted ? t('Muted. Press M to turn the sound back on.')
    : st === 'idle' ? t('Sound starts after your first click or key press.')
    : st === 'loading' ? t('Starting the sound…')
    : s.musicSource === 'generated' ? t('The music is composed by the game as you play, and follows your civilization through the ages.')
    : t('The music is public-domain recordings chosen for each age, in peace and at war; the game\'s own score fills the gaps and plays the fanfares.');
  return (
    <div class={cx('snd', dark && 'is-dark')} data-testid="sound-settings">
      <div class="snd-head">
        <button type="button" class={cx('snd-mute', s.muted && 'is-muted')} aria-pressed={s.muted} data-testid="sound-mute"
          title={s.muted ? t('Turn the sound on (M)') : t('Mute (M)')} onClick={() => toggleMute()}>
          <Speaker muted={s.muted} />
          <span>{s.muted ? t('Sound off') : t('Sound on')}</span>
          <kbd>M</kbd>
        </button>
        {compact ? (
          <button type="button" class="linklike snd-more" aria-expanded={more} data-testid="sound-more" onClick={() => setMore(!more)}>
            {more ? t('Fewer settings') : t('More settings')}
          </button>
        ) : null}
      </div>
      {more ? <Slider label={t('Master volume')} value={s.master} disabled={s.muted} testid="sound-master" onInput={(v) => set({ master: v })} /> : null}
      <Slider label={t('Music')} value={s.music} disabled={s.muted} testid="sound-music" onInput={(v) => set({ music: v })} />
      <fieldset class="snd-source" data-testid="sound-source">
        <legend>{t('Music source')}</legend>
        {SOURCES.map(([v, label]) => (
          <label key={v}>
            <input type="radio" name={compact ? 'snd-source-menu' : 'snd-source'} value={v} checked={s.musicSource === v} data-testid={`sound-source-${v}`} onChange={() => set({ musicSource: v })} />
            <span>{t(label)}</span>
          </label>
        ))}
      </fieldset>
      {playing && !s.muted ? (
        <p class="snd-playing" data-testid="sound-now-playing">{t('Now playing: {track}', { track: trackLine(playing) })}</p>
      ) : null}
      {more ? (
        <>
          <Slider label={t('Effects')} value={s.effects} disabled={s.muted || !s.uiSounds} testid="sound-effects" onInput={(v) => set({ effects: v })} />
          <Check label={t('Music on the title screen too')} checked={s.titleMusic} testid="sound-title-music" onChange={(v) => set({ titleMusic: v })} />
          <Check label={t('Interface sounds (end of round, orders, notices)')} checked={s.uiSounds} testid="sound-ui" onChange={(v) => set({ uiSounds: v })} />
          <p class="snd-note" role="status">{note}</p>
          <button type="button" class="linklike snd-credits-toggle" aria-expanded={credits} data-testid="sound-credits-toggle" onClick={() => setCredits(!credits)}>
            {credits ? t('Hide the music credits') : t('Music credits and licences')}
          </button>
          {credits ? <MusicCredits /> : null}
        </>
      ) : null}
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
