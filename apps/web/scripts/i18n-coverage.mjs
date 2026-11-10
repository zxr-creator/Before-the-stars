// Localization coverage for the web client, measured on real text.
//
//   source scripts/env.sh
//   (cd apps/web && npx vite build --outDir ../../.toolchain/i18n-dist --emptyOutDir)
//   .toolchain/bts-ui-snapshot serve --port 7983 --web .toolchain/i18n-dist --saves .toolchain/i18n-saves --fresh &
//   (cd apps/web && node scripts/i18n-coverage.mjs)
//
// 1. Harvest: plays several matches headlessly through the HTTP API (a fully delegated human
//    seat against hard/medium/medium native AI, to the horizon), collecting every prose string
//    of every seat's observation each round, plus the receipts of deliberately invalid orders.
// 2. Server text: loads the built client in headless Chromium, switches to zh-Hans through
//    window.__btsI18n and runs every harvested string through tc(). A string counts as
//    untranslated when the result still contains a run of three or more Latin letters that is
//    not a generated region name.
// 3. UI strings: walks every panel, tab, form and the inspector in zh-Hans on an early and a
//    late-game state and reads window.__btsI18n.missing().
// 4. Repeats 2 for zh-Hant.
// 5. Runs the static checks: i18n-rust-check.mjs (every string literal and format! pattern of the
//    Rust sources resolves, including events no harvested match triggered) and i18n-keys.mjs
//    (every literal t()/tn()/tx() key of the panel files has an entry).
// Writes screenshots/i18n/untranslated.txt and coverage.json; exits non-zero when server-text
// coverage is below I18N_THRESHOLD (default 99) or a UI string owned by the panels is missing.
//
// Environment: BTS_URL (default http://127.0.0.1:7983), I18N_SEEDS (comma list, default three
// seeds), I18N_ROUNDS (default 240), I18N_THRESHOLD (percent of distinct strings), I18N_SKIP_UI=1.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BASE, Harvest, WEB, get, openClient, play, post, regionNameRe, walk } from './i18n-lib.mjs';

const SEEDS = (process.env.I18N_SEEDS ?? 'i18n-amber,i18n-basalt,i18n-cedar,i18n-delta,i18n-ember,i18n-flint').split(',').map((s) => s.trim()).filter(Boolean);
const ROUNDS = Number(process.env.I18N_ROUNDS ?? 240);
const THRESHOLD = Number(process.env.I18N_THRESHOLD ?? 99);
const OUT = join(WEB, 'screenshots', 'i18n');
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[i18n]', ...a);

// ---- 1. harvest ------------------------------------------------------------------------------
const probe = await get('/api/match');
if (!probe.ok && probe.status !== 404) throw new Error(`referee not reachable at ${BASE}`);
const harvest = new Harvest();
const matches = [];
const POLICIES = ['all', 'no-subordination', 'none'];
let saved = { early: false, late: false };
for (let i = 0; i < SEEDS.length; i += 1) {
  const seed = SEEDS[i];
  const t0 = Date.now();
  const before = harvest.strings.size;
  const first = i === 0;
  const res = await play({
    seed, rounds: ROUNDS, harvest, log,
    disclosed: i % 2 === 1, // the victory contract is visible from round 1 in every second match
    signPolicy: POLICIES[i % POLICIES.length],
    // the first match leaves two saves behind for i18n-shots.mjs and the UI walk
    onRound: first ? async (round) => {
      if (round === 4 && !saved.early) { saved.early = (await post('/api/save', { name: 'i18n-early' })).ok; }
    } : undefined,
    // saved inside a negotiation window, preferably one with an open channel, so the composer is reachable
    onNegotiate: first ? async (round, obs) => {
      const target = Math.min(200, ROUNDS - 2);
      if (!saved.late && round >= target && (obs.diplomacy.channels.some((ch) => ch.open) || round >= target + 12)) saved.late = (await post('/api/save', { name: 'i18n-late' })).ok;
    } : undefined,
  });
  matches.push({ seed, round: res.state.round, finished: res.state.finished, winner: res.state.winner, new_strings: harvest.strings.size - before, seconds: (Date.now() - t0) / 1000 });
  log(`${seed}: reached round ${res.state.round}${res.state.finished ? ' (finished' + (res.state.winner !== null ? ', winner seat ' + res.state.winner : '') + ')' : ''}; ${harvest.strings.size} distinct strings so far`);
}
const strings = [...harvest.strings.keys()];
log(`harvested ${strings.length} distinct strings from ${harvest.samples} observations of ${SEEDS.length} matches`);

