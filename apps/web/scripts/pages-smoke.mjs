// End-to-end check of the browser build (the GitHub Pages site): the whole game with
// NO referee running anywhere. The Rust engine is the WebAssembly module in a Web Worker.
//
//   scripts/build-pages.sh
//   node apps/web/scripts/serve-static.mjs dist/pages 8080 /Before-the-stars/ &
//   node apps/web/scripts/pages-smoke.mjs http://127.0.0.1:8080/Before-the-stars/
//
// or against the deployed site:
//
//   node apps/web/scripts/pages-smoke.mjs https://<user>.github.io/<repository>/
//
// A. A person plays: start a match from the title screen, select the capital on the
//    map, order a building, end rounds; the year advances and the building progresses.
//    The observer-only calls are refused for that match, through the page's own API.
// W. Regional works: stewards run the seat until the capital has a works with a choice of
//    production method; then, in the regional works view, a new work and a two-level
//    expansion are ordered and charged exactly the referee's quote, and a method change
//    is recorded and run the next round. (Part C checks the view is read-only when watching.)
// B. Saves: a named save, the session text out and back in, and a refused import that
//    leaves the match alone.
// S. Saves that last (docs/saves.md): the match comes back after a reload, at the same
//    round and byte-identical; a manual save survives a reload; export to a .btsave
//    file, start another match, import the file; damaged, truncated, foreign and
//    hostile files are refused with a visible reason and the match untouched; three
//    autosaves rotate; under a tiny budget the oldest autosaves are evicted first and
//    a manual save never is; a save that does not fit is refused; the storage manager
//    shows usage and its cleanup works.
// T. Two tabs at once, storage that is blocked, a database from a newer version, a
//    damaged autosave (the one before it is restored, and the player told).
// C. An AI-only match is watched: step one round, play continuously, pause, run ten
//    rounds (which must not arrive as one jump), look through one civilization's eyes.
// D. Timings in the worker for four AIs on 48 regions, early and late in a match, how
//    long the interface thread was ever held up meanwhile, and the engine's memory.
// E. An engine that cannot start, or that fails, is reported on the page; a save that
//    cannot be played is refused without harming the match in progress.
// Throughout: no page error, no console error, no failed or refused request, and no
// request that leaves the site's own path (so nothing depends on a server or on "/").
//
// The run removes the saves it makes from the page's database and does not assume the
// database was empty, so it can be pointed at the deployed site.
//
// Environment: PAGES_URL (instead of the argument), PAGES_SHOTS (screenshot directory),
// PAGES_SKIP_BENCH=1 (skip D), PAGES_HEADED=1, PAGES_ONLY=S (stop after part S).
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { damagedFiles, readSaveFile, unplayableFile } from './savefile-lib.mjs';

