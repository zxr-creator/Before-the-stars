// Observer mode: behaviour checks and review screenshots against a running referee.
//
//   target/release/bts serve --port 7983 --fresh --web <built client> --saves <dir> &
//   BTS_URL=http://127.0.0.1:7983 node scripts/observer-review-shots.mjs
//
// Part A drives the interface the way a spectator would: main menu, the observer
// quick start, playback by mouse and keyboard (asserting that time really moves
// and really stops), the comparison panels and their client-side history, the
// perspective switch, and an attempt to give orders from a civilization's view
// (no order may leave the browser). Part B checks the fall-back when the referee
// refuses the spectator view. Part C starts a match with a human seat and checks
// that the referee refuses spectator requests and that the client never makes
// them. Screenshots go to screenshots/observer-review/ in English and Simplified
// Chinese at 1440x900 and 1280x720. Any page error fails the run.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7983';
const SHOTS = fileURLToPath(new URL('../screenshots/observer-review/', import.meta.url));
const ONLY = process.env.OBS_ONLY ?? '';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const log = (...a) => console.log('[observer-review]', ...a);
function check(cond, msg) {
  results.push({ ok: !!cond, msg });
  console.log(cond ? '  ok  ' : '  FAIL', msg);
}
async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { status: res.status, data };
}
const tid = (id) => `[data-testid="${id}"]`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await context.addInitScript(() => {
  try { localStorage.setItem('bts.tutorial.off', '1'); localStorage.setItem('bts.mapTier', 'flat'); } catch { /* ignore */ }
});
const page = await context.newPage();
const pageErrors = [];
const requests = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pageErrors.push('console: ' + m.text()); });
page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) requests.push({ method: r.method(), path: u.pathname }); });
const sent = (method, re, from = 0) => requests.slice(from).filter((r) => r.method === method && re.test(r.path));

const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: SHOTS + name + '.png' }); };
const setLang = async (lang) => { await page.evaluate((l) => window.__btsI18n?.setLocale(l), lang); await page.waitForTimeout(200); };
const round = async () => Number(await page.getAttribute(tid('observer-round'), 'data-round').catch(() => null) ?? (await api('GET', '/api/match')).data.round);
const serverRound = async () => (await api('GET', '/api/match')).data.round;
const mode = () => page.getAttribute(tid('observer-playback'), 'data-mode');
const waitMode = (m, timeout = 60000) => page.waitForFunction((want) => document.querySelector('[data-testid="observer-playback"]')?.getAttribute('data-mode') === want, m, { timeout });
const samples = async () => Number((await page.evaluate(() => JSON.parse(sessionStorage.getItem('bts.observer.history') ?? '{"samples":[]}').samples.length)));

