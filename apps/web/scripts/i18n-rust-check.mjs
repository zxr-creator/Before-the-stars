// Static coverage of server text: every user-facing string literal and format! pattern in the
// Rust sources must resolve through the zh-Hans dictionaries and templates, including rare
// events a harvested match never triggers.
//   node scripts/i18n-rust-check.mjs [--all]
// Placeholders ({}, {name}, {:.0}) are filled with sample values (a number, a proper name, or
// nothing) and each variant is run through the same tc() the client uses.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, loadPack, makeTc } from './i18n-engine.mjs';

const repo = join(WEB, '..', '..');
const FILES = [
  'crates/bts-engine/src/observe.rs', 'crates/bts-engine/src/actions.rs', 'crates/bts-engine/src/content.rs',
  'crates/bts-engine/src/worldgen.rs', 'crates/bts-engine/src/sim/chronicle.rs', 'crates/bts-engine/src/sim/projects.rs',
  'crates/bts-engine/src/sim/knowledge.rs', 'crates/bts-engine/src/sim/culture.rs', 'crates/bts-engine/src/sim/military.rs',
  'crates/bts-engine/src/sim/diplomacy.rs', 'crates/bts-engine/src/sim/victory.rs', 'crates/bts-engine/src/sim/economy.rs',
  'crates/bts-engine/src/sim/population.rs', 'crates/bts-protocol/src/lib.rs',
];
// The referee binary: only its HTTP error replies and new-match validation are player-facing.
const SERVER = 'crates/bts-server/src/main.rs';
const SERVER_LINE = /\berr\(\d+, "[A-Z_]+", |return Err\("|ok_or_else\(\|\| format!\("unknown controller/;
// Lines that are not player-facing text.
const SKIP_LINE = /const REL_[AB]|const SYL_|stream\(|expect\(|panic!|assert|unwrap_or_else\(\|\| panic|eprintln!|println!|#\[|^\s*\/\/|include_str!|serde\(/;
// Fragments spliced into a longer pattern; the whole sentences are covered by templates.
const FRAGMENTS = new Set([
  ' in breach of a signed commitment', '; a war is in progress', '; as the first of its kind it will take half as long again',
  'not verified', 'verified', 'a thousand', 'five thousand', 'twenty thousand', 'a hundred thousand', ' — or — ', ' and ',
  ' This rests on the anomaly this world actually exhibits, not on established physics.',
  ' It remains an engineering extrapolation with declared limits.', 'Construction ordered{}.',
  '{} delivered {:.0} of {:.0} {}', // prefixed by "Month N: " in the treaty record
  'Hunger in {}', // filled with "Year N": template "Hunger in Year {#n}"
  'Counts across every governed region now exceed {label} people. More hands, and more mouths, housing and care to answer for.', // four exact entries
  'The {a} {b}', // religion names: all REL_A × REL_B combinations are exact entries
  // ruleset 2.0: population milestones (four exact entries and templates, as for the thousands above)
  'a million', 'five million', 'twenty million', 'a hundred million',
  // the construction receipt is assembled from these; every combination is a template in templates-server-scale.json
  'Construction ordered: {terms}{}.', 'at least {} months',
  ", with its site crew reserved from this region's qualified residents until it is finished, paused or cancelled",
  "; site power comes from the region's shaft supply, then from site engines burning coal, then refined fuel",
  '. As the first of its kind it takes half as much work and time again',
  // the fields' method note is assembled from these; every combination is an exact entry in content-server-scale.json
  ' Used only while a full month of its inputs is in store for every field that may draw them; otherwise the land is worked by the next method down.',
  ' Needs herds on pasture somewhere under the same government.',
]);
// Region-name syllables, colours, wire keys and the like.
const NOT_TEXT = (s) =>
  !/[A-Za-z]{3}/.test(s) || /^[a-z0-9_:.\-/{}#]+$/.test(s) || /^#[0-9a-f]{6}$/i.test(s) || /^[TCEF]\d{3}\b|^[A-Z]:|&|\|\||POP>=|REG>=|^Q:|^F:|CONTACT|^REL$|^SCI$/.test(s) ||
  /^bts-|^\{.*\}$|^[A-Z][a-z]{1,4}$|^[a-z]{1,4}$/.test(s) || /^[A-Z_]+$/.test(s);

const tc = makeTc(loadPack('zh-Hans'));
const NAME = 'Belmar';
const leftovers = (s) => (s.replaceAll(NAME, '').match(/[A-Za-z]{3,}/g) ?? []);

function variants(lit) {
  const slots = [...lit.matchAll(/\{[^{}]*\}/g)];
  if (!slots.length) return [lit];
  const fills = ['7', NAME, ''];
  const out = [];
  const n = Math.min(slots.length, 5);
  for (let code = 0; code < 3 ** n; code += 1) {
    let i = 0;
    let c = code;
    out.push(lit.replace(/\{[^{}]*\}/g, () => { const f = i < n ? fills[c % 3] : '7'; c = Math.floor(c / 3); i += 1; return f; }));
  }
  return out;
}

let total = 0;
const bad = [];
const seen = new Set();
for (const rel of [...FILES, SERVER]) {
  const lines = readFileSync(join(repo, rel), 'utf8').split('\n');
  let inTests = false;
  lines.forEach((line, ix) => {
    if (/^#\[cfg\(test\)\]|^mod tests/.test(line)) inTests = true;
    if (inTests || SKIP_LINE.test(line)) return;
    if (rel === SERVER && !SERVER_LINE.test(line)) return;
    for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      const lit = m[1].replace(/\\(.)/g, '$1');
      if (NOT_TEXT(lit) || FRAGMENTS.has(lit) || seen.has(lit)) continue;
      // SYL_*/REL_* word lists and controller ids are single words handled elsewhere
      if (!/\s/.test(lit) && !/^[A-Z][a-z]+/.test(lit)) continue;
      seen.add(lit);
      total += 1;
      const ok = variants(lit).some((v) => { const z = tc(v.trim() === v ? v : v.trim()); return z !== v && leftovers(z).length === 0; });
      if (!ok) bad.push(`${rel}:${ix + 1}  ${JSON.stringify(lit)}  →  ${tc(variants(lit)[0])}`);
    }
  });
}
console.log(`${total} distinct Rust literals checked, ${bad.length} unresolved`);
for (const b of bad) console.log('  ' + b);
process.exit(bad.length ? 1 : 0);
