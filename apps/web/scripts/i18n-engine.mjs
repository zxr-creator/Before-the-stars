// Node port of src/i18n/index.ts (dictionary loading, t and tc) so dictionaries can be checked
// without a browser. Keep the matching rules identical to the client engine.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(tpl) {
  const names = [];
  const numeric = [];
  let literal = 0;
  let src = '^';
  let last = 0;
  const rx = /\{(#?)([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let m;
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
  return { re: new RegExp(src), names, numeric, zh: tpl.zh, weight: literal, en: tpl.en };
}

export function loadPack(locale = 'zh-Hans') {
  const dir = join(WEB, 'src', 'i18n', locale);
  const pack = { ui: {}, content: {}, templates: [] };
  const names = readdirSync(dir).filter((f) => f.endsWith('.json')).sort((a, b) => {
    const ao = a === 'overrides.json' ? 1 : 0;
    const bo = b === 'overrides.json' ? 1 : 0;
    return ao - bo || a.localeCompare(b);
  });
  for (const base of names) {
    const data = JSON.parse(readFileSync(join(dir, base), 'utf8'));
    if (base.startsWith('templates') && Array.isArray(data)) {
      for (const tpl of data) {
        const c = compile(tpl);
        if (c) pack.templates.push(c);
        else pack.content[tpl.en] = tpl.zh;
      }
    } else if (data && typeof data === 'object' && !Array.isArray(data)) {
      Object.assign(base.startsWith('ui') ? pack.ui : pack.content, data);
      if (base === 'overrides.json') { Object.assign(pack.ui, data); Object.assign(pack.content, data); }
    }
  }
  pack.templates.sort((a, b) => b.weight - a.weight);
  return pack;
}

const fill = (text, vars) => text.replace(/\{#?([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (w, n) => (n in vars ? String(vars[n]) : w));

export function makeTc(pack) {
  const cache = new Map();
  const trace = new Map();
  function tc(text, depth = 0) {
    if (!text) return text ?? '';
    const cached = cache.get(text);
    if (cached !== undefined) return cached;
    let out = pack.content[text] ?? pack.ui[text];
    if (out === undefined && depth < 4) {
      for (const tpl of pack.templates) {
        const m = tpl.re.exec(text);
        if (!m) continue;
        const vars = {};
        tpl.names.forEach((n, i) => { vars[n] = tpl.numeric[i] ? m[i + 1] : tc(m[i + 1], depth + 1); });
        out = fill(tpl.zh, vars);
        trace.set(text, tpl.en);
        break;
      }
    }
    if (out === undefined) {
      const parts = text.split(/(?<=[.!?])\s+/);
      if (parts.length > 1 && depth < 2) {
        const joined = parts.map((p) => tc(p, depth + 1));
        if (joined.some((p, i) => p !== parts[i])) out = joined.join('');
      }
    }
    if (out === undefined) out = text;
    if (depth === 0) cache.set(text, out);
    return out;
  }
  tc.trace = trace;
  return tc;
}
