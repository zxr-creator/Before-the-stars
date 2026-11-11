// Static check: every literal key passed to t()/tn()/tx() in the given source files has a
// zh-Hans dictionary entry (ui-*.json or content*.json).
//   node scripts/i18n-keys.mjs src/panels/economy.tsx src/inspector.tsx
//   node scripts/i18n-keys.mjs            (all files owned by the panels work)
// Dynamic keys (t(LABEL[x]), titleCase(x)) are covered at run time by i18n-coverage.mjs.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const dictDir = join(web, 'src', 'i18n', 'zh-Hans');
const dict = {};
for (const f of readdirSync(dictDir).filter((x) => x.endsWith('.json') && !x.startsWith('templates'))) {
  Object.assign(dict, JSON.parse(readFileSync(join(dictDir, f), 'utf8')));
}
let files = process.argv.slice(2);
if (!files.length) {
  files = ['src/inspector.tsx', 'src/format.ts', 'src/app.tsx', ...readdirSync(join(web, 'src', 'panels')).map((f) => 'src/panels/' + f),
    // ruleset 3.0 client: works, building tree, urban block, market, camps
    ...['Construction', 'BuildingTree', 'UrbanBlock', 'MarketOverlay'].map((f) => `src/economy/${f}.tsx`), 'src/economy/works.ts', 'src/map/Camp.tsx'];
}
const STR = `(?:'((?:\\\\.|[^'\\\\])*)'|"((?:\\\\.|[^"\\\\])*)"|\`((?:\\\\.|[^\`\\\\$])*)\`)`;
const unq = (m, i) => (m[i] ?? m[i + 1] ?? m[i + 2] ?? '').replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
let bad = 0;
let total = 0;
for (const rel of files) {
  const src = readFileSync(join(web, rel), 'utf8');
  const keys = new Set();
  for (const m of src.matchAll(new RegExp(`(?<![A-Za-z0-9_.])(?:t|tx)\\(\\s*${STR}`, 'g'))) keys.add(unq(m, 1));
  for (const m of src.matchAll(new RegExp(`(?<![A-Za-z0-9_.])tn\\(\\s*[^,]+,\\s*${STR}\\s*,\\s*${STR}`, 'g'))) { keys.add(unq(m, 4)); }
  for (const m of src.matchAll(new RegExp(`(?<![A-Za-z0-9_.])plural\\(\\s*[^,]+,\\s*${STR}(?:\\s*,\\s*${STR})?`, 'g'))) {
    const one = unq(m, 1); const many = m[4] ?? m[5] ?? m[6];
    keys.add(`{n} ${many ?? one + 's'}`);
  }
  const missing = [...keys].filter((k) => !(k in dict));
  total += keys.size;
  if (missing.length) {
    bad += missing.length;
    console.log(`\n${rel}: ${missing.length} of ${keys.size} keys have no zh-Hans entry`);
    for (const k of missing) console.log('  ' + JSON.stringify(k));
  } else {
    console.log(`${rel}: ${keys.size} keys, all translated`);
  }
}
console.log(`\n${total} literal keys checked, ${bad} missing`);
process.exit(bad ? 1 : 0);