const BASE = (process.argv[2] ?? process.env.PAGES_URL ?? 'http://127.0.0.1:8080/Before-the-stars/').replace(/\/?$/, '/');
const SHOTS = process.env.PAGES_SHOTS ? process.env.PAGES_SHOTS.replace(/\/?$/, '/') : fileURLToPath(new URL('../screenshots/pages/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
/** Save files downloaded from the page, and the damaged copies made of them. */
const TMP = mkdtempSync(join(tmpdir(), 'bts-pages-smoke-'));

const log = (...a) => console.log('[pages]', ...a);
const notes = [];
const note = (s) => { notes.push(s); log(s); };
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}
const tid = (id) => `[data-testid="${id}"]`;

// --- what the page may and may not do on the network ------------------------------------
const problems = [];
const requested = [];
let expectTrouble = false;
function watch(page) {
  page.on('pageerror', (e) => { if (!expectTrouble) problems.push(`page error: ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !expectTrouble) problems.push(`console error: ${m.text()}`); });
  page.on('requestfailed', (r) => {
    // a recording streams from a blob URL; leaving the page or changing track cancels that read
    if (r.url().startsWith('blob:') && r.failure()?.errorText === 'net::ERR_ABORTED') return;
    if (!expectTrouble) problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`);
  });
  page.on('request', (r) => {
    const url = r.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    requested.push(url);
    if (!url.startsWith(BASE)) problems.push(`request outside the site: ${url}`);
    if (new URL(url).pathname.includes('/api/')) problems.push(`request to a server API: ${url}`);
  });
  page.on('response', (r) => { if (r.status() >= 400 && !expectTrouble) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  page.on('worker', (w) => log('worker started:', w.url().replace(BASE, './')));
}

let page;
async function shot(name) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}
/** Call the page's own API object (the calls the interface makes, with the same rules). */
const api = (fn, ...args) => page.evaluate(([f, a]) => window.__btsApi[f](...a), [fn, args]);
/** The same, for calls that are expected to be refused: resolves to the error's fields. */
const refused = (fn, ...args) => page.evaluate(([f, a]) => window.__btsApi[f](...a).then(() => null, (e) => ({ status: e.status, code: e.code, message: e.message })), [fn, args]);
/** The round the top bar shows (player and observer top bars carry it); the year there is historical since ruleset 3.0. */
/** A historical date as the interface writes it in English: "5000 BC", "AD 1066". */
const histLabel = (d) => (d.year < 0 ? `${-d.year} BC` : `AD ${d.year}`);
const yearShown = async () => Number((await page.getAttribute('.topbar-date[data-round]', 'data-round')) ?? 0);

async function closePanel() {
  for (let i = 0; i < 4; i++) {
    if (!(await page.$('[data-testid^="panel-"]'))) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(60);
  }
}
async function clearToasts() {
  for (const b of await page.$$('.toast-x')) await b.click().catch(() => {});
}
/** Click a region on the canvas using the renderer's own hit test. */
async function clickRegion(id) {
  const pt = await page.evaluate((rid) => {
    const a = window.__atlas;
    const c = a?.regionScreenCenter(rid);
    if (!c) return null;
    const tries = [[0, -25], [0, -40], [22, -12], [-22, -12], [0, 26], [34, 8], [-34, 8], [0, 0], [0, -60], [50, -30], [-50, -30]];
    for (const [dx, dy] of tries) {
      const x = c[0] + dx, y = c[1] + dy;
      const el = document.elementFromPoint(x, y);
      if (a.regionAt(x, y) === rid && el && el.tagName === 'CANVAS') return [x, y];
    }
    return null;
  }, id);
  if (!pt) return false;
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForTimeout(80);
  return true;
}
async function selectRegion(id) {
  let ok = await clickRegion(id);
  if (!ok) {
    await closePanel();
    await page.click(tid('map-fit'));
    await page.waitForTimeout(350);
    ok = await clickRegion(id);
  }
  if (!ok) return false;
  await page.waitForSelector(tid('inspector'));
  return true;
}
/** The title screen. A page that has an autosave goes straight back into its match unless asked for the title. */
async function openTitle() {
  await page.goto(BASE + '?title');
  await page.waitForSelector(tid('title-screen'), { timeout: 30000 });
}

// =====================================================================================
async function partA() {
  log('A: a person plays, with no server');
  await page.goto(BASE);
  await page.waitForSelector(tid('title-screen'), { timeout: 30000 });
  assert(await page.evaluate(() => window.__btsApi.mode === 'local' && window.__btsApi.features.local), 'the page runs its own referee');
  assert((await api('match')).exists === false, 'a fresh page has no match');
  await shot('01-title');
  await page.click(tid('title-new'));
  await page.waitForSelector(tid('setup-screen'));
  assert(await page.isVisible(tid('setup-local-note')), 'setup explains what the browser build leaves out');
  assert((await page.$(tid('setup-seat-1-agent'))) === null, 'LLM agent seats are not offered without a server');
  assert((await page.$(tid('setup-seat-1-hard'))) !== null, 'built-in opponents are offered');
  await page.fill(tid('setup-seed'), 'pages-smoke');
  await page.click(tid('setup-regions-30'));
  await shot('02-setup');
  await page.click(tid('setup-start'));
  await page.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  await page.waitForTimeout(500);

  let obs = await api('observation', 0);
  const summary = await api('match');
  assert(obs.round === 1 && obs.phase === 'contact', 'a fresh match starts in round 1, contact phase');
  assert(summary.observer_allowed === false && summary.seats[0].controller === 'human', 'seat 1 is the person');
  assert((await page.textContent(tid('civ-name'))) === obs.civ.name, 'the top bar shows the civilization');
  assert(summary.seats.length === 3 && obs.world.wrap_x === true && obs.calendar?.rounds === 525, 'a Small Earth-like world with three civilizations on the standard calendar');
  assert((await page.textContent(tid('year'))) === '5000 BC' && /of 525/.test((await page.textContent(tid('dock-span'))) ?? ''), 'the date is historical and the dock counts 525 rounds');
  assert((await yearShown()) === 1, 'the match opens in year 1');
  await shot('03-match-start');

  // Observer privileges must not exist for a match somebody plays, even from the page's own API.
  for (const [what, r] of [
    ['the whole-world view', await refused('spectator')],
    ['playback control', await refused('advance', 5)],
    ["another civilization's view", await refused('observation', 1)],
    ["another civilization's chronicle", await refused('chronicleText', 2, 'json')],
  ]) {
    assert(r && r.status === 403, `${what} is refused in a match a person plays (got ${JSON.stringify(r)})`);
  }
  assert((await refused('newMatch', { controllers: ['human', 'claude-api', 'easy', 'easy'] }))?.status === 400, 'an LLM seat is refused by name');
  assert((await api('match')).round === 1, 'refused calls changed nothing');
  note('observer-only calls are refused (403) for the human match, through the page API');

  // Select the capital on the map and order a building from its inspector.
  await closePanel();
  const capital = obs.civ.capital;
  assert(await selectRegion(capital), 'the capital can be clicked on the map');
  assert((await page.textContent(tid('inspector-name'))) === obs.regions.find((r) => r.id === capital).name, 'the inspector shows the capital');
  await shot('04-capital-selected');
  await page.click(tid('qa-build'));
  await page.waitForSelector(tid('build-region'));
  const available = obs.catalog.facilities.filter((f) => f.available).map((f) => f.kind);
  const candidates = [...new Set(['workshop', 'fields', ...available])].filter((k) => available.includes(k));
  let ordered = null;
  for (const kind of candidates) {
    if (!(await page.$(tid(`fac-${kind}`)))) continue;
    await page.click(tid(`fac-${kind}`));
    await page.waitForSelector(tid('build-detail'));
    if (await page.isDisabled(tid('build-submit'))) continue;
    const before = (await api('observation', 0)).projects.length;
    await page.click(tid('build-submit'));
    await page.waitForFunction(() => !document.querySelector('.busy, [aria-busy="true"]'), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    obs = await api('observation', 0);
    if (obs.projects.length > before) {
      ordered = obs.projects.find((p) => p.kind === 'build' && p.region === capital) ?? obs.projects[obs.projects.length - 1];
      note(`ordered ${kind} in the capital: project #${ordered.id} "${ordered.title}", ${ordered.work_done}/${ordered.work_needed} work`);
      break;
    }
    await clearToasts();
    if (await page.$(tid('newproject-back'))) continue;
    await page.click(tid('new-project')).catch(() => {});
  }
  assert(ordered, 'a build order was accepted through the interface');
  await page.waitForSelector(tid('project-card'));
  await shot('05-building-ordered');
  const kindOrdered = ordered.target ?? null;
  const levelOf = (o) => o.regions.find((r) => r.id === capital)?.own?.facilities.reduce((n, f) => n + f.level, 0) ?? 0;
  const levelsBefore = levelOf(obs);

  // End rounds: the year advances and the building progresses.
  let progressed = false;
  let rounds = 0;
  while (rounds < 10 && !(progressed && rounds >= 4)) {
    const year = await yearShown();
    await closePanel();
    await page.click(tid('end-round'));
    await page.waitForFunction((y) => Number(document.querySelector('.topbar-date[data-round]')?.getAttribute('data-round') ?? 0) > y, year, { timeout: 30000 });
    rounds++;
    await clearToasts();
    obs = await api('observation', 0);
    const p = obs.projects.find((x) => x.id === ordered.id);
    if (p ? p.work_done > ordered.work_done : levelOf(obs) > levelsBefore) progressed = true;
    log(`  round ${obs.round}: year ${await yearShown()}, project ${p ? `${p.work_done}/${p.work_needed}` : 'finished'}, facility levels in the capital ${levelOf(obs)}`);
  }
  assert((await yearShown()) === rounds + 1 && obs.round === rounds + 1, `after ${rounds} rounds the page shows year ${rounds + 1}`);
  assert(progressed, 'the ordered building progressed (work done or a level built)');
  note(`played ${rounds} rounds in the page: year ${await yearShown()}; the building ${obs.projects.some((x) => x.id === ordered.id) ? 'is under way' : 'was completed'}${kindOrdered ? ` (${kindOrdered})` : ''}`);
  await page.click(tid('rail-projects')).catch(() => {});
  await shot('06-after-rounds');
  const md = await api('chronicleText', 0, 'md');
  assert(md.startsWith('# Chronicle of ' + obs.civ.name), 'the chronicle exports as Markdown without a server');
  return obs;
}

// =====================================================================================
// --- W. regional works: build, expand, change a production method ------------------------
/** Every term of a build order equals the referee's quote for one level times the levels. */
function checkCharged(p, site, n) {
  const want = (site.cost_per_level ?? []).map((g) => `${g.good}:${g.amount * n}`).sort().join(',');
  const got = p.inputs_needed.map((g) => `${g.good}:${g.amount}`).sort().join(',');
  assert(got === want, `goods charged ${got} = quote x ${n} (${want})`);
  assert(p.work_needed === site.work_per_level * n, `work charged ${p.work_needed} = ${site.work_per_level} x ${n}`);
  assert((p.crew ?? []).map((c) => c.needed).join(',') === (site.crew_per_level ?? []).map((c) => c.count * n).join(','), 'site crew charged = quote x levels');
  assert((p.site_power ?? 0) === (site.site_power_per_level ?? 0) * n, 'site power charged = quote x levels');
  assert((p.min_months ?? site.min_months) === site.min_months, 'minimum months as quoted');
  return `${got || 'no goods'}, ${p.work_needed} worker-months, crew ${(p.crew ?? []).map((c) => c.needed).join('+') || 'none'}, ${p.min_months} months`;
}

async function endRoundInPage() {
  const year = await yearShown();
  if (await page.$(tid('overlay-works'))) await page.click(tid('works-close'));
  await closePanel();
  await page.click(tid('end-round'));
  await page.waitForFunction((y) => Number(document.querySelector('.topbar-date[data-round]')?.getAttribute('data-round') ?? 0) > y, year, { timeout: 60000 });
  await clearToasts();
}

/** Click an order button and return the project it created (polling the page's API). */
async function orderAndFind(selector) {
  const before = new Set((await api('observation', 0)).projects.map((p) => p.id));
  await page.click(selector);
  for (let i = 0; i < 50; i++) {
    const o = await api('observation', 0);
    const p = o.projects.find((x) => !before.has(x.id));
    if (p) return { obs: o, project: p };
    await page.waitForTimeout(100);
  }
  throw new Error(`no order was created by ${selector}`);
}

async function partW(obs) {
  log('W: regional works — build, expand, change a production method');
  const capital = obs.civ.capital;
  const ownCap = (o) => o.regions.find((r) => r.id === capital)?.own;
  const withChoice = (o) => {
    const own = ownCap(o);
    const fs = o.catalog.facilities.filter((f) => f.recipes.filter((r) => r.available).length > 1 && own?.facilities.some((x) => x.kind === f.kind && x.level > 0 && x.enabled));
    return fs.find((f) => f.kind !== 'fields') ?? fs[0] ?? null;
  };
  // A works with a choice of method needs some knowledge: let the stewards run the seat for a while.
  const m = await api('match');
  await api('delegate', 0, m.steward_domains ?? ['economy', 'research', 'education', 'culture', 'expansion', 'military']);
  let stewarded = 0;
  while (stewarded < 16 && !withChoice(obs)) {
    await endRoundInPage();
    stewarded++;
    obs = await api('observation', 0);
  }
  await api('delegate', 0, []);
  const choice = withChoice(obs);
  assert(choice, `after ${stewarded} stewarded rounds the capital has a works with a choice of production method`);
  note(`stewards ran the seat for ${stewarded} rounds; ${choice.kind} offers ${choice.recipes.filter((r) => r.available).map((r) => r.key).join(', ')}`);

  await closePanel();
  await page.click(tid('rail-works'));
  await page.waitForSelector(tid('overlay-works'));
  await page.click(tid(`works-region-${capital}`));
  await shot('05a-works-overview');

  // a new work, at the quoted price
  await page.click(tid('works-tab-build'));
  let own = ownCap(obs);
  let built = null;
  for (const f of obs.catalog.facilities) {
    const site = own.construction_sites?.find((s) => s.kind === f.kind);
    if (!f.available || !site || own.facilities.some((x) => x.kind === f.kind) || site.max_level - site.queued_levels < 1) continue;
    if (!(await page.$(tid(`build-card-${f.kind}`)))) continue;
    await page.click(tid(`build-card-${f.kind}`));
    await page.waitForSelector(tid(`quote-${f.kind}`));
    if (await page.isDisabled(tid(`order-${f.kind}`))) continue;
    assert(Number(await page.getAttribute(tid(`quote-${f.kind}`), 'data-work')) === site.work_per_level, 'the quote shown is the referee’s');
    await shot('05b-works-build-quote');
    const r = await orderAndFind(tid(`order-${f.kind}`));
    built = f.kind;
    note(`built ${f.kind} from the regional works view: charged ${checkCharged(r.project, site, 1)}`);
    obs = r.obs;
    break;
  }
  assert(built, 'a new work was ordered from the regional works view at the quoted price');

  // expand an existing work by two levels
  await page.click(tid('works-tab-works'));
  own = ownCap(obs);
  const grow = own.facilities.find((f) => { const s = own.construction_sites?.find((x) => x.kind === f.kind); return s && f.kind !== built && s.max_level - f.level - s.queued_levels >= 2 && obs.catalog.facilities.find((c) => c.kind === f.kind)?.available; });
  assert(grow, 'a work with room for two more levels');
  const growSite = own.construction_sites.find((x) => x.kind === grow.kind);
  await page.click(tid(`work-row-${grow.kind}`));
  await page.click(tid(`expand-levels-${grow.kind}-inc`));
  await page.waitForFunction(([k, w]) => Number(document.querySelector(`[data-testid="quote-${k}"]`)?.getAttribute('data-work')) === w, [grow.kind, growSite.work_per_level * 2]);
  const r2 = await orderAndFind(tid(`expand-order-${grow.kind}`));
  note(`expanded ${grow.kind} by two levels: charged ${checkCharged(r2.project, growSite, 2)}`);
  obs = r2.obs;

  // change a production method; the next round runs it
  const fv = ownCap(obs).facilities.find((x) => x.kind === choice.kind);
  const next = choice.recipes.find((r) => r.available && r.key !== fv.active_method);
  await page.click(tid(`work-row-${choice.kind}`));
  await page.waitForSelector(tid(`methods-${choice.kind}`));
  await page.click(tid(`choose-${choice.kind}-${next.key}`));
  await page.waitForFunction(([k, key]) => document.querySelector(`[data-testid="method-${k}-${key}"]`)?.classList.contains('is-chosen'), [choice.kind, next.key], { timeout: 10000 });
  obs = await api('observation', 0);
  assert(ownCap(obs).facilities.find((x) => x.kind === choice.kind).method === next.key, `the referee recorded ${next.key}`);
  await page.locator(tid(`methods-${choice.kind}`)).scrollIntoViewIfNeeded();
  await shot('05c-works-method-chosen');
  await endRoundInPage();
  obs = await api('observation', 0);
  const ran = ownCap(obs).facilities.find((x) => x.kind === choice.kind);
  assert(ran.active_method === next.key, `the next round ran ${next.key} (ran ${ran.active_method})`);
  note(`method: ${choice.kind} ${fv.active_method} -> ${next.key}; next round ran ${ran.active_method} (${(ran.runs ?? []).map((x) => `${x.rate_bp / 100}%${x.blockers.length ? ', ' + x.blockers.join('; ') : ''}`).join(' | ')})`);
  return obs;
}

async function partB(obs) {
  log('B: saves without a server');
  const round = obs.round;
  const hash = async () => JSON.stringify((await api('observation', 0)).civ);
  const civBefore = await hash();
  const text = await api('exportSession');
  assert(JSON.parse(text).format === 'bts-save/1', 'exportSession returns save text');
  assert((await api('save', 'pages smoke!')).saved === 'pagessmoke', 'a named save is kept (name sanitised as the server does)');
  assert((await api('saves')).saves.includes('pagessmoke'), 'the save is listed');

  let changes = await page.evaluate(() => { window.__changes = []; window.__btsApi.onSessionChange((c) => window.__changes.push(c)); return 0; });
  await closePanel();
  await page.click(tid('end-round'));
  await page.waitForFunction((y) => Number(document.querySelector('.topbar-date[data-round]')?.getAttribute('data-round') ?? 0) > y, round, { timeout: 30000 });
  changes = await page.evaluate(() => window.__changes);
  assert(changes.some((c) => c.cause === 'request' && c.request === 'POST /api/ready' && c.roundResolved), 'the page is told when a round is resolved (the autosave point)');
  assert((await api('match')).round === round + 1, 'one more round was played');

  for (const bad of ['', 'not a save', '{"format":"bts-save/1"}', text.slice(0, text.length - 20), text.replace('bts-save/1', 'bts-save/0')]) {
    const r = await refused('importSession', bad);
    assert(r && r.status === 400 && r.code === 'INVALID_SAVE', `a bad save is refused (${JSON.stringify(r)})`);
    assert((await api('match')).round === round + 1, 'a refused import leaves the match untouched');
  }
  const restored = await api('importSession', text);
  assert(restored.round === round && restored.match_id === obs.match_id, 'importSession restores the saved round');
  assert((await hash()) === civBefore, 'the restored civilization is exactly the saved one');
  assert((await refused('spectator'))?.status === 403, 'an imported human match still has no observer view');
  await api('ready', 0, true);
  const loaded = await api('load', 'pagessmoke');
  assert(loaded.round === round, 'a named save loads');
  assert((await refused('load', 'no-such-save'))?.status === 404, 'an unknown save name is an error, not a crash');
  note(`session text: ${(text.length / 1024).toFixed(0)} KB; export, import, refused imports and named saves work in the page`);
}

// =====================================================================================
// Saves that last. Everything below runs against the page's own database, which may
// already hold saves (the deployed site in a used profile): it counts only what it
// made, by name and by match, and removes it again at the end.
const made = { matches: new Set(), names: new Set() };
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
/** A page-API call that takes a save file's bytes. */
const withBytes = (p, fn, bytes) => p.evaluate(([f, data]) => window.__btsApi[f](Uint8Array.from(atob(data), (c) => c.charCodeAt(0))), [fn, b64(bytes)]);
const refusedBytes = (p, fn, bytes) => p.evaluate(([f, data]) => window.__btsApi[f](Uint8Array.from(atob(data), (c) => c.charCodeAt(0)))
  .then(() => null, (e) => ({ status: e.status, code: e.code, reason: e.reason, message: e.message })), [fn, b64(bytes)]);
const vaultOf = (p) => p.evaluate(async () => { await window.__btsSaves.refresh(); return window.__btsSaves.state(); });
const settleOf = (p) => p.evaluate(() => window.__btsSaves.settled());
const vault = () => vaultOf(page);
const settle = () => settleOf(page);
const autosOf = (v) => v.entries.filter((e) => e.kind === 'auto');
const mineOf = (v) => v.entries.filter((e) => made.matches.has(e.matchId));
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

async function playRound() {
  const year = await yearShown();
  await closePanel();
  await clearToasts();
  await page.click(tid('end-round'));
  await page.waitForFunction((y) => Number(document.querySelector('.topbar-date[data-round]')?.getAttribute('data-round') ?? 0) > y, year, { timeout: 30000 });
  await settle();
  return year + 1;
}
async function openManager() {
  if (await page.$(tid('saves-manager'))) return;
  if (!(await page.$(tid('game-menu')))) await page.click(tid('menu-button'));
  await page.waitForSelector(tid('game-menu'));
  await page.click(tid('menu-saves'));
  await page.waitForSelector(tid('saves-manager'));
  await page.waitForTimeout(250);
}
async function closeManager() {
  if (await page.$(tid('saves-manager'))) await page.click(tid('saves-close'));
  await page.waitForSelector(tid('saves-manager'), { state: 'detached' });
  if (await page.$(tid('game-menu'))) await page.keyboard.press('Escape');
  await page.waitForSelector(tid('game-menu'), { state: 'detached' });
}
async function setBudget(bytes) {
  await openManager();
  await page.fill(tid('saves-budget'), (bytes / 1048576).toFixed(6));
  await page.waitForFunction((b) => Math.abs(window.__btsSaves.state().settings.budgetBytes - b) <= 2, bytes);
}

async function partS(obs) {
  log('S: saves that last — autosave, restoration, files, the budget');
  made.matches.add(obs.match_id);
  made.names.add('pagessmoke');

  // --- autosave after each round, and the same match after a reload ---------------------
  await settle();
  let v = await vault();
  assert(v.durable && v.problem === null, `saves are kept in IndexedDB (${v.problem} ${v.problemDetail})`);
  assert(await page.evaluate(() => window.__btsApi.features.durableSaves === true), 'named saves are durable in the browser build');
  let m = await api('match');
  assert(autosOf(v).length >= 1 && autosOf(v).length <= v.settings.autosaves, `autosaves are being kept (${autosOf(v).length} of at most ${v.settings.autosaves})`);
  assert(autosOf(v)[0].matchId === m.match_id && autosOf(v)[0].round === m.round, 'the newest autosave is this match at this round');
  assert(v.settings.budgetBytes === 20 * 1048576 && v.settings.autosaves === 3, 'the defaults are a 20 MiB budget and three autosaves');
  let beforeReload = await api('exportSession');
  assert(autosOf(v)[0].sha256 === sha256(beforeReload), 'the newest autosave holds exactly the current state');

  // part B left the match where the page API put it; a reload must bring back exactly that
  await page.reload();
  await page.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  let after = await api('match');
  assert(after.match_id === m.match_id && after.round === m.round, `a reload returns to the same match and round (${after.match_id} round ${after.round})`);
  assert((await api('exportSession')) === beforeReload, 'the restored state is byte-identical to the state before the reload');
  assert((await yearShown()) === m.round, 'the interface is back in the game at that year');
  v = await vault();
  assert(v.restored && v.restored.round === m.round && v.restoreFailures.length === 0, 'the page knows which autosave it restored');
  const told = await page.textContent('.toast');
  assert(/restored/i.test(told ?? ''), `the player is told the match was restored ("${told}")`);
  await shot('07-restored-after-reload');

  // orders given within a round are saved too: at once when the tab is hidden, and after a pause otherwise
  const domain = (await api('match')).steward_domains[0];
  const slots = autosOf(v).length;
  await api('delegate', 0, [domain]);
  const withOrder = await api('exportSession');
  assert(withOrder !== beforeReload && autosOf(await vault())[0].sha256 !== sha256(withOrder), 'an order within the round is not written the instant it is given');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction((want) => window.__btsSaves.state().entries.find((e) => e.kind === 'auto')?.sha256 === want, sha256(withOrder), { timeout: 1200 });
  await page.evaluate(() => { delete document.visibilityState; });
  v = await vault();
  assert(autosOf(v).length === slots && autosOf(v)[0].round === m.round, 'hiding the tab saved the order, in the slot of the same round');
  await api('delegate', 0, []);
  await page.waitForFunction(async (want) => window.__btsSaves.state().entries.find((e) => e.kind === 'auto')?.sha256 === want, sha256(await api('exportSession')), { timeout: 4000 });
  assert(autosOf(await vault()).length === slots, 'and a pause saved the next one, again without using another slot');
  note('orders within a round: saved when the tab was hidden, and after a pause of a second and a half; the round keeps one autosave slot');

  // play on from the restored match, and reload again in the middle of things
  await playRound();
  await playRound();
  m = await api('match');
  beforeReload = await api('exportSession');
  v = await vault();
  assert(autosOf(v)[0].round === m.round && autosOf(v)[0].sha256 === sha256(beforeReload), 'the autosave written after the round holds exactly the current state');
  note(`autosave: round ${m.round} stored as ${autosOf(v)[0].bytes} bytes (session text ${beforeReload.length} bytes); export ${v.lastAutosave.exportMs.toFixed(1)} ms in the worker, IndexedDB write ${v.lastAutosave.storeMs.toFixed(1)} ms`);
  await page.reload();
  await page.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  after = await api('match');
  assert(after.match_id === m.match_id && after.round === m.round && (await api('exportSession')) === beforeReload && (await yearShown()) === m.round, 'a second reload, after playing on, again returns the same round and state');

  // a fresh visit lands on the title screen with Continue ready, saying which save and when
  await page.goto(BASE + '?title');
  await page.waitForSelector(tid('title-screen'), { timeout: 30000 });
  assert(!(await page.isDisabled(tid('title-continue'))), 'Continue is offered after a reload');
  const sub = (await page.textContent(tid('title-continue'))) ?? '';
  assert(sub.includes(histLabel(m.date)) && /autosaved/.test(sub), `Continue says which save it is ("${sub}")`);
  await shot('08-title-continue');
  await page.click(tid('title-continue'));
  await page.waitForSelector(tid('map-canvas'));
  assert((await yearShown()) === m.round && (await api('exportSession')) === beforeReload, 'Continue resumes that state');
  note(`reload: match ${m.match_id} came back at round ${m.round}, byte-identical; title "Continue" reads "${sub.replace('Continue', '').trim()}"`);

  // --- a manual save survives a reload and loads from the title screen ---------------------
  await page.click(tid('menu-button'));
  await page.waitForSelector(tid('game-menu'));
  assert((await page.$(tid('save-local-note'))) === null, 'the menu no longer says saves are lost on reload');
  await page.fill(tid('save-name'), 'smoke-manual');
  made.names.add('smoke-manual');
  await page.click('.menu form button[type="submit"]');
  await page.waitForFunction(() => window.__btsSaves.state().entries.some((e) => e.id === 'm:smoke-manual'));
  const savedText = await api('exportSession');
  const savedRound = m.round;
  await page.keyboard.press('Escape');
  await playRound();
  await page.goto(BASE + '?title');
  await page.waitForSelector(tid('title-screen'), { timeout: 30000 });
  await page.click(tid('title-load'));
  await page.waitForSelector(tid('title-saves'));
  await shot('09-title-load');
  await page.click(tid('title-load-smoke-manual'));
  await page.waitForSelector(tid('map-canvas'));
  after = await api('match');
  assert(after.round === savedRound && (await api('exportSession')) === savedText, 'the manual save made before the reload loads to exactly the saved state');
  note(`manual save "smoke-manual" (round ${savedRound}) survived a reload and loaded from the title screen, byte-identical`);

  // --- export to a file, play something else, import the file ------------------------------
  await openManager();
  await shot('10-saves-manager');
  const usageText = await page.textContent(tid('saves-usage-text'));
  v = await vault();
  assert(Number(await page.getAttribute(tid('saves-usage'), 'data-used')) === v.entries.reduce((n, e) => n + e.cost, 0), 'the usage bar shows what is stored');
  assert(/ of 20\.0 MiB used/.test(usageText ?? ''), `usage is shown against the budget ("${usageText}")`);
  assert(['true', 'false', 'null'].includes(await page.getAttribute(tid('saves-persist'), 'data-persisted')), 'the manager says whether the browser will keep the data');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(tid('saves-export-current'))]);
  const filePath = join(TMP, download.suggestedFilename());
  await download.saveAs(filePath);
  const file = readFileSync(filePath);
  const exportText = await api('exportSession');
  const exported = readSaveFile(file); // checks magic, both CRCs, lengths and SHA-256 independently of the game
  assert(/^before-the-stars-.*\.btsave$/.test(download.suggestedFilename()), `the file is named for the game (${download.suggestedFilename()})`);
  assert(exported.version === 1 && exported.text === exportText, 'the file unpacks (in Node) to exactly the session export');
  const h = exported.header;
  assert(h.match_id === after.match_id && h.round === after.round && h.date?.year === after.date.year && h.kind === 'manual', 'the header names the match, round and historical date');
  assert(h.seats.length === 3 && h.seats[0].controller === 'human' && h.seats[0].name === obs.civ.name, 'the header lists the seats');
  assert(after.versions.includes(h.versions.ruleset) && after.versions.includes(h.versions.content) && after.versions.includes(h.versions.protocol), 'the header carries the versions the engine reports');
  assert(h.seed === 'pages-smoke' && Math.abs(h.created_ms - Date.now()) < 120000, 'the header carries the disclosed seed and the time of saving');
  note(`export: ${download.suggestedFilename()}, ${file.length} bytes for ${exportText.length} bytes of session text (${(exportText.length / file.length).toFixed(1)}:1), header ${exported.headerLength} bytes`);
  await closeManager();

  // a different match, through the interface
  await page.goto(BASE + '?title');
  await page.waitForSelector(tid('title-screen'), { timeout: 30000 });
  await page.click(tid('title-new'));
  await page.waitForSelector(tid('setup-screen'));
  await page.fill(tid('setup-seed'), 'pages-other');
  await page.click(tid('setup-regions-30'));
  await page.click(tid('setup-start'));
  await page.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  await page.waitForTimeout(400);
  await playRound();
  const other = await api('match');
  made.matches.add(other.match_id);
  assert(other.match_id !== h.match_id && other.round === 2, 'a different match is now in progress');
  const otherText = await api('exportSession');

  // preview, cancel: nothing changes
  await openManager();
  await page.setInputFiles(tid('saves-import-input'), filePath);
  await page.waitForSelector(`${tid('saves-preview')}[data-loadable="true"]`);
  const previewText = (await page.textContent(tid('saves-preview'))) ?? '';
  assert(previewText.includes(h.match_id) && previewText.includes(histLabel(h.date)) && previewText.includes(obs.civ.name) && previewText.includes(h.versions.ruleset), 'the preview shows the match, year, seats and versions before anything is loaded');
  assert(/Replace the current game/.test((await page.textContent(tid('saves-preview-confirm'))) ?? ''), 'the preview asks before replacing the game in progress');
  await shot('11-import-preview');
  await page.click(tid('saves-preview-cancel'));
  assert((await api('exportSession')) === otherText, 'looking at a file and cancelling changes nothing');
  // preview, confirm: the exported state is back
  await page.setInputFiles(tid('saves-import-input'), filePath);
  await page.waitForSelector(`${tid('saves-preview')}[data-loadable="true"]`);
  await page.click(tid('saves-preview-confirm'));
  await page.waitForSelector(tid('saves-manager'), { state: 'detached' });
  await page.waitForFunction((y) => Number(document.querySelector('.topbar-date[data-round]')?.getAttribute('data-round') ?? 0) === y, h.round);
  assert((await api('exportSession')) === exportText, 'after the import the state is byte-identical to the export');
  note(`import: from a different match (${other.match_id}, round 2), the file brought back ${h.match_id} at round ${h.round}, byte-identical to the export`);

  // --- files that must be refused, each with a reason, none of them touching the match -----
  const bad = [...damagedFiles(file), { name: 'unplayable-session', reason: 'UNPLAYABLE', bytes: unplayableFile(file) }];
  const reasons = [];
  for (const b of bad) {
    const r = await refusedBytes(page, 'importSave', b.bytes);
    assert(r && r.status === 400 && r.code === 'INVALID_SAVE' && r.reason === b.reason, `${b.name}: import is refused as ${b.reason} (${JSON.stringify(r)})`);
    assert((await api('exportSession')) === exportText, `${b.name}: the match is unchanged after the refused import`);
    const badPath = join(TMP, `${b.name}.btsave`);
    writeFileSync(badPath, b.bytes);
    await openManager();
    await page.setInputFiles(tid('saves-import-input'), badPath);
    await page.waitForSelector(`${tid('saves-preview')}[data-loadable="false"]:not([data-reason=""])`);
    assert((await page.getAttribute(tid('saves-preview'), 'data-reason')) === b.reason, `${b.name}: the preview gives the reason ${b.reason}`);
    const why = ((await page.textContent(tid('saves-preview-reason'))) ?? '').replace(/\s+/g, ' ').trim();
    assert(why.length > 30 && (await page.isVisible(tid('saves-preview-reason'))), `${b.name}: the reason is shown to the player`);
    assert((await page.$(tid('saves-preview-confirm'))) === null, `${b.name}: a file that cannot be loaded offers no way to load it`);
    if (b.name === 'other-rules') {
      assert(why.includes('bts-rules/0.0.1') && why.includes(h.versions.ruleset), `the version refusal names both versions ("${why}")`);
      await shot('12-import-refused');
    }
    reasons.push(`${b.name} -> ${b.reason}`);
    await page.click(tid('saves-preview-cancel'));
    assert((await api('exportSession')) === exportText, `${b.name}: the match is unchanged after the preview`);
  }
  note(`refused files (${bad.length}), each with a visible reason and the match byte-identical afterwards: ${reasons.join('; ')}`);

  // a file dropped on the window opens the same preview
  await closeManager();
  await page.evaluate((data) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'dropped.btsave'));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, b64(file));
  await page.waitForSelector(`${tid('saves-preview')}[data-loadable="true"]`);
  assert(((await page.textContent(tid('saves-preview'))) ?? '').includes('dropped.btsave'), 'a dropped file is previewed');
  await page.click(tid('saves-preview-cancel'));
  await closeManager();
  note('drag and drop: a file dropped on the window opened the import preview');

  // --- rotation: three autosaves, the oldest making way ------------------------------------
  await openManager();
  if (await page.$(tid('saves-delete-autos'))) await page.click(tid('saves-delete-autos'));
  await page.waitForFunction(() => window.__btsSaves.state().entries.every((e) => e.kind !== 'auto'));
  await page.fill(tid('saves-name'), 'smoke-keep');
  made.names.add('smoke-keep');
  await page.click(tid('saves-save'));
  await page.waitForFunction(() => window.__btsSaves.state().entries.some((e) => e.id === 'm:smoke-keep'));
  const keep = (await vault()).entries.find((e) => e.id === 'm:smoke-keep');
  const keepText = await api('exportSession');
  assert(keep.sha256 === sha256(keepText) && keep.kind === 'manual', 'the manual save holds the current state');
  await closeManager();
  const keptIntact = async (when) => {
    const e = (await vault()).entries.find((x) => x.id === 'm:smoke-keep');
    assert(e && e.sha256 === keep.sha256 && e.bytes === keep.bytes, `the manual save is untouched ${when}`);
  };
  const played = [];
  for (let i = 0; i < 5; i++) played.push(await playRound());
  v = await vault();
  assert(JSON.stringify(autosOf(v).map((e) => e.round)) === JSON.stringify(played.slice(-3).reverse()), `three autosaves rotate: rounds ${autosOf(v).map((e) => e.round)} are kept after playing ${played}`);
  await keptIntact('by rotation');
  const A = Math.max(...autosOf(v).map((e) => e.cost));
  note(`rotation: after rounds ${played.join(', ')} the autosaves are rounds ${autosOf(v).map((e) => e.round).join(', ')} (${autosOf(v).map((e) => e.cost).join(', ')} bytes); manual save ${keep.cost} bytes`);

  // --- a tiny budget: oldest autosaves are evicted first, the manual save stays ---------------
  const others = v.entries.filter((e) => e.kind === 'manual').reduce((n, e) => n + e.cost, 0);
  await setBudget(Math.round(others + 2.9 * A));
  await shot('13-tiny-budget');
  await closeManager();
  for (let i = 0; i < 3; i++) {
    const round = await playRound();
    v = await vault();
    assert(JSON.stringify(autosOf(v).map((e) => e.round)) === JSON.stringify([round, round - 1]), `with room for two autosaves the oldest is evicted first (kept rounds ${autosOf(v).map((e) => e.round)} at round ${round})`);
    assert(v.usage.used <= v.settings.budgetBytes, `usage ${v.usage.used} stays within the budget ${v.settings.budgetBytes}`);
    await keptIntact('by eviction');
  }
  note(`budget ${v.settings.budgetBytes} bytes (your saves ${others} + room for two autosaves): three more rounds, always the newest two autosaves kept, usage ${v.usage.used}; the manual save never touched`);

  // --- a manual save that does not fit is refused; nothing is deleted for it -------------------
  await setBudget(Math.round(others + 0.5 * A));
  await closeManager();
  const idsBefore = (await vault()).entries.map((e) => e.id).sort();
  await page.click(tid('menu-button'));
  await page.waitForSelector(tid('game-menu'));
  await page.fill(tid('save-name'), 'smoke-nofit');
  await page.click('.menu form button[type="submit"]');
  await page.waitForSelector(tid('saves-notice'));
  const notice = ((await page.textContent(tid('saves-notice'))) ?? '').replace(/\s+/g, ' ').trim();
  assert(/Nothing was deleted/.test(notice) && /budget/.test(notice), `the refusal says why and that nothing was deleted ("${notice}")`);
  assert(await page.isVisible(tid('saves-manager')), 'the storage manager opens so the player can make room');
  await shot('14-manual-refused');
  const r = await refused('save', 'smoke-nofit');
  assert(r && r.status === 507 && r.code === 'SAVE_NOT_STORED', `the page API refuses it too (${JSON.stringify(r)})`);
  assert(JSON.stringify((await vault()).entries.map((e) => e.id).sort()) === JSON.stringify(idsBefore), 'no save, manual or automatic, was removed for the save that did not fit');
  await keptIntact('by a refused save');
  await closeManager();
  note(`manual save that does not fit: refused ("${notice.slice(0, 110)}…"), the storage manager opened, every existing save still there`);

  // --- an autosave that cannot fit is skipped, with a standing warning ----------------------------
  await playRound();
  await page.waitForSelector(tid('saves-warning-autosave'));
  assert((await page.getAttribute(tid('saves-warning-autosave'), 'data-reason')) === 'full', 'the warning says the budget is full');
  v = await vault();
  assert(JSON.stringify(v.entries.map((e) => e.id).sort()) === JSON.stringify(idsBefore) && v.autosaveOff?.reason === 'full', 'the autosave was skipped and the older autosaves were kept');
  await shot('15-autosave-off');
  await playRound();
  assert(await page.isVisible(tid('saves-warning-autosave')), 'the warning stays while autosave is off');
  await page.click(tid('saves-warning-dismiss'));
  await page.waitForSelector(tid('saves-warning-autosave'), { state: 'detached' });
  await playRound();
  assert((await page.$(tid('saves-warning-autosave'))) === null && (await vault()).autosaveOff?.reason === 'full', 'a dismissed warning stays dismissed while the cause is the same');
  await openManager();
  assert(await page.isVisible(tid('saves-autosave-off')), 'the storage manager still says autosave is off');
  await page.fill(tid('saves-budget'), '20');
  await closeManager();
  const back = await playRound();
  v = await vault();
  assert(v.autosaveOff === null && autosOf(v)[0].round === back, 'with room again the next round is autosaved and the warning clears');
  await keptIntact('while autosave was off');
  note('autosave that cannot fit: skipped with a standing, dismissible warning; older autosaves kept; autosave resumed once the budget was raised');

  // --- the browser itself out of room (simulated QuotaExceededError) -------------------------------
  await page.evaluate(() => window.__btsSaves.refuseWrites(1));
  const tight = await playRound();
  v = await vault();
  assert(autosOf(v)[0].round === tight && v.autosaveOff === null, 'after the browser refuses a write, the autosave is written by giving up older autosaves');
  await keptIntact('when the browser ran out of room');
  await page.evaluate(() => window.__btsSaves.refuseWrites(9));
  const q = await page.evaluate(() => window.__btsApi.save('smoke-quota').then(() => null, (e) => ({ code: e.code, why: e.why })));
  await page.evaluate(() => window.__btsSaves.refuseWrites(0));
  v = await vault();
  assert(q && q.code === 'SAVE_NOT_STORED' && q.why === 'quota' && !v.entries.some((e) => e.id === 'm:smoke-quota'), `a manual save the browser has no room for is refused (${JSON.stringify(q)})`);
  await keptIntact('by a quota refusal');
  note(`QuotaExceededError (simulated): the autosave got through by evicting older autosaves (${autosOf(v).length} left); a manual save was refused; the existing manual save untouched`);

  // --- rename, load, delete with confirmation, cleanup controls -------------------------------------
  await openManager();
  await page.click(tid('saves-rename-m:smoke-keep'));
  await page.fill(tid('saves-rename-input-m:smoke-keep'), 'smoke-manual');
  await page.click(tid('saves-rename-confirm-m:smoke-keep'));
  await page.waitForSelector(`${tid('saves-row-m:smoke-keep')} .sv-row-error`);
  assert((await vault()).entries.some((e) => e.id === 'm:smoke-keep'), 'renaming onto a name that is taken is refused and replaces nothing');
  await page.fill(tid('saves-rename-input-m:smoke-keep'), 'smoke-kept');
  made.names.add('smoke-kept');
  await page.click(tid('saves-rename-confirm-m:smoke-keep'));
  await page.waitForSelector(tid('saves-row-m:smoke-kept'));
  v = await vault();
  assert(!v.entries.some((e) => e.id === 'm:smoke-keep') && v.entries.find((e) => e.id === 'm:smoke-kept').sha256 === keep.sha256, 'the save has its new name and the same contents');
  const renamed = Buffer.from(await page.evaluate(async () => btoa(String.fromCharCode(...(await window.__btsApi.saveFile('m:smoke-kept'))))), 'base64');
  assert(readSaveFile(renamed).header.name === 'smoke-kept' && readSaveFile(renamed).text === keepText, 'the file itself carries the new name');
  await page.click(tid('saves-load-m:smoke-kept'));
  await page.waitForSelector(tid('saves-manager'), { state: 'detached' });
  assert((await api('exportSession')) === keepText, 'loading it from the manager restores the saved state');
  await openManager();
  await page.click(tid('saves-delete-m:smoke-kept'));
  assert((await vault()).entries.some((e) => e.id === 'm:smoke-kept'), 'deleting a manual save asks first');
  await page.click(tid('saves-delete-confirm-m:smoke-kept'));
  await page.waitForSelector(tid('saves-row-m:smoke-kept'), { state: 'detached' });
  const usedBefore = (await vault()).usage.used;
  await page.click(tid('saves-delete-autos'));
  await page.waitForFunction(() => window.__btsSaves.state().entries.every((e) => e.kind !== 'auto'));
  v = await vault();
  assert(v.usage.used < usedBefore && v.entries.some((e) => e.id === 'm:smoke-manual'), '"Delete all autosaves" frees their space and leaves manual saves');
  assert(Number(await page.getAttribute(tid('saves-usage'), 'data-used')) === v.usage.used, 'the usage bar follows');
  note(`cleanup: rename (and a refused rename onto a taken name), load, delete with confirmation, "delete all autosaves" (usage ${usedBefore} -> ${v.usage.used} bytes)`);

  // --- settings: the autosave count, and both settings across a reload ---------------------------------
  await page.fill(tid('saves-autocount'), '1');
  await page.fill(tid('saves-budget'), '7');
  await closeManager();
  await playRound();
  await playRound();
  v = await vault();
  assert(autosOf(v).length === 1 && v.settings.autosaves === 1, 'with the count set to one, one autosave is kept');
  await page.goto(BASE); // (the address still carried ?title; this is the plain page again)
  await page.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  v = await vault();
  assert(v.settings.budgetBytes === 7 * 1048576 && v.settings.autosaves === 1, 'the budget and the autosave count are remembered across a reload');
  await openManager();
  await page.fill(tid('saves-autocount'), '0');
  await closeManager();
  await playRound();
  assert(autosOf(await vault()).length === 1 && autosOf(await vault())[0].round < (await api('match')).round, 'a count of zero turns autosave off');
  await openManager();
  await page.click(tid('saves-settings-reset'));
  v = await vault();
  assert(v.settings.budgetBytes === 20 * 1048576 && v.settings.autosaves === 3, 'the defaults come back');
  await closeManager();
  note('settings: autosave count 1 kept one; budget and count survived a reload; count 0 stopped autosave; defaults restored');
}