// --- Part A: from the main menu to a running observer match -------------------------------------------------
async function partA() {
  log('Part A: quick start, playback, comparison, perspectives, read-only');
  await page.goto(BASE + '/?title');
  await page.waitForSelector(tid('title-screen'));
  check(await page.isVisible(tid('title-observer')), 'the main menu has an Observer mode entry');
  await shot('01-title-en-1440');
  await page.click(tid('title-observer'));
  await page.waitForSelector(tid('title-observer-pane'));
  check(await page.isVisible(tid('title-observer-start')), 'one click on the entry shows the quick start with a Start watching button');
  await shot('02-title-quickstart-en-1440');
  await setLang('zh-Hans'); await shot('02-title-quickstart-zh-1440');
  await page.setViewportSize({ width: 1280, height: 720 });
  await shot('02-title-quickstart-zh-1280'); await setLang('en'); await shot('02-title-quickstart-en-1280');
  await page.setViewportSize({ width: 1440, height: 900 });

  // Adjust difficulty and world size, then start: two clicks from the menu with the defaults.
  await page.click(tid('quick-level-mixed'));
  await page.click(tid('quick-regions-72'));
  await page.click(tid('quick-regions-48'));
  await page.click(tid('quick-short-false'));
  const before = requests.length;
  await page.click(tid('title-observer-start'));
  await page.waitForSelector(tid('observer-console'), { timeout: 60000 });
  await page.waitForSelector(tid('scoreboard'));
  const m = (await api('GET', '/api/match')).data;
  check(m.seats.every((s) => s.controller !== 'human') && m.observer_allowed === true, 'the quick start made an AI-only match (' + m.seats.map((s) => s.controller).join(', ') + ', ' + m.regions + ' regions)');
  check(sent('POST', /^\/api\/match$/, before).length === 1, 'exactly one POST /api/match was needed');
  check((await mode()) === 'paused', 'a new observer match starts paused, and says so');
  await shot('03-world-start-en-1440');

  // Step by keyboard.
  const r0 = await serverRound();
  await page.keyboard.press('.');
  await page.waitForFunction((want) => Number(document.querySelector('[data-testid="observer-round"]')?.getAttribute('data-round')) >= want, r0 + 1, { timeout: 30000 });
  await waitMode('paused');
  check((await serverRound()) === r0 + 1, `"." steps exactly one round (${r0} -> ${r0 + 1})`);

  // Play and pause by keyboard; measure how promptly pause takes hold.
  await page.keyboard.press(']'); await page.keyboard.press(']'); await page.keyboard.press(']');
  check((await page.getAttribute(tid('observer-speed-8'), 'aria-checked')) === 'true', '"]" raises the speed to 8x');
  await page.keyboard.press('Space');
  await waitMode('playing', 5000);
  check((await page.getAttribute(tid('observer-play'), 'aria-pressed')) === 'true', 'Space starts play; the dock says "Playing"');
  await page.waitForFunction((want) => Number(document.querySelector('[data-testid="observer-round"]')?.getAttribute('data-round')) >= want, r0 + 8, { timeout: 60000 });
  const rate = await page.textContent(tid('observer-rate'));
  check(/\d/.test(rate ?? ''), `rounds per second is shown while playing ("${(rate ?? '').trim()}")`);
  await page.screenshot({ path: SHOTS + '04-world-playing-en-1440.png' });
  const t0 = Date.now();
  await page.keyboard.press('Space');
  await waitMode('paused', 5000);
  const uiMs = Date.now() - t0;
  const rPause = await serverRound();
  await sleep(2500);
  const rAfter = await serverRound();
  check(uiMs < 500, `pause shows within ${uiMs} ms of pressing Space`);
  check(rAfter - rPause <= 1, `the referee stops after the round in hand (round ${rPause} when paused, ${rAfter} 2.5 s later)`);
  await page.waitForFunction((want) => Number(document.querySelector('[data-testid="observer-round"]')?.getAttribute('data-round')) === want, rAfter, { timeout: 8000 });

  // Run N rounds by mouse.
  await page.selectOption(tid('observer-run-n'), '20');
  const r1 = await serverRound();
  await page.click(tid('observer-run10'));
  await waitMode('running', 5000).catch(() => {});
  await shot('05-world-running-en-1440');
  await waitMode('paused', 120000);
  check((await serverRound()) === r1 + 20, `"Run 20" runs twenty rounds and pauses (${r1} -> ${await serverRound()})`);
  // A long run is chained past the referee's 20-round limit and can be stopped.
  await page.selectOption(tid('observer-run-n'), '50');
  const r2 = await serverRound();
  await page.keyboard.press('r');
  await waitMode('running', 5000).catch(() => {});
  await waitMode('paused', 240000);
  const r3 = await serverRound();
  check(r3 === r2 + 50 || (await api('GET', '/api/match')).data.finished, `R runs the chosen fifty rounds (${r2} -> ${r3})`);
  await page.selectOption(tid('observer-run-n'), '10');

  // Comparison panels.
  await page.click(tid('obs-tab-compare'));
  await page.waitForSelector(tid('compare-chart'));
  await page.waitForTimeout(1500);
  const n1 = await samples();
  const rNow = await serverRound();
  check(n1 === rNow, `the console has kept one history sample per round watched (${n1} samples at round ${rNow})`);
  check((await page.getAttribute(tid('compare-coverage'), 'data-partial')) === '0', 'watched from year 1: the coverage note says the record is complete');
  const box = await page.locator(`${tid('compare-chart')} svg.ch-svg`).boundingBox();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
  await page.waitForSelector('.ch-tip');
  check((await page.locator('.ch-tip-row').count()) === 4, 'hovering the chart reads out all four civilizations at that year');
  await shot('06-compare-trends-en-1440');
  await page.mouse.move(10, 10);
  for (const key of ['stability', 'objective', 'works']) {
    await page.click(tid('compare-metric-' + key));
    await page.waitForTimeout(120);
  }
  await page.click(tid('compare-table-toggle'));
  await page.waitForSelector(tid('compare-table'));
  await shot('07-compare-works-table-en-1440');
  await page.click(tid('compare-table-toggle'));
  await page.locator(`${tid('compare-chart')} svg.ch-svg`).focus();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  check(await page.isVisible('.ch-tip'), 'arrow keys on the focused chart step the read-out');
  await page.keyboard.press('Escape');
  await page.click(tid('compare-duel-tab'));
  await page.waitForSelector(tid('compare-duel'));
  await page.click(tid('duel-row-population') + ' button');
  check((await page.locator(`${tid('duel-chart')} .ch-legend li`).count()) === 2, 'head to head charts exactly the two chosen civilizations');
  await shot('08-compare-duel-en-1440');

  // Perspectives.
  check((await page.getAttribute(tid('perspective'), 'data-view')) === 'world', 'the perspective switch shows "World" as the current view');
  const seats = (await api('GET', '/api/match')).data.seats;
  await page.keyboard.press('2');
  await page.waitForSelector(tid('observing-badge'));
  check((await page.textContent(tid('civ-name'))) === seats[1].name, `"2" opens ${seats[1].name}'s own view`);
  check((await page.getAttribute(tid('perspective'), 'data-view')) === '1' && await page.isVisible(tid('perspective-readonly')), 'the switch marks whose view is shown, and that it is read-only');
  await page.waitForSelector(tid('observer-playback'));
  await shot('09-view-as-en-1440');

  // Read-only: try to give orders every way the interface offers.
  const from = requests.length;
  check(!(await page.$(tid('end-round'))) && !(await page.$(tid('next-phase'))), 'no end-round or next-phase control in a civilization’s view');
  let clicked = 0, disabledOrders = 0;
  for (const panel of ['economy', 'projects', 'people', 'knowledge', 'culture', 'politics', 'diplomacy', 'military', 'objectives']) {
    await page.click(tid('rail-' + panel));
    await page.waitForSelector(tid('panel-' + panel));
    disabledOrders += await page.locator(`${tid('panel-' + panel)} button.is-observing:disabled`).count();
    // Press everything that can still be pressed (tabs and expanders included), a few passes deep.
    for (let pass = 0; pass < 2; pass++) {
      const n = Math.min(60, await page.locator(`${tid('panel-' + panel)} .drawer-body button:enabled`).count());
      for (let i = 0; i < n; i++) {
        const b = page.locator(`${tid('panel-' + panel)} .drawer-body button:enabled`).nth(i);
        try { await b.click({ timeout: 400, noWaitAfter: true }); clicked++; } catch { /* covered or gone */ }
        if (await page.$('.map-pick')) await page.keyboard.press('Escape');
        if (!(await page.$(tid('panel-' + panel)))) { await page.click(tid('rail-' + panel)).catch(() => {}); await page.waitForSelector(tid('panel-' + panel), { timeout: 2000 }).catch(() => {}); }
      }
    }
    if (panel === 'projects') await shot('10-view-as-projects-readonly-en-1440');
    if (panel === 'diplomacy') await shot('11-view-as-diplomacy-readonly-en-1440');
  }
  // The ledger overlay and the region inspector as well.
  await page.keyboard.press('Escape');
  await page.keyboard.press('l');
  if (await page.waitForSelector(tid('overlay-ledger'), { timeout: 3000 }).catch(() => null)) {
    const n = Math.min(80, await page.locator(`${tid('overlay-ledger')} button:enabled`).count());
    for (let i = 0; i < n; i++) {
      try { await page.locator(`${tid('overlay-ledger')} button:enabled`).nth(i).click({ timeout: 300, noWaitAfter: true }); clicked++; } catch { /* gone */ }
      if (!(await page.$(tid('overlay-ledger')))) break;
    }
    await page.keyboard.press('Escape');
  }
  if (await page.$('.fs-overlay')) await page.keyboard.press('Escape');
  // A region of its own, opened in the inspector: facility switches and demolition.
  const capital = (await api('GET', `/api/observation?seat=${seats[1].seat}`)).data?.civ?.capital;
  const at = capital !== undefined ? await page.evaluate((id) => window.__atlas?.regionScreenCenter(id) ?? null, capital) : null;
  if (at) {
    await page.mouse.click(at[0], at[1]);
    if (await page.waitForSelector(tid('inspector'), { timeout: 3000 }).catch(() => null)) {
      const frozen = await page.locator(`${tid('inspector')} button:disabled`).count();
      const n = await page.locator(`${tid('inspector')} button:enabled`).count();
      for (let i = 0; i < n; i++) {
        try { await page.locator(`${tid('inspector')} button:enabled`).nth(i).click({ timeout: 300, noWaitAfter: true }); clicked++; } catch { /* gone */ }
        if (!(await page.$(tid('inspector')))) break;
      }
      disabledOrders += frozen;
      check(frozen > 0, `the region inspector's facility controls are disabled in the read-only view (${frozen})`);
    }
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(300);
  const orders = sent('POST', /^\/api\/(actions|ready|delegate)$/, from);
  check(clicked > 40, `pressed ${clicked} live controls across nine panels and the ledger in the read-only view (${disabledOrders} order buttons were disabled outright)`);
  check(orders.length === 0, `no order left the browser from the read-only view (POST actions/ready/delegate: ${orders.length})`);
  const direct = await api('POST', '/api/actions', { seat: seats[1].seat, token: '', actions: [] });
  const directReady = await api('POST', '/api/ready', { seat: seats[1].seat, token: '', through_round: true });
  check(direct.status >= 400 && directReady.status >= 400, `the referee itself refuses orders for an AI seat (actions ${direct.status}, ready ${directReady.status})`);

  // Time still moves from a civilization's view, the history keeps growing, and it survives the switch back.
  for (const p of ['economy', 'projects']) if (await page.$(tid('panel-' + p))) await page.keyboard.press('Escape');
  const nBefore = await samples();
  const rv = await serverRound();
  await page.keyboard.press('.');
  await page.waitForFunction((want) => document.querySelector('[data-testid="observer-year"]') && fetch('/api/match').then((r) => r.json()).then((mm) => mm.round >= want), rv + 1, { timeout: 30000 });
  await waitMode('paused');
  await page.keyboard.press('v');
  await page.waitForFunction(() => document.querySelector('[data-testid="perspective"]')?.getAttribute('data-view') === '2');
  check(true, 'V moves to the next civilization’s view');
  await page.click(tid('observer-world'));
  await page.waitForSelector(tid('observer-console'));
  await page.waitForSelector(tid('compare'));
  check(await page.isVisible(tid('compare-duel')), 'back in the world view the console is where it was left (Compare, head to head)');
  await page.waitForTimeout(1500);
  const nAfter = await samples();
  check(nAfter >= nBefore + 1, `history survived the perspective switch and grew while a civilization was being viewed (${nBefore} -> ${nAfter} samples)`);

  // Reload: the record is restored for this match.
  await page.goto(BASE + '/');
  await page.waitForSelector(tid('observer-console'));
  await page.click(tid('obs-tab-compare'));
  await page.waitForSelector(tid('compare-coverage'));
  await page.waitForTimeout(1500);
  check((await samples()) >= nAfter, 'a page reload keeps the record (session storage)');

  // A console that starts watching late says so.
  await page.evaluate(() => sessionStorage.removeItem('bts.observer.history'));
  await page.goto(BASE + '/');
  await page.waitForSelector(tid('observer-console'));
  await page.click(tid('obs-tab-compare'));
  await page.click(tid('compare-trends'));
  await page.waitForSelector(tid('compare-coverage'));
  check((await page.getAttribute(tid('compare-coverage'), 'data-partial')) === '1', 'without earlier samples the panel states that history only covers the rounds watched');
  await page.keyboard.press('.'); await waitMode('paused', 30000).catch(() => {});
  await page.waitForTimeout(600);
  await page.keyboard.press('.'); await page.waitForTimeout(400); await waitMode('paused', 30000).catch(() => {});
  await page.waitForTimeout(800);
  await shot('12-compare-partial-history-en-1440');
}

// --- Review set: the same six views in both languages and both sizes -----------------------------------------
async function reviewSet() {
  log('Review set: en and zh-Hans at 1440x900 and 1280x720');
  // Give the charts a full record again: a fresh short match watched from year 1.
  await page.goto(BASE + '/?title');
  await page.evaluate(() => sessionStorage.removeItem('bts.observer.history'));
  await api('POST', '/api/match', { seed: 'amber-reach-417', regions: 48, horizon: 960, pace_bp: 3300, controllers: ['hard', 'medium', 'medium', 'easy'], disclosed_objective: false });
  await page.goto(BASE + '/');
  await page.waitForSelector(tid('observer-console'));
  await page.click(tid('observer-speed-8'));
  await page.click(tid('observer-play'));
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="observer-round"]')?.getAttribute('data-round')) >= 62, null, { timeout: 600000 });
  await page.click(tid('observer-play'));
  await waitMode('paused', 10000);
  await page.waitForTimeout(1500);
  const seats = (await api('GET', '/api/match')).data.seats;
  for (const [w, h] of [[1440, 900], [1280, 720]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const lang of ['en', 'zh-Hans']) {
      const tag = `${lang === 'en' ? 'en' : 'zh'}-${w}`;
      await setLang(lang);
      await page.click(tid('obs-tab-score'));
      await shot(`20-world-scoreboard-${tag}`);
      await page.click(tid('obs-tab-compare'));
      await page.click(tid('compare-trends'));
      await page.click(tid('compare-metric-population'));
      const box = await page.locator(`${tid('compare-chart')} svg.ch-svg`).boundingBox();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
      await page.waitForSelector('.ch-tip');
      await shot(`21-compare-trends-${tag}`);
      await page.mouse.move(8, 8);
      await page.click(tid('compare-metric-objective'));
      await shot(`22-compare-objective-${tag}`);
      await page.click(tid('compare-duel-tab'));
      await page.click(tid('duel-row-techs') + ' button');
      await shot(`23-compare-duel-${tag}`);
      await page.hover(tid('observer-shortcuts'));
      await shot(`24-playback-shortcuts-${tag}`);
      await page.mouse.move(8, 8);
      await page.click(tid('observer-seat-' + seats[0].seat));
      await page.waitForSelector(tid('observing-badge'));
      await page.mouse.move(w * 0.6, h * 0.55);
      await page.waitForTimeout(500);
      await shot(`25-view-as-${tag}`);
      await page.click(tid('observer-world'));
      await page.waitForSelector(tid('observer-console'));
    }
  }
  // Setup screen with the observer preset, and the finished state.
  await page.setViewportSize({ width: 1440, height: 900 });
  await setLang('en');
  await page.goto(BASE + '/?title');
  await page.click(tid('title-observer'));
  await page.click(tid('title-observer-custom'));
  await page.waitForSelector(tid('setup-screen'));
  check(await page.isVisible(tid('setup-observer-note')) && (await page.getAttribute(tid('setup-mode-observe'), 'aria-checked')) === 'true', 'Custom observer match opens the full setup with every seat an AI');
  await shot('26-setup-observer-en-1440');
  await setLang('zh-Hans'); await shot('26-setup-observer-zh-1440'); await setLang('en');
  await page.goto(BASE + '/');
  await page.waitForSelector(tid('observer-console'));
  await page.click(tid('observer-speed-8'));
  await page.click(tid('observer-play'));
  await page.waitForSelector(tid('result-screen'), { timeout: 600000 });
  check((await page.getAttribute(tid('observer-status'), 'data-state')) === 'done' && (await mode()) === 'finished', 'at the horizon playback stops by itself and the dock says "Finished"');
  check(await page.isDisabled(tid('observer-step')) && await page.isDisabled(tid('observer-play')), 'playback controls are disabled once the match has finished');
  await page.click(tid('result-keep-looking'));
  await page.click(tid('obs-tab-compare'));
  await page.click(tid('compare-trends'));
  await page.click(tid('compare-metric-population'));
  await shot('27-finished-compare-en-1440');
  await setLang('zh-Hans'); await shot('27-finished-compare-zh-1440'); await setLang('en');
}

