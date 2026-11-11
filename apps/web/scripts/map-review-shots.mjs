// Batch screenshots of the map dev harness on both tiers, for judging legibility.
//
//   BTS_DEV_PORT=5387 npx vite --host 127.0.0.1 --strictPort &      (from apps/web)
//   BTS_DEV_PORT=5387 node scripts/map-review-shots.mjs <subdir> [filter]
//   BTS_DEV_PORT=5387 node scripts/map-review-shots.mjs <subdir> --spec 'name|query|1440x900' ...
//
// Expects a Vite dev server on BTS_DEV_PORT serving /dev/map.html. PNGs go to
// screenshots/<subdir>/. Without --spec the built-in review set is taken: far,
// middle and close zoom, early and late game, 24 and 72 regions, both tiers,
// every map mode, English and Simplified Chinese, 1440x900 and 1280x720.
// [filter] is a substring of the shot names ("flat-", "3d-w72") or a comma-separated
// list of exact names. The 3D tier renders in software here: about two minutes a shot.
// A spec query takes the harness's own parameters plus
//   at=capital|city|industry|farm|coast|<region id>   (resolved from the fixture file)
//   dist=<3D camera distance>  zoom=<flat zoom factor>  hover=<region id>|at  sel=at
//   fit=1  (3D: frame the whole known world; the tier otherwise opens on the capital)
//   drag=<dx>  (after positioning, drag the map dx pixels sideways: e.g. across the date line)
// and the harness's build=1, which queues a few building projects so construction shows.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.BTS_DEV_PORT ?? '5387';
const args = process.argv.slice(2);
const sub = args[0] ?? 'map-review';
const outDir = resolve(root, 'screenshots', sub);
mkdirSync(outDir, { recursive: true });

const obsCache = new Map();
function loadObs(file) {
  if (!obsCache.has(file)) obsCache.set(file, JSON.parse(readFileSync(resolve(root, 'dev/obs', file + '.json'), 'utf8')));
  return obsCache.get(file);
}
const levels = (r, pred) => (r.own?.facilities ?? []).filter(pred).reduce((n, f) => n + f.level, 0);
function resolveAt(file, at) {
  if (!at || !file) return null;
  const o = loadObs(file);
  // Spectator fixtures (?spec=1) carry no catalog and no civilisation of their own.
  const cat = new Map((o.catalog?.facilities ?? []).map((f) => [f.kind, f.category]));
  const own = o.regions.filter((r) => r.own);
  const ind = (r) => levels(r, (f) => ['Industry', 'Power'].includes(cat.get(f.kind)));
  const food = (r) => levels(r, (f) => cat.get(f.kind) === 'Food');
  let r = null;
  if (at === 'capital') r = o.regions.find((x) => x.id === o.civ?.capital);
  else if (at === 'city') r = [...own].sort((a, b) => b.own.population - a.own.population)[0];
  else if (at === 'industry') r = [...own].sort((a, b) => ind(b) - ind(a))[0];
  else if (at === 'farm') r = [...own].sort((a, b) => (food(b) - ind(b) * 3) - (food(a) - ind(a) * 3))[0];
  else if (at === 'coast') r = [...own].filter((x) => x.coastal).sort((a, b) => levels(b, (f) => f.kind === 'port') - levels(a, (f) => f.kind === 'port'))[0];
  else r = o.regions.find((x) => x.id === Number(at));
  return r ? { id: r.id, x: r.center[0], z: r.center[1], name: r.name } : null;
}

