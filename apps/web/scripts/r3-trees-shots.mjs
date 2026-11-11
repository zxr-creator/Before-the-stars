// Screenshots and checks of the deeper trees (ruleset 3.0 slices 6b/6c) against a running
// referee: the late-game technology tree (cards and era overview), a rival-family card with
// its lock, the revisit study, fragile know-how, investigation lines, the civics tree with
// the institutional load meter and an exclusive group, the repeal action, and the knowledge
// and culture panels. English and Simplified Chinese, 1440×900 and 1280×720.
//
//   source scripts/env.sh
//   target/release/bts serve --port 7993 --web apps/web/dist --saves <dir> --fresh &
//   (cd apps/web && BTS_URL=http://127.0.0.1:7993 node scripts/r3-trees-shots.mjs)
//
// It creates its own match (replacing whatever the referee holds), plays a delegated seat
// forward (ROUNDS, default 510), writes apps/web/screenshots/r3-trees/*.png and fails on a
// broken information rule or any page or console error:
//   - the chart places exactly the disclosed cards, and renders only disclosed ones;
//   - a family block lists exactly the card and the rivals the referee disclosed;
//   - the encyclopedia passage of a new (doc 39) card is the content passage for that card,
//     and no passage is on screen without an open card;
//   - the era banner stays absent while the referee sends no era.
// The era screen is also rendered once from a sample observation (the referee does not
// send eras yet), written as era-preview-*.png.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7993';
const ROUNDS = Number(process.env.ROUNDS ?? 510);
const OUT = fileURLToPath(new URL('../screenshots/r3-trees/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const content = (p) => JSON.parse(readFileSync(fileURLToPath(new URL('../../../content/' + p, import.meta.url)), 'utf8'));
const TECHS = content('technologies.json');
const LORE = new Map(content('lore/technologies.json').map((e) => [e.id, e]));
const NEW_IDS = new Set(TECHS.filter((t) => Number(t.id.slice(1)) >= 183).map((t) => t.id));
const idOf = new Map(TECHS.map((t) => [t.name, t.id]));

const errors = [];
const log = (...a) => console.log('[r3-trees]', ...a);
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
const tid = (id) => `[data-testid="${id}"]`;

// The trees need no WebGL; software GL only slows the screenshots of a large chart.
const browser = await chromium.launch();

async function open(locale, size) {
  const context = await browser.newContext({ viewport: size });
  await context.addInitScript((loc) => {
    try {
      localStorage.setItem('bts.locale', loc);
      localStorage.setItem('bts.tutorial.off', '1');
      localStorage.setItem('bts.audio', JSON.stringify({ muted: true }));
    } catch { /* ignore */ }
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
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}${name}.png` });
  log('wrote', `${name}.png`);
}
async function openTree(page, which) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.click(tid(which === 'tech' ? 'rail-techtree' : 'rail-civics'));
  await page.waitForSelector(tid(which === 'tech' ? 'overlay-tech' : 'overlay-civics'));
  await page.waitForTimeout(400);
}
async function openCard(page, name) {
  await page.fill(tid('tree-search'), name);
  await page.press(tid('tree-search'), 'Enter');
  await page.waitForSelector(tid('tree-detail'));
  await page.fill(tid('tree-search'), '');
  await page.waitForTimeout(350);
}
/** Scroll the open drawer (only the drawer) so that `selector` sits at its top. */
async function scrollDrawerTo(page, selector) {
  await page.evaluate((sel) => {
    const body = document.querySelector('[data-testid="tree-detail"] .tree-drawer-body');
    const el = body?.querySelector(sel);
    if (body && el) body.scrollTop += el.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
  }, selector);
  await page.waitForTimeout(150);
}
async function assertExactCards(page, handles, what) {
  const placed = Number(await page.getAttribute(tid('tree-viewport'), 'data-cards'));
  assert(placed === handles.length, `${what}: the chart places exactly the disclosed cards (${placed} vs ${handles.length})`);
  const shown = await page.$$eval(`${tid('tree-card')}, ${tid('tree-lead')}`, (els) => els.map((e) => e.getAttribute('data-handle')));
  const known = new Set(handles);
  assert(shown.length > 0 && shown.every((h) => known.has(h)), `${what}: every rendered card is a disclosed one`);
  return { placed, rendered: shown.length };
}

// --- a late game ---------------------------------------------------------------------------
// Matches differ in how far their research gets; take the first seed that reaches a deep tree.
const MIN_TECHS = Number(process.env.MIN_TECHS ?? 150);
async function play(seed) {
  await api('POST', '/api/match', { seed, regions: 24, controllers: ['human', 'hard', 'medium', 'medium'] });
  await api('POST', '/api/delegate', { seat: 0, token: '', domains: ['economy', 'research', 'education', 'culture', 'expansion', 'military'] });
  for (let i = 0; i < ROUNDS; i++) {
    const m = await api('POST', '/api/ready', { seat: 0, token: '', through_round: true });
    if (m?.finished) break;
  }
  await api('POST', '/api/delegate', { seat: 0, token: '', domains: [] });
  const o = await getObs();
  // a rival still to be learned that the installed base holds back, for the lock and revisit shots
  const held = o.knowledge.techs.some((c) => c.family_view && c.state !== 'understood' && c.state !== 'prototyped' && c.state !== 'adopted' && c.family_view.incumbent && c.family_view.incumbent !== c.handle && c.family_view.lock_e_bp < 10000);
  log(`seed ${seed}: ${o.knowledge.techs.length} technologies after ${ROUNDS} rounds${held ? ', a held-back rival' : ''}`);
  return { deep: o.knowledge.techs.length >= MIN_TECHS, held };
}
let chosen = false;
let fallback = null;
for (const seed of (process.env.SEED ?? 'trees-b,trees-e,trees-f,trees').split(',')) {
  const r = await play(seed);
  if (r.deep && r.held) { chosen = true; break; }
  if (r.deep && !fallback) fallback = seed;
}
// No seed had both: replay the first deep one (matches vary from run to run).
if (!chosen && fallback) await play(fallback);
let obs = await getObs();
const techIds = (o) => [...o.knowledge.techs.map((c) => c.handle), ...o.knowledge.leads.map((l) => 'lead-' + l.handle)];
log(`round ${obs.round}: ${obs.knowledge.techs.length} technologies (${obs.knowledge.techs.filter((c) => c.family_view).length} in a family), ${obs.culture.practices.length} practices, lines ${obs.knowledge.investigation_lines}, load ${JSON.stringify(obs.culture.load)}, slots ${obs.culture.reform_slots}`);
assert(!obs.era, 'this referee sends no era yet (the banner check below relies on it)');

const byHandle = new Map(obs.knowledge.techs.map((c) => [c.handle, c]));
const open_ = (c) => c.state === 'discovered' || c.state === 'hinted';
const locked = obs.knowledge.techs.find((c) => c.family_view && open_(c) && c.family_view.incumbent && c.family_view.incumbent !== c.handle && c.family_view.lock_e_bp < 10000 && !c.family_view.revisit_active)
  ?? obs.knowledge.techs.find((c) => c.family_view && c.family_view.lock_e_bp < 10000);
const fresh = obs.knowledge.techs.find((c) => NEW_IDS.has(idOf.get(c.name)) && c.state !== 'hinted') ?? obs.knowledge.techs.find((c) => NEW_IDS.has(idOf.get(c.name)));
const pracs = new Map(obs.culture.practices.map((p) => [p.handle, p]));
const HELD = new Set(['reforming', 'enacted', 'established']);
const blocked = obs.culture.practices.find((p) => p.state === 'recognized' && (p.exclusive_with ?? []).some((h) => HELD.has(pracs.get(h)?.state) && pracs.get(h)?.state !== 'reforming'));
const holder = blocked ? (blocked.exclusive_with ?? []).map((h) => pracs.get(h)).find((p) => p && (p.state === 'enacted' || p.state === 'established')) : null;
log(`family card: ${locked?.name ?? '-'}; new card: ${fresh?.name ?? '-'}; exclusive: ${blocked?.name ?? '-'} (held: ${holder?.name ?? '-'})`);

try {
  for (const [locale, size, tag] of [['en', { width: 1440, height: 900 }, 'en-1440'], ['zh-Hans', { width: 1440, height: 900 }, 'zh-1440'], ['en', { width: 1280, height: 720 }, 'en-1280'], ['zh-Hans', { width: 1280, height: 720 }, 'zh-1280']]) {
    const { context, page } = await open(locale, size);
    const big = tag.endsWith('1440');
    assert(await page.locator(tid('era-banner')).count() === 0, 'no era banner while the referee sends no era');
    await openTree(page, 'tech');
    obs = await getObs();
    const counts = await assertExactCards(page, techIds(obs), `tech tree (${tag})`);
    if (tag === 'en-1440') log(`tech tree: ${counts.placed} cards placed, ${counts.rendered} rendered near the view`);
    if (tag === 'en-1440') assert(counts.rendered < counts.placed, 'off-screen cards are not rendered');
    assert(await page.locator(tid('lore')).count() === 0, 'no encyclopedia passage without an open card');
    await shot(page, `${tag}-tech-late`);
    await page.click(tid('tree-level-overview'));
    await page.waitForSelector(tid('tree-cell'));
    assert(await page.locator(tid('tree-card')).count() === 0, 'the era overview shows counts, not cards');
    await shot(page, `${tag}-tech-overview`);
    if (big) {
      await page.click(tid('tree-level-band'));
      await shot(page, `${tag}-tech-bands`);
      await page.click(tid('tree-filter-rival'));
      await shot(page, `${tag}-tech-filter-rival`);
      await page.click(tid('tree-filter-clear'));
      await page.click(tid('tree-level-cards'));
    }

    if (locked) {
      await openCard(page, locked.name);
      const fam = page.locator(`${tid('tree-detail')} ${tid('family-block')}`);
      assert(await fam.count() === 1, 'the family card shows its family block');
      const members = await fam.locator('.family-members li').count();
      assert(members === 1 + locked.family_view.rivals_discovered.length, `the family block lists the card and exactly its disclosed rivals (${members})`);
      await shot(page, `${tag}-family-card`);
      await scrollDrawerTo(page, tid('family-block'));
      await shot(page, `${tag}-family-lock`);
      if (big) {
        await scrollDrawerTo(page, '.family-revisit');
        await shot(page, `${tag}-revisit`);
      }
    }
    if (fresh) {
      await openCard(page, fresh.name);
      const id = idOf.get(fresh.name);
      const want = LORE.get(id)?.[locale === 'en' ? 'en' : 'zh-Hans']?.intro;
      await page.waitForSelector(`${tid('tree-detail')} ${tid('lore')}`, { timeout: 8000 });
      const shown = (await page.textContent(`${tid('tree-detail')} .lore-intro`)).trim();
      assert(shown === want, `the passage of the new card ${id} resolves through the normal content path (${locale})`);
      assert(await page.locator(tid('lore')).count() === 1, 'exactly one passage on screen');
      if (big) await shot(page, `${tag}-new-card-lore`);
    }

    await openTree(page, 'civics');
    await assertExactCards(page, obs.culture.practices.map((c) => c.handle), `civics tree (${tag})`);
    assert(await page.locator(tid('load-meter')).count() === 1, 'the civics header shows the institutional load meter');
    await shot(page, `${tag}-civics`);
    if (blocked) {
      await openCard(page, blocked.name);
      await page.waitForSelector(`${tid('tree-detail')} ${tid('practice-rules')}`);
      await scrollDrawerTo(page, tid('practice-rules'));
      await shot(page, `${tag}-civics-exclusive`);
    }
    if (big) {
      await page.keyboard.press('Escape');
      await page.click(tid('tree-fit'));
      await shot(page, `${tag}-civics-overview`);
    }

    if (big) {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.click(tid('rail-knowledge'));
      await page.waitForSelector('.panel.knowledge');
      await shot(page, `${tag}-knowledge-lines`);
      await page.click(tid('rail-culture'));
      await page.waitForSelector('.panel.culture');
      await shot(page, `${tag}-culture-load`);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert(!overflow, `no horizontal page overflow at ${size.width}×${size.height}`);
    await context.close();
  }

  // --- actions: revisit study, repeal, and the refusal when every line is in use -------------
  {
    const { context, page } = await open('en', { width: 1440, height: 900 });
    await openTree(page, 'tech');
    if (locked && !locked.family_view.revisit_active && open_(locked)) {
      await openCard(page, locked.name);
      await scrollDrawerTo(page, '.family-revisit');
      const btn = page.locator(`${tid('tree-detail')} ${tid('fund-revisit')}`);
      if (await btn.isEnabled()) {
        await Promise.all([page.waitForResponse((r) => r.url().includes('/api/observation')), btn.click()]);
        await page.waitForTimeout(400);
        const now = await getObs();
        assert(now.projects.some((p) => p.kind === 'revisit' && p.target === locked.handle), 'Fund revisit study starts a revisit project for that card');
        await scrollDrawerTo(page, '.family-revisit');
        await shot(page, 'en-1440-revisit-funded');
      }
    }
    // Fill the investigation lines, then the next one is refused with the reason on the card.
    obs = await getObs();
    const lines = obs.knowledge.investigation_lines ?? 0;
    const startable = obs.knowledge.techs.filter((c) => c.can_investigate && c.state === 'discovered' && !obs.projects.some((p) => p.kind === 'research' && p.target === c.handle));
    let running = obs.projects.filter((p) => p.kind === 'research' && !p.paused).length;
    while (running < lines && startable.length > 1) {
      const c = startable.shift();
      const r = await api('POST', '/api/actions', { seat: 0, token: '', actions: [{ kind: 'start_project', spec: { kind: 'research', tech: c.handle }, priority: null }] }).catch(() => null);
      if (!r || !r.receipts?.every((x) => x.status === 'accepted' || x.status === 'applied')) break;
      running += 1;
    }
    obs = await getObs();
    running = obs.projects.filter((p) => p.kind === 'research' && !p.paused).length;
    if (running >= lines && startable.length) {
      const c = startable[0];
      const r = await api('POST', '/api/actions', { seat: 0, token: '', actions: [{ kind: 'start_project', spec: { kind: 'research', tech: c.handle }, priority: null }] }).catch((e) => ({ error: String(e) }));
      log('referee on a full set of lines:', JSON.stringify(r).slice(0, 240));
      assert(JSON.stringify(r).includes('every investigation line is in use'), 'the referee refuses an investigation beyond the lines, with its reason');
      await page.reload();
      await page.waitForSelector(tid('rail-techtree'));
      await openTree(page, 'tech');
      await openCard(page, c.name);
      const why = await page.textContent(`${tid('tree-detail')} ${tid('tree-detail-investigate')}`).catch(() => '');
      assert(await page.locator(`${tid('tree-detail')} ${tid('tree-detail-investigate')}`).isDisabled(), 'Investigate is disabled when every line is in use');
      void why;
      await shot(page, 'en-1440-lines-full');
    }
    // Repeal the held member of an exclusive group.
    if (blocked && holder) {
      await openTree(page, 'civics');
      await openCard(page, blocked.name);
      await scrollDrawerTo(page, tid('practice-rules'));
      const btn = page.locator(`${tid('tree-detail')} ${tid('practice-rules')} ${tid('repeal')}`).first();
      if (await btn.count() && await btn.isEnabled()) {
        await Promise.all([page.waitForResponse((r) => r.url().includes('/api/observation')), btn.click()]);
        await page.waitForTimeout(400);
        const now = await getObs();
        assert(now.projects.some((p) => p.kind === 'repeal' && p.target === holder.handle), 'Repeal starts a repeal project for the held member');
        await scrollDrawerTo(page, tid('practice-rules'));
        await shot(page, 'en-1440-repeal-begun');
      }
    }
    await context.close();
  }

  // --- the era screen from a sample observation (the referee sends no era yet) ---------------
  for (const [locale, tag] of [['en', 'en'], ['zh-Hans', 'zh']]) {
    const { context, page } = await open(locale, { width: 1440, height: 900 });
    const real = await getObs();
    const sample = {
      ...real,
      era: {
        era: 5, since: real.month - 420, transition: { until: real.month + 60, strain: 3, score: 61, parts: [{ label: 'Food', points: 22, max: 25 }, { label: 'Order', points: 14, max: 25 }, { label: 'Modernization', points: 18, max: 25 }, { label: 'Integrity', points: 7, max: 25 }] },
        age: null, can_choose_charter: true,
        charters: [
          { key: 'mass_mobilization', name: 'Mass Mobilization', effect: 'Recruit room +50%; fit-out points +20%', cost: 'Consumption level forced to at most 9,000', held: true },
          { key: 'welfare_state', name: 'Welfare State', effect: 'Stability +4; smaller families slow growth less', cost: 'Expected basket +15%', held: false },
          { key: 'planned_electrification', name: 'Planned Electrification', effect: 'Generator halls, grid and hydro −30% work', cost: 'Services productivity −300', held: false },
        ],
        next: { era: 6, conditions: [{ text: 'Programmable computers', satisfied: true, handle: null }, { text: 'An undiscovered technology of the Information era in computing', satisfied: false, handle: null }, { text: 'A computing centre operating', satisfied: false, handle: null }] },
      },
      traditions: [
        { slot: 'machine', offered: true, path: 'engine', mastery_bp: 4200, switching: null, options: ['steam', 'engine', 'wire'].map((p) => ({ path: p, available: p !== 'wire', reason: p === 'wire' ? 'A further switch in this slot is refused for 600 months' : null })) },
        { slot: 'frontier', offered: false, path: null, mastery_bp: 0, switching: null, options: [] },
      ],
    };
    await page.route('**/api/observation**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sample) }));
    await page.reload();
    await page.waitForSelector(tid('era-banner'), { timeout: 10000 });
    await shot(page, `era-preview-${tag}-banner`);
    await page.click(tid('era-banner'));
    await page.waitForSelector(tid('overlay-era'));
    await shot(page, `era-preview-${tag}-screen`);
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
