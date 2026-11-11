// Ruleset 3.0 screenshots of goods, works and productivity, from a saved observation.
//
//   cd apps/web && node scripts/construction-r3-shots.mjs [fixture.json]
//
// Serves the client with Vite and answers its /api calls from the fixture (default
// ../../.scratch/obs_huge_late.json): one human seat, nothing is sent anywhere. For
// English and Simplified Chinese at 1440×900 and 1280×720 it opens the regional works
// view (productivity by region, one works' posts and yield, the build list with lines
// and eras), the economy ledger's grouped market, the economy panel (grouped goods and
// productivity), the military panel's generations and the region inspector, and writes
// them to screenshots/r3-economy/. The inspector region is given an epidemic (marked
// "injected" in the file name) so the outbreak notice can be seen.
//
// Env: PORT (Vite, default 5197), SHOTS (default screenshots/r3-economy), LANGS, SIZES,
//      REGION (works region id; default the capital), WORK (works kind), BUILD (facility kind).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = resolve(process.argv[2] ?? resolve(root, '../../.scratch/obs_huge_late.json'));
const port = Number(process.env.PORT ?? 5197);
const out = resolve(root, process.env.SHOTS ?? 'screenshots/r3-economy');
const langs = (process.env.LANGS ?? 'en,zh-Hans').split(',');
const sizes = (process.env.SIZES ?? '1440x900,1280x720').split(',').map((s) => s.split('x').map(Number));
mkdirSync(out, { recursive: true });

const obs = JSON.parse(readFileSync(fixture, 'utf8'));
const own = obs.regions.filter((r) => r.own);
const regionId = Number(process.env.REGION ?? obs.civ.capital);
const region = own.find((r) => r.id === regionId) ?? own[0];
// the works with the largest saving, and a land works with a yield factor
const chain = (f) => (f.posts_base ?? 0) - (f.posts_after_productivity ?? 0);
const work = process.env.WORK ?? [...region.own.facilities].sort((a, b) => chain(b) - chain(a))[0]?.kind;
const landRegion = own.find((r) => r.own.facilities.some((f) => f.yield_factors?.length)) ?? region;
const buildKind = process.env.BUILD ?? (obs.catalog.facilities.find((f) => f.kind === 'textile_mill') ? 'textile_mill' : obs.catalog.facilities[0].kind);
// an epidemic on the inspected region, so the notice is on screen
const inspectRegion = landRegion;
const patched = structuredClone(obs);
patched.regions.find((r) => r.id === inspectRegion.id).outbreak = { since: obs.month - 14, severity_band: 2 };

const seats = [obs.seat, ...obs.others.map((o) => o.seat)].sort((a, b) => a - b);
const summary = {
  exists: true, match_id: obs.match_id, seed: 'fixture', regions: obs.world.region_count, round: obs.round, month: obs.month,
  months_per_round: obs.months_per_round, horizon: obs.horizon, phase: obs.phase, window: obs.window, finished: false, winner: null,
  waiting_on: [obs.seat], date: obs.date, calendar: obs.calendar, versions: [obs.protocol_version],
  seats: seats.map((s) => {
    const o = obs.others.find((x) => x.seat === s);
    return s === obs.seat
      ? { seat: s, name: obs.civ.name, color: obs.civ.color, controller: 'human', status: 'active', token: 'fixture' }
      : { seat: s, name: o?.name ?? `Seat ${s}`, color: o?.color ?? '#888', controller: 'native_medium', status: o?.status ?? 'active' };
  }),
};

const vite = await createServer({
  root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error',
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null },
});
await vite.listen();
const browser = await chromium.launch();
const errors = [];
const tid = (id) => `[data-testid="${id}"]`;

async function route(page, data) {
  await page.route('**/api/**', (r) => {
    const url = new URL(r.request().url());
    const path = url.pathname;
    const json = (body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/api/match')) return json(summary);
    if (path.endsWith('/api/observation')) return json(data);
    if (path.endsWith('/api/saves')) return json({ saves: [] });
    if (path.endsWith('/api/actions')) return json({ receipts: [] });
    return json({});
  });
}

{
  // first load lets Vite optimise dependencies (it reloads the page when it does)
  const page = await browser.newPage();
  await route(page, patched);
  await page.goto(`http://127.0.0.1:${port}/?notitle`).catch(() => {});
  await page.waitForTimeout(4000);
  await page.close();
}

/** Scroll only the nearest scrolling box (never the window) so `selector` sits near its top. */
async function reveal(page, selector, offset = 8) {
  await page.$eval(selector, (el, off) => {
    let box = el.parentElement;
    while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
    if (box) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - off;
    window.scrollTo(0, 0);
  }, offset).catch(() => {});
}

async function shot(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(out, name + '.png') });
  console.log('  ' + name);
}

