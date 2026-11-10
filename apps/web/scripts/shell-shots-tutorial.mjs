// Screenshots and checks for the guided tutorial and the Almanac.
//
//   source scripts/env.sh
//   target/release/bts serve --port 7984 --web apps/web/dist --saves .toolchain/shell-saves-tutorial --fresh &
//   (cd apps/web && node scripts/shell-shots-tutorial.mjs)        # BTS_URL overrides the address
//
// Plays the whole tour through the interface in English (every "do it" step is
// really done: the capital is clicked on the map, a project is ordered, the
// round is ended, ...), repeats the opening in Simplified Chinese and at
// 1280×720, checks the tour never covers what it points at, that automated
// browsers are left alone, that every string has a Chinese entry, and walks the
// Almanac (pages, search, glossary, Chinese, and with no observation at all).
// Any page error or console error fails the run.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7984';
const SHOTS = fileURLToPath(new URL('../screenshots/shell/', import.meta.url));
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const errors = [];
const log = (...a) => console.log('[tutorial-shots]', ...a);
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}
const tid = (id) => `[data-testid="${id}"]`;
const card = (step) => `${tid('tutorial-card')}[data-step="${step}"]`;

async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const newMatch = (seed, controllers = ['human', 'easy', 'easy', 'easy']) => api('POST', '/api/match', { seed, regions: 24, controllers });
const getObs = () => api('GET', '/api/observation?seat=0');

let page;
async function shot(name) {
  await page.waitForTimeout(380);
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

/** The callout must be on screen and must not cover what it points at. */
async function checkPlacement(step) {
  const measure = () => {
    const c = document.querySelector('[data-testid="tutorial-card"]');
    if (!c) return null;
    const cb = c.getBoundingClientRect();
    const a = document.querySelector('.tut-hole, .tut-ring');
    const ab = a ? a.getBoundingClientRect() : null;
    const inside = c.classList.contains('is-inside');
    const overlap = ab && !inside ? !(cb.right <= ab.left || cb.left >= ab.right || cb.bottom <= ab.top || cb.top >= ab.bottom) : false;
    return { on: cb.left >= 0 && cb.top >= 0 && cb.right <= window.innerWidth && cb.bottom <= window.innerHeight, overlap, anchored: !!ab };
  };
  // The callout follows its anchor within a moment (panels slide, the software-rendered map can stall frames).
  let r = await page.evaluate(measure);
  for (let i = 0; i < 20 && r && (!r.on || r.overlap); i++) {
    await page.waitForTimeout(200);
    r = await page.evaluate(measure);
  }
  assert(r, `${step}: the callout is shown`);
  assert(r.on, `${step}: the callout is inside the viewport`);
  assert(!r.overlap, `${step}: the callout does not cover its anchor`);
  return r;
}

async function at(step, name) {
  await page.waitForSelector(card(step), { timeout: 15000 });
  await page.waitForTimeout(480); // panels slide in; the callout follows its anchor within a moment
  const r = await checkPlacement(step);
  if (name) await shot(name);
  return r;
}
const next = () => page.click(tid('tutorial-next'));

async function clickCapital(obs) {
  // The ring marks the capital; it takes no clicks, so the map underneath gets this one.
  const pt = await page.evaluate((cap) => {
    const ring = document.querySelector('.tut-ring');
    const cands = [];
    if (ring) { const b = ring.getBoundingClientRect(); cands.push([b.left + b.width / 2, b.top + b.height / 2]); }
    const c = window.__atlas?.regionScreenCenter?.(cap);
    if (c) for (const [dx, dy] of [[0, -25], [0, -40], [22, -12], [-22, -12], [0, 26], [0, 0]]) cands.push([c[0] + dx, c[1] + dy]);
    for (const [x, y] of cands) {
      const el = document.elementFromPoint(x, y);
      if (el && el.tagName === 'CANVAS' && (!window.__atlas?.regionAt || window.__atlas.regionAt(x, y) === cap)) return [x, y];
    }
    return cands[0] ?? null;
  }, obs.civ.capital);
  assert(pt, 'a point on the capital was found');
  await page.mouse.click(pt[0], pt[1]);
}

async function orderSomething() {
  const obs = await getObs();
  const kinds = ['fields', 'fishery', 'pasture', 'workshop', 'granary'].filter((k) => obs.catalog.facilities.some((f) => f.kind === k && f.available));
  await page.click(tid('new-project'));
  await page.waitForSelector(tid('build-region'));
  for (const kind of [...kinds, 'workshop']) {
    if (!(await page.$(tid(`fac-${kind}`)))) continue;
    await page.click(tid(`fac-${kind}`));
    await page.waitForSelector(tid('build-detail'));
    if (await page.isDisabled(tid('build-submit'))) continue;
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/actions') && r.request().method() === 'POST'),
      page.click(tid('build-submit')),
    ]);
    const rec = (await res.json()).receipts?.[0];
    log(`order ${kind} -> ${rec?.status}`);
    if (rec?.status === 'accepted') return kind;
  }
  return null;
}

