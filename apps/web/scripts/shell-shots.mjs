// Screenshots and checks for the game shell: title, setup, top bar, round dock,
// notifications and banners, menus, desktop integration, read-only observing,
// result screen — then the part scripts for the trees, tutorial/almanac and
// observer console. Any page error or console error fails the run.
//
//   source scripts/env.sh
//   target/release/bts serve --port 7982 --web apps/web/dist --saves .toolchain/shell-saves --fresh &
//   (cd apps/web && npm run build && BTS_URL=http://127.0.0.1:7982 node scripts/shell-shots.mjs)
//
//   --only=shell     skip the part scripts        --parts-only   run only the part scripts
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7982';
const SHOTS = fileURLToPath(new URL('../screenshots/shell/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const args = new Set(process.argv.slice(2));
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const log = (...a) => console.log('[shell]', ...a);
const tid = (id) => `[data-testid="${id}"]`;
const errors = [];
let count = 0;

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}
async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const DOMAINS = ['economy', 'research', 'education', 'culture', 'expansion', 'military'];
async function newMatch(body) {
  return api('POST', '/api/match', body);
}
async function autoplay(rounds, seat = 0) {
  await api('POST', '/api/delegate', { seat, token: '', domains: DOMAINS });
  for (let i = 0; i < rounds; i++) {
    const m = await api('POST', '/api/ready', { seat, token: '', through_round: true });
    if (m.finished) break;
  }
}

let browser;
async function open({ w = 1440, h = 900, locale = 'en', init = null, url = '/' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  await ctx.addInitScript((l) => { try { localStorage.setItem('bts.locale', l); } catch { /* ignore */ } }, locale);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(BASE + url);
  return page;
}
async function shot(page, name) {
  await page.waitForTimeout(260);
  await page.screenshot({ path: `${SHOTS}${name}.png` });
  count++;
}
async function game(page) {
  await page.waitForSelector(tid('map-canvas'), { timeout: 20000 });
  await page.waitForTimeout(500);
}
async function endRound(page) {
  const before = await page.textContent(tid('year'));
  await page.click(tid('end-round'));
  await page.waitForFunction((b) => document.querySelector('[data-testid="year"]')?.textContent !== b, before, { timeout: 30000 });
  await page.waitForTimeout(150);
}

// --- title and setup ---------------------------------------------------------------------
async function titleAndSetup() {
  log('title screen and setup');
  await newMatch({ seed: 'shell-title', regions: 24, controllers: ['human', 'medium', 'medium', 'medium'] });
  for (const [locale, tag] of [['en', 'en'], ['zh-Hans', 'zh-hans'], ['zh-Hant', 'zh-hant']]) {
    const page = await open({ locale, url: '/?title' });
    await page.waitForSelector(tid('title-screen'));
    assert(await page.isEnabled(tid('title-continue')), 'Continue is offered when a match exists');
    await shot(page, `title-${tag}`);
    if (locale === 'en') {
      await page.click(tid('title-load'));
      await page.waitForSelector(tid('title-saves'));
      await shot(page, 'title-load-game');
      await page.click(tid('title-load'));
      // the language control works right on this screen
      await page.click(tid('lang-zh-Hans'));
      assert((await page.textContent(tid('title-new'))).includes('新游戏'), 'switching language re-renders immediately');
      assert(await page.evaluate(() => localStorage.getItem('bts.locale')) === 'zh-Hans', 'the language choice persists');
      await page.click(tid('lang-en'));
    }
    await page.click(tid('title-new'));
    await page.waitForSelector(tid('setup-screen'));
    await page.fill(tid('setup-seed'), 'amber-ford-204');
    await shot(page, `setup-${tag}`);
    // agent seats: Claude API, Claude Code, Codex, OpenAI-compatible; no human = observer
    const providers = ['claude-api', 'claude-code', 'codex', 'openai-api'];
    for (let i = 0; i < 4; i++) {
      await page.click(tid(`setup-seat-${i}-agent`));
      await page.click(tid(`setup-seat-${i}-${providers[i]}`));
    }
    await page.click(tid('setup-agent-0-every-5'));
    await page.fill(tid('setup-agent-0-key'), 'sk-example-not-a-real-key');
    assert(await page.getAttribute(tid('setup-agent-0-key'), 'type') === 'password', 'the API key field is a password input');
    assert(await page.inputValue(tid('setup-agent-0-model')) === 'claude-opus-5-5', 'Claude API suggests a default model');
    assert(await page.isDisabled(tid('setup-start')), 'an OpenAI-compatible seat needs a model before the match can start');
    await page.fill(tid('setup-agent-3-model'), 'my-model');
    await page.fill(tid('setup-agent-3-baseurl'), 'http://localhost:8080/v1');
    assert(await page.isEnabled(tid('setup-start')), 'start is enabled once the model is given');
    assert(await page.$(tid('setup-observer-note')), 'observer mode is explained when no seat is human');
    assert(await page.evaluate(() => !JSON.stringify(Object.entries(localStorage)).includes('sk-example')), 'the API key is not written to localStorage');
    await shot(page, `setup-agents-${tag}`);
    await page.locator('.setup-scroll').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await shot(page, `setup-agents-lower-${tag}`);
    await page.context().close();
  }
  // 1280×720, a mixed table, and the request the form sends
  const page = await open({ w: 1280, h: 720, url: '/?title' });
  await page.waitForSelector(tid('title-screen'));
  await shot(page, 'title-1280x720');
  await page.click(tid('title-new'));
  await page.click(tid('setup-seat-0-agent'));
  await page.click(tid('setup-seat-0-claude-code'));
  await page.click(tid('setup-agent-0-every-2'));
  await page.click(tid('setup-seat-1-hard'));
  await page.click(tid('setup-seat-2-easy'));
  await page.click(tid('setup-regions-24'));
  await shot(page, 'setup-1280x720');
  let sent = null;
  await page.route('**/api/match', async (route) => {
    if (route.request().method() === 'POST') { sent = route.request().postDataJSON(); await route.abort(); } else await route.continue();
  });
  await page.click(tid('setup-start'));
  await page.waitForTimeout(400);
  assert(sent && sent.controllers.join() === 'claude-code,hard,easy,medium', 'controllers are sent as the server contract names them: ' + JSON.stringify(sent?.controllers));
  assert(sent.agent_options && sent.agent_options['0'].consult_every === 2 && !('api_key' in sent.agent_options['0']), 'agent_options carry consult_every and no empty key');
  await page.context().close();
  // tutorial entry pre-fills a gentle match
  const tp = await open({ url: '/?title' });
  await tp.click(tid('title-tutorial'));
  await tp.waitForSelector(tid('setup-tutorial-note'));
  await shot(tp, 'setup-tutorial-preset');
  await tp.context().close();
}

// --- the main screen ------------------------------------------------------------------------
async function mainScreen() {
  log('main screen, early');
  await newMatch({ seed: 'shell-main', regions: 24, controllers: ['human', 'medium', 'medium', 'medium'] });
  let page = await open();
  await game(page);
  await shot(page, 'main-early');
  for (const y of ['food', 'materials', 'population', 'stability', 'research', 'labour']) {
    await page.hover(tid(`yield-${y}`));
    await page.waitForSelector(`.yield-${y} .yield-tip`, { state: 'visible' });
    await shot(page, `topbar-tip-${y}`);
  }
  await page.mouse.move(700, 500);
  // phase flow through the dock
  assert((await page.getAttribute(tid('phase'), 'data-phase')) === 'contact', 'starts in contact');
  await shot(page, 'dock-contact');
  await page.click(tid('next-phase'));
  await page.waitForFunction(() => document.querySelector('[data-testid="phase"]')?.getAttribute('data-phase') === 'negotiate');
  await page.click(tid('next-phase'));
  await page.waitForFunction(() => document.querySelector('[data-testid="phase"]')?.getAttribute('data-window') === '2');
  await shot(page, 'dock-negotiate-window2');
  for (let i = 0; i < 4; i++) { await page.click(tid('next-phase')); await page.waitForTimeout(250); }
  await page.waitForFunction(() => document.querySelector('[data-testid="phase"]')?.getAttribute('data-phase') === 'plan');
  await shot(page, 'dock-plan');
  // notification column
  await page.keyboard.press('Escape');
  assert(await page.locator(tid('notify-item')).count() > 0, 'briefing items appear as medallions');
  await page.hover(tid('notify-item'));
  await shot(page, 'notify-hover');
  await page.locator(tid('notify-item')).first().click();
  assert(await page.$('[data-testid^="panel-"], [data-testid="inspector"]'), 'a medallion opens the relevant panel or region');
  // hotkeys for overlays
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  for (const [key, id] of [['t', 'overlay-tech'], ['c', 'overlay-civics'], ['l', 'overlay-ledger'], ['?', 'overlay-almanac']]) {
    await page.keyboard.press(key);
    await page.waitForSelector(tid(id));
    if (id === 'overlay-ledger') await shot(page, 'overlay-ledger');
    await page.keyboard.press('Escape');
    await page.waitForSelector(tid(id), { state: 'detached' });
  }
  await page.keyboard.press('h');
  await page.waitForSelector(tid('panel-chronicle'));
  await page.keyboard.press('Escape');
  // play until a major moment raises the banner; the attention list shows on the way
  await page.click(tid('rail-briefing'));
  // stewards run the civilization meanwhile, so that history actually happens
  await api('POST', '/api/delegate', { seat: 0, token: '', domains: DOMAINS });
  let banner = false, attention = false;
  for (let i = 0; i < 45 && !(banner && attention); i++) {
    await endRound(page);
    if (!attention && await page.$(tid('attention-count'))) {
      await page.hover(tid('end-round'));
      await page.waitForSelector(tid('attention-list'), { state: 'visible' });
      await shot(page, 'dock-attention');
      await page.mouse.move(700, 400);
      attention = true;
    }
    if (!banner && await page.$(tid('moment-banner'))) {
      await shot(page, 'banner-major-moment');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      if (await page.$(tid('moment-banner'))) await shot(page, 'banner-over-map');
      banner = true;
    }
  }
  assert(attention, 'the attention count appeared within the first rounds');
  assert(banner, 'a major chronicle moment raised a banner within the first rounds');
  await page.context().close();

  log('main screen, late (stewards play 110 rounds)');
  await autoplay(110);
  for (const [locale, tag] of [['en', 'en'], ['zh-Hans', 'zh-hans']]) {
    page = await open({ locale });
    await game(page);
    await shot(page, `main-late-${tag}`);
    await page.hover(tid('yield-food'));
    await shot(page, `topbar-tip-food-late-${tag}`);
    await page.mouse.move(700, 500);
    await page.click(tid('rail-economy'));
    await page.waitForSelector(tid('panel-economy'));
    await shot(page, `panel-economy-late-${tag}`);
    await page.click(tid('menu-button'));
    await page.waitForSelector(tid('game-menu'));
    await shot(page, `menu-${tag}`);
    await page.context().close();
  }
  page = await open({ w: 1280, h: 720 });
  await game(page);
  await shot(page, 'main-late-1280x720');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.querySelector('.topbar').scrollWidth > window.innerWidth + 1);
  assert(!overflow, 'no horizontal overflow at 1280×720');
  await page.context().close();
}

// --- hot seat, result, loading and error states -------------------------------------------------
async function states() {
  log('hot seat waiting state');
  await newMatch({ seed: 'shell-duo', regions: 24, controllers: ['human', 'human', 'medium', 'medium'] });
  let page = await open();
  await game(page);
  assert(await page.$(tid('seat-1')), 'hot-seat switcher present');
  await page.click(tid('end-round'));
  await page.waitForSelector(tid('handover-continue'));
  await shot(page, 'hotseat-handover');
  await page.click('.overlay .btn-ghost');
  await page.waitForSelector(tid('waiting'));
  await shot(page, 'dock-waiting');
  await page.context().close();

  log('result screen');
  await newMatch({ seed: 'shell-end', regions: 24, horizon: 120, pace_bp: 3300, controllers: ['human', 'medium', 'medium', 'medium'] });
  await autoplay(12);
  page = await open();
  await page.waitForSelector(tid('result-screen'), { timeout: 20000 });
  await shot(page, 'result-screen');
  await page.click('.result-card .btn-ghost');
  await page.waitForSelector(tid('orb-finished'));
  assert(!(await page.$(tid('end-round'))), 'no end-round control once the match has finished');
  await shot(page, 'dock-finished');
  await page.context().close();

  log('loading, unreachable and closed states');
  page = await open({ init: () => { /* nothing */ } });
  await page.context().close();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page = await ctx.newPage();
  await page.route('**/api/match', async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.abort(); });
  await page.goto(BASE + '/');
  await page.waitForSelector('.splash');
  await shot(page, 'state-loading');
  await page.waitForSelector('.splash-error', { timeout: 8000 });
  await shot(page, 'state-unreachable');
  await ctx.close();

  // app mode: Quit from the menu shuts the referee down (mocked here) and shows the closing screen
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page = await ctx2.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  let shutdowns = 0;
  await page.route('**/api/match', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), app_mode: true } });
  });
  await page.route('**/api/shutdown', async (route) => { shutdowns++; await route.fulfill({ json: { ok: true } }); });
  await page.goto(BASE + '/');
  await page.waitForSelector(tid('title-screen'));
  assert(await page.$(tid('title-quit')), 'app mode opens on the title screen and offers Quit');
  await page.click(tid('title-continue'));
  await page.click('.result-card .btn-ghost').catch(() => {});
  await page.click(tid('menu-button'));
  await page.click(tid('menu-quit'));
  await shot(page, 'menu-quit-confirm');
  await page.click(tid('menu-quit-confirm'));
  await page.waitForSelector(tid('closed-screen'));
  assert(shutdowns === 1, 'POST /api/shutdown was called once');
  assert(!(await page.textContent('body')).toLowerCase().includes('tab'), 'no "close this tab" wording');
  await shot(page, 'state-closed');
  await ctx2.close();
}