// --- Part B: the referee refuses the spectator view ----------------------------------------------------------
async function partB() {
  log('Part B: quiet fall-back when the spectator view is refused');
  await api('POST', '/api/match', { seed: 'still-ford-220', regions: 24, horizon: 960, pace_bp: 3300, controllers: ['medium', 'medium', 'medium', 'medium'] });
  await page.route('**/api/spectator', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'FORBIDDEN', message: 'Spectating is not allowed for this match.' }) }));
  const errorsBefore = pageErrors.length;
  await page.goto(BASE + '/');
  await page.waitForSelector(tid('observing-badge'), { timeout: 20000 });
  check(!(await page.$(tid('observer-console'))) && !(await page.$(tid('observer-world'))), 'refused with 403: no world view is shown or offered; one seat is watched read-only');
  check(!(await page.$('.splash-error')) && !(await page.$(tid('toast-bad'))), 'the fall-back is quiet: no error screen, no error toast');
  const from = requests.length;
  await page.waitForTimeout(3500);
  check(sent('GET', /^\/api\/spectator$/, from).length === 0, 'after the refusal the client stops asking for the spectator view');
  await shot('30-spectator-refused-fallback-en-1440');
  pageErrors.length = errorsBefore;
  await page.unroute('**/api/spectator');
}

