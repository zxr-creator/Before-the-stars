// Build the generated zh-Hans server-content dictionaries from the translation tables in
// scripts/i18n-data-*.mjs and the catalog in content/*.json:
//   src/i18n/zh-Hans/content-catalog.json   technologies, practices, courses, facilities, enums …
//   src/i18n/zh-Hans/content-server.json    fixed sentences the server emits
//   src/i18n/zh-Hans/templates.json         format! patterns
// It also cross-checks the tables against the Rust sources so nothing in the catalog is missed.
//   node scripts/i18n-build.mjs && node scripts/make-zh-hant.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TECH, TECH_GROUPS, TECH_LABELS } from './i18n-data-tech.mjs';
import { PRACTICE, PRACTICE_GROUPS, PRACTICE_EFFECT, COURSE } from './i18n-data-practices.mjs';
import * as C from './i18n-data-content.mjs';
import { EXACT, TEMPLATES } from './i18n-data-server.mjs';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(web, '..', '..');
const out = join(web, 'src', 'i18n', 'zh-Hans');
const json = (p) => JSON.parse(readFileSync(join(repo, p), 'utf8'));
const rust = (p) => readFileSync(join(repo, p), 'utf8');
const problems = [];
const cat = {};
const names = new Set(); // keys that also get a lower-case twin (the server lower-cases names mid-sentence)
const put = (en, zh, isName = false) => {
  if (zh === undefined || zh === null || zh === '') { problems.push(`no translation for ${JSON.stringify(en)}`); return; }
  if (en in cat && cat[en] !== zh) problems.push(`conflict for ${JSON.stringify(en)}: ${cat[en]} / ${zh}`);
  cat[en] = zh;
  if (isName) names.add(en);
};

// ---- content/*.json -------------------------------------------------------------------
for (const t of json('content/technologies.json')) {
  const z = TECH[t.id];
  if (!z) { problems.push(`technology ${t.id} untranslated`); continue; }
  put(t.name, z[0], true); put(t.requirements, z[1]); put(t.capability, z[2]);
  put(t.group_title, TECH_GROUPS[t.group]);
  put(t.label, TECH_LABELS[t.label]);
}
for (const p of json('content/practices.json')) {
  const z = PRACTICE[p.id];
  if (!z) { problems.push(`practice ${p.id} untranslated`); continue; }
  put(p.name, z[0], true); put(p.requirements, z[1]); put(p.behavior, z[2]);
  put(p.group, PRACTICE_GROUPS[p.group]);
}
for (const [en, zh] of Object.entries(PRACTICE_EFFECT)) put(en, zh);
for (const c of json('content/courses.json')) {
  const z = COURSE[c.id];
  if (!z) { problems.push(`course ${c.id} untranslated`); continue; }
  put(c.name, z[0], true);
  put(c.prerequisites, z[1]); put(c.output, z[2]);
  // the server shows "{prerequisites} Output: {output}"
  put(`${c.prerequisites} Output: ${c.output}`, `先修要求：${z[1]}。学习内容与成果：${z[2]}。`);
}

// ---- crates/bts-engine/src/content.rs ---------------------------------------------------
const content = rust('crates/bts-engine/src/content.rs');
const S = '"((?:[^"\\\\]|\\\\.)*)"';
const un = (s) => s.replace(/\\(.)/g, '$1');
let nFac = 0;
for (const m of content.matchAll(new RegExp(`\\bfac\\(${S},\\s*${S},\\s*${S},\\s*${S}\\)`, 'g'))) {
  const [key, name, category, desc] = [m[1], un(m[2]), un(m[3]), un(m[4])];
  const z = C.FACILITY[key];
  nFac += 1;
  if (!z) { problems.push(`facility ${key} untranslated`); continue; }
  put(name, z[0], true); put(desc, z[1]); put(category, C.FAC_CATEGORY[category], true);
}
let nRec = 0;
for (const m of content.matchAll(new RegExp(`\\brec\\(${S},\\s*${S}\\)`, 'g'))) { nRec += 1; put(un(m[2]), C.RECIPE[un(m[2])], true); }
let nTag = 0;
for (const m of content.matchAll(new RegExp(`^\\s*\\w+ => ${S}, ${S}, ${S};`, 'gm'))) {
  const z = C.TAG[m[1]];
  nTag += 1;
  if (!z) { problems.push(`domain ${m[1]} untranslated`); continue; }
  put(un(m[2]), z[0], true); put(un(m[3]), z[1]);
}
let nTier = 0;
for (const m of content.matchAll(new RegExp(`\\bmk\\(\\d,\\s*${S},\\s*\\[${S},\\s*${S},\\s*${S}\\]`, 'g'))) {
  nTier += 1;
  for (const s of [m[1], m[2], m[3], m[4]]) put(un(s), C.UNIT[un(s)], true);
}
let nBelief = 0;
for (const m of content.matchAll(new RegExp(`Belief \\{ key: ${S}, slot: ${S}, name: ${S}, desc: ${S} \\}`, 'g'))) {
  const z = C.BELIEF[m[1]];
  nBelief += 1;
  if (!z) { problems.push(`belief ${m[1]} untranslated`); continue; }
  put(un(m[3]), z[0], true); put(un(m[4]), z[1]); put(un(m[2]), C.BELIEF_SLOT[un(m[2])], true);
}
const block = (src, start, end) => { const i = src.indexOf(start); return i < 0 ? '' : src.slice(i, src.indexOf(end, i)); };
for (const m of block(content, 'pub const TRAIT_NAMES', '];').matchAll(new RegExp(`\\(${S}, ${S}\\)`, 'g'))) {
  const z = C.TRAIT[un(m[1])];
  if (!z) { problems.push(`trait ${m[1]} untranslated`); continue; }
  // "Civic" is also a facility category; the client asks for "<name> (trait)" first
  cat[`${un(m[1])} (trait)`] = z[0];
  if (!(un(m[1]) in cat)) put(un(m[1]), z[0], true);
  put(un(m[2]), z[1]);
}
for (const m of block(content, 'pub const TENDENCY_NAMES', '];').matchAll(new RegExp(S, 'g'))) put(un(m[1]), C.TENDENCY[un(m[1])], true);
for (const m of content.matchAll(new RegExp(`"C\\d{3}" => ${S},`, 'g'))) {
  const s = un(m[1]);
  if (/[a-z] [a-z]/.test(s) && !(s in cat)) problems.push(`practice effect untranslated: ${s}`);
}

