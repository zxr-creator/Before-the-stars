// The Solar System layer in the running game: the zoom sequence from the planet's surface out to
// the outer system, a site card and the flat schematic, in English and Simplified Chinese at
// 1440x900 and 1280x720. A last pass feeds the client sample `space` fields (the engine does not
// send them yet) to show how owned sites, stations, shipments and boost will appear; those files
// are named `fixture-*`.
//
//   target/release/bts serve --port 7992 --fresh --web apps/web/dist --saves <dir> &
//   BTS_URL=http://127.0.0.1:7992 node apps/web/scripts/space-shots.mjs [rounds]
//
// PNGs go to apps/web/screenshots/space/ (git-ignored). Any page error fails the run.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7992';
const ROUNDS = Number(process.argv[2] ?? 40);
const OUT = fileURLToPath(new URL('../screenshots/space/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const tid = (id) => `[data-testid="${id}"]`;
async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

await api('POST', '/api/match', { seed: 'space-shots', regions: 48, world: 'earth_like', calendar: 'standard', controllers: ['human', 'medium', 'medium', 'medium'] });
await api('POST', '/api/delegate', { seat: 0, domains: ['economy', 'research', 'education', 'culture', 'expansion', 'military'] });
for (let i = 0; i < ROUNDS; i++) {
  const m = await api('POST', '/api/ready', { seat: 0, through_round: true });
  if (m.finished) break;
}
const obs0 = await api('GET', '/api/observation?seat=0');
console.log(`seat 0 at round ${obs0.round}, ${obs0.date?.label ?? 'month ' + obs0.month}`);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const timings = [];

async function open(size, lang, tier, fixture) {
  const [width, height] = size;
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(([l, tr]) => {
    try { localStorage.setItem('bts.tutorial.off', '1'); localStorage.setItem('bts.locale', l); localStorage.setItem('bts.mapTier', tr); } catch { /* ignore */ }
  }, [lang, tier]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebGL|GPU stall|GL_/.test(m.text())) errors.push(m.text()); });
  if (fixture) await page.route('**/api/observation**', async (route) => {
    const res = await route.fetch();
    const o = await res.json();
    o.space = fixture(o);
    await route.fulfill({ response: res, json: o });
  });
  await page.goto(BASE + '/?notitle');
  await page.waitForSelector(tid('map-canvas'));
  await page.waitForTimeout(900);
  await page.keyboard.press('Escape');
  return { ctx, page };
}

const settle = async (page, ms = 1400) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => window.__space?.settle());
  await page.waitForTimeout(120);
};

