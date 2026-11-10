// Localization: English source strings are the keys (gettext style).
//
//   t('End round')                       UI strings written in the client
//   t('{n} regions governed', { n: 4 })  with placeholders
//   tc(text)                             text that arrives from the referee (names,
//                                        descriptions, briefing, chronicle, receipts)
//
// Dictionaries live in ./zh-Hans/*.json. Traditional Chinese (./zh-Hant/*.json) is
// generated from Simplified by scripts/make-zh-hant.mjs and may be hand-corrected in
// ./zh-Hant/overrides.json. A missing entry falls back to English, never to a blank.
//
// File kinds, by name:
//   ui-*.json        { "English source": "中文" }            looked up by t()
//   content*.json    { "English source": "中文" }            exact lookups for tc()
//   templates*.json  [ { "en": "Understood: {name}", "zh": "已掌握：{name}" } ]
//                    {name} matches any text and is itself passed through tc();
//                    {#n} matches a number and is kept as written.
import { useEffect, useState } from 'preact/hooks';

export type Locale = 'en' | 'zh-Hans' | 'zh-Hant';
export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'zh-Hant', label: '繁體中文' },
];

type Dict = Record<string, string>;
interface Template { en: string; zh: string }
interface Compiled { re: RegExp; names: string[]; numeric: boolean[]; zh: string; weight: number }
interface Pack { ui: Dict; content: Dict; templates: Compiled[] }

const files = import.meta.glob('./zh-*/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compile(tpl: Template): Compiled | null {
  const names: string[] = [];
  const numeric: boolean[] = [];
  let literal = 0;
  let src = '^';
  let last = 0;
  const rx = /\{(#?)([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(tpl.en))) {
    const lit = tpl.en.slice(last, m.index);
    literal += lit.length;
    src += escapeRe(lit);
    numeric.push(m[1] === '#');
    names.push(m[2]);
    src += m[1] === '#' ? '(-?[\\d][\\d,.]*)' : '([\\s\\S]+?)';
    last = m.index + m[0].length;
  }
  const tail = tpl.en.slice(last);
  literal += tail.length;
  src += escapeRe(tail) + '$';
  if (!names.length) return null;
  try {
    return { re: new RegExp(src), names, numeric, zh: tpl.zh, weight: literal };
  } catch {
    return null;
  }
}

function build(locale: Locale): Pack {
  const pack: Pack = { ui: {}, content: {}, templates: [] };
  if (locale === 'en') return pack;
  const prefix = `./${locale}/`;
  const names = Object.keys(files).filter((p) => p.startsWith(prefix)).sort((a, b) => {
    // overrides are applied last so hand corrections win
    const ao = a.endsWith('overrides.json') ? 1 : 0;
    const bo = b.endsWith('overrides.json') ? 1 : 0;
    return ao - bo || a.localeCompare(b);
  });
  for (const path of names) {
    const base = path.slice(prefix.length);
    const data = files[path];
    if (base.startsWith('templates') && Array.isArray(data)) {
      for (const tpl of data as Template[]) {
        if (!tpl || typeof tpl.en !== 'string' || typeof tpl.zh !== 'string') continue;
        const c = compile(tpl);
        if (c) pack.templates.push(c);
        else pack.content[tpl.en] = tpl.zh;
      }
    } else if (data && typeof data === 'object' && !Array.isArray(data)) {
      const target = base.startsWith('ui') ? pack.ui : pack.content;
      Object.assign(target, data as Dict);
      // overrides apply to both kinds of lookup
      if (base === 'overrides.json') Object.assign(pack.ui, data as Dict), Object.assign(pack.content, data as Dict);
    }
  }
  // the most specific template (most literal text) is tried first
  pack.templates.sort((a, b) => b.weight - a.weight);
  return pack;
}

const KEY = 'bts.locale';
function initial(): Locale {
  try {
    const saved = localStorage.getItem(KEY) as Locale | null;
    if (saved && LOCALES.some((l) => l.value === saved)) return saved;
  } catch { /* storage unavailable */ }
  return 'en';
}

let current: Locale = initial();
let pack: Pack = build(current);
const cache = new Map<string, string>();
const listeners = new Set<() => void>();
const missing = new Set<string>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  pack = build(next);
  cache.clear();
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  document.documentElement.lang = next === 'en' ? 'en' : next;
  listeners.forEach((l) => l());
}

/** Re-render the calling component when the language changes; returns the locale. */
export function useLocale(): Locale {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return current;
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{#?([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** Translate a UI string written in the client. English is the key. */
export function t(text: string, vars?: Record<string, string | number>): string {
  if (current === 'en') return fill(text, vars);
  const hit = pack.ui[text] ?? pack.content[text];
  if (hit === undefined) missing.add(text);
  return fill(hit ?? text, vars);
}

/** Translate text that came from the referee: exact match first, then templates. */
export function tc(text: string | null | undefined, depth = 0): string {
  if (!text) return text ?? '';
  if (current === 'en') return text;
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  let out = pack.content[text] ?? pack.ui[text];
  if (out === undefined && depth < 4) {
    for (const tpl of pack.templates) {
      const m = tpl.re.exec(text);
      if (!m) continue;
      const vars: Record<string, string> = {};
      tpl.names.forEach((n, i) => { vars[n] = tpl.numeric[i] ? m[i + 1] : tc(m[i + 1], depth + 1); });
      out = fill(tpl.zh, vars);
      break;
    }
  }
  if (out === undefined) {
    // sentence-by-sentence fallback keeps partly known paragraphs readable
    const parts = text.split(/(?<=[.!?])\s+/);
    if (parts.length > 1 && depth < 2) {
      const joined = parts.map((p) => tc(p, depth + 1));
      if (joined.some((p, i) => p !== parts[i])) out = joined.join('');
    }
  }
  if (out === undefined) {
    if (depth === 0 && /[A-Za-z]{3}/.test(text)) missing.add(text);
    out = text;
  }
  // Only top-level results are cached: a nested call can stop early at the depth limit, and
  // caching that would hide the full translation from a later direct lookup of the same text.
  if (depth === 0) cache.set(text, out);
  return out;
}

/** True when the active language is one of the Chinese variants. */
export function isZh(): boolean {
  return current !== 'en';
}

/** Strings requested in the current session that had no translation (for coverage tools). */
export function missingStrings(): string[] {
  return [...missing].sort();
}

declare global {
  interface Window { __btsI18n?: { missing: () => string[]; setLocale: (l: Locale) => void; getLocale: () => Locale; t: typeof t; tc: (s: string) => string } }
}
if (typeof window !== 'undefined') {
  window.__btsI18n = { missing: missingStrings, setLocale, getLocale, t, tc: (s: string) => tc(s) };
  document.documentElement.lang = current === 'en' ? 'en' : current;
}