// ---- 2. server text through the client's tc() ---------------------------------------------------
const nameRe = regionNameRe();
const known = [...harvest.regionNames].sort((a, b) => b.length - a.length);
const leftovers = (text) => {
  let rest = nameRe ? text.replace(nameRe, ' ') : text;
  for (const n of known) rest = rest.split(n).join(' ');
  return rest.match(/[A-Za-z]{3,}/g) ?? [];
};

const browser = await chromium.launch();
async function measure(locale) {
  const { page, errors } = await openClient(browser, { locale });
  const out = [];
  for (let i = 0; i < strings.length; i += 2000) {
    const chunk = strings.slice(i, i + 2000);
    out.push(...await page.evaluate((list) => list.map((s) => window.__btsI18n.tc(s)), chunk));
  }
  await page.close();
  let translated = 0; let weight = 0; let weightOk = 0;
  const bad = [];
  strings.forEach((s, i) => {
    const info = harvest.strings.get(s);
    weight += info.count;
    const left = leftovers(out[i]);
    if (out[i] !== s && left.length === 0) { translated += 1; weightOk += info.count; } else bad.push({ text: s, result: out[i], count: info.count, where: info.where, leftovers: left });
  });
  bad.sort((a, b) => b.count - a.count);
  return { locale, total: strings.length, translated, unweighted: (translated / strings.length) * 100, weighted: (weightOk / weight) * 100, untranslated: bad, errors };
}
const hans = await measure('zh-Hans');
const hant = await measure('zh-Hant');
// Traditional output must not keep Simplified-only characters of the most common kind
log(`zh-Hans server text: ${hans.translated}/${hans.total} distinct = ${hans.unweighted.toFixed(2)}% (weighted by occurrence ${hans.weighted.toFixed(2)}%)`);
log(`zh-Hant server text: ${hant.translated}/${hant.total} distinct = ${hant.unweighted.toFixed(2)}% (weighted ${hant.weighted.toFixed(2)}%)`);

// ---- 3. UI strings: walk every panel in zh-Hans -------------------------------------------------
// A missing key is attributed to the panels work when it is a literal in the files that work owns
// (src/panels, src/inspector.tsx, src/format.ts) or when it is not a literal of any shell file
// (label maps and server text reach t()/tc() dynamically).
const src = (rel) => { try { return readFileSync(join(WEB, 'src', rel), 'utf8'); } catch { return ''; } };
const listTsx = (dir) => { try { return readdirSync(join(WEB, 'src', dir), { recursive: true }).filter((f) => /\.tsx?$/.test(String(f))).map((f) => join(dir, String(f))); } catch { return []; } };
const ownedSrc = [...listTsx('panels'), 'inspector.tsx', 'format.ts'].map(src).join('\n');
const all = listTsx('.');
const shellSrc = all.filter((f) => !f.startsWith('panels') && f !== 'inspector.tsx' && f !== 'format.ts' && !f.startsWith('i18n')).map(src).join('\n');
const quoted = (text, k) => text.includes(`'${k.replace(/'/g, "\\'")}'`) || text.includes(`"${k}"`) || text.includes('`' + k + '`') || text.includes(`>${k}<`);

const ui = { owned: [], shell: [], server: [], skipped: [], errors: [] };
if (!process.env.I18N_SKIP_UI) {
  for (const save of ['i18n-early', 'i18n-late']) {
    const loaded = await post('/api/load', { name: save });
    if (!loaded.ok) { ui.skipped.push(`${save}: save not available`); continue; }
    const obs = (await get('/api/observation?seat=0')).data;
    const { page, errors } = await openClient(browser, { locale: 'zh-Hans' });
    const skipped = await walk(page, obs);
    ui.skipped.push(...skipped.map((s) => `${save}: ${s}`));
    const missing = await page.evaluate(() => window.__btsI18n.missing());
    for (const k of missing) {
      if (/[\u3400-\u9fff]/.test(k)) continue; // already-translated text passed through tc() again
      if (leftovers(k).length === 0) continue; // a bare region name (never translated)
      const mine = quoted(ownedSrc, k);
      const theirs = quoted(shellSrc, k);
      const bucket = mine ? ui.owned : theirs ? ui.shell : harvest.strings.has(k) || /[.:;]|\d/.test(k) ? ui.server : ui.owned;
      if (!bucket.includes(k)) bucket.push(k);
    }
    ui.errors.push(...errors.map((e) => `${save}: ${e}`));
    await page.close();
  }
  log(`UI walk: ${ui.owned.length} missing key(s) in panel-owned files, ${ui.server.length} server string(s) shown untranslated, ${ui.shell.length} missing in shell files (not ours), ${ui.skipped.length} stop(s) skipped`);
}
await browser.close();