const QUICK = !!process.env.SPACE_QUICK;
const SIZES = [[[1440, 900], 'en', 'en-1440'], [[1440, 900], 'zh-Hans', 'zh-1440'], [[1280, 720], 'en', 'en-1280'], [[1280, 720], 'zh-Hans', 'zh-1280']];
for (const [size, lang, tag] of QUICK ? SIZES.slice(0, 1) : SIZES) {
  // --- 3D: surface → globe → Earth–Moon → inner system → outer system, and a site card ---
  {
    const { ctx, page } = await open(size, lang, '3d');
    await page.waitForTimeout(5000); // the 3D planet builds
    await page.screenshot({ path: `${OUT}${tag}-3d-01-surface.png` });
    // Wheel out past the whole planet: the view leaves for space.
    const box = await page.locator(tid('map-canvas')).boundingBox();
    // (Map labels and badges take their own pointer events, so wheel over bare ground, trying a
    // second spot if the first is covered.)
    for (const [fx, fy] of [[0.5, 0.5], [0.66, 0.74], [0.35, 0.3]]) {
      await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
      for (let i = 0; i < 16 && !(await page.$(tid('space-layer'))); i++) { await page.mouse.wheel(0, 240); await page.waitForTimeout(90); }
    }
    if (!(await page.$(tid('space-layer')))) errors.push(`${tag}: wheeling out did not open the Solar System`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}${tag}-3d-02-leaving.png` });
    await settle(page, 1800);
    await page.screenshot({ path: `${OUT}${tag}-3d-03-globe.png` });
    await page.click(tid('map-scale-orbit'));
    await settle(page);
    await page.screenshot({ path: `${OUT}${tag}-3d-04-earth-moon.png` });
    await page.evaluate(() => window.__space.goBand('inner'));
    await settle(page);
    await page.screenshot({ path: `${OUT}${tag}-3d-05-inner.png` });
    await page.click(tid('map-scale-system'));
    await settle(page);
    await page.screenshot({ path: `${OUT}${tag}-3d-06-outer.png` });
    timings.push([tag + ' 3d', await page.evaluate(() => window.__space.lastDrawMs()), await page.evaluate(() => window.__space.tier())]);
    // Jupiter's moons and a site card.
    await page.evaluate(() => { window.__space.focus('jupiter'); window.__space.select('body', 'jupiter'); });
    await settle(page);
    await page.screenshot({ path: `${OUT}${tag}-3d-07-jupiter.png` });
    await page.evaluate(() => { window.__space.focus('mars'); window.__space.select('site', 'arcadia_planitia'); });
    await settle(page);
    await page.screenshot({ path: `${OUT}${tag}-3d-08-site-card.png` });
    // Back to the planet.
    await page.keyboard.press('Escape');
    await page.click(tid('map-scale-planet'));
    await page.waitForTimeout(1200);
    if (await page.$(tid('space-layer'))) errors.push(`${tag}: the planet switch did not close the Solar System`);
    await ctx.close();
  }
  // --- flat: atlas → schematic, the Moon's sites and the whole system ---
  {
    const { ctx, page } = await open(size, lang, 'flat');
    await page.click(tid('map-fit'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}${tag}-flat-01-atlas.png` });
    for (let i = 0; i < 12 && !(await page.$(tid('space-layer'))); i++) { await page.click(tid('map-zoom-out')); await page.waitForTimeout(120); }
    if (!(await page.$(tid('space-layer')))) errors.push(`${tag}: zooming out did not open the flat Solar System`);
    await settle(page, 1600);
    await page.screenshot({ path: `${OUT}${tag}-flat-02-globe.png` });
    await page.click(tid('map-scale-orbit'));
    await settle(page);
    await page.screenshot({ path: `${OUT}${tag}-flat-03-earth-moon.png` });
    await page.click(tid('map-scale-system'));
    await settle(page);
    await page.screenshot({ path: `${OUT}${tag}-flat-04-system.png` });
    timings.push([tag + ' flat', await page.evaluate(() => window.__space.lastDrawMs()), await page.evaluate(() => window.__space.tier())]);
    await page.evaluate(() => { window.__space.focus('moon', 7); window.__space.select('site', 'shackleton_rim'); });
    await settle(page);
    await page.screenshot({ path: `${OUT}${tag}-flat-05-moon-card.png` });
    // Idle cost: no frames while nothing changes.
    const idle = await page.evaluate(async () => {
      let frames = 0;
      const t0 = performance.now();
      const orig = window.requestAnimationFrame;
      window.requestAnimationFrame = (cb) => { frames++; return orig(cb); };
      await new Promise((r) => setTimeout(r, 2000));
      window.requestAnimationFrame = orig;
      return { frames, ms: performance.now() - t0 };
    });
    timings.push([tag + ' flat idle rAF calls in 2 s', idle.frames]);
    await page.keyboard.press('Home');
    await page.waitForTimeout(1000);
    if (await page.$(tid('space-layer'))) errors.push(`${tag}: Home did not return to the planet`);
    await ctx.close();
  }
}

