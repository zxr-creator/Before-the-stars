// Which recording is playing, for the corner notice and the sound settings. Set by
// index.ts from the engine; null while the composed score plays or nothing does.
import { useEffect, useState } from 'preact/hooks';

export interface NowPlaying { id: string; title: string; composer: string; performer: string }

let current: NowPlaying | null = null;
const listeners = new Set<() => void>();

export function getNowPlaying(): NowPlaying | null {
  return current;
}

export function setNowPlaying(t: NowPlaying | null): void {
  const next = t ? { id: t.id, title: t.title, composer: t.composer, performer: t.performer } : null;
  if ((next?.id ?? null) === (current?.id ?? null)) return;
  current = next;
  listeners.forEach((l) => l());
}

export function subscribeNowPlaying(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useNowPlaying(): NowPlaying | null {
  const [, force] = useState(0);
  useEffect(() => subscribeNowPlaying(() => force((n) => (n + 1) | 0)), []);
  return current;
}