// ---- static checks: Rust literals (rare events) and literal UI keys -----------------------------
const staticChecks = [];
for (const script of ['i18n-rust-check.mjs', 'i18n-keys.mjs']) {
  const r = spawnSync(process.execPath, [join(WEB, 'scripts', script)], { encoding: 'utf8' });
  const out = (r.stdout ?? '').trim().split('\n');
  const summary = out.filter((l) => /checked/.test(l)).pop() ?? out.pop() ?? '';
  staticChecks.push({ script, ok: r.status === 0, summary, detail: r.status === 0 ? [] : out });
  log(`${script}: ${summary}`);
}

// ---- report ---------------------------------------------------------------------------------
const lines = [];
lines.push('Before the Stars — localization coverage', `referee ${BASE}; seeds ${SEEDS.join(', ')}; rounds ${ROUNDS}`, '');
for (const m of matches) lines.push(`match ${m.seed}: round ${m.round}${m.finished ? ', finished' : ''}${m.winner !== null && m.winner !== undefined ? ', winner seat ' + m.winner : ''}; +${m.new_strings} strings; ${m.seconds.toFixed(1)}s`);
lines.push('');
for (const r of [hans, hant]) {
  lines.push(`${r.locale}: ${r.translated} of ${r.total} distinct server strings translated — ${r.unweighted.toFixed(2)}% unweighted, ${r.weighted.toFixed(2)}% weighted by occurrence`);
}
lines.push('', `Untranslated server strings (zh-Hans): ${hans.untranslated.length}`);
for (const b of hans.untranslated) lines.push(`  [${b.count}× ${b.where}] ${b.text}\n      → ${b.result}`);
const hantOnly = hant.untranslated.filter((b) => !hans.untranslated.some((x) => x.text === b.text));
lines.push('', `Untranslated only in zh-Hant: ${hantOnly.length}`);
for (const b of hantOnly) lines.push(`  [${b.count}× ${b.where}] ${b.text}\n      → ${b.result}`);
lines.push('', `UI strings requested with no translation, files owned by the panels work: ${ui.owned.length}`);
for (const k of ui.owned) lines.push('  ' + JSON.stringify(k));
lines.push('', `Server strings the panels displayed untranslated during the walk: ${ui.server.length}`);
for (const k of ui.server) lines.push('  ' + JSON.stringify(k));
lines.push('', `UI strings missing in shell-owned files (another engineer's): ${ui.shell.length}`);
for (const k of ui.shell) lines.push('  ' + JSON.stringify(k));
lines.push('', `Walk stops that could not be reached: ${ui.skipped.length}`);
for (const k of ui.skipped) lines.push('  ' + k);
if (ui.errors.length || hans.errors.length) { lines.push('', 'Page errors:'); for (const e of [...hans.errors, ...ui.errors]) lines.push('  ' + e); }
lines.push('', `Free text left alone (written by players or agents): ${harvest.freeText.size} distinct`);
lines.push('', 'Static checks:');
for (const s of staticChecks) { lines.push(`  ${s.script}: ${s.summary}${s.ok ? '' : '  — FAILED'}`); for (const d of s.detail) lines.push('    ' + d); }
writeFileSync(join(OUT, 'untranslated.txt'), lines.join('\n') + '\n');
writeFileSync(join(OUT, 'coverage.json'), JSON.stringify({
  base: BASE, seeds: SEEDS, rounds: ROUNDS, matches, samples: harvest.samples,
  zhHans: { total: hans.total, translated: hans.translated, unweighted: hans.unweighted, weighted: hans.weighted, untranslated: hans.untranslated },
  zhHant: { total: hant.total, translated: hant.translated, unweighted: hant.unweighted, weighted: hant.weighted, untranslated: hantOnly },
  ui,
}, null, 1) + '\n');
writeFileSync(join(OUT, 'harvest.json'), JSON.stringify([...harvest.strings].map(([s, i]) => [s, i.count, i.where])) + '\n');
log(`report: ${join(OUT, 'untranslated.txt')}`);

const fail = [];
if (hans.unweighted < THRESHOLD) fail.push(`zh-Hans server-text coverage ${hans.unweighted.toFixed(2)}% is below ${THRESHOLD}%`);
if (hant.unweighted < THRESHOLD) fail.push(`zh-Hant server-text coverage ${hant.unweighted.toFixed(2)}% is below ${THRESHOLD}%`);
if (ui.owned.length) fail.push(`${ui.owned.length} UI string(s) in panel-owned files have no translation`);
if (ui.server.length) fail.push(`${ui.server.length} server string(s) were displayed untranslated`);
for (const s of staticChecks) if (!s.ok) fail.push(`${s.script} failed: ${s.summary}`);
if (fail.length) { for (const f of fail) console.error('[i18n] FAIL: ' + f); process.exit(1); }
log('OK');