function builtin() {
  const s = [];
  const add = (name, query, size = '1440x900') => s.push({ name, query, size });
  for (const tier of ['flat', '3d']) {
    const T = tier === 'flat' ? 'flat' : '3d';
    const far = tier === '3d' ? '&fit=1' : '';
    // far / middle / close, early and late, 24 and 72
    add(`${T}-w24-early-far`, `tier=${tier}&src=file&file=w24-r030${far}`);
    add(`${T}-w24-late-far`, `tier=${tier}&src=file&file=w24-r120${far}`);
    add(`${T}-w24-late-mid`, `tier=${tier}&src=file&file=w24-r120&at=industry&dist=620&zoom=2`);
    add(`${T}-w24-late-close`, `tier=${tier}&src=file&file=w24-r120&at=industry&dist=270&zoom=4.4`);
    add(`${T}-w72-early-far`, `tier=${tier}&src=file&file=w72-r060${far}`);
    add(`${T}-w72-late-far`, `tier=${tier}&src=file&file=w72-r140${far}`);
    add(`${T}-w72-late-mid`, `tier=${tier}&src=file&file=w72-r140&at=industry&dist=620&zoom=2.4`);
    add(`${T}-w72-late-close-industry`, `tier=${tier}&src=file&file=w72-r140&at=industry&dist=270&zoom=5.5`);
    add(`${T}-w72-late-close-farm`, `tier=${tier}&src=file&file=w72-r140&at=farm&dist=270&zoom=5.5`);
    add(`${T}-w48-late-far`, `tier=${tier}&src=file&file=w48-r160${far}`);
    add(`${T}-w48-late-mid-selected`, `tier=${tier}&src=file&file=w48-r160&at=city&sel=at&hover=at&dist=560&zoom=2.2&build=1`);
    add(`${T}-w48-first-year`, `tier=${tier}&src=file&file=w48-r001`);
    for (const mode of ['terrain', 'resources', 'population']) {
      add(`${T}-w48-mode-${mode}`, `tier=${tier}&src=file&file=w48-r160&mode=${mode}${far}`);
    }
    add(`${T}-w48-construction-list`, `tier=${tier}&src=file&file=w48-r160&mode=construction&build=1${far}`);
    add(`${T}-w48-construction-region`, `tier=${tier}&src=file&file=w48-r160&mode=construction&build=1&at=industry&sel=at&dist=760&zoom=1.5`);
    add(`${T}-w72-late-far-zh`, `tier=${tier}&src=file&file=w72-r140&lang=zh-Hans${far}`);
    add(`${T}-w48-construction-zh-720`, `tier=${tier}&src=file&file=w48-r160&mode=construction&build=1&at=industry&sel=at&dist=760&zoom=1.5&lang=zh-Hans`, '1280x720');
    add(`${T}-w72-late-far-720`, `tier=${tier}&src=file&file=w72-r140${far}`, '1280x720');
    add(`${T}-fixture-far`, `tier=${tier}&seed=11&n=48${far}`);
  }
  return s;
}

