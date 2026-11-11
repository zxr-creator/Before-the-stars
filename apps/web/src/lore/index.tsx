// Encyclopedia passages: a short introduction (and sometimes a quotation) for every
// technology and practice, shown in the card details. The text lives in content/lore/
// and is loaded on first use, one chunk per language, so the main bundle carries none
// of it. Callers pass the name of a card the seat has disclosed; nothing here lists or
// reveals any other card.
import { useEffect, useState } from 'preact/hooks';
import { t, useLocale } from '../i18n';
import type { Locale } from '../i18n';
import { Icon } from '../icons';
import { cx } from '../ui';
import './lore.css';

export interface Passage { intro: string; quote?: { text: string; source: string } }
type Pack = { tech: Record<string, Passage>; practice: Record<string, Passage> };
export type LoreKind = keyof Pack;

const LOADERS: Record<Locale, () => Promise<{ default: Pack }>> = {
  en: () => import('virtual:lore/en'),
  'zh-Hans': () => import('virtual:lore/zh-Hans'),
  'zh-Hant': () => import('virtual:lore/zh-Hant'),
};
const packs = new Map<Locale, Pack>();
const loading = new Map<Locale, Promise<void>>();
const listeners = new Set<() => void>();

function load(locale: Locale): void {
  if (loading.has(locale)) return;
  loading.set(locale, LOADERS[locale]().then(
    (m) => { packs.set(locale, m.default); listeners.forEach((l) => l()); },
    () => { loading.delete(locale); }, // offline or a stale build: show nothing, try again later
  ));
}

/** The passage for a disclosed card in the current language: null while loading or if none. */
export function useLore(kind: LoreKind, name: string): Passage | null {
  const locale = useLocale();
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    load(locale);
    return () => { listeners.delete(l); };
  }, [locale]);
  return packs.get(locale)?.[kind][name] ?? null;
}

/** The encyclopedia passage for a disclosed card, styled as a printed entry. */
export function LorePassage({ kind, name, kicker = true }: { kind: LoreKind; name: string; kicker?: boolean }) {
  const locale = useLocale();
  const p = useLore(kind, name);
  if (!p) return null;
  return (
    <section class={cx('lore', locale === 'en' && 'is-latin')} data-testid="lore" aria-label={t('Encyclopedia entry')}>
      {kicker ? <h4 class="lore-kicker"><Icon name="almanac" size={12} /> {t('Encyclopedia')}</h4> : null}
      <p class="lore-intro">{p.intro}</p>
      {p.quote ? (
        <blockquote class="lore-quote">
          <p>{p.quote.text}</p>
          <footer>— <cite>{p.quote.source}</cite></footer>
        </blockquote>
      ) : null}
    </section>
  );
}

/** The same passage folded behind a small "Encyclopedia" toggle, for long lists. */
export function LoreFold({ kind, name }: { kind: LoreKind; name: string }) {
  const p = useLore(kind, name);
  const [open, setOpen] = useState(false);
  if (!p) return null;
  return (
    <details class="lore-fold" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} data-testid="lore-fold">
      <summary><Icon name="almanac" size={12} /> {t('Encyclopedia')}</summary>
      {open ? <LorePassage kind={kind} name={name} kicker={false} /> : null}
    </details>
  );
}
