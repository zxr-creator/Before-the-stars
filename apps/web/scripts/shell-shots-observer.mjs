// Observer console: end-to-end checks and screenshots against a running referee.
//
//   source scripts/env.sh
//   target/release/bts serve --port 7985 --web apps/web/dist --saves .toolchain/shell-saves-observer --fresh &
//   (cd apps/web && node scripts/shell-shots-observer.mjs)
//
// Creates its own observer matches (two seats played by the referee's test-only
// "mock" agent, then an all-built-in short match), drives the console through the
// interface, asserts that time really moves and stops, and writes
// screenshots/shell/observer-*.png. Any page error or console error fails the run.
// Two agent states cannot be produced on demand by the mock provider ("thinking"
// and a failed agent); those screenshots inject them into GET /api/match.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7985';
const SHOTS = fileURLToPath(new URL('../screenshots/shell/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const errors = [];
const log = (...a) => console.log('[observer]', ...a);
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
  log('ok:', msg);
}
async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const tid = (id) => `[data-testid="${id}"]`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// Reduced motion keeps screenshots deterministic: under software WebGL the 3D map can starve
// CSS transitions for long enough that a capture lands mid-fade.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await context.addInitScript(() => {
  try { localStorage.setItem('bts.tutorial.off', '1'); localStorage.removeItem('bts.locale'); } catch { /* ignore */ }
});
const page = await context.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

async function shot(name) {
  await page.waitForTimeout(260);
  await page.screenshot({ path: `${SHOTS}observer-${name}.png` });
}
const uiRound = () => page.evaluate(() => Number(document.querySelector('[data-testid="observer-round"]')?.getAttribute('data-round')));
const waitRound = (n, timeout = 30000) => page.waitForFunction((want) => Number(document.querySelector('[data-testid="observer-round"]')?.getAttribute('data-round')) >= want, n, { timeout });
const waitIdle = () => page.waitForFunction(() => ['idle', 'done'].includes(document.querySelector('[data-testid="observer-status"]')?.getAttribute('data-state')), null, { timeout: 30000 });
async function open() {
  await page.goto(BASE + '/?notutorial&notitle');
  await page.waitForSelector(tid('observer-console'));
  await page.waitForSelector(tid('map-canvas'));
  await page.waitForSelector(tid('scoreboard'));
  await page.waitForTimeout(700);
}
async function setLocale(l) {
  await page.evaluate((x) => window.__btsI18n.setLocale(x), l);
  await page.waitForTimeout(350);
}