for (const lang of langs) {
  for (const [w, h] of sizes) {
    const tag = `${lang}-${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await ctx.addInitScript((loc) => { try { localStorage.setItem('bts.locale', loc); } catch { /* */ } }, lang);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${tag}] ${e}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
    await route(page, patched);
    await page.goto(`http://127.0.0.1:${port}/?notitle`);
    await page.waitForSelector(tid('map-canvas'), { timeout: 40000 });
    await page.waitForTimeout(900);
    for (const b of await page.$$(tid('panel-close'))) await b.click().catch(() => {});

    // regional works: productivity by region
    await page.click(tid('rail-works'));
    await page.waitForSelector(tid('overlay-works'));
    await page.click(tid(`works-region-${region.id}`));
    await page.click(tid('works-tab-productivity'));
    await shot(page, `${tag}-01-productivity-region`);
    await reveal(page, tid('prod-matrix'));
    await shot(page, `${tag}-02-productivity-matrix-works`);

    // one works: posts chain
    await page.click(tid('works-tab-works'));
    if (work) await page.click(tid(`work-row-${work}`)).catch(() => {});
    await reveal(page, `[data-testid^="works-labour-"]`, 40);
    await shot(page, `${tag}-03-productivity-works`);

    // a land works: yield factors
    await page.click(tid(`works-region-${landRegion.id}`));
    await page.click(tid('works-tab-works'));
    await page.click(tid('work-row-fields')).catch(() => {});
    await reveal(page, tid('works-labour-fields'), 20);
    await shot(page, `${tag}-04-works-yield-fields`);

    // the build list with lines and eras
    await page.click(tid(`works-region-${region.id}`));
    await page.click(tid('works-tab-build'));
    await page.click(tid('build-filter-all'));
    await page.click(tid(`build-card-${buildKind}`)).catch(() => {});
    await shot(page, `${tag}-05-works-build-lines`);
    await page.click(tid('works-close'));

    // the ledger's market, grouped
    await page.click(tid('rail-ledger'));
    await page.waitForSelector(tid('economy-ledger'));
    await shot(page, `${tag}-06-ledger-goods-groups`);
    await reveal(page, '.ledger-group:nth-of-type(5)', 0);
    await shot(page, `${tag}-07-ledger-goods-groups-lower`);
    await page.click(tid('ledger-close'));

    // the economy panel
    await page.click(tid('rail-economy'));
    await page.waitForSelector(tid('panel-economy'));
    await shot(page, `${tag}-08-economy-panel-goods`);
    await reveal(page, tid('prod-civ'), 120);
    await shot(page, `${tag}-09-economy-panel-productivity`);

    // the military panel: generations
    await page.click(tid('rail-military'));
    await page.waitForSelector(tid('panel-military'));
    await reveal(page, tid('unit-tier'), 60);
    await shot(page, `${tag}-10-military-generations`);
    await page.click(tid('panel-close')).catch(() => {});

    // the inspector, with an injected epidemic
    await page.click(tid('rail-works'));
    await page.click(tid(`works-region-${inspectRegion.id}`));
    await page.click('.wrh-links .linklike');
    await page.waitForSelector(tid('inspector'));
    await shot(page, `${tag}-11-inspector-injected-outbreak`);
    await reveal(page, tid('prod-mini'), 60);
    await shot(page, `${tag}-12-inspector-productivity`);
    await reveal(page, tid('inspector-deposits'), 160);
    await shot(page, `${tag}-13-inspector-survey`);
    if (lang !== 'en') {
      const miss = await page.evaluate(() => window.__btsI18n?.missing?.() ?? []);
      if (miss.length) console.log(`  [${tag}] ${miss.length} strings without a translation:\n    ` + miss.join('\n    '));
    }
    await ctx.close();
  }
}

await browser.close();
await vite.close();
console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'no page errors');
process.exit(errors.length ? 1 : 0);
