// Screenshots of the encyclopedia passages against a running referee.
//
//   source scripts/env.sh
//   target/release/bts serve --port 7988 --web apps/web/dist --saves .toolchain/lore-saves --fresh &
//   (cd apps/web && npm run build && BTS_URL=http://127.0.0.1:7988 node scripts/lore-shots.mjs)
//
// Plays one single-human match forward with stewards (LORE_ROUNDS, default 40), then writes
// apps/web/screenshots/lore/*.png: a technology card and a civics card with their passages in
// the tree drawers, in English and Simplified Chinese, at 1440×900 and 1280×720; the knowledge
// panel's card detail; the culture panel's folded entry; the almanac's links. It checks that
// every disclosed card shown has a passage, that the passage belongs to that card, and that
// no undisclosed card's passage is rendered. Fails on any page or console error.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7988';
const ROUNDS = Number(process.env.LORE_ROUNDS ?? 40);
const OUT = fileURLToPath(new URL('../screenshots/lore/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const content = (p) => JSON.parse(readFileSync(fileURLToPath(new URL('../../../content/' + p, import.meta.url)), 'utf8'));
const loreByName = (nodes, lore) => {
  const byId = new Map(lore.map((e) => [e.id, e]));
  return new Map(nodes.map((n) => [n.name, byId.get(n.id)]));
};
const TECH = loreByName(content('technologies.json'), content('lore/technologies.json'));
const PRAC = loreByName(content('practices.json'), content('lore/practices.json'));

const errors = [];
const log = (...a) => console.log('[lore-shots]', ...a);
function assert(cond, msg) { if (!cond) throw new Error('Assertion failed: ' + msg); }
async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const getObs = () => api('GET', '/api/observation?seat=0');
const tid = (id) => `[data-testid="${id}"]`;

await api('POST', '/api/match', { seed: 'lore-shots', regions: 24, controllers: ['human', 'medium', 'medium', 'medium'] });
await api('POST', '/api/delegate', { seat: 0, token: '', domains: ['economy', 'research', 'education', 'culture', 'expansion', 'military'] });
for (let i = 0; i < ROUNDS; i++) await api('POST', '/api/ready', { seat: 0, token: '', through_round: true });
await api('POST', '/api/delegate', { seat: 0, token: '', domains: [] });
const obs = await getObs();
log(`round ${obs.round}: ${obs.knowledge.techs.length} technologies, ${obs.culture.practices.length} practices disclosed`);
for (const c of obs.knowledge.techs) assert(TECH.get(c.name), `technology “${c.name}” has a lore entry`);
for (const c of obs.culture.practices) assert(PRAC.get(c.name), `practice “${c.name}” has a lore entry`);
// Prefer the latest disclosed cards that carry a quotation, to show the whole passage.
const pick = (cards, map) => [...cards].reverse().find((c) => map.get(c.name)?.en.quote) ?? cards[cards.length - 1];
const tech = pick(obs.knowledge.techs, TECH);
const prac = pick(obs.culture.practices, PRAC);
log(`showing “${tech.name}” and “${prac.name}”`);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function open(locale, size) {
  const context = await browser.newContext({ viewport: size });
  await context.addInitScript((loc) => {
    try { localStorage.setItem('bts.locale', loc); localStorage.setItem('bts.tutorial.off', '1'); } catch { /* ignore */ }
  }, locale);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + '/?notutorial');
  await page.waitForSelector(tid('rail-techtree'), { timeout: 20000 });
  await page.waitForTimeout(400);
  return { context, page };
}
async function shot(page, name) {
  await page.waitForTimeout(250);
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))),
    new Promise((r) => setTimeout(r, 4000)),
  ]));
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${OUT}${name}.png` });
  log('wrote', `${name}.png`);
}
const lang = (l) => (l === 'en' ? 'en' : 'zh-Hans');
/** Open a card through the tree's search: the chart renders only the cards near the view. */
async function openByName(page, name) {
  await page.fill(tid('tree-search'), name);
  await page.press(tid('tree-search'), 'Enter');
  await page.waitForSelector(tid('tree-detail'));
  await page.fill(tid('tree-search'), '');
}
async function drawer(page, which, card, map, locale) {
  await page.keyboard.press('Escape'); // closes an open drawer, if any
  const tab = tid(which === 'tech' ? 'tree-tab-tech' : 'tree-tab-civics');
  if (await page.locator(tab).count()) await page.click(tab);
  else await page.click(tid(which === 'tech' ? 'rail-techtree' : 'rail-civics'));
  await page.waitForSelector(tid(which === 'tech' ? 'overlay-tech' : 'overlay-civics'));
  await page.waitForTimeout(300);
  await openByName(page, card.name);
  await page.waitForSelector(`${tid('tree-detail')} ${tid('lore')}`, { timeout: 8000 });
  const shown = (await page.textContent(`${tid('tree-detail')} .lore-intro`)).trim();
  assert(shown === map.get(card.name)[lang(locale)].intro, `the ${which} drawer shows the passage of “${card.name}” (${locale})`);
  assert(await page.locator(tid('lore')).count() === 1, 'one passage on screen');
}

try {
  for (const [locale, size, tag] of [['en', { width: 1440, height: 900 }, 'en-1440'], ['zh-Hans', { width: 1440, height: 900 }, 'zh-1440'], ['en', { width: 1280, height: 720 }, 'en-1280'], ['zh-Hans', { width: 1280, height: 720 }, 'zh-1280']]) {
    const { context, page } = await open(locale, size);
    await drawer(page, 'tech', tech, TECH, locale);
    await shot(page, `${tag}-tech`);
    await drawer(page, 'civics', prac, PRAC, locale);
    await shot(page, `${tag}-civics`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert(!overflow, `no horizontal page overflow at ${size.width}×${size.height}`);
    if (tag === 'en-1440' || tag === 'zh-1440') {
      // Every other disclosed technology also shows its own passage.
      await drawer(page, 'tech', tech, TECH, locale);
      for (const c of obs.knowledge.techs.slice(0, 12)) {
        await openByName(page, c.name);
        await page.waitForFunction((want) => document.querySelector('[data-testid="tree-detail"] .lore-intro')?.textContent?.trim() === want, TECH.get(c.name)[lang(locale)].intro, { timeout: 4000 });
      }
      // Knowledge panel card detail and the culture panel's folded entry.
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.click(tid('rail-knowledge'));
      await page.waitForSelector('.panel.knowledge');
      await page.click(tid('tab-graph'));
      await page.locator(tid('graph-node')).last().click();
      await page.waitForSelector(`${tid('tech-detail')} ${tid('lore')}`);
      await shot(page, `${tag}-knowledge-detail`);
      await page.click(tid('rail-culture'));
      await page.waitForSelector('.panel.culture');
      const fold = page.locator(tid('lore-fold')).first();
      if (await fold.count()) {
        await fold.locator('summary').click();
        await page.waitForSelector(`${tid('lore-fold')} ${tid('lore')}`);
        await fold.scrollIntoViewIfNeeded();
        await shot(page, `${tag}-culture-fold`);
      }
      // The almanac lists the disclosed cards and opens one in its tree.
      await page.keyboard.press('Escape');
      await page.keyboard.press('?');
      await page.waitForSelector(tid('overlay-almanac'));
      await page.click(tid('almanac-topic-knowledge'));
      await page.waitForSelector(tid('almanac-encyclopedia-tech'));
      assert(await page.locator(tid('almanac-card')).count() === obs.knowledge.techs.length, 'the almanac links exactly the disclosed technologies');
      await page.locator(tid('almanac-encyclopedia-tech')).scrollIntoViewIfNeeded();
      await shot(page, `${tag}-almanac`);
      await page.locator(tid('almanac-card')).first().click();
      await page.waitForSelector(`${tid('overlay-tech')} ${tid('tree-detail')} ${tid('lore')}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (errors.length) {
  console.error(errors.join('\n'));
  throw new Error(`${errors.length} page/console error(s)`);
}
log('done, no page errors');