try {
  // ============================== A: two mock-agent seats ==============================
  log('A: observer match with two mock agent seats');
  let m = await api('POST', '/api/match', { seed: 'obs-shots', regions: 24, controllers: ['mock', 'medium', 'mock', 'easy'], agent_options: { 0: { consult_every: 2 } } });
  assert(m.observer_allowed === true, 'the referee marks the match as an observer match');
  await open();
  assert((await uiRound()) === 1, 'console opens on round 1');
  assert(await page.locator(tid('agent-state')).count() >= 2, 'agent seats show a state chip on the scoreboard');
  assert(!(await page.$(tid('end-round'))), 'no end-round control for an observer');
  await shot('01-console-round1');

  // Step one round through the interface.
  await page.click(tid('observer-step'));
  await waitRound(2);
  await waitIdle();
  assert((await uiRound()) === 2, 'Step advanced exactly one round');
  assert((await api('GET', '/api/match')).round === 2, 'the referee agrees: round 2');
  await shot('02-after-step');

  // Play at 4×, then pause: rounds advance, then stop.
  await page.click(tid('observer-speed-4'));
  await page.click(tid('observer-play'));
  assert((await page.getAttribute(tid('observer-play'), 'aria-pressed')) === 'true', 'play is latched');
  await waitRound(6);
  await shot('03-playing-4x');
  await page.click(tid('observer-play'));
  await waitIdle();
  await page.waitForTimeout(1500);
  const r1 = await uiRound();
  await page.waitForTimeout(2500);
  const r2 = await uiRound();
  const mm = await api('GET', '/api/match');
  assert(r1 >= 6 && r2 === r1, `pause holds the match (round ${r1} then ${r2})`);
  assert(mm.round === r2 && (mm.autoplay_until ?? 0) <= mm.round, 'the referee is not running anything after pause');
  await page.click(tid('observer-speed-1'));
  await shot('04-paused');

  // Run ten rounds.
  await page.click(tid('observer-run10'));
  await page.waitForFunction(() => ['busy', 'thinking'].includes(document.querySelector('[data-testid="observer-status"]')?.getAttribute('data-state')), null, { timeout: 5000 }).catch(() => {});
  await shot('05-running-ten');
  await waitRound(r2 + 10, 60000);
  await waitIdle();
  await page.waitForTimeout(1200);
  assert((await uiRound()) === r2 + 10, `Run 10 stopped exactly ten rounds later (round ${r2 + 10})`);
  for (const b of await page.$$(tid('banner-dismiss'))) await b.click().catch(() => {});
  await shot('06-scoreboard');

  // World events: feed, filters, click-to-map.
  await page.click(tid('obs-tab-events'));
  await page.waitForSelector(tid('events'));
  const total = await page.locator(tid('event-item')).count();
  assert(total > 0, `the feed lists world events (${total} shown)`);
  await shot('07-events');
  await page.click(tid('events-civ-1'));
  const seatsShown = await page.$$eval(tid('event-item'), (els) => [...new Set(els.map((e) => e.getAttribute('data-seat')))]);
  assert(seatsShown.length === 1 && seatsShown[0] === '1', 'the civilization filter shows one civilization only');
  const cat = await page.locator('[data-testid^="events-cat-"]').first().getAttribute('data-testid');
  await page.click(tid(cat));
  const catsShown = await page.$$eval(tid('event-item'), (els) => [...new Set(els.map((e) => e.getAttribute('data-category')))]);
  assert(catsShown.length <= 1, 'the category filter shows one category only');
  await shot('08-events-filtered');
  await page.click(tid(cat));
  await page.click(tid('events-civ-all'));
  const withRegion = page.locator(`${tid('event-item')}:has(.ev-pin)`).first();
  if (await withRegion.count()) {
    await withRegion.click();
    await page.waitForSelector(tid('observer-region'));
    await page.waitForTimeout(500);
    await shot('09-event-on-map-region-card');
    await page.click('.rc-close');
  }

  // Agents: the mock agents' real log.
  await page.click(tid('obs-tab-agents'));
  await page.waitForSelector(tid('agent-log-entry'));
  const logged = await page.locator(tid('agent-log-entry')).count();
  const real = await api('GET', '/api/agent-log?seat=0');
  assert(logged > 0 && real.entries.length > 0, `agent panel shows the log (${logged} entries on screen, ${real.entries.length} for seat 1 on the referee)`);
  assert(await page.locator('.log-error').count() > 0, 'a log entry with an error shows the error text');
  await shot('10-agents-log');

  // Injected states: one agent thinking, one failed (the mock provider answers instantly and never fails outright).
  const inject = (states) => page.route('**/api/match', async (route) => {
    try {
      if (route.request().method() !== 'GET') return await route.continue();
      const res = await route.fetch();
      const body = await res.json();
      for (const s of body.seats ?? []) if (s.agent && states[s.seat]) Object.assign(s.agent, states[s.seat]);
      await route.fulfill({ response: res, json: body });
    } catch { /* the route was removed while this request was in flight */ }
  });
  const stopInjecting = () => page.unrouteAll({ behavior: 'ignoreErrors' });
  await inject({
    0: { state: 'thinking', thinking_seconds: 41, provider: 'claude-code', model: '' },
    2: { state: 'error', provider: 'codex', model: 'gpt-5.1-codex', last_error: 'codex exited with status 1: not logged in. Run `codex login` on this machine, then the seat is tried again next round.' },
  });
  await page.waitForSelector(`${tid('agent-state')}[data-state="thinking"]`, { timeout: 8000 });
  await page.waitForSelector(tid('agent-error'));
  await page.waitForTimeout(1100);
  assert((await page.getAttribute(tid('observer-status'), 'data-state')) === 'thinking', 'the status line says who is being waited for');
  await shot('11-agents-thinking-and-error-MOCKED');
  await page.click(tid('obs-tab-score'));
  await page.waitForSelector(tid('scoreboard-errors'));
  await shot('12-scoreboard-thinking-and-error-MOCKED');
  await stopInjecting();
  await inject({ 2: { state: 'stopped', provider: 'claude-api', model: 'claude-opus-5-5', last_error: 'Anthropic API: 401 authentication_error (invalid x-api-key). The agent was stopped after three failures.' } });
  await page.waitForSelector(`${tid('agent-state')}[data-state="stopped"]`, { timeout: 8000 });
  await shot('13-scoreboard-agent-stopped-MOCKED');
  await stopInjecting();
  await page.waitForSelector(`${tid('agent-state')}[data-state="stopped"]`, { state: 'detached', timeout: 8000 });

  // View as a civilization: the seat's own interface, read-only.
  const seat1 = (await api('GET', '/api/match')).seats[1];
  await page.click(tid('view-as-1'));
  await page.waitForSelector(tid('observing-badge'));
  await page.waitForSelector(tid('map-canvas'));
  assert((await page.textContent(tid('civ-name'))) === seat1.name, 'view-as shows that civilization’s own interface');
  await page.click(tid('rail-economy'));
  await page.waitForSelector(tid('panel-economy'));
  const frozen = await page.locator('[data-testid="panel-economy"] [title="You are observing"]').count();
  assert(frozen > 0, `order controls in the panel are disabled with the reason "You are observing" (${frozen} found)`);
  assert(await page.locator('[data-testid="panel-economy"] .stepper-btn:not([disabled])').count() === 0, 'no stepper in the economy panel can be pressed');
  const before = JSON.stringify((await api('GET', '/api/observation?seat=1')).civ.policies);
  await page.click(tid('rail-projects'));
  await page.waitForSelector(tid('panel-projects'));
  await shot('14-view-as-readonly-projects');
  await page.click(tid('rail-economy'));
  await shot('15-view-as-readonly-economy');
  assert(JSON.stringify((await api('GET', '/api/observation?seat=1')).civ.policies) === before, 'nothing about the observed seat changed');
  await page.click(tid('observer-world'));
  await page.waitForSelector(tid('observer-console'));
  assert(!(await page.$(tid('observing-badge'))), 'World view returns to the console');

  // Simplified Chinese.
  await setLocale('zh-Hans');
  await shot('16-zh-scoreboard');
  await page.click(tid('obs-tab-events'));
  await shot('17-zh-events');
  await page.click(tid('obs-tab-agents'));
  await page.waitForSelector(tid('agent-log-entry'));
  await shot('18-zh-agents');
  await page.click(tid('obs-tab-score'));
  const missing = await page.evaluate(() => window.__btsI18n.missing());
  log(`strings with no zh-Hans translation seen so far: ${missing.length}`);
  for (const s of missing.slice(0, 60)) log('   missing:', JSON.stringify(s.length > 110 ? s.slice(0, 110) + '…' : s));
  await setLocale('zh-Hant');
  await shot('19-zh-hant-scoreboard');
  await setLocale('en');

  // 1280×720.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(400);
  await shot('20-1280x720-scoreboard');
  await page.click(tid('obs-tab-events'));
  await shot('21-1280x720-events');
  await page.click(tid('obs-tab-score'));
  const fits = await page.evaluate(() => {
    const pb = document.querySelector('[data-testid="observer-playback"]').getBoundingClientRect();
    const side = document.querySelector('[data-testid="observer-side"]').getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1 || document.querySelector('.topbar').scrollWidth > window.innerWidth + 1,
      playbackVisible: pb.left >= side.right - 1 && pb.right <= window.innerWidth && pb.bottom <= window.innerHeight,
    };
  });
  assert(!fits.overflow, 'no horizontal overflow at 1280×720');
  assert(fits.playbackVisible, 'the playback controls are fully visible beside the docked panel at 1280×720');
  await setLocale('zh-Hans');
  await shot('22-1280x720-zh');
  await setLocale('en');
  await page.setViewportSize({ width: 1440, height: 900 });

  // ============================== B: built-in seats, short horizon ==============================
  log('B: all built-in seats, ten-round horizon, to the result screen');
  m = await api('POST', '/api/match', { seed: 'obs-short', regions: 24, horizon: 120, pace_bp: 3300, controllers: ['hard', 'medium', 'medium', 'easy'] });
  await open();
  await page.click(tid('obs-tab-agents'));
  await page.waitForSelector(tid('agents-empty'));
  await shot('23-agents-empty-built-in');
  await page.click(tid('obs-tab-score'));
  await page.click(tid('observer-run10'));
  await page.waitForSelector(tid('result-screen'), { timeout: 60000 });
  const end = await api('GET', '/api/spectator');
  assert(end.outcome && (await page.textContent(tid('result-screen'))).includes(end.outcome.reason), 'the result screen states the outcome reason');
  await page.waitForTimeout(500);
  await shot('24-result');
  await setLocale('zh-Hans');
  await shot('25-zh-result');
  await setLocale('en');
  await page.click(tid('result-keep-looking'));
  await page.waitForSelector(tid('result-screen'), { state: 'detached' });
  assert((await page.getAttribute(tid('observer-status'), 'data-state')) === 'done', 'the status line says the match is finished');
  assert(await page.isDisabled(tid('observer-step')) && await page.isDisabled(tid('observer-play')), 'playback is disabled once the match has finished');
  for (const b of await page.$$(tid('banner-dismiss'))) await b.click().catch(() => {});
  await shot('26-finished-console');

  // ============================== C: a long built-in match, mid/late game ==============================
  log('C: four built-in seats advanced to round 61 through the API, for late-game content');
  await api('POST', '/api/match', { seed: 'obs-late', regions: 24, horizon: 960, pace_bp: 3300, controllers: ['hard', 'hard', 'medium', 'medium'] });
  for (let target = 21; target <= 61; target += 20) {
    await api('POST', '/api/advance', { rounds: 20 });
    for (let i = 0; i < 1200; i++) {
      const cur = await api('GET', '/api/match');
      if (cur.round >= target || cur.finished) break;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  assert((await api('GET', '/api/match')).round === 61, 'the referee ran sixty rounds on its own');
  await open();
  assert((await uiRound()) === 61, 'the console opens on the running match at round 61');
  await shot('27-late-scoreboard');
  // Stop: a run of ten is cut short (or, if the referee was faster than the click, simply completes).
  await page.click(tid('observer-run10'));
  await page.click(tid('observer-stop'), { timeout: 3000 }).catch(() => {});
  await waitIdle();
  await page.waitForTimeout(1500);
  const stopped = await uiRound();
  const after = await api('GET', '/api/match');
  assert(stopped >= 61 && stopped <= 71 && after.round === stopped && (after.autoplay_until ?? 0) <= after.round, `Stop left the match at rest on round ${stopped}`);
  for (const b of await page.$$(tid('banner-dismiss'))) await b.click().catch(() => {});
  await page.click(tid('obs-tab-events'));
  await page.waitForSelector(tid('events-timeline'));
  await shot('28-late-events-timeline');
  await page.click(tid('events-major'));
  await shot('29-late-events-major-only');
  await page.click(tid('events-major'));
  const world = await api('GET', '/api/spectator');
  const garrison = world.armies[0]?.region ?? world.civs[0].capital;
  const pt = await page.evaluate((rid) => window.__atlas?.regionScreenCenter?.(rid) ?? null, garrison);
  if (pt) {
    await page.mouse.click(pt[0], pt[1]);
    if (await page.waitForSelector(tid('observer-region'), { timeout: 4000 }).catch(() => null)) await shot('30-late-region-card');
    else log('note: the map did not report a click at the region centre; region card screenshot skipped');
  } else log('note: this map build has no __atlas.regionScreenCenter hook; region card screenshot skipped');
  await page.click(tid('obs-tab-score'));
  await setLocale('zh-Hans');
  await shot('31-late-zh-scoreboard');
  await setLocale('en');

  // Injected: wars, an overlord, an eliminated seat and endgame counters (rare in built-in play).
  await page.route('**/api/spectator', async (route) => {
    try {
      const res = await route.fetch();
      const body = await res.json();
      const c = body.civs;
      c[0].at_war_with = [1]; c[1].at_war_with = [0, 2]; c[2].at_war_with = [1];
      c[3].overlord = 0; c[2].status = 'eliminated';
      Object.assign(c[0], { gov_streak: 61, ftl_streak: 14, assemblies: 3, trials: 1, planetary: body.month - 300, interstellar: body.month - 40 });
      Object.assign(c[1], { gov_streak: 0, ftl_streak: 24, assemblies: 4, trials: 2, planetary: body.month - 210, interstellar: body.month - 12 });
      await route.fulfill({ response: res, json: body });
    } catch { /* route removed mid-flight */ }
  });
  await open();
  await shot('32-scoreboard-wars-overlord-endgame-MOCKED');
  await stopInjecting();
} catch (e) {
  errors.push(String(e && e.stack ? e.stack : e));
  await page.screenshot({ path: `${SHOTS}observer-FAILED.png` }).catch(() => {});
}

await browser.close();
if (errors.length) {
  console.error('[observer] FAILED');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
log('all checks passed; screenshots in', SHOTS);
