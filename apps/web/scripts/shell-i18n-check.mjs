// Lists t('…') source strings used by the shell files that have no Simplified Chinese entry.
//   node scripts/shell-i18n-check.mjs            report missing keys (exit 1 if any)
//   node scripts/shell-i18n-check.mjs --keys     print every key found, one JSON string per line
// Strings passed to t() through tables (labels in const arrays) are found by the
// `// i18n-table` convention below: any string literal on a line inside the listed tables.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const OWN = ['app.tsx', 'topbar.tsx', 'setup.tsx', 'menu.tsx', 'ui.tsx', 'store.ts', 'theme', 'trees', 'tutorial', 'observer'];
const files = [];
const walk = (p) => {
  const st = statSync(p);
  if (st.isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
  else if (/\.tsx?$/.test(p)) files.push(p);
};
for (const o of OWN) { try { walk(join(root, o)); } catch { /* not there yet */ } }

const unescape = (s, q) => s.replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c === q || c === '\\' ? c : '\\' + c));
const keys = new Map();
const add = (k, f) => { if (k && /[A-Za-z]/.test(k)) keys.set(k, keys.get(k) ?? f); };
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rx = /(?<![A-Za-z0-9_.$])t\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g;
  let m;
  while ((m = rx.exec(src))) add(m[1] !== undefined ? unescape(m[1], "'") : m[2] !== undefined ? unescape(m[2], '"') : m[3], f);
  // tables whose strings reach t() indirectly: "// i18n-table … // i18n-end" (every string value)
  // and "// i18n-fields … // i18n-end" (only the display fields named below)
  const lit = `(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")`;
  const pick = (k) => (k[1] !== undefined ? unescape(k[1], "'") : unescape(k[2], '"'));
  const tx = /i18n-table([\s\S]*?)i18n-end/g;
  while ((m = tx.exec(src))) {
    const ax = new RegExp(`[A-Za-z_'"-]+\\s*:\\s*${lit}`, 'g');
    let k;
    while ((k = ax.exec(m[1]))) add(pick(k), f);
  }
  const fx = /i18n-fields([\s\S]*?)i18n-end/g;
  while ((m = fx.exec(src))) {
    const sx = new RegExp(`\\b(?:label|title|hint|blurb|modelHint|text|body|sub|kicker|term|def|lede|caption|cta|heading|name)\\s*:\\s*${lit}`, 'g');
    let k;
    while ((k = sx.exec(m[1]))) add(pick(k), f);
  }
}
if (process.argv.includes('--keys')) {
  for (const k of keys.keys()) console.log(JSON.stringify(k));
  process.exit(0);
}
const dictDir = join(root, 'i18n', 'zh-Hans');
const have = new Set();
for (const f of readdirSync(dictDir)) {
  if (!f.endsWith('.json')) continue;
  const d = JSON.parse(readFileSync(join(dictDir, f), 'utf8'));
  if (Array.isArray(d)) d.forEach((x) => x && x.en && have.add(x.en));
  else Object.keys(d).forEach((k) => have.add(k));
}
const missing = [...keys].filter(([k]) => !have.has(k));
for (const [k, f] of missing) console.log(JSON.stringify(k) + '   <- ' + f.slice(root.length + 1));
console.log(`${keys.size} keys, ${missing.length} missing`);
process.exit(missing.length ? 1 : 0);