// --- sample engine fields (not sent by the engine yet): owned sites, stations, a shipment, boost ---
const fixture = (o) => {
  const others = o.others.map((x) => x.seat);
  return {
    boost: { stock: 4800, cap: 7200, made_last: 1600, spent_last: 900, failure_rate_bp: 200, by_stage: [{ stage: 'Launch complex', levels: 2, made: 1600, standing_down: false }] },
    sites: [
      { site: 'shackleton_rim', owner: o.seat, surveyed: true, population: 42000, housing: 52000, works: [{ kind: 'Ice works', level: 3 }, { kind: 'Propellant plant', level: 2 }], deposits: [{ kind: 'volatiles', remaining: 296e6, quality_bp: 9000, epistemic: 'verified' }] },
      { site: 'mare_imbrium', owner: others[0] ?? null, population_low: 8000, population_high: 15000 },
      { site: 'arcadia_planitia', owner: o.seat, population: 120000, housing: 200000 },
      { site: 'ceres', owner: others[1] ?? null },
    ],
    stations: [
      { id: 1, orbit: 'leo', owner: o.seat, core: 'K2', modules: [{ kind: 'Habitat' }, { kind: 'Shipyard' }, { kind: 'Docking and depot' }], aboard: 2200 },
      { id: 2, orbit: 'leo', owner: others[0] ?? o.seat, core: 'K1' },
      { id: 3, orbit: 'eml1', owner: o.seat, core: 'K1', modules: [{ kind: 'Docking and depot' }] },
    ],
    transfers: [{ id: 7, owner: o.seat, from_zone: 'earth_orbit', to_zone: 'mars', payload_t: 2000, people: 600, departed: o.month - 3, arrives: o.month + 5 }],
    windows: [{ zone: 'mars', open: false, opens_in: 9 }],
  };
};
for (const [size, lang, tag] of [[[1440, 900], 'en', 'en-1440'], [[1440, 900], 'zh-Hans', 'zh-1440']]) {
  const { ctx, page } = await open(size, lang, 'flat', fixture);
  await page.screenshot({ path: `${OUT}fixture-${tag}-topbar-boost.png`, clip: { x: 0, y: 0, width: size[0], height: 64 } });
  if (!(await page.$(tid('yield-boost')))) errors.push(`${tag}: the boost counter did not appear with boost in the observation`);
  await page.hover(tid('yield-boost')).catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}fixture-${tag}-boost-tip.png`, clip: { x: Math.max(0, size[0] - 900), y: 0, width: 900, height: 420 } });
  await page.mouse.move(size[0] / 2, size[1] / 2);
  await page.click(tid('map-scale-orbit'));
  await settle(page, 1800);
  await page.evaluate(() => window.__space.select('orbit', 'leo'));
  await settle(page);
  await page.screenshot({ path: `${OUT}fixture-${tag}-earth-orbit-stations.png` });
  await page.evaluate(() => window.__space.goBand('inner'));
  await page.evaluate(() => window.__space.select('site', 'arcadia_planitia'));
  await settle(page);
  await page.screenshot({ path: `${OUT}fixture-${tag}-inner-owned.png` });
  await ctx.close();
}
// Without boost the counter stays hidden.
{
  const { ctx, page } = await open([1280, 720], 'en', 'flat');
  if (await page.$(tid('yield-boost'))) errors.push('the boost counter appeared without boost in the observation');
  await ctx.close();
}

// The observer's world view opens the Solar System too (read-only: there is nothing to order).
if (!QUICK) {
  await api('POST', '/api/match', { seed: 'space-shots-watch', regions: 48, world: 'earth_like', calendar: 'standard', controllers: ['hard', 'medium', 'medium', 'easy'] });
  for (let i = 0; i < 4; i++) await api('POST', '/api/advance', { rounds: 10 });
  for (const [tier, name] of [['flat', 'observer-flat-globe'], ['3d', 'observer-3d-system']]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((tr) => { try { localStorage.setItem('bts.tutorial.off', '1'); localStorage.setItem('bts.locale', 'en'); localStorage.setItem('bts.mapTier', tr); } catch { /* ignore */ } }, tier);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(BASE + '/?notitle');
    await page.waitForSelector(tid('observer-console'), { timeout: 60000 });
    await page.waitForTimeout(tier === '3d' ? 5000 : 1200);
    await page.click(tid(tier === 'flat' ? 'map-scale-orbit' : 'map-scale-system'));
    await settle(page, 2200);
    if (tier === 'flat') await page.evaluate(() => window.__space.goBand('globe'));
    await settle(page);
    await page.screenshot({ path: `${OUT}${name}.png` });
    await ctx.close();
  }
}

await browser.close();
for (const t of timings) console.log('timing', ...t);
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('screenshots in', OUT);
