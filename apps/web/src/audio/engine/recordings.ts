// Plays the recorded music (tracks.ts) through the engine's graph.
//
// Each recording is streamed, never decoded whole: the file is fetched when it is about
// to play (and only the next one is fetched ahead), handed to an <audio> element as a
// blob URL, and the element is routed into Web Audio with a MediaElementAudioSourceNode
// so the engine's volumes, mute, ducking and fades apply. A blob URL rather than the
// file's own URL because the referee's little file server answers neither byte ranges
// nor a media type for .webm, which Safari/WKWebView need to stream from a URL.
//
// The elements come from a small pool made during the first click or key press (see
// index.ts): WebKit lets an element play later without a gesture only if it has been
// played inside one.
//
// Two or three decks: the one playing, the one fading out behind it, and the one being
// loaded. Order within an era and mood is a shuffled bag, so every recording that fits is
// heard before any repeats, and never the same one twice in a row. A file that cannot be
// fetched or decoded is set aside for the session and the next one is tried; when none
// is left for the moment, `onUnavailable` lets the engine play the composed score.
import type { Mood } from './arrange';
import type { ScoreKey } from './score';
import { fitting, RECORDED_TRACKS, type RecordedTrack } from './tracks';

/** Seconds before a recording's end at which the next one is asked for (they overlap). */
const OVERLAP = 6;
/** Fade-in of a recording that starts while another is sounding. */
const FADE_IN = 3;
/** Give up on a file that has not started this long after it was asked for. */
const LOAD_TIMEOUT_MS = 45_000;
const MIME = 'audio/webm';

interface Deck {
  el: HTMLAudioElement;
  node: MediaElementAudioSourceNode | null;
  gain: GainNode;
  track: RecordedTrack | null;
  url: string | null;
  /** loading → playing → fading → idle */
  phase: 'idle' | 'loading' | 'playing' | 'fading';
  key: string;
  endingSignalled: boolean;
  token: number;
}

export interface RecStats {
  playing: string | null;
  title: string | null;
  key: string | null;
  loading: string | null;
  fading: number;
  gain: number;
  failed: string[];
  started: number;
  supported: boolean;
  paused: boolean;
  /** Each deck: idle, loading, playing or fading, and its recording. */
  decks: string[];
}

export class RecordPlayer {
  private ctx: AudioContext;
  private decks: Deck[];
  private cur: Deck | null = null;
  private bags = new Map<string, string[]>();
  private lastId: string | null = null;
  private broken = new Set<string>();
  private prefetched: { id: string; blob: Promise<Blob | null> } | null = null;
  private paused = false;
  /** The browser refused to start an element without a fresh gesture. */
  private blocked = false;
  private token = 0;
  private started = 0;
  readonly supported: boolean;
  /** A recording began (null: recordings stopped). */
  onTrack: ((t: RecordedTrack | null) => void) | null = null;
  /** The current recording is about to end: the engine chooses what follows. */
  onEnding: (() => void) | null = null;
  /** Nothing playable is left for what was asked. */
  onUnavailable: (() => void) | null = null;

