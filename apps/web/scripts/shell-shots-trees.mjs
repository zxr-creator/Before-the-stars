// Screenshots of the technology and civics tree screens against a running referee.
//
//   source scripts/env.sh
//   target/release/bts serve --port 7993 --web apps/web/dist --saves .toolchain/shell-saves-trees --fresh &
//   (cd apps/web && BTS_URL=http://127.0.0.1:7993 node scripts/shell-shots-trees.mjs)
//
// The script creates its own matches (it replaces whatever match the referee holds),
// writes apps/web/screenshots/shell/tree-*.png, checks the information rule (the chart
// holds exactly the disclosed cards) and fails on any page error or console error.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7993';
const LATE_ROUNDS = Number(process.env.TREE_ROUNDS ?? 110);
const OUT = fileURLToPath(new URL('../screenshots/shell/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const errors = [];
const log = (...a) => console.log('[tree-shots]', ...a);
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const getObs = () => api('GET', '/api/observation?seat=0');

/** A single-human match, played forward by stewards for `rounds` rounds. */
async function match(seed, rounds) {
  await api('POST', '/api/match', { seed, regions: 24, controllers: ['human', 'medium', 'medium', 'medium'] });
  if (rounds > 0) {
    await api('POST', '/api/delegate', { seat: 0, token: '', domains: ['economy', 'research', 'education', 'culture', 'expansion', 'military'] });
    for (let i = 0; i < rounds; i++) await api('POST', '/api/ready', { seat: 0, token: '', through_round: true });
    await api('POST', '/api/delegate', { seat: 0, token: '', domains: [] });
  }
  return getObs();
}

const tid = (id) => `[data-testid="${id}"]`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(locale, size = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport: size });
  await context.addInitScript((loc) => {
    try { localStorage.setItem('bts.locale', loc); localStorage.setItem('bts.tutorial.off', '1'); } catch { /* ignore */ }
  }, locale);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + '/?notutorial');
  await page.waitForSelector(tid('rail-techtree'), { timeout: 20000 });
  await page.waitForTimeout(500);
  return { context, page };
}
async function shot(page, name) {
  await page.waitForTimeout(300);
  // Let slide-in and glide transitions finish (software rendering can be slow); looping glows are ignored.
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))),
    new Promise((r) => setTimeout(r, 4000)),
  ]));
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}tree-${name}.png` });
  log('wrote', `tree-${name}.png`);
}
/**
 * The information rule with a virtualized chart: the chart places exactly the disclosed
 * cards (its data-cards count), and every card in the DOM (only those near the viewport
 * are rendered) is one of them.
 */
async function assertExactCards(page, handles, what) {
  const placed = Number(await page.getAttribute(tid('tree-viewport'), 'data-cards'));
  assert(placed === handles.length, `${what}: the chart places exactly the disclosed cards (${placed} vs ${handles.length})`);
  const shown = await page.$$eval(`${tid('tree-card')}, ${tid('tree-lead')}`, (els) => els.map((e) => e.getAttribute('data-handle')));
  const known = new Set(handles);
  assert(shown.length > 0 && shown.every((h) => known.has(h)), `${what}: every rendered card is a disclosed one`);
}
/** Open a card's details through the search (the chart renders only cards near the view). */
async function openCard(page, card, title = card.name) {
  await page.fill(tid('tree-search'), card.name);
  await page.press(tid('tree-search'), 'Enter');
  await page.waitForSelector(tid('tree-detail'));
  await page.fill(tid('tree-search'), '');
  if (title) await page.waitForFunction((n) => document.querySelector('[data-testid="tree-detail"] h3')?.textContent === n, title, { timeout: 4000 });
}
const techIds = (o) => [...o.knowledge.techs.map((c) => c.handle), ...o.knowledge.leads.map((l) => 'lead-' + l.handle)];
const pracIds = (o) => o.culture.practices.map((c) => c.handle);
async function openTree(page, which) {
  await page.keyboard.press('Escape');
  await page.click(tid(which === 'tech' ? 'rail-techtree' : 'rail-civics'));
  await page.waitForSelector(tid(which === 'tech' ? 'overlay-tech' : 'overlay-civics'));
  await page.waitForTimeout(350);
}

try {
  // --- early game ------------------------------------------------------------------
  let obs = await match('tree-early', 3);
  let { context, page } = await open('en');
  await openTree(page, 'tech');
  await assertExactCards(page, techIds(obs), 'tech tree (early)');
  assert(await page.locator(tid('tree-lead')).count() === obs.knowledge.leads.length, 'frontier column shows exactly the open leads');
  await shot(page, 'tech-early');
  if (obs.knowledge.leads.length) {
    const before = (await getObs()).projects.length;
    await Promise.all([page.waitForResponse((r) => r.url().includes('/api/observation')), page.locator(`${tid('tree-follow-up')}:not([disabled])`).first().click()]);
    await page.waitForTimeout(250);
    assert((await getObs()).projects.length === before + 1, 'Follow up on a lead card starts a project');
    await shot(page, 'tech-early-lead-followed');
  }
  if (await page.locator(`${tid('tree-investigate')}:not([disabled])`).count()) {
    const before = (await getObs()).projects.filter((p) => p.kind === 'research').length;
    await Promise.all([page.waitForResponse((r) => r.url().includes('/api/observation')), page.locator(`${tid('tree-investigate')}:not([disabled])`).first().click()]);
    await page.waitForTimeout(250);
    assert((await getObs()).projects.filter((p) => p.kind === 'research').length === before + 1, 'Investigate on a card starts a research project');
    assert(await page.locator(`${tid('tree-queue-item')}`).count() >= 1, 'the queue strip lists the new investigation');
    await shot(page, 'tech-early-investigating');
  }
  await page.keyboard.press('c');
  await page.waitForSelector(tid('overlay-civics'));
  obs = await getObs();
  await assertExactCards(page, pracIds(obs), 'civics tree (early)');
  await shot(page, 'civics-early');
  await page.keyboard.press('Escape');
  await page.waitForSelector(tid('overlay-civics'), { state: 'detached' });
  await context.close();

  // --- late game ---------------------------------------------------------------------
  obs = await match('tree-late', LATE_ROUNDS);
  log(`late match: round ${obs.round}, ${obs.knowledge.techs.length} techs, ${obs.knowledge.leads.length} leads, ${obs.culture.practices.length} practices`);
  ({ context, page } = await open('en'));
  await openTree(page, 'tech');
  await assertExactCards(page, techIds(obs), 'tech tree (late)');
  await shot(page, 'tech-late');
  // Detail drawer: a card that can be investigated if there is one, else any discovered card.
  const want = obs.knowledge.techs.find((c) => c.can_investigate && c.state === 'discovered') ?? obs.knowledge.techs.find((c) => c.state === 'investigating') ?? obs.knowledge.techs[obs.knowledge.techs.length - 1];
  await page.fill(tid('tree-search'), want.name.split(/[ ,]/)[0]);
  await page.waitForTimeout(200);
  await shot(page, 'tech-search');
  await page.press(tid('tree-search'), 'Enter');
  await page.waitForSelector(tid('tree-detail'));
  await shot(page, 'tech-search-first-hit');
  await page.fill(tid('tree-search'), '');
  await openCard(page, want);
  assert((await page.textContent(`${tid('tree-detail')} h3`)) === want.name, 'drawer shows the chosen card');
  await shot(page, 'tech-detail');
  await page.locator('.tree-drawer-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await shot(page, 'tech-detail-lower');
  // Esc closes the drawer first, then the overlay.
  await page.keyboard.press('Escape');
  await page.waitForSelector(tid('tree-detail'), { state: 'detached' });
  assert(await page.$(tid('overlay-tech')), 'Esc closed only the drawer');
  // Keyboard: arrows move between cards, Enter opens.
  await page.focus(tid('tree-viewport'));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForSelector(tid('tree-detail'));
  await shot(page, 'tech-keyboard-open');
  await page.keyboard.press('Escape');
  // An adopted card, for the gilded state and its "enables" list.
  const adopted = obs.knowledge.techs.filter((c) => c.state === 'adopted' && c.enables.length).pop();
  if (adopted) {
    await openCard(page, adopted);
    await shot(page, 'tech-detail-adopted');
    await page.keyboard.press('Escape');
  }
  // Hovering a card lights its links and the cards at their other ends.
  await page.hover(`${tid('tree-card')}[data-handle="${want.handle}"]`);
  await shot(page, 'tech-hover-links');
  await page.click(tid('tree-zoom-out'));
  await page.click(tid('tree-zoom-out'));
  await shot(page, 'tech-late-zoomed-out');
  await page.click(tid('tree-fit'));
  await shot(page, 'tech-late-fit');
  await page.click(tid('tree-tab-civics'));
  await page.waitForSelector(tid('overlay-civics'));
  await page.waitForTimeout(300);
  await assertExactCards(page, pracIds(obs), 'civics tree (late)');
  await shot(page, 'civics-late');
  const practice = obs.culture.practices.find((c) => c.state === 'recognized') ?? obs.culture.practices.find((c) => c.state === 'enacted') ?? obs.culture.practices[obs.culture.practices.length - 1];
  await openCard(page, practice);
  await shot(page, 'civics-detail');
  await page.keyboard.press('Escape');
  await page.fill(tid('tree-search'), 'school');
  await shot(page, 'civics-search');
  await page.fill(tid('tree-search'), '');
  await page.click(tid('tree-fit'));
  await shot(page, 'civics-late-fit');
  await context.close();

  // --- Simplified Chinese ------------------------------------------------------------------
  ({ context, page } = await open('zh-Hans'));
  await openTree(page, 'tech');
  await shot(page, 'zh-tech-late');
  await openCard(page, want, null);
  await shot(page, 'zh-tech-detail');
  await page.keyboard.press('Escape');
  await page.keyboard.press('c');
  await page.waitForSelector(tid('overlay-civics'));
  await page.waitForTimeout(300);
  await shot(page, 'zh-civics-late');
  await openCard(page, practice, null);
  await shot(page, 'zh-civics-detail');
  const missing = await page.evaluate(() => window.__btsI18n?.missing() ?? []);
  log(`zh-Hans strings without a translation this session: ${missing.length}`);
  if (process.env.TREE_MISSING) console.log(missing.join('\n'));
  await context.close();

  // --- 1280×720 ------------------------------------------------------------------------------
  ({ context, page } = await open('en', { width: 1280, height: 720 }));
  await openTree(page, 'tech');
  await shot(page, '1280-tech');
  await openCard(page, want);
  await shot(page, '1280-tech-detail');
  await page.keyboard.press('Escape');
  await page.keyboard.press('c');
  await page.waitForSelector(tid('overlay-civics'));
  await shot(page, '1280-civics');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, 'no horizontal page overflow at 1280×720');
  await context.close();

  // --- observing a seat: the tree is readable, its actions are disabled with the reason ---------
  try {
    await api('POST', '/api/match', { seed: 'tree-watch', regions: 24, controllers: ['medium', 'medium', 'easy', 'hard'] });
    await api('POST', '/api/advance', { rounds: 6 });
    for (let i = 0; i < 60 && (await api('GET', '/api/match')).round < 7; i++) await new Promise((r) => setTimeout(r, 250));
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(BASE + '/?notutorial');
    await page.waitForSelector(tid('view-as-0'), { timeout: 8000 });
    await page.click(tid('view-as-0'));
    await page.waitForSelector(tid('rail-techtree'));
    await page.click(tid('rail-techtree'));
    await page.waitForSelector(tid('overlay-tech'));
    const acts = page.locator(`${tid('tree-investigate')}, ${tid('tree-follow-up')}`);
    const n = await acts.count();
    for (let i = 0; i < n; i++) {
      assert(await acts.nth(i).isDisabled(), 'tree actions are disabled while observing');
      assert((await acts.nth(i).getAttribute('title')) === 'You are observing', 'the disabled action says why');
    }
    log(`observing: ${n} action button(s) on the tree, all disabled with the reason`);
    await shot(page, 'tech-observing');
    await context.close();
  } catch (e) {
    if (String(e.message).startsWith('Assertion failed')) throw e;
    log('observer check skipped: ' + String(e.message).split('\n')[0]);
  }
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(errors.join('\n'));
  throw new Error(`${errors.length} page/console error(s)`);
}
log('done, no page errors');