// ---- religion names: "The {A} {B}" --------------------------------------------------------
const culture = rust('crates/bts-engine/src/sim/culture.rs');
const list = (name) => [...block(culture, `const ${name}`, '];').matchAll(new RegExp(S, 'g'))].map((m) => un(m[1]));
for (const a of list('REL_A')) {
  for (const b of list('REL_B')) {
    if (!C.REL_A[a] || !C.REL_B[b]) { problems.push(`religion word untranslated: ${a} ${b}`); continue; }
    put(`The ${a} ${b}`, C.REL_A[a] + C.REL_B[b]);
  }
}

// ---- civilizations ------------------------------------------------------------------------
const worldgen = rust('crates/bts-engine/src/worldgen.rs');
for (const m of block(worldgen, 'const CIV_ROOTS', '];').matchAll(new RegExp(`\\(${S}, ${S}\\)`, 'g'))) {
  put(m[1], C.CIV[m[1]]); put(m[2], C.CIV[m[2]]);
}

// ---- protocol enum labels -------------------------------------------------------------------
const proto = rust('crates/bts-protocol/src/lib.rs');
const enums = { ...C.GOOD, ...C.GOOD_SHORT, ...C.QUAL, ...C.ENUMS };
for (const m of proto.matchAll(new RegExp(`^\\s*\\w+ => ${S},$`, 'gm'))) {
  const s = un(m[1]);
  if (!(s in enums) && !(s in cat)) problems.push(`protocol label untranslated: ${s}`);
}
for (const [en, zh] of Object.entries(enums)) if (!(en in cat)) put(en, zh, true);

// lower-case twins: "A working makers' circle", "Short of refined fuel", "At least 4 scribes"
for (const en of names) {
  const low = en.toLowerCase();
  if (low !== en && !(low in cat)) cat[low] = cat[en];
}

// ---- fixed sentences and templates ----------------------------------------------------------
const server = {};
for (const [en, zh] of Object.entries(EXACT)) {
  if (en in cat && cat[en] !== zh) problems.push(`sentence conflicts with catalog: ${JSON.stringify(en)} ${cat[en]} / ${zh}`);
  server[en] = zh;
}
const seen = new Set();
const templates = [];
for (const [en, zh] of TEMPLATES) {
  if (seen.has(en)) { problems.push(`duplicate template: ${en}`); continue; }
  seen.add(en);
  const ph = (s) => [...s.matchAll(/\{#?([a-zA-Z_]\w*)\}/g)].map((m) => m[1]).sort().join(',');
  if (ph(en) !== ph(zh)) problems.push(`placeholder mismatch: ${en} → ${zh}`);
  templates.push({ en, zh });
}

const write = (name, data) => writeFileSync(join(out, name), JSON.stringify(data, null, 1) + '\n');
write('content-catalog.json', cat);
write('content-server.json', server);
write('templates.json', templates);
console.log(`catalog: ${Object.keys(cat).length} entries (${nFac} facilities, ${nRec} recipe uses, ${nTag} domains, ${nTier} tiers, ${nBelief} beliefs)`);
console.log(`server sentences: ${Object.keys(server).length}; templates: ${templates.length}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log('  ' + p);
  process.exit(1);
}