// --- desktop shell bridge ---------------------------------------------------------------------------
async function desktop() {
  log('desktop shell integration (window.__btsDesktop mocked)');
  await newMatch({ seed: 'shell-desk', regions: 24, controllers: ['human', 'medium', 'medium', 'medium'] });
  await autoplay(6);
  await api('POST', '/api/delegate', { seat: 0, token: '', domains: [] });
  const page = await open({ init: () => { window.__desk = { fs: 0, quit: 0 }; window.__btsDesktop = { fullscreen() { window.__desk.fs++; }, quit() { window.__desk.quit++; } }; } });
  await page.waitForSelector(tid('title-screen'));
  await shot(page, 'desktop-title');
  await page.click(tid('title-fullscreen'));
  assert(await page.evaluate(() => window.__desk.fs) === 1, 'the title full-screen entry calls the bridge');
  await page.click(tid('title-quit'));
  await page.waitForSelector(tid('title-quit-pane'));
  await shot(page, 'desktop-title-quit');
  let shutdown = false;
  await page.route('**/api/shutdown', async (route) => { shutdown = true; await route.fulfill({ json: {} }); });
  await page.click(tid('title-quit-confirm'));
  assert(await page.evaluate(() => window.__desk.quit) === 1 && !shutdown, 'Quit calls the bridge, not the HTTP shutdown');
  await page.click(tid('title-continue'));
  await game(page);
  await page.click(tid('menu-button'));
  await page.waitForSelector(tid('game-menu'));
  await page.click(tid('menu-fullscreen'));
  assert(await page.evaluate(() => window.__desk.fs) === 2, 'the menu full-screen entry calls the bridge');
  await shot(page, 'desktop-menu');
  const pages = page.context().pages().length;
  await page.click(tid('export-view-md'));
  await page.waitForSelector('.export-text');
  assert((await page.inputValue('.export-text')).length > 20, 'the export is shown in an in-app viewer');
  assert(page.context().pages().length === pages, 'exports never open another tab or window');
  await shot(page, 'desktop-export-viewer');
  await page.context().close();
}