/** Remove what this run stored in the page's database, and put the settings back. */
async function cleanUp() {
  const left = await page.evaluate(async ([names, matches]) => {
    const api = window.__btsApi;
    window.__btsSaves.settings({ autosaves: 0 });
    await window.__btsSaves.settled();
    for (const e of (await api.saveList()).entries) {
      if ((e.kind === 'manual' && names.includes(e.name)) || (e.header && matches.includes(e.header.match_id))) await api.deleteSave(e.id);
    }
    window.__btsSaves.resetSettings();
    return (await api.saveList()).entries.filter((e) => e.header && matches.includes(e.header.match_id)).length;
  }, [[...made.names], [...made.matches]]);
  assert(left === 0, 'the saves this run made were removed');
  note(`cleanup: removed the saves of ${made.matches.size} matches and ${made.names.size} names made by this run; settings back to the defaults`);
}

// =====================================================================================
async function partT(browser) {
  log('T: two tabs, blocked storage, a newer database, a damaged autosave');
  const fresh = async (init) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    if (init) await ctx.addInitScript(init);
    return ctx;
  };
  const open = async (ctx, query = '') => {
    const p = await ctx.newPage();
    watch(p);
    await p.goto(BASE + query);
    await p.waitForSelector(`${tid('title-screen')}, ${tid('map-canvas')}`, { timeout: 30000 });
    return p;
  };
  const start = (p, seed, rounds) => p.evaluate(async ([s, n]) => {
    const api = window.__btsApi;
    const made = await api.newMatch({ seed: s, regions: 24, controllers: ['human', 'easy', 'easy', 'easy'] });
    for (let i = 0; i < n; i++) {
      await api.ready(0, true);
      await window.__btsSaves.settled();
    }
    return made.match_id;
  }, [seed, rounds]);
  const round = (p) => p.evaluate(async () => { const s = await window.__btsApi.ready(0, true); await window.__btsSaves.settled(); return s.round; });

  // --- two tabs on the site -----------------------------------------------------------
  let ctx = await fresh();
  const a = await open(ctx);
  const b = await open(ctx);
  const matchA = await start(a, 'tab-a', 1);
  const matchB = await start(b, 'tab-b', 1);
  await a.waitForFunction(() => window.__btsSaves.state().otherTabs === 1);
  await b.waitForFunction(() => window.__btsSaves.state().otherTabs === 1);
  await a.evaluate(() => window.__btsSaves.open());
  await a.waitForSelector(tid('saves-tabs-warning'));
  await a.screenshot({ path: `${SHOTS}22-two-tabs.png` });
  await a.evaluate(() => window.__btsSaves.close());
  // both write at once, several times: nothing is lost, nothing is doubled, nothing is half-written
  for (let i = 0; i < 4; i++) {
    await Promise.all([
      a.evaluate((n) => Promise.all([window.__btsApi.save(`tab-a-${n}`), window.__btsApi.ready(0, true)]), i),
      b.evaluate((n) => Promise.all([window.__btsApi.save(`tab-b-${n}`), window.__btsApi.ready(0, true)]), i),
    ]);
  }
  await settleOf(a);
  await settleOf(b);
  const [va, vb] = [await vaultOf(a), await vaultOf(b)];
  const ids = (v) => v.entries.map((e) => `${e.id}:${e.sha256.slice(0, 8)}`).sort();
  assert(JSON.stringify(ids(va)) === JSON.stringify(ids(vb)) && va.usage.used === vb.usage.used, 'both tabs see the same saves and the same usage');
  assert(va.entries.filter((e) => e.kind === 'manual').length === 8, `all eight manual saves written by the two tabs are there (${va.entries.filter((e) => e.kind === 'manual').length})`);
  assert(autosOf(va).length <= 3 && autosOf(va).length >= 1, `the autosaves stayed within the three slots across both tabs (${autosOf(va).length})`);
  const stored = await a.evaluate(async () => {
    let bad = 0;
    for (const e of window.__btsSaves.state().entries) {
      const d = await window.__btsApi.describeSave(await window.__btsApi.saveFile(e.id));
      if (!d.loadable || d.header.sha256 !== e.sha256) bad++;
    }
    return bad;
  });
  assert(stored === 0, 'every save written while both tabs were busy is intact');
  // each tab comes back to its own match when its autosave is still there
  await round(a);
  await round(b);
  await a.reload();
  await a.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  await b.reload();
  await b.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  assert((await a.evaluate(() => window.__btsApi.match())).match_id === matchA && (await b.evaluate(() => window.__btsApi.match())).match_id === matchB, 'after a reload each tab resumes the match it was playing');
  await b.close();
  await a.waitForFunction(async () => { await window.__btsSaves.refresh(); return window.__btsSaves.state().otherTabs === 0; }, null, { timeout: 10000 });
  note(`two tabs: each warned about the other; ${va.entries.length} saves written concurrently, identical in both tabs and all intact; ${autosOf(va).length} autosaves; each tab resumed its own match after a reload; the warning cleared when the other tab closed`);
  await ctx.close();

  // --- storage blocked (a private window that refuses IndexedDB) ---------------------------
  ctx = await fresh(() => {
    Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
  });
  let p = await open(ctx);
  await start(p, 'blocked', 2);
  let v = await vaultOf(p);
  assert(v.durable === false && v.problem === 'unavailable', `blocked storage is noticed (${v.problem})`);
  assert(await p.evaluate(() => window.__btsApi.features.durableSaves === false), 'the page stops promising durable saves');
  assert((await p.evaluate(() => window.__btsApi.save('in-memory'))).saved === 'in-memory' && (await p.evaluate(() => window.__btsApi.load('in-memory'))).round === 3, 'saving and loading still work for the life of the tab');
  await p.waitForSelector(`${tid('saves-warning-autosave')}[data-reason="unavailable"]`);
  await p.evaluate(() => window.__btsSaves.open());
  await p.waitForSelector(`${tid('saves-problem')}[data-problem="unavailable"]`);
  await p.screenshot({ path: `${SHOTS}23-storage-blocked.png` });
  await p.reload();
  await p.waitForSelector(tid('title-screen'), { timeout: 30000 });
  assert((await p.evaluate(() => window.__btsApi.match())).exists === false, 'with storage blocked a reload starts clean, without an error');
  note('blocked storage: noticed and explained (warning, storage manager, menu); saves work until the tab closes; a reload starts clean');
  await ctx.close();

  // --- no CompressionStream in the page: compression is the referee's own -----------------
  ctx = await fresh(() => {
    delete window.CompressionStream;
    delete window.DecompressionStream;
  });
  p = await open(ctx);
  assert(await p.evaluate(() => typeof window.CompressionStream === 'undefined'), 'CompressionStream is absent in this page');
  await start(p, 'no-streams', 2);
  v = await vaultOf(p);
  const whole = await p.evaluate(async () => (await window.__btsApi.describeSave(await window.__btsApi.exportSave())).loadable);
  assert(autosOf(v).length >= 1 && autosOf(v)[0].bytes < autosOf(v)[0].header.length / 4 && whole, 'saves are written, compressed, and read back without CompressionStream');
  note(`no CompressionStream: autosave still ${autosOf(v)[0].bytes} bytes for ${autosOf(v)[0].header.length} of text (the referee compresses, in Rust)`);

  // a burst of rounds: one write at a time, the rest coalesced into the state at the end
  const burst = await p.evaluate(async () => {
    const before = window.__btsSaves.stats();
    await Promise.all(Array.from({ length: 12 }, () => window.__btsApi.ready(0, true)));
    await window.__btsSaves.settled();
    const after = window.__btsSaves.stats();
    const newest = window.__btsSaves.state().entries.find((e) => e.kind === 'auto');
    return { written: after.written - before.written, most: after.maxInFlight, round: (await window.__btsApi.match()).round, saved: newest.round };
  });
  assert(burst.most === 1, `never two autosave writes at once (${burst.most})`);
  assert(burst.written < 12 && burst.saved === burst.round, `twelve rounds in a burst were coalesced into ${burst.written} write(s), ending on the last round (${burst.saved} of ${burst.round})`);
  note(`burst: twelve rounds resolved back to back made ${burst.written} autosave write(s), never two at once, and the last round (${burst.round}) is the one saved`);
  await ctx.close();

  // --- the database is upgraded by a newer version of the game in another tab ----------------
  ctx = await fresh();
  p = await open(ctx);
  await start(p, 'upgrade', 2);
  await p.evaluate(() => window.__btsApi.save('before-upgrade'));
  const count = (await vaultOf(p)).entries.length;
  await p.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open(window.__btsSaves.dbName, 99);
    req.onupgradeneeded = () => undefined; // a newer layout would be made here
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  }));
  await p.waitForFunction(() => window.__btsSaves.state().problem === 'stale');
  await p.evaluate(() => window.__btsSaves.open());
  await p.waitForSelector(`${tid('saves-problem')}[data-problem="stale"]`);
  await p.reload();
  await p.waitForSelector(tid('title-screen'), { timeout: 30000 });
  v = await vaultOf(p);
  assert(v.problem === 'newer' && v.durable === false, `a database from a newer version is not touched (${v.problem})`);
  const kept = await p.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open(window.__btsSaves.dbName);
    req.onsuccess = () => {
      const all = req.result.transaction('meta', 'readonly').objectStore('meta').count();
      all.onsuccess = () => { req.result.close(); resolve(all.result); };
    };
    req.onerror = () => reject(req.error);
  }));
  assert(kept === count, `the ${count} stored saves are still in the upgraded database (${kept})`);
  await p.evaluate(() => window.__btsSaves.open());
  await p.waitForSelector(`${tid('saves-problem')}[data-problem="newer"]`);
  note(`database upgraded elsewhere: this tab stopped using it and asked for a reload; on reload the newer database (still holding its ${kept} saves) was left alone and the page said so`);
  await ctx.close();

  // --- the newest autosave is damaged: fall back to the one before, and say so ------------------
  ctx = await fresh();
  p = await open(ctx);
  const damagedMatch = await start(p, 'damaged', 3);
  v = await vaultOf(p);
  assert(JSON.stringify(autosOf(v).map((e) => e.round)) === '[4,3,2]', `three autosaves to work with (${autosOf(v).map((e) => e.round)})`);
  const damage = (ids) => p.evaluate((list) => new Promise((resolve, reject) => {
    const req = indexedDB.open(window.__btsSaves.dbName);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('data', 'readwrite');
      const store = tx.objectStore('data');
      for (const id of list) {
        const get = store.get(id);
        get.onsuccess = () => {
          const bytes = new Uint8Array(get.result);
          bytes[bytes.length - 200] ^= 0x55;
          store.put(bytes.buffer, id);
        };
      }
      tx.oncomplete = () => { req.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), ids);
  await damage([autosOf(v)[0].id]);
  await p.reload();
  await p.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  let m = await p.evaluate(() => window.__btsApi.match());
  assert(m.match_id === damagedMatch && m.round === 3, `with the newest autosave damaged, the one before it is restored (round ${m.round})`);
  const said = ((await p.textContent('.toast-bad')) ?? '').replace(/\s+/g, ' ');
  assert(/earlier autosave was restored/i.test(said) && /kept/.test(said), `the player is told ("${said}")`);
  await p.screenshot({ path: `${SHOTS}24-restore-fallback.png` });
  v = await vaultOf(p);
  assert(v.restoreFailures.length === 1 && v.restoreFailures[0].reason === 'CORRUPT' && autosOf(v).length === 3, 'the damaged autosave is reported and kept, not deleted');
  // every autosave damaged: no match, a note on the title screen, nothing wiped, no reload loop
  await p.evaluate(() => window.__btsSaves.settings({ autosaves: 0 }));
  await damage(autosOf(v).slice(1).map((e) => e.id));
  let loads = 0;
  p.on('load', () => { loads++; });
  await p.reload();
  await p.waitForSelector(tid('title-restore-failed'), { timeout: 30000 });
  await p.waitForTimeout(1500);
  assert(loads === 1 && (await p.isDisabled(tid('title-continue'))), 'with nothing loadable the page rests on the title screen: one load, no loop');
  v = await vaultOf(p);
  assert(autosOf(v).length === 3 && (await p.evaluate(() => window.__btsApi.match())).exists === false, 'the damaged autosaves are all still there');
  note(`damaged autosave: the previous one (round 3) was restored and the player told ("${said.trim().slice(0, 80)}…"); with all three damaged the page rested on the title screen with a note, nothing deleted`);
  await ctx.close();
}

// =====================================================================================
async function partC() {
  log('C: an AI-only match is watched');
  await openTitle();
  await page.click(tid('title-observer'));
  // the menu entry opens a quick start; the full setup is one link further
  await page.waitForSelector(tid('title-observer-start'));
  await page.click(tid('title-observer-custom'));
  await page.waitForSelector(tid('setup-screen'));
  await page.fill(tid('setup-seed'), 'pages-watch');
  await page.click(tid('setup-regions-60'));
  assert(await page.isVisible(tid('setup-observer-note')), 'setup says this is an observer match');
  await page.click(tid('setup-start'));
  await page.waitForSelector(tid('observer-console'), { timeout: 30000 });
  await page.waitForSelector(tid('observer-playback'));
  let m = await api('match');
  made.matches.add(m.match_id);
  assert(m.observer_allowed && m.seats.every((s) => s.controller.startsWith('native')), 'four built-in AIs, nobody playing');
  assert(m.round === 1 && (await yearShown()) === 1, 'nothing moves until asked');
  const world = await api('spectator');
  assert(world.civs.length === 4 && world.regions.length === 60, 'the whole world is visible to the observer');
  await shot('10-observer-start');

  // step one round
  await page.click(tid('observer-step'));
  await page.waitForFunction(() => Number(document.querySelector('.topbar-date[data-round]')?.getAttribute('data-round') ?? 0) === 2, null, { timeout: 30000 });
  await page.waitForSelector(`${tid('observer-status')}:not([data-state="busy"])`);
  await page.waitForTimeout(700);
  m = await api('match');
  assert(m.round === 2 && (await yearShown()) === 2, 'one step is exactly one round');
  note('step: year 1 -> 2');

  // run continuously, then pause
  await page.click(tid('observer-speed-4'));
  await page.click(tid('observer-play'));
  await page.waitForFunction(() => Number(document.querySelector('.topbar-date[data-round]')?.getAttribute('data-round') ?? 0) >= 5, null, { timeout: 60000 });
  assert((await page.getAttribute(tid('observer-play'), 'aria-pressed')) === 'true', 'the play control shows it is playing');
  await shot('11-observer-playing');
  const pausedAt = Date.now();
  await page.click(tid('observer-play'));
  const atPause = (await api('match')).round;
  await page.waitForTimeout(2500);
  const settled = (await api('match')).round;
  await page.waitForTimeout(2500);
  m = await api('match');
  assert(m.round === settled, `paused: the match stays at round ${settled}`);
  assert(settled - atPause <= 1, `pause takes effect after the round in hand (round ${atPause} when pressed, ${settled} at rest)`);
  assert(m.phase === 'contact', 'the paused match rests at the start of a round');
  await page.waitForFunction((r) => Number(document.querySelector('.topbar-date[data-round]')?.getAttribute('data-round') ?? 0) === r, settled, { timeout: 10000 });
  assert((await page.getAttribute(tid('observer-play'), 'aria-pressed')) === 'false', 'the play control shows it is paused');
  note(`continuous play reached year ${settled}; pause held it there (pressed at round ${atPause}, checked ${((Date.now() - pausedAt) / 1000).toFixed(1)} s later)`);

  // fast-forward ten rounds: they must arrive one by one, not as a single jump
  const from = settled;
  await page.evaluate(() => {
    const seen = new Set();
    const el = () => Number(document.querySelector('.topbar-date[data-round]')?.getAttribute('data-round') ?? 0);
    window.__years = seen;
    window.__yearTimer = setInterval(() => seen.add(el()), 15);
  });
  await page.click(tid('observer-run10'));
  await page.waitForFunction((r) => Number(document.querySelector('.topbar-date[data-round]')?.getAttribute('data-round') ?? 0) === r, from + 10, { timeout: 90000 });
  await page.waitForSelector(`${tid('observer-status')}:not([data-state="busy"])`);
  const years = await page.evaluate(() => { clearInterval(window.__yearTimer); return [...window.__years].sort((a, b) => a - b); });
  m = await api('match');
  assert(m.round === from + 10, 'run-ten stops after ten rounds');
  // Early rounds take a few milliseconds each, so the page cannot draw every one of them;
  // it must still have shown the match on its way rather than one jump at the end.
  assert(years.some((y) => y > from && y < from + 10), `the ten rounds arrived progressively (the page showed years ${years.join(', ')})`);
  note(`run ten: year ${from} -> ${from + 10}; on the way the page showed years ${years.join(', ')}`);
  await shot('12-observer-after-run');

  // a civilization's own perspective, and back
  const seat = 2;
  const name = m.seats[seat].name;
  // the civilization's chip in the header (or, failing that, the scoreboard's "View as")
  if (await page.$(tid(`civ-chip-${seat}`))) await page.click(tid(`civ-chip-${seat}`));
  else await page.click(tid(`view-as-${seat}`));
  await page.waitForSelector(tid('observing-badge'), { timeout: 15000 });
  assert((await page.textContent(tid('civ-name'))) === name, `the interface shows ${name}'s own view`);
  const own = await api('observation', seat);
  assert(own.seat === seat && own.regions.length <= 60, "the perspective is that seat's own observation");
  assert((await refused('actions', seat, [{ kind: 'forfeit' }]))?.status === 403, 'watching a civilization does not let the page command it');
  await shot('13-perspective');
  // its regional works can be looked at, but no control in them gives an order
  await page.click(tid('rail-works'));
  await page.waitForSelector(tid('overlay-works'));
  await page.click(tid('works-tab-build'));
  const orderButtons = await page.$$('[data-testid^="order-"], [data-testid^="choose-"], [data-testid^="queue-up-"], [data-testid^="expand-order-"]');
  for (const b of orderButtons) assert(await b.isDisabled(), 'every order control in the regional works view is disabled while watching');
  await page.click(tid('works-close'));
  note(`perspective: the regional works view opened read-only (${orderButtons.length} order controls, all disabled)`);
  await page.click(tid('observer-world'));
  await page.waitForSelector(tid('observer-console'));
  note(`perspective: viewed ${name} (seat ${seat + 1}) read-only, then returned to the world view`);
}

// =====================================================================================
async function partD() {
  if (process.env.PAGES_SKIP_BENCH) return;
  log('D: timings in the worker (four AIs, 60 regions, the standard calendar)');
  await openTitle();
  // the title screen keeps the interface idle, so the numbers are the worker's own
  const result = await page.evaluate(async () => {
    const api = window.__btsApi;
    const t0 = performance.now();
    await api.newMatch({ seed: 'pages-bench', regions: 60, calendar: 'standard', controllers: ['hard', 'medium', 'medium', 'easy'] });
    const created = performance.now() - t0;
    const stamps = [];
    let idle = null;
    const off = api.onSessionChange((c) => {
      if (c.cause !== 'playback') return;
      if (c.roundResolved) stamps.push(performance.now());
      if (!c.running && idle) idle();
    });
    // how long the interface thread is ever held up while the worker runs
    let worstGap = 0;
    let last = performance.now();
    const beat = setInterval(() => { const now = performance.now(); worstGap = Math.max(worstGap, now - last); last = now; }, 4);
    const perRound = [];
    for (let batch = 0; batch < 12; batch++) {
      const before = stamps.length;
      const start = performance.now();
      const done = new Promise((r) => { idle = r; });
      const s = await api.advance(20);
      if (s.finished) break;
      await done;
      let prev = start;
      for (const t of stamps.slice(before)) { perRound.push(t - prev); prev = t; }
      if ((await api.match()).finished) break;
    }
    clearInterval(beat);
    off();
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const t1 = performance.now();
    const spectator = JSON.stringify(await api.spectator()).length;
    const spectatorMs = performance.now() - t1;
    const t2 = performance.now();
    const save = (await api.exportSession()).length;
    const saveMs = performance.now() - t2;
    // the save file late in a match: how large, how long to make, to check and to load
    await window.__btsSaves.settled();
    const t3 = performance.now();
    const file = await api.exportSave({ kind: 'auto' });
    const fileMs = performance.now() - t3;
    const t4 = performance.now();
    const described = await api.describeSave(file);
    const describeMs = performance.now() - t4;
    const t5 = performance.now();
    await api.importSave(file);
    const importMs = performance.now() - t5;
    const m = await api.match();
    const vault = window.__btsSaves.state();
    return {
      file: file.length, fileMs, describeMs, importMs, loadable: described.loadable, matchId: m.match_id,
      autosave: { ...window.__btsSaves.stats(), last: vault.lastAutosave, sizes: vault.entries.filter((e) => e.kind === 'auto').map((e) => `round ${e.round}: ${e.bytes}`) },
      created, rounds: perRound.length, round: m.round, finished: m.finished,
      early: avg(perRound.slice(0, 20)), middle: avg(perRound.slice(110, 130)), late: avg(perRound.slice(-20)),
      slowest: Math.max(...perRound), total: perRound.reduce((x, y) => x + y, 0), worstGap,
      spectator, spectatorMs, save, saveMs, heap: performance.memory?.usedJSHeapSize ?? null,
    };
  });
  const worker = page.workers()[0];
  const memory = worker ? await worker.evaluate(() => self.__btsEngine.memoryBytes()) : null;
  assert(result.rounds >= 200, `the bench match ran (${result.rounds} rounds)`);
  note(`bench: new 60-region match ${result.created.toFixed(0)} ms; ${result.rounds} rounds in ${(result.total / 1000).toFixed(1)} s`);
  note(`bench: per round early (1-20) ${result.early.toFixed(1)} ms, middle ${result.middle.toFixed(1)} ms, late (last 20) ${result.late.toFixed(1)} ms, slowest ${result.slowest.toFixed(1)} ms`);
  note(`bench: interface thread never held longer than ${result.worstGap.toFixed(0)} ms while the worker played`);
  note(`bench: late spectator view ${(result.spectator / 1024).toFixed(0)} KB in ${result.spectatorMs.toFixed(0)} ms; session export ${(result.save / 1024).toFixed(0)} KB in ${result.saveMs.toFixed(0)} ms`);
  note(`bench: engine memory ${memory ? (memory / 1048576).toFixed(1) + ' MB' : 'n/a'}; page JS heap ${result.heap ? (result.heap / 1048576).toFixed(1) + ' MB' : 'n/a'}`);
  assert(result.worstGap < 1000, 'the interface thread stayed responsive while the worker ran a whole match');
  made.matches.add(result.matchId);
  assert(result.loadable && result.file * 4 < result.save, `the late-game save file is compressed (${result.file} of ${result.save} bytes)`);
  const auto = result.autosave;
  assert(auto.written >= 3 && auto.failed === 0 && auto.skipped === 0, `autosaves were written throughout playback (${JSON.stringify(auto)})`);
  assert(auto.written < result.rounds / 2, `fast playback did not autosave every round: ${auto.written} writes for ${result.rounds} rounds`);
  note(`bench: late-game save file ${result.file} bytes (${(result.file / 1024).toFixed(0)} KiB) for ${(result.save / 1024).toFixed(0)} KiB of session text, ${(result.save / result.file).toFixed(1)}:1; made in ${result.fileMs.toFixed(0)} ms, described (verified and rehearsed) in ${result.describeMs.toFixed(0)} ms, imported in ${result.importMs.toFixed(0)} ms`);
  note(`bench: autosave during playback: ${auto.written} written for ${result.rounds} rounds (${auto.coalesced} requests coalesced, ${auto.unchanged} unchanged); slowest export in the worker ${auto.maxExportMs.toFixed(0)} ms, slowest IndexedDB write ${auto.maxStoreMs.toFixed(0)} ms; kept at the end: ${auto.sizes.join(', ')} bytes`);
}

// =====================================================================================
async function partE(browser) {
  log('E: an engine that cannot start, or fails, is reported on the page');
  // 1. the module cannot be downloaded
  expectTrouble = true;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.route('**/*.wasm', (r) => r.abort());
  await p.goto(BASE);
  await p.waitForSelector(tid('engine-failure-note'), { timeout: 30000 });
  const message = await p.textContent('.splash-error');
  assert(/game engine/i.test(message ?? ''), `the page says the engine did not start ("${message}")`);
  await p.screenshot({ path: `${SHOTS}20-engine-missing.png` });
  await p.unroute('**/*.wasm');
  await p.click('.splash-card button');
  await p.waitForSelector(tid('title-screen'), { timeout: 30000 });
  note(`engine could not load -> the page shows "${(message ?? '').trim().slice(0, 90)}"; "Try again" recovered`);

  // 2. a save that parses but cannot be played (most of its regions are missing) is
  //    rehearsed away from the match: it is refused, and the match in progress goes on
  const probe = await p.evaluate(async () => {
    const api = window.__btsApi;
    await api.newMatch({ seed: 'pages-broken', regions: 24, controllers: ['human', 'easy', 'easy', 'easy'] });
    await api.ready(0, true);
    const save = JSON.parse(await api.exportSession());
    const world = JSON.parse(save.world);
    const list = Object.entries(world).find(([, v]) => Array.isArray(v) && v.length === 24);
    if (!list) return { tried: false };
    world[list[0]] = list[1].slice(0, 3);
    save.world = JSON.stringify(world);
    const refusal = await api.importSession(JSON.stringify(save)).then(() => null, (e) => ({ status: e.status, code: e.code, message: e.message }));
    const after = await api.ready(0, true);
    return { tried: true, refusal, round: after.round };
  });
  assert(probe.tried, 'the save lists its regions');
  assert(probe.refusal && probe.refusal.status === 400 && probe.refusal.code === 'INVALID_SAVE', `an unplayable save is refused (${JSON.stringify(probe.refusal)})`);
  assert(probe.round === 3, 'the match in progress survived the unplayable save and played on');
  note(`unplayable save -> refused: "${probe.refusal.message.replace(/\s+/g, ' ').slice(0, 130)}"; the match in progress played on`);
  const lost = await p.evaluate(async () => { await window.__btsSaves.settled(); return window.__btsApi.exportSession(); });

  // 3. the engine itself fails (a deliberate panic): the page says so, calls are refused
  //    rather than left hanging, and "Try again" starts a fresh engine
  await p.workers()[0].evaluate(() => self.__btsEngine.panic());
  await p.waitForSelector(tid('engine-failure-note'), { timeout: 10000 });
  const shown = ((await p.textContent('.splash-error')) ?? '').replace(/\s+/g, ' ').trim();
  await p.screenshot({ path: `${SHOTS}21-engine-failed.png` });
  assert(/panicked at .*deliberate failure/.test(shown), `the page shows why the engine stopped ("${shown}")`);
  const again = await p.evaluate(() => window.__btsApi.match().then(() => 'answered', (e) => e.code));
  assert(again === 'ENGINE_FAILURE', 'a failed engine refuses calls instead of hanging');
  await p.click('.splash-card button');
  // the fresh engine starts empty, and the page gives it the autosave: the match is not lost
  await p.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  const back = await p.evaluate(async () => ({ m: await window.__btsApi.match(), text: await window.__btsApi.exportSession() }));
  assert(back.m.exists && back.m.round === 3 && back.text === lost, 'after "Try again" a fresh engine holds the autosaved match, byte-identical');
  note(`engine panic -> the page shows "${shown.slice(0, 150)}"; calls are refused; "Try again" started a fresh engine and restored the autosave (round ${back.m.round}, byte-identical)`);
  await ctx.close();
  expectTrouble = false;
}

// =====================================================================================
const started = Date.now();
const browser = await chromium.launch({ headless: !process.env.PAGES_HEADED });
let failed = null;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  watch(page);
  log('site:', BASE);
  let obs = await partA();
  obs = await partW(obs);
  await partB(obs);
  await partS(obs);
  if (process.env.PAGES_ONLY !== 'S') {
    await partC();
    await partD();
  }
  await cleanUp();
  await context.close();
  if (process.env.PAGES_ONLY !== 'S') {
    await partE(browser);
    await partT(browser);
  }

  // the static host answers unknown paths with the site's own not-found page
  const missing = await fetch(BASE + 'no-such-page/at-all').catch(() => null);
  if (missing) {
    const body = await missing.text();
    note(`unknown path -> HTTP ${missing.status}${body.includes('Open the game') ? ' with the site 404 page' : ''}`);
  }
  const kinds = { wasm: requested.filter((u) => u.endsWith('.wasm')), worker: requested.filter((u) => /worker-[\w-]+\.js$/.test(u)) };
  assert(kinds.wasm.length > 0 && kinds.wasm.every((u) => u.startsWith(BASE + 'assets/')), 'the WebAssembly module was loaded from the site');
  assert(kinds.worker.length > 0 && kinds.worker.every((u) => u.startsWith(BASE + 'assets/')), 'the worker script was loaded from the site');
  note(`requests: ${requested.length}, all under ${BASE} (module ${kinds.wasm[0].replace(BASE, './')}, worker ${kinds.worker[0].replace(BASE, './')}); none to an API`);
  assert(problems.length === 0, 'no page errors, console errors or failed requests:\n  ' + problems.join('\n  '));
} catch (e) {
  failed = e;
  if (page && !page.isClosed()) await page.screenshot({ path: `${SHOTS}failure.png` }).catch(() => {});
} finally {
  await browser.close();
  rmSync(TMP, { recursive: true, force: true });
}
console.log('\n[pages] summary');
for (const n of notes) console.log('  - ' + n);
if (problems.length) {
  console.log('[pages] problems');
  for (const p of problems) console.log('  ! ' + p);
}
if (failed) {
  console.error(`\n[pages] FAILED after ${((Date.now() - started) / 1000).toFixed(0)} s: ${failed.message}`);
  process.exit(1);
}
console.log(`\n[pages] PASSED in ${((Date.now() - started) / 1000).toFixed(0)} s — screenshots in ${SHOTS}`);