// --- Part C: a match with a human seat --------------------------------------------------------------------------
async function partC() {
  log('Part C: no spectator data in a match with a human seat');
  await api('POST', '/api/match', { seed: 'north-vale-305', regions: 24, horizon: 960, pace_bp: 3300, controllers: ['human', 'medium', 'medium', 'medium'] });
  const sp = await api('GET', '/api/spectator');
  const adv = await api('POST', '/api/advance', { rounds: 1 });
  const logs = await api('GET', '/api/agent-log?seat=1');
  const other = await api('GET', '/api/observation?seat=1&token=');
  check(sp.status === 403, `referee: GET /api/spectator answers ${sp.status} in a match with a human seat`);
  check(adv.status === 403, `referee: POST /api/advance answers ${adv.status}`);
  check(other.status >= 400, `referee: GET /api/observation for an AI seat answers ${other.status} (agent log: ${logs.status})`);
  const from = requests.length;
  await page.evaluate(() => sessionStorage.removeItem('bts.observer.history'));
  await page.goto(BASE + '/');
  await page.waitForSelector(tid('end-round'), { timeout: 20000 });
  await page.waitForTimeout(4500);
  // Every observer shortcut is inert for a seated player.
  const name = await page.textContent(tid('civ-name'));
  for (const k of ['v', 'Shift+V', '.', 'r', ']']) await page.keyboard.press(k);
  await page.locator(tid('map-canvas')).click({ position: { x: 700, y: 300 } }).catch(() => {});
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  const bad = sent('GET', /^\/api\/(spectator|agent-log)$/, from).length + sent('POST', /^\/api\/advance$/, from).length;
  const seatsAsked = [...new Set(requests.slice(from).filter((r) => r.path === '/api/observation').map((r) => r.method))];
  const obsUrls = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/api/observation')).map((n) => new URL(n).searchParams.get('seat')));
  check(bad === 0, `client: no request to /api/spectator, /api/advance or /api/agent-log in a human match (${bad})`);
  check(obsUrls.length > 0 && obsUrls.every((s) => s === '0') && seatsAsked.length <= 1, `client: only the player's own seat was ever observed (seats asked: ${[...new Set(obsUrls)].join(', ')})`);
  check(!(await page.$(tid('perspective'))) && !(await page.$(tid('observer-playback'))) && !(await page.$(tid('observing-badge'))) && !(await page.$(tid('observer-console'))),
    'client: no perspective switch, playback dock or observer console for a seated player');
  check((await page.textContent(tid('civ-name'))) === name, 'client: observer shortcuts (V, ., R, Space) do nothing for a seated player');
  check((await page.evaluate(() => sessionStorage.getItem('bts.observer.history'))) === null, 'client: no comparison history is recorded in a human match');
  await shot('31-human-match-no-observer-en-1440');
}

try {
  if (!ONLY || ONLY.includes('A')) await partA();
  if (!ONLY || ONLY.includes('R')) await reviewSet();
  if (!ONLY || ONLY.includes('B')) await partB();
  if (!ONLY || ONLY.includes('C')) await partC();
} catch (e) {
  results.push({ ok: false, msg: 'script error: ' + (e && e.stack ? e.stack : e) });
  console.log('  FAIL script error:', e);
  await page.screenshot({ path: SHOTS + 'zz-failure.png' }).catch(() => {});
}
await browser.close();
if (pageErrors.length) { console.log('Page errors:'); for (const e of pageErrors) console.log('  ' + e); }
const failed = results.filter((r) => !r.ok).length + (pageErrors.length ? 1 : 0);
console.log(`\n${results.length} checks, ${results.filter((r) => !r.ok).length} failed, ${pageErrors.length} page errors`);
process.exit(failed ? 1 : 0);