// --- observing a seat read-only (the world console itself is covered by the observer part) --------------
async function viewAs() {
  log('observer: view as a civilization, read-only');
  await newMatch({ seed: 'shell-watch', regions: 24, controllers: ['hard', 'medium', 'medium', 'easy'] });
  await api('POST', '/api/advance', { rounds: 12 });
  for (let i = 0; i < 60; i++) { const m = await api('GET', '/api/match'); if (m.round >= 13) break; await new Promise((r) => setTimeout(r, 300)); }
  for (const [locale, tag] of [['en', 'en'], ['zh-Hans', 'zh-hans']]) {
    const page = await open({ locale });
    await page.waitForSelector(tid('observer-console'), { timeout: 20000 });
    await page.evaluate(() => 0);
    await page.click(tid('view-as-1'));
    await game(page);
    assert(await page.$(tid('observing-badge')), 'the Observing badge is always visible');
    await shot(page, `view-as-${tag}`);
    await page.click(tid('rail-projects'));
    await page.waitForSelector(tid('panel-projects'));
    const why = await page.getAttribute(tid('new-project'), 'title');
    assert(await page.isDisabled(tid('new-project')) && why && why.length > 0, 'action controls are disabled with the reason');
    if (locale === 'en') assert(why === 'You are observing', 'the reason reads "You are observing"');
    await shot(page, `view-as-projects-disabled-${tag}`);
    const before = await page.textContent(tid('year'));
    await page.click(tid('observer-step'));
    await page.waitForFunction((b) => document.querySelector('[data-testid="year"]')?.textContent !== b, before, { timeout: 30000 });
    await page.click(tid('observer-world'));
    await page.waitForSelector(tid('observer-console'));
    await page.context().close();
  }
}