async function open(context, url, viewport) {
  page = await context.newPage();
  if (viewport) await page.setViewportSize(viewport);
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + url);
  await page.waitForSelector(tid('map-canvas'));
  await page.waitForTimeout(700);
}

// --- static dictionary coverage ---------------------------------------------------------
function staticCoverage() {
  const dict = JSON.parse(readFileSync(`${SRC}i18n/zh-Hans/ui-tutorial.json`, 'utf8'));
  const rx = /\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  const missing = [];
  for (const f of readdirSync(`${SRC}tutorial`).filter((x) => x.endsWith('.tsx'))) {
    const src = readFileSync(`${SRC}tutorial/${f}`, 'utf8');
    let m;
    while ((m = rx.exec(src))) {
      const key = m[2].replace(/\\(['"])/g, '$1');
      if (!(key in dict)) missing.push(`${f}: ${key}`);
    }
  }
  assert(!missing.length, 'every t() literal in src/tutorial has a zh-Hans entry; missing: ' + missing.join(' | '));
  log(`dictionary: ${Object.keys(dict).length} entries, all t() literals covered`);
}

// =========================================================================================
async function englishTour(browser) {
  log('English: the whole tour at 1440×900');
  await newMatch('tut-en');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Automated browsers are never offered the tour (other teams' scripts load the game).
  await open(context, '/');
  await page.waitForTimeout(1600);
  assert(await page.evaluate(() => navigator.webdriver === true), 'this browser reports navigator.webdriver');
  assert(!(await page.$(tid('tutorial-offer'))) && !(await page.$(tid('tutorial'))) && !(await page.$('.tutorial')), 'no offer and no tutorial element under webdriver without ?tutorial');
  await page.close();

  await open(context, '/?tutorial');
  await page.waitForSelector(tid('tutorial-offer'));
  await page.waitForTimeout(900);
  // The offer is not modal: the game underneath still answers.
  await page.keyboard.press('2');
  await page.waitForSelector(tid('panel-economy'));
  await page.keyboard.press('1');
  await page.waitForSelector(tid('panel-briefing'));
  await shot('tutorial-01-offer');
  await page.keyboard.press('Escape'); // close the briefing so the "open the briefing" step has something to ask for
  await page.click(tid('tutorial-start'));

  await at('welcome', 'tutorial-02-welcome');
  // An explanation owns the keyboard: a panel hotkey does nothing, arrow keys page through.
  await page.keyboard.press('3');
  assert(!(await page.$(tid('panel-projects'))), 'game hotkeys are ignored while an explanation card is open');
  await page.keyboard.press('ArrowRight');
  await at('yields', 'tutorial-03-yields');
  await page.keyboard.press('ArrowLeft');
  await at('welcome');
  await next();
  await at('yields');
  await next();
  await at('dock', 'tutorial-04-round-dock');
  await next();
  await at('notify', 'tutorial-05-notifications');
  await next();

  // "Do it" steps: only doing the thing moves on.
  await at('briefing', 'tutorial-06-do-open-briefing');
  assert((await page.getAttribute(tid('tutorial'), 'data-mode')) === 'do', 'an instruction step is non-modal');
  assert(!(await page.$('[data-tutorial-modal]')), 'an instruction card does not claim the keyboard');
  await page.click(tid('rail-briefing'));
  await at('capital', 'tutorial-07-do-select-capital');
  const obs = await getObs();
  await clickCapital(obs);
  await at('inspector', 'tutorial-08-inspector');
  await next();
  await at('projects', 'tutorial-09-do-open-projects');
  await page.keyboard.press('3'); // game hotkeys work during an instruction step
  await at('order', 'tutorial-10-do-first-order');
  const built = await orderSomething();
  assert(built, 'a project was ordered through the interface');
  await at('labour', 'tutorial-11-callable-labour');
  await next();
  await at('people', 'tutorial-12-people');
  await next();
  await at('endround', 'tutorial-13-do-end-round');
  await page.click(tid('end-round'));
  await at('after', 'tutorial-14-read-what-happened');
  await next();
  await at('lead', 'tutorial-15-do-follow-lead');
  await page.click(tid('rail-knowledge'));
  await page.waitForSelector(tid('panel-knowledge'));
  let acted = false;
  for (const id of ['follow-up', 'investigate']) {
    const b = page.locator(`${tid(id)}:not([disabled])`).first();
    if (await b.count()) { await b.click(); acted = true; break; }
  }
  if (!acted) {
    if (await page.$(tid('tab-frontier'))) await page.click(tid('tab-frontier'));
    if (await page.$(tid('toggle-study'))) await page.click(tid('toggle-study'));
    const b = page.locator('[data-testid^="study-"]:not([disabled])').first();
    if (await b.count()) { await b.click(); acted = true; }
  }
  await page.waitForTimeout(500);
  await shot('tutorial-16-lead-in-knowledge');
  log(`lead step: ${acted ? 'done through the interface' : 'nothing on offer, skipped with the button'}`);
  if (!acted) await next();
  await at('tree', 'tutorial-17-do-open-tree');
  await page.keyboard.press('t');
  await at('treeinfo', 'tutorial-18-tree-explained');
  await next();
  assert(!(await page.$(tid('overlay-tech'))), 'the tree is closed again when the tour moves on');
  await at('civics');
  await next();
  await at('expand');
  await next();
  await at('diplomacy', 'tutorial-19-diplomacy');
  await next();
  await at('military');
  await next();
  await at('chronicle', 'tutorial-20-do-open-chronicle');
  await page.click(tid('chronicle-tab'));
  await at('stewards', 'tutorial-21-stewards');
  await next();
  await at('objective', 'tutorial-22-objective');
  await next();
  await at('finish', 'tutorial-23-finish');
  await next();
  await page.waitForSelector(tid('tutorial'), { state: 'detached' });
  assert((await page.evaluate(() => JSON.parse(localStorage.getItem('bts.tutorial')).status)) === 'done', 'finishing is remembered');
  await page.reload();
  await page.waitForSelector(tid('map-canvas'));
  await page.waitForTimeout(1500);
  assert(!(await page.$(tid('tutorial-offer'))), 'a finished tour is not offered again');

  // Restart from the menu, then leave with Esc.
  await page.keyboard.press('Escape');
  await page.click(tid('menu-button'));
  await page.waitForSelector(tid('game-menu'));
  if (await page.$(tid('menu-tutorial'))) {
    await page.click(tid('menu-tutorial'));
    await at('welcome');
    await next();
    await next();
    await at('dock');
    // Progress is remembered across a reload: the offer becomes "pick up where you stopped".
    await page.reload();
    await page.waitForSelector(tid('tutorial-offer'));
    await shot('tutorial-24-resume-offer');
    await page.click(tid('tutorial-start'));
    await at('dock');
    await page.keyboard.press('Escape');
    await page.waitForSelector(tid('tutorial-ask'));
    await shot('tutorial-25-leave-prompt');
    await page.click(tid('tutorial-ask-leave'));
    await page.waitForSelector(tid('tutorial'), { state: 'detached' });
  } else log('menu entry "Restart the tutorial" not found (menu not built yet?) — restart path not exercised');
  await context.close();
}

async function chineseTour(browser, locale, prefix) {
  log(`${locale}: the opening of the tour`);
  await newMatch('tut-zh');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((l) => { localStorage.setItem('bts.locale', l); }, locale);
  await open(context, '/?tutorial');
  await page.waitForSelector(tid('tutorial-offer'));
  await page.keyboard.press('Escape');
  await shot(`${prefix}-01-offer`);
  await page.click(tid('tutorial-start'));
  await at('welcome', `${prefix}-02-welcome`);
  await next();
  await at('yields', `${prefix}-03-yields`);
  await next();
  await at('dock', `${prefix}-04-round-dock`);
  await next();
  await at('notify');
  await next();
  await at('briefing', `${prefix}-05-do-open-briefing`);
  await page.click(tid('rail-briefing'));
  await at('capital', `${prefix}-06-do-select-capital`);
  await clickCapital(await getObs());
  await at('inspector', `${prefix}-07-inspector`);
  await next();
  await at('projects');
  await page.click(tid('rail-projects'));
  await at('order', `${prefix}-08-do-first-order`);
  if (locale === 'zh-Hans') {
    // Every string of the tour and the almanac has a translation.
    const untranslated = await page.evaluate(() => window.__btsTutorialStrings().filter((s) => window.__btsI18n.t(s) === s));
    assert(!untranslated.length, 'every tutorial and almanac string is translated; missing: ' + untranslated.join(' | '));
  }
  await page.click(tid('tutorial-leave'));
  await page.waitForSelector(tid('tutorial-ask'));
  await shot(`${prefix}-09-leave-prompt`);
  await page.click(tid('tutorial-ask-leave'));
  await context.close();
}

async function smallScreen(browser, locale, prefix) {
  log(`${locale}: 1280×720`);
  await newMatch('tut-720');
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript((l) => { localStorage.setItem('bts.locale', l); }, locale);
  await open(context, '/?tutorial');
  await page.waitForSelector(tid('tutorial-offer'));
  await shot(`${prefix}-01-offer`);
  await page.click(tid('tutorial-start'));
  const stops = { welcome: '02-welcome', yields: '03-yields', dock: '04-round-dock', inspector: '05-inspector', order: '06-do-first-order', labour: '07-callable-labour', treeinfo: '08-tree-explained', finish: '09-finish' };
  const obs = await getObs();
  // Walk every step; do the first few for real, skip the rest with the button.
  for (;;) {
    const step = await page.getAttribute(tid('tutorial-card'), 'data-step');
    await at(step, stops[step] ? `${prefix}-${stops[step]}` : null);
    if (step === 'finish') break;
    if (step === 'capital') await clickCapital(obs);
    else if (step === 'projects') await page.click(tid('rail-projects'));
    else await next();
    await page.waitForFunction((s) => document.querySelector('[data-testid="tutorial-card"]')?.getAttribute('data-step') !== s, step, { timeout: 15000 });
  }
  await next();
  await page.waitForSelector(tid('tutorial'), { state: 'detached' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, 'no horizontal overflow at 1280×720');
  await context.close();
}

async function almanac(browser) {
  log('Almanac');
  await newMatch('tut-alm');
  let context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await open(context, '/');
  await page.keyboard.press('?');
  await page.waitForSelector(tid('overlay-almanac'));
  await shot('almanac-01-what-you-are');
  const topics = await page.$$eval('[data-testid^="almanac-topic-"]', (els) => els.map((e) => e.getAttribute('data-testid').replace('almanac-topic-', '')));
  assert(topics.length >= 20, `the almanac lists its topics (${topics.length})`);
  const named = { round: '02-round', knowledge: '03-knowledge', goods: '04-goods', card: '05-reading-a-card', blocked: '06-why-blocked', observer: '07-observer-and-agents', keys: '08-keys', glossary: '09-glossary' };
  for (const k of topics) {
    await page.click(tid(`almanac-topic-${k}`));
    await page.waitForSelector(`${tid('almanac-page')}[data-topic="${k}"]`);
    if (named[k]) await shot(`almanac-${named[k]}`);
  }
  // Search: body text and glossary terms; a glossary hit jumps to the term.
  await page.fill(tid('almanac-search'), 'envelope');
  await page.waitForSelector(tid('almanac-hit'));
  assert((await page.locator(tid('almanac-hit')).count()) >= 2, 'search finds "envelope" in pages and in the glossary');
  await page.locator(tid('almanac-hit')).last().click();
  await page.waitForSelector('.alm-def.is-target');
  await shot('almanac-10-search-envelope');
  await page.fill(tid('almanac-search'), 'zzzz');
  await page.waitForSelector('.alm-none');
  await shot('almanac-11-search-no-results');
  await page.fill(tid('almanac-search'), '');
  // Cross-links: "see also" moves between topics, an action opens the panel and closes the almanac.
  await page.click(tid('almanac-topic-food'));
  await page.locator(tid('almanac-see')).first().click();
  assert((await page.getAttribute(tid('almanac-page'), 'data-topic')) !== 'food', '"see also" opens another topic');
  await page.click(tid('almanac-topic-food'));
  await page.locator(tid('almanac-action')).first().click();
  await page.waitForSelector(tid('panel-economy'));
  assert(!(await page.$(tid('overlay-almanac'))), 'an "open panel" link closes the almanac');
  await page.click(tid('rail-almanac'));
  await page.waitForSelector(tid('overlay-almanac'));
  await page.keyboard.press('Escape');
  await page.waitForSelector(tid('overlay-almanac'), { state: 'detached' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.press('?');
  await page.waitForSelector(tid('overlay-almanac'));
  await page.click(tid('almanac-topic-diplomacy'));
  await shot('almanac-12-1280x720');
  await context.close();

  for (const [locale, prefix] of [['zh-Hans', 'almanac-zh'], ['zh-Hant', 'almanac-zh-hant']]) {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((l) => { localStorage.setItem('bts.locale', l); }, locale);
    await open(context, '/');
    await page.keyboard.press('?');
    await page.waitForSelector(tid('overlay-almanac'));
    await page.click(tid('almanac-topic-knowledge'));
    await shot(`${prefix}-01-knowledge`);
    if (locale === 'zh-Hans') {
      await page.click(tid('almanac-topic-blocked'));
      await shot(`${prefix}-02-why-blocked`);
      await page.click(tid('almanac-topic-observer'));
      await shot(`${prefix}-03-observer`);
      await page.fill(tid('almanac-search'), '线索');
      await page.waitForSelector(tid('almanac-hit'));
      await shot(`${prefix}-04-search`);
      await page.fill(tid('almanac-search'), '');
      await page.click(tid('almanac-topic-glossary'));
      await shot(`${prefix}-05-glossary`);
    }
    await context.close();
  }

  // With no observation at all (observer world view): pages render, panel links and the tour are absent.
  const summary = await newMatch('tut-watch', ['easy', 'easy', 'easy', 'easy']);
  if (summary.observer_allowed) {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(BASE + '/?tutorial');
    await page.waitForSelector(tid('observer-console'));
    await page.waitForTimeout(1500);
    assert(!(await page.$(tid('tutorial-offer'))), 'the tour is not offered in observer mode');
    await page.keyboard.press('?');
    await page.waitForSelector(tid('overlay-almanac'));
    await page.click(tid('almanac-topic-food'));
    assert(!(await page.$(tid('almanac-action'))), 'no "open panel" links without an observation');
    assert(!(await page.$(tid('almanac-tour'))), 'no tour entry without a playable seat');
    await page.click(tid('almanac-topic-observer'));
    await shot('almanac-13-no-observation');
    await context.close();
  } else log('referee has no observer mode: almanac-without-observation not exercised');
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = null;
try {
  staticCoverage();
  await englishTour(browser);
  await chineseTour(browser, 'zh-Hans', 'tutorial-zh');
  await chineseTour(browser, 'zh-Hant', 'tutorial-zh-hant');
  await smallScreen(browser, 'en', 'tutorial-720');
  await smallScreen(browser, 'zh-Hans', 'tutorial-720-zh');
  await almanac(browser);
} catch (e) {
  failed = e;
  try { await page?.screenshot({ path: `${SHOTS}tutorial-zz-failure.png` }); } catch { /* ignore */ }
}
await browser.close();
if (errors.length) console.error('[tutorial-shots] page errors:\n  ' + errors.join('\n  '));
if (failed) { console.error('[tutorial-shots] FAILED:', failed.message); process.exit(1); }
if (errors.length) process.exit(1);
log('ok');
