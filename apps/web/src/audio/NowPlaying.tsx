// "Now playing" — a small notice in the corner for a few seconds when a recording begins.
// It sits beside the app (like the saves layer), never takes clicks, and stays away while
// the sound is muted.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { t, useLocale } from '../i18n';
import { useAudioSettings } from './settings';
import { useNowPlaying, type NowPlaying as Track } from './playing';
import './audio.css';

const SHOW_MS = 7000;

/** "Title — Composer (Performer)", in the player's language. */
export function trackLine(tr: Track): string {
  return t('{title} — {composer} ({performer})', { title: t(tr.title), composer: t(tr.composer), performer: t(tr.performer) });
}

function NowPlayingNotice() {
  useLocale();
  const tr = useNowPlaying();
  const s = useAudioSettings();
  const [shown, setShown] = useState<Track | null>(null);
  useEffect(() => {
    if (!tr) { setShown(null); return; }
    setShown(tr);
    const id = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(id);
  }, [tr?.id]);
  if (!shown || s.muted) return null;
  return (
    <div class="snd-now" role="status" aria-live="polite" data-testid="now-playing">
      <svg class="snd-now-icon" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M8 15.5V4.5l9-2v11" /><circle cx="5.5" cy="15.5" r="2.5" /><circle cx="14.5" cy="13.5" r="2.5" />
      </svg>
      <span class="snd-now-label">{t('Now playing')}</span>
      <span class="snd-now-track">{trackLine(shown)}</span>
    </div>
  );
}

export function mountNowPlaying(): void {
  if (typeof document === 'undefined' || document.getElementById('now-playing-layer')) return;
  const host = document.createElement('div');
  host.id = 'now-playing-layer';
  document.body.appendChild(host);
  render(<NowPlayingNotice />, host);
}
