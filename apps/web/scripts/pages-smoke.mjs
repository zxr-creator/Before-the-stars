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
// B. Saves: a named save, the session text out and back in, and a refused import that
//    leaves the match alone.
// C. An AI-only match is watched: step one round, play continuously, pause, run ten
//    rounds (which must not arrive as one jump), look through one civilization's eyes.
// D. Timings in the worker for four AIs on 48 regions, early and late in a match, how
//    long the interface thread was ever held up meanwhile, and the engine's memory.
// E. An engine that cannot start, or that fails, is reported on the page; a save that
//    cannot be played is refused without harming the match in progress.
// Throughout: no page error, no console error, no failed or refused request, and no
// request that leaves the site's own path (so nothing depends on a server or on "/").
//
// Environment: PAGES_URL (instead of the argument), PAGES_SHOTS (screenshot directory),
// PAGES_SKIP_BENCH=1 (skip D), PAGES_HEADED=1.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] ?? process.env.PAGES_URL ?? 'http://127.0.0.1:8080/Before-the-stars/').replace(/\/?$/, '/');
const SHOTS = process.env.PAGES_SHOTS ? process.env.PAGES_SHOTS.replace(/\/?$/, '/') : fileURLToPath(new URL('../screenshots/pages/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

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
  page.on('requestfailed', (r) => { if (!expectTrouble) problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`); });
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
const yearShown = async () => Number(((await page.textContent(tid('year'))) ?? '').replace(/\D+/g, ''));

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
async function openTitle() {
  await page.goto(BASE);
  await page.waitForSelector(tid('title-screen'), { timeout: 30000 });
}

// =====================================================================================
async function partA() {
  log('A: a person plays, with no server');
  await openTitle();
  assert(await page.evaluate(() => window.__btsApi.mode === 'local' && window.__btsApi.features.local), 'the page runs its own referee');
  assert((await api('match')).exists === false, 'a fresh page has no match');
  await shot('01-title');
  await page.click(tid('title-new'));
  await page.waitForSelector(tid('setup-screen'));
  assert(await page.isVisible(tid('setup-local-note')), 'setup explains what the browser build leaves out');
  assert((await page.$(tid('setup-seat-1-agent'))) === null, 'LLM agent seats are not offered without a server');
  assert((await page.$(tid('setup-seat-1-hard'))) !== null, 'built-in opponents are offered');
  await page.fill(tid('setup-seed'), 'pages-smoke');
  await page.click(tid('setup-regions-24'));
  await shot('02-setup');
  await page.click(tid('setup-start'));
  await page.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  await page.waitForTimeout(500);

  let obs = await api('observation', 0);
  const summary = await api('match');
  assert(obs.round === 1 && obs.phase === 'contact', 'a fresh match starts in round 1, contact phase');
  assert(summary.observer_allowed === false && summary.seats[0].controller === 'human', 'seat 1 is the person');
  assert((await page.textContent(tid('civ-name'))) === obs.civ.name, 'the top bar shows the civilization');
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
    await page.waitForFunction((y) => Number((document.querySelector('[data-testid="year"]')?.textContent ?? '').replace(/\D+/g, '')) > y, year, { timeout: 30000 });
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
  await page.waitForFunction((y) => Number((document.querySelector('[data-testid="year"]')?.textContent ?? '').replace(/\D+/g, '')) > y, round, { timeout: 30000 });
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
async function partC() {
  log('C: an AI-only match is watched');
  await openTitle();
  await page.click(tid('title-observer'));
  // the menu entry opens a quick start; the full setup is one link further
  await page.waitForSelector(tid('title-observer-start'));
  await page.click(tid('title-observer-custom'));
  await page.waitForSelector(tid('setup-screen'));
  await page.fill(tid('setup-seed'), 'pages-watch');
  await page.click(tid('setup-regions-48'));
  assert(await page.isVisible(tid('setup-observer-note')), 'setup says this is an observer match');
  await page.click(tid('setup-start'));
  await page.waitForSelector(tid('observer-console'), { timeout: 30000 });
  await page.waitForSelector(tid('observer-playback'));
  let m = await api('match');
  assert(m.observer_allowed && m.seats.every((s) => s.controller.startsWith('native')), 'four built-in AIs, nobody playing');
  assert(m.round === 1 && (await yearShown()) === 1, 'nothing moves until asked');
  const world = await api('spectator');
  assert(world.civs.length === 4 && world.regions.length === 48, 'the whole world is visible to the observer');
  await shot('10-observer-start');

  // step one round
  await page.click(tid('observer-step'));
  await page.waitForFunction(() => Number((document.querySelector('[data-testid="year"]')?.textContent ?? '').replace(/\D+/g, '')) === 2, null, { timeout: 30000 });
  await page.waitForSelector(`${tid('observer-status')}:not([data-state="busy"])`);
  await page.waitForTimeout(700);
  m = await api('match');
  assert(m.round === 2 && (await yearShown()) === 2, 'one step is exactly one round');
  note('step: year 1 -> 2');

  // run continuously, then pause
  await page.click(tid('observer-speed-4'));
  await page.click(tid('observer-play'));
  await page.waitForFunction(() => Number((document.querySelector('[data-testid="year"]')?.textContent ?? '').replace(/\D+/g, '')) >= 5, null, { timeout: 60000 });
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
  await page.waitForFunction((r) => Number((document.querySelector('[data-testid="year"]')?.textContent ?? '').replace(/\D+/g, '')) === r, settled, { timeout: 10000 });
  assert((await page.getAttribute(tid('observer-play'), 'aria-pressed')) === 'false', 'the play control shows it is paused');
  note(`continuous play reached year ${settled}; pause held it there (pressed at round ${atPause}, checked ${((Date.now() - pausedAt) / 1000).toFixed(1)} s later)`);

  // fast-forward ten rounds: they must arrive one by one, not as a single jump
  const from = settled;
  await page.evaluate(() => {
    const seen = new Set();
    const el = () => Number((document.querySelector('[data-testid="year"]')?.textContent ?? '').replace(/\D+/g, ''));
    window.__years = seen;
    window.__yearTimer = setInterval(() => seen.add(el()), 15);
  });
  await page.click(tid('observer-run10'));
  await page.waitForFunction((r) => Number((document.querySelector('[data-testid="year"]')?.textContent ?? '').replace(/\D+/g, '')) === r, from + 10, { timeout: 90000 });
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
  assert(own.seat === seat && own.regions.length <= 48, "the perspective is that seat's own observation");
  assert((await refused('actions', seat, [{ kind: 'forfeit' }]))?.status === 403, 'watching a civilization does not let the page command it');
  await shot('13-perspective');
  await page.click(tid('observer-world'));
  await page.waitForSelector(tid('observer-console'));
  note(`perspective: viewed ${name} (seat ${seat + 1}) read-only, then returned to the world view`);
}

// =====================================================================================
async function partD() {
  if (process.env.PAGES_SKIP_BENCH) return;
  log('D: timings in the worker (four AIs, 48 regions, standard length)');
  await openTitle();
  // the title screen keeps the interface idle, so the numbers are the worker's own
  const result = await page.evaluate(async () => {
    const api = window.__btsApi;
    const t0 = performance.now();
    await api.newMatch({ seed: 'pages-bench', regions: 48, controllers: ['hard', 'medium', 'medium', 'easy'] });
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
    const m = await api.match();
    return {
      created, rounds: perRound.length, round: m.round, finished: m.finished,
      early: avg(perRound.slice(0, 20)), middle: avg(perRound.slice(110, 130)), late: avg(perRound.slice(-20)),
      slowest: Math.max(...perRound), total: perRound.reduce((x, y) => x + y, 0), worstGap,
      spectator, spectatorMs, save, saveMs, heap: performance.memory?.usedJSHeapSize ?? null,
    };
  });
  const worker = page.workers()[0];
  const memory = worker ? await worker.evaluate(() => self.__btsEngine.memoryBytes()) : null;
  assert(result.rounds >= 200, `the bench match ran (${result.rounds} rounds)`);
  note(`bench: new 48-region match ${result.created.toFixed(0)} ms; ${result.rounds} rounds in ${(result.total / 1000).toFixed(1)} s`);
  note(`bench: per round early (1-20) ${result.early.toFixed(1)} ms, middle ${result.middle.toFixed(1)} ms, late (last 20) ${result.late.toFixed(1)} ms, slowest ${result.slowest.toFixed(1)} ms`);
  note(`bench: interface thread never held longer than ${result.worstGap.toFixed(0)} ms while the worker played`);
  note(`bench: late spectator view ${(result.spectator / 1024).toFixed(0)} KB in ${result.spectatorMs.toFixed(0)} ms; session export ${(result.save / 1024).toFixed(0)} KB in ${result.saveMs.toFixed(0)} ms`);
  note(`bench: engine memory ${memory ? (memory / 1048576).toFixed(1) + ' MB' : 'n/a'}; page JS heap ${result.heap ? (result.heap / 1048576).toFixed(1) + ' MB' : 'n/a'}`);
  assert(result.worstGap < 1000, 'the interface thread stayed responsive while the worker ran a whole match');
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
  await p.waitForSelector(tid('title-screen'), { timeout: 30000 });
  assert((await p.evaluate(() => window.__btsApi.match())).exists === false, 'after "Try again" a fresh engine answers');
  note(`engine panic -> the page shows "${shown.slice(0, 150)}"; calls are refused; "Try again" started a fresh engine`);
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
  const obs = await partA();
  await partB(obs);
  await partC();
  await partD();
  await context.close();
  await partE(browser);

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