const part = (name) => fileURLToPath(new URL(`./shell-shots-${name}.mjs`, import.meta.url));
function runParts() {
  for (const name of ['trees', 'tutorial', 'observer']) {
    if (!existsSync(part(name))) { log(`part script missing: ${name}`); process.exitCode = 1; continue; }
    log(`--- part: ${name}`);
    const r = spawnSync(process.execPath, [part(name)], { stdio: 'inherit', env: { ...process.env, BTS_URL: BASE } });
    if (r.status !== 0) { console.error(`[shell] part ${name} FAILED`); process.exitCode = 1; }
  }
}

if (!args.has('--parts-only')) {
  browser = await chromium.launch({ args: GL });
  try {
    const only = [...args].find((a) => a.startsWith('--step='))?.slice(7);
    const steps = { title: titleAndSetup, main: mainScreen, states, desktop, viewas: viewAs };
    for (const [name, fn] of Object.entries(steps)) if (!only || only === name) await fn();
  } catch (e) {
    console.error('[shell] FAILED:', e.message);
    process.exitCode = 1;
  }
  await browser.close();
  if (errors.length) {
    console.error('[shell] page errors:\n  ' + [...new Set(errors)].join('\n  '));
    process.exitCode = 1;
  }
  log(`${count} screenshots in ${SHOTS}`);
}
if (!args.has('--only=shell') && !process.exitCode) runParts();