let specs;
const si = args.indexOf('--spec');
if (si >= 0) {
  specs = args.slice(si + 1).map((x) => {
    const [name, query = '', size = '1440x900'] = x.split('|');
    return { name, query, size };
  });
} else {
  specs = builtin();
  // A filter is a substring, or a comma-separated list of exact names.
  if (args[1]) {
    const names = args[1].split(',');
    specs = names.length > 1 ? specs.filter((x) => names.includes(x.name)) : specs.filter((x) => x.name.includes(args[1]));
  }
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
let bad = 0;
for (const spec of specs) {
  const [w, h] = spec.size.split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  const p = new URLSearchParams(spec.query);
  const tier = p.get('tier') === 'flat' ? 'flat' : '3d';
  const where = resolveAt(p.get('file'), p.get('at'));
  const zoom = p.get('zoom');
  p.delete('zoom');
  if (where) {
    if (p.get('sel') === 'at') p.set('sel', String(where.id));
    if (p.get('hover') === 'at') p.set('hover', String(where.id));
  }
  if (!p.has('lang')) p.set('lang', 'en');
  if (!p.has('bare')) p.set('bare', '1');
  await page.goto(`http://127.0.0.1:${port}/dev/map.html?${p}`);
  await page.waitForSelector('[data-testid="map-canvas"]');
  try {
    await page.waitForFunction((t) => window.__atlas && (t === 'flat' ? window.__atlas.tier() === 'flat' : (window.__map3d && window.__map3d.frames > 0)), tier, { timeout: 120000 });
  } catch {
    errors.push('timeout waiting for the map');
  }
  await page.waitForTimeout(500);
  if (tier === '3d' && p.get('fit') === '1') {
    // The 3D tier opens on the capital; F frames the whole known world.
    await page.focus('[data-testid="map-canvas"]');
    await page.keyboard.press('f');
  } else if (tier === '3d' && where) {
    await page.evaluate(([c, dist]) => window.__map3d?.lookAt(c.x, c.z, dist, 0), [where, Number(p.get('dist') ?? 420)]);
  } else if (tier === 'flat') {
    // Flat tier: wheel-zoom about the region's centre (or the canvas centre), then drag it to the middle.
    const z = zoom ? Number(zoom) : 1;
    const at = async () => (where ? await page.evaluate((id) => window.__atlas.regionScreenCenter(id), where.id) : null) ?? [w / 2, h / 2];
    let left = Math.log(z);
    while (Math.abs(left) > 0.01) {
      const step = Math.max(-0.4, Math.min(0.4, left));
      const [x, y] = await at();
      await page.mouse.move(Math.max(4, Math.min(w - 4, x)), Math.max(4, Math.min(h - 4, y)));
      await page.mouse.wheel(0, -step / 0.0018);
      left -= step;
      await page.waitForTimeout(40);
    }
    if (where) {
      for (let pass = 0; pass < 3; pass++) {
        const [x, y] = await at();
        const dx = w / 2 - x, dy = h / 2 - y;
        if (Math.hypot(dx, dy) < 6) break;
        const sx = Math.max(60, Math.min(w - 60, x)), sy = Math.max(60, Math.min(h - 120, y));
        const mx = Math.max(-w * 0.7, Math.min(w * 0.7, dx)), my = Math.max(-h * 0.7, Math.min(h * 0.7, dy));
        await page.mouse.move(sx, sy);
        await page.mouse.down();
        await page.mouse.move(sx + mx / 2, sy + my / 2, { steps: 3 });
        await page.mouse.move(sx + mx, sy + my, { steps: 3 });
        await page.mouse.up();
        await page.waitForTimeout(60);
      }
      // Park the pointer on the zoom buttons so no region shows a hover tooltip.
      await page.hover('[data-testid="map-zoom-in"]');
    }
  }
  if (p.get('drag')) {
    const dx = Number(p.get('drag'));
    const steps = Math.max(1, Math.ceil(Math.abs(dx) / 300));
    for (let i = 0; i < steps; i++) {
      const sx = dx > 0 ? w * 0.25 : w * 0.75;
      await page.mouse.move(sx, h * 0.45);
      await page.mouse.down();
      await page.mouse.move(sx + dx / steps / 2, h * 0.45, { steps: 4 });
      await page.mouse.move(sx + dx / steps, h * 0.45, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(tier === '3d' ? 300 : 60);
    }
    await page.hover('[data-testid="map-zoom-in"]');
  }
  await page.waitForTimeout(tier === '3d' ? 1800 : 500);
  if (p.get('hover')) {
    const c = await page.evaluate((id) => window.__atlas.regionScreenCenter(Number(id)), p.get('hover'));
    if (c) await page.mouse.move(c[0] + 18, c[1] + 22);
    await page.waitForTimeout(tier === '3d' ? 700 : 250);
  }
  await page.screenshot({ path: resolve(outDir, spec.name + '.png') });
  const info = await page.evaluate(() => ({ tier: window.__atlas?.tier?.(), zoom: +(window.__atlas?.zoom() ?? 0).toFixed(2), ms: +(window.__atlas?.lastDrawMs() ?? 0).toFixed(1) }));
  if (errors.length) bad++;
  console.log(spec.name, JSON.stringify(info), where ? `at ${where.name}#${where.id}` : '', errors.length ? '\n  ERRORS ' + errors.join('\n  ') : 'ok');
  await ctx.close();
}
await browser.close();
if (bad) { console.log(`${bad} shots had errors`); process.exit(1); }