  constructor(ctx: AudioContext, out: AudioNode, pool: HTMLAudioElement[]) {
    this.ctx = ctx;
    const probe = pool[0] ?? (typeof Audio !== 'undefined' ? new Audio() : null);
    this.supported = !!probe && RECORDED_TRACKS.length > 0 && probe.canPlayType(`${MIME}; codecs="opus"`) !== '';
    const els = pool.length ? pool : [];
    while (this.supported && els.length < 3) els.push(new Audio());
    this.decks = els.map((el) => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(out);
      el.preload = 'auto';
      return { el, node: null, gain, track: null, url: null, phase: 'idle', key: '', endingSignalled: false, token: 0 };
    });
  }

  /** Whether some recording that has not failed fits this era and mood. */
  has(key: ScoreKey, mood: Mood, except?: string | null): boolean {
    return this.supported && !this.blocked && fitting(key, mood, (t) => this.broken.has(t.id) || t.id === except).length > 0;
  }

  get current(): RecordedTrack | null {
    return this.cur && (this.cur.phase === 'playing' || this.cur.phase === 'loading') ? this.cur.track : null;
  }

  get busy(): boolean {
    return !!this.cur && (this.cur.phase === 'playing' || this.cur.phase === 'loading');
  }

  /** Choose the next recording for this era and mood: a shuffled bag, never the last one again. */
  private pick(key: ScoreKey, mood: Mood): RecordedTrack | null {
    const k = `${key}|${mood}`;
    const ok = fitting(key, mood, (t) => this.broken.has(t.id));
    if (!ok.length) return null;
    let bag = (this.bags.get(k) ?? []).filter((id) => ok.some((t) => t.id === id));
    if (!bag.length) {
      // weighted shuffle: a track of weight w is entered w times (rounded), then deduplicated in order
      const entries: string[] = [];
      for (const t of ok) for (let i = 0; i < Math.max(1, Math.round(t.weight)); i++) entries.push(t.id);
      for (let i = entries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [entries[i], entries[j]] = [entries[j], entries[i]];
      }
      bag = [...new Set(entries)];
      if (bag.length > 1 && bag[0] === this.lastId) bag.push(bag.shift()!);
    }
    let id = bag.shift()!;
    if (id === this.lastId && bag.length) { bag.push(id); id = bag.shift()!; }
    this.bags.set(k, bag);
    return ok.find((t) => t.id === id) ?? null;
  }

  /** What the bag would give next, without taking it (for prefetching). */
  private peek(key: ScoreKey, mood: Mood, after: string): RecordedTrack | null {
    const ok = fitting(key, mood, (t) => this.broken.has(t.id) || t.id === after);
    if (!ok.length) return null;
    const bag = this.bags.get(`${key}|${mood}`) ?? [];
    const id = bag.find((x) => x !== after && ok.some((t) => t.id === x));
    return ok.find((t) => t.id === id) ?? null;
  }

  private fetchBlob(t: RecordedTrack): Promise<Blob | null> {
    if (this.prefetched?.id === t.id) {
      const p = this.prefetched.blob;
      this.prefetched = null;
      return p;
    }
    return fetch(t.url).then((r) => {
      // a missing file comes back as the referee's index page or a 404
      const type = r.headers.get('content-type') ?? '';
      if (!r.ok || type.startsWith('text/')) return null;
      return r.blob();
    }).then((b) => (b && b.size > 1024 ? b.slice(0, b.size, MIME) : null)).catch(() => null);
  }

  private prefetch(t: RecordedTrack | null): void {
    if (!t || this.prefetched?.id === t.id) return;
    this.prefetched = { id: t.id, blob: this.fetchBlob(t) };
  }

  private freeDeck(): Deck | null {
    return this.decks.find((d) => d.phase === 'idle')
      ?? this.decks.find((d) => d.phase === 'fading')
      ?? this.decks.find((d) => d !== this.cur)
      ?? null;
  }

  private release(d: Deck): void {
    d.token = ++this.token;
    try { d.el.pause(); } catch { /* nothing */ }
    d.el.onended = null;
    d.el.onerror = null;
    d.el.removeAttribute('src');
    try { d.el.load(); } catch { /* nothing */ }
    if (d.url) URL.revokeObjectURL(d.url);
    d.url = null;
    d.track = null;
    d.phase = 'idle';
    const now = this.ctx.currentTime;
    d.gain.gain.cancelScheduledValues(now);
    d.gain.gain.setValueAtTime(0, now);
  }

  private fadeOut(d: Deck, seconds: number): void {
    if (d.phase === 'idle') return;
    if (d.phase === 'loading') { this.release(d); return; }
    d.phase = 'fading';
    const now = this.ctx.currentTime;
    const g = d.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(0, now, Math.max(0.05, seconds / 4));
    const tok = d.token;
    setTimeout(() => { if (d.token === tok && d.phase === 'fading') this.release(d); }, seconds * 1000 + 1500);
  }

  /**
   * Play a recording for this era and mood, crossfading from whatever sounds now.
   * `fade` is how long the old one takes to leave.
   */
  start(key: ScoreKey, mood: Mood, fade: number): void {
    if (!this.supported) { this.onUnavailable?.(); return; }
    const t = this.pick(key, mood);
    if (!t) { this.stop(fade); this.onUnavailable?.(); return; }
    const old = this.cur;
    const d = this.freeDeck();
    if (!d) return;
    if (d.phase !== 'idle') this.release(d);
    if (old && old !== d) this.fadeOut(old, fade);
    this.cur = d;
    const tok = (d.token = ++this.token);
    d.track = t;
    d.phase = 'loading';
    d.key = `${key}|${mood}`;
    d.endingSignalled = false;
    const crossfade = !!old && old.phase !== 'idle';
    const giveUp = setTimeout(() => { if (d.token === tok && d.phase === 'loading') fail(); }, LOAD_TIMEOUT_MS);
    const fail = () => {
      clearTimeout(giveUp);
      if (d.token !== tok) return;
      this.broken.add(t.id);
      this.release(d);
      if (this.cur === d) this.cur = null;
      // try another recording for the same moment; the engine falls back when none is left
      if (this.has(key, mood)) this.start(key, mood, 0.5);
      else { this.onTrack?.(null); this.onUnavailable?.(); }
    };
    void this.fetchBlob(t).then((blob) => {
      if (d.token !== tok) return;
      if (!blob) { fail(); return; }
      d.url = URL.createObjectURL(blob);
      d.el.onerror = () => fail();
      d.el.onended = () => { if (d.token === tok) { if (this.cur === d && !d.endingSignalled) { d.endingSignalled = true; this.onEnding?.(); } this.release(d); } };
      d.el.src = d.url;
      if (!d.node) {
        try {
          d.node = this.ctx.createMediaElementSource(d.el);
          d.node.connect(d.gain);
        } catch {
          fail();
          return;
        }
      }
      const begin = () => {
        if (d.token !== tok) return;
        clearTimeout(giveUp);
        d.phase = 'playing';
        this.lastId = t.id;
        this.started++;
        const now = this.ctx.currentTime;
        const level = Math.pow(10, t.gainDb / 20);
        const g = d.gain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        // recordings carry their own fade-in; a short ramp only avoids a click, a longer one blends a crossfade
        g.linearRampToValueAtTime(level, now + (crossfade ? FADE_IN : 0.3));
        this.onTrack?.(t);
        this.prefetch(this.peek(key, mood, t.id));
      };
      if (this.paused) { begin(); return; }
      d.el.play().then(begin).catch((e: unknown) => {
        // an aborted play (the deck was reused meanwhile) is not a failure of the file
        if (d.token !== tok) return;
        if ((e as { name?: string })?.name === 'NotAllowedError') {
          // not the file's fault: wait for the next click or key press, play the score meanwhile
          clearTimeout(giveUp);
          this.blocked = true;
          this.release(d);
          if (this.cur === d) this.cur = null;
          this.onTrack?.(null);
          this.onUnavailable?.();
          return;
        }
        fail();
      });
    });
  }

  /** A click or key press: elements may be started again. Returns whether they had been refused. */
  unblock(): boolean {
    const was = this.blocked;
    this.blocked = false;
    return was;
  }

  /** Fade the recordings out (the composed score takes over, or silence). */
  stop(fade: number): void {
    const had = this.busy;
    for (const d of this.decks) if (d.phase === 'playing' || d.phase === 'loading') this.fadeOut(d, fade);
    this.cur = null;
    if (had) this.onTrack?.(null);
  }

  /** The page is hidden or muted: hold the elements where they are (the context is suspended too). */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    for (const d of this.decks) if (d.phase === 'playing' || d.phase === 'fading') { try { d.el.pause(); } catch { /* nothing */ } }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const d of this.decks) if (d.phase === 'playing' || d.phase === 'fading') void d.el.play().catch(() => {});
  }

  /** Called by the engine's clock: notice a recording nearing its end. */
  tick(): void {
    const d = this.cur;
    if (!d || d.phase !== 'playing' || d.endingSignalled || this.paused) return;
    const dur = Number.isFinite(d.el.duration) ? d.el.duration : d.track?.duration ?? Infinity;
    if (dur - d.el.currentTime <= OVERLAP) {
      d.endingSignalled = true;
      this.onEnding?.();
    }
  }

  stats(): RecStats {
    const cur = this.cur && this.cur.phase === 'playing' ? this.cur : null;
    const loading = this.decks.find((d) => d.phase === 'loading');
    return {
      playing: cur?.track?.id ?? null,
      title: cur?.track?.title ?? null,
      key: cur?.key ?? null,
      loading: loading?.track?.id ?? null,
      fading: this.decks.filter((d) => d.phase === 'fading').length,
      gain: cur ? cur.gain.gain.value : 0,
      failed: [...this.broken],
      started: this.started,
      supported: this.supported,
      paused: this.paused,
      decks: this.decks.map((d) => `${d.phase}${d.track ? ' ' + d.track.id : ''}`),
    };
  }
}
