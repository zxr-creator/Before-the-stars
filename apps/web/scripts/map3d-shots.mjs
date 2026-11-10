// Screenshot and interaction check for the 3D map tier.
//
//   node scripts/map3d-shots.mjs            (from apps/web, after `source scripts/env.sh`)
//
// Starts its own Vite dev server, opens the map dev harness (dev/map.html) in
// headless Chromium with WebGL on SwiftShader, and saves PNGs to
// screenshots/map3d/. It uses the synthetic fixture (occupied regions, armies,
// remembered regions, every terrain) and real observations saved from the referee
// by scripts/map3d-worlds.mjs (dev/obs/*.json). The run fails on any page error,
// on a blank WebGL canvas, or when an interaction does not behave.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'screenshots/map3d');
mkdirSync(outDir, { recursive: true });
const only = process.argv[2] ?? '';

const server = await createServer({ root, logLevel: 'error', server: { port: 5197, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const base = `http://127.0.0.1:${server.config.server.port}`;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const failures = [];
const notes = [];
const fail = (m) => { failures.push(m); console.log('  FAIL', m); };
const real = (name) => existsSync(resolve(root, 'dev/obs', name + '.json'));

/** Pick a region from the observation the harness shows. */
const FIND = (at) => {
  const o = window.__devObs;
  if (!o) return null;
  const rs = o.regions;
  const rank = { wilderness: 0, camp: 1, village: 2, town: 3, city: 4, metropolis: 5 };
  const nFac = (r) => r.own?.facilities.length ?? 0;
  let r = null;
  if (at === 'capital') r = rs.find((x) => x.id === o.civ.capital);
  else if (at === 'city') r = rs.filter((x) => x.visibility !== 'remembered').sort((a, b) => rank[b.settlement] - rank[a.settlement] || nFac(b) - nFac(a))[0];
  else if (at === 'coast') r = rs.filter((x) => x.coastal && x.own && x.id !== o.civ.capital).sort((a, b) => (b.own.facilities.some((f) => f.kind === 'port') ? 50 : 0) + nFac(b) - ((a.own.facilities.some((f) => f.kind === 'port') ? 50 : 0) + nFac(a)))[0] ?? rs.find((x) => x.coastal);
  else if (at === 'mountain') r = rs.filter((x) => x.visibility !== 'remembered').sort((a, b) => (b.terrain === 'mountains' ? 1000 : b.terrain === 'hills' ? 500 : 0) + b.elevation - ((a.terrain === 'mountains' ? 1000 : a.terrain === 'hills' ? 500 : 0) + a.elevation))[0];
  else if (at === 'occupied') { const occ = rs.filter((x) => x.controller != null && x.controller !== x.owner); const has = (x) => o.armies.some((a) => a.region === x.id) || o.foreign_armies.some((a) => a.region === x.id); r = occ.find((x) => x.visibility !== 'remembered' && has(x)) ?? occ.find(has) ?? occ[0]; }
  else if (at === 'army') r = rs.map((x) => [x, o.armies.filter((a) => a.region === x.id).length + o.foreign_armies.filter((a) => a.region === x.id).length]).sort((a, b) => b[1] - a[1])[0]?.[0];
  else if (at === 'fog') r = rs.filter((x) => x.visibility === 'remembered' && x.neighbors.some((n) => !rs.some((y) => y.id === n.region))).sort((a, b) => a.id - b.id)[0] ?? rs.find((x) => x.visibility === 'remembered') ?? rs.find((x) => x.neighbors.some((n) => !rs.some((y) => y.id === n.region)));
  else if (at === 'desert' || at === 'steppe' || at === 'tundra' || at === 'marsh' || at === 'forest' || at === 'hills') r = rs.filter((x) => x.terrain === at && x.visibility !== 'remembered')[0];
  else r = rs.find((x) => x.id === Number(at));
  return r ? { id: r.id, x: r.center[0], z: r.center[1], name: r.name } : null;
};

async function open(query, size = [1440, 900], dpr = 1) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error (${query}): ${String(e)}`));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'warning' && /flat atlas|Context Lost/i.test(t)) notes.push(`warning (${query}): ${t}`);
    if (m.type() !== 'error') return;
    // A missing favicon is not a map problem.
    if (/favicon/.test(t)) return;
    fail(`console error (${query}): ${t}`);
  });
  // Headless Chromium draws WebGL on the CPU, where the map would pick its reduced-cost path;
  // the shots force the full-quality path so they show what a GPU shows.
  // The flat atlas is the default tier, so every 3D shot asks for the 3D tier explicitly.
  await page.goto(`${base}/dev/map.html?bare=1&${/(^|&)q=/.test(query) ? '' : 'q=high&'}${/(^|&)tier=/.test(query) ? '' : 'tier=3d&'}${query}`);
  await page.waitForSelector('[data-testid="map-canvas"]');
  const flat = new URLSearchParams(query).get('tier') === 'flat';
  await page.waitForFunction((f) => window.__atlas && (f ? window.__atlas.tier() === 'flat' : window.__map3d && window.__map3d.frames > 2), flat, { timeout: 90000 });
  await page.waitForTimeout(500);
  return { page, ctx };
}

async function shot(name, query, opts = {}) {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  const { page, ctx } = await open(query, opts.size, opts.dpr);
  try {
    if (opts.at) {
      const where = await page.evaluate(FIND, opts.at);
      if (!where) notes.push(`${name}: nothing matches "${opts.at}" in this observation`);
      else await page.evaluate(([w, d, hd, dx, dz]) => window.__map3d?.lookAt(w.x + dx, w.z + dz, d, (hd * Math.PI) / 180), [where, opts.dist ?? 420, opts.heading ?? 0, opts.dx ?? 0, opts.dz ?? 0]);
      if (where && opts.hover) {
        await page.waitForTimeout(700);
        const c = await page.evaluate((id) => window.__atlas.regionScreenCenter(id), where.id);
        if (c) await page.mouse.move(c[0] + 26, c[1] + 22);
      }
    }
    if (opts.before) await opts.before(page);
    await page.waitForTimeout(opts.wait ?? 1400);
    const flat = await page.evaluate(() => window.__atlas.tier() === 'flat');
    if (!flat) {
      const colours = await page.evaluate(() => window.__map3d.probe());
      if (colours < 12) fail(`${name}: the WebGL canvas looks blank (${colours} distinct colours)`);
    } else if (!opts.flat) fail(`${name}: expected the 3D tier but the flat atlas is showing`);
    await page.screenshot({ path: resolve(outDir, name + '.png') });
    const info = await page.evaluate(() => ({ s: window.__map3d?.stats, b: window.__map3d?.buildMs }));
    if (!info.s && !opts.flat) fail(`${name}: the 3D tier fell back to the flat atlas during the shot`);
    console.log(`${name}.png  ${info.s ? `${info.s.regions} regions, ${info.s.triangles} tris, ${info.s.calls} calls, ${info.s.props} props, build ${Math.round(info.b)} ms` : 'flat tier'}  (${Date.now() - t0} ms)`);
    if (opts.after) await opts.after(page);
  } finally {
    await ctx.close();
  }
}

const FX = 'n=48&seed=11';
const late = real('w48-r200') ? 'src=file&file=w48-r200' : FX;
const big = real('w72-r220') ? 'src=file&file=w72-r220' : 'n=72&seed=5';
const early = real('w48-r001') ? 'src=file&file=w48-r001' : 'n=24&seed=3';
const mid = real('w48-r100') ? 'src=file&file=w48-r100' : FX;

try {
  // Camera distances.
  await shot('01-far-overview', late);
  await shot('02-mid-zoom', late, { at: 'capital', dist: 760, dx: 60 });
  await shot('03-close-city-districts', late, { at: 'capital', dist: 215, dx: -8, dz: 12 });
  // Map modes.
  await shot('04-mode-political', late, { at: 'capital', dist: 1150, dx: 150, dz: -60 });
  await shot('05-mode-terrain', late + '&mode=terrain', { at: 'capital', dist: 620, dx: 80, dz: -40 });
  await shot('06-mode-resources', late + '&mode=resources', { at: 'capital', dist: 520, dx: 60, dz: -70 });
  await shot('07-mode-population', late + '&mode=population', { at: 'capital', dist: 900, dx: 120, dz: -40 });
  // Places.
  await shot('08-coast-harbour', FX, { at: 'coast', dist: 300 });
  await shot('09-mountains', FX, { at: 'mountain', dist: 430 });
  await shot('10-fog-edge', FX, { at: 'fog', dist: 560 });
  await shot('11-occupied-armies', FX, { at: 'occupied', dist: 330, hover: true });
  await shot('12-world-72', big);
  await shot('13-world-72-mid', big, { at: 'capital', dist: 520 });
  await shot('28-world-24', real('w24-r120') ? 'src=file&file=w24-r120' : 'n=24&seed=3');
  await shot('14-early-exploration', early);
  await shot('15-midgame', mid, { at: 'capital', dist: 420 });
  await shot('16-terrains-desert', FX + '&mode=terrain', { at: 'desert', dist: 360 });
  await shot('17-terrains-tundra', FX + '&mode=terrain', { at: 'tundra', dist: 360 });
  await shot('18-rotated', late, { at: 'capital', dist: 420, heading: 140 });
  await shot('19-zh-hans', late + '&lang=zh-Hans&mode=resources', { at: 'capital', dist: 520, hover: true });
  await shot('20-hidpi', late, { at: 'capital', dist: 300, size: [960, 600], dpr: 2 });
  await shot('21-insets-pick', FX + '&insets=1&pick=1');
  await shot('22-reduced-motion', late, {
    at: 'capital', dist: 420,
    before: async (page) => { await page.emulateMedia({ reducedMotion: 'reduce' }); },
  });

  await shot('27-software-quality-auto', late + '&q=auto', {
    at: 'capital', dist: 420,
    after: async (page) => {
      const lowQ = await page.evaluate(() => window.__map3d.lowQuality);
      if (!lowQ) notes.push('27: the automatic quality did not detect a software renderer (expected under SwiftShader)');
      const cost = await page.evaluate(async () => {
        const m = window.__map3d;
        const f0 = m.frames, t0 = performance.now();
        while (performance.now() - t0 < 2500) { m.panBy(6, 2, true); await new Promise((r) => requestAnimationFrame(r)); }
        return { frames: m.frames - f0, avgMs: +((performance.now() - t0) / Math.max(1, m.frames - f0)).toFixed(1) };
      });
      console.log('  reduced-cost path, moving camera:', JSON.stringify(cost));
    },
  });

  // The flat tier through the toggle, and back.
  if (!only || 'flat-toggle'.includes(only)) {
    const { page, ctx } = await open(late);
    await page.click('[data-testid="map-tier-flat"]');
    await page.waitForFunction(() => window.__atlas?.tier() === 'flat', null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(outDir, '23-flat-tier-via-toggle.png') });
    console.log('23-flat-tier-via-toggle.png');
    const remembered = await page.evaluate(() => localStorage.getItem('bts.mapTier'));
    if (remembered !== 'flat') fail('the tier choice was not remembered in localStorage');
    await page.click('[data-testid="map-tier-3d"]');
    await page.waitForFunction(() => window.__atlas?.tier() === '3d' && window.__map3d && window.__map3d.frames > 2, null, { timeout: 60000 });
    if ((await page.evaluate(() => window.__map3d.probe())) < 12) fail('3D canvas blank after switching back from the flat tier');
    await ctx.close();
  }

  // Interaction checks on the 3D tier.
  if (!only || 'interact'.includes(only)) {
    const { page, ctx } = await open(FX);
    const out = {};
    const ids = await page.evaluate(() => window.__devObs.regions.filter((r) => r.visibility === 'own').map((r) => r.id));
    const target = ids[0];
    await page.evaluate((id) => { const r = window.__devObs.regions.find((x) => x.id === id); window.__map3d.lookAt(r.center[0], r.center[1], 520, 0); }, target);
    await page.waitForTimeout(700);
    let c = await page.evaluate((id) => window.__atlas.regionScreenCenter(id), target);
    out.hit = (await page.evaluate(([x, y]) => window.__atlas.regionAt(x, y + 24), c)) === target;
    if (!out.hit) fail('ray picking does not return the region under its own centre');
    await page.mouse.move(c[0] + 8, c[1] + 24);
    await page.waitForTimeout(300);
    out.tooltip = await page.evaluate(() => document.querySelector('[data-testid="map-tooltip"]').classList.contains('is-on'));
    const name = await page.evaluate((id) => window.__devObs.regions.find((x) => x.id === id).name, target);
    out.tooltipNames = (await page.textContent('[data-testid="map-tooltip"]')).includes(name);
    if (!out.tooltip || !out.tooltipNames) fail('hover tooltip did not show the region');
    await page.mouse.click(c[0] + 8, c[1] + 24);
    await page.waitForTimeout(200);
    out.selected = (await page.textContent('[data-testid="dev-sel"]')) === String(target);
    if (!out.selected) fail('click did not select the region');
    await page.screenshot({ path: resolve(outDir, '24-selected-hover-tooltip.png') });
    console.log('24-selected-hover-tooltip.png');
    // Wheel zoom, drag pan, keys, rotate, reset north.
    const z0 = await page.evaluate(() => window.__atlas.zoom());
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(500);
    out.wheel = (await page.evaluate(() => window.__atlas.zoom())) > z0;
    if (!out.wheel) fail('wheel did not zoom in');
    c = await page.evaluate((id) => window.__atlas.regionScreenCenter(id), target);
    await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(790, 500, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(300);
    const c2 = await page.evaluate((id) => window.__atlas.regionScreenCenter(id), target);
    out.drag = [Math.round(c2[0] - c[0]), Math.round(c2[1] - c[1])];
    if (Math.abs(out.drag[0] - 90) > 14 || Math.abs(out.drag[1] - 50) > 14) fail(`drag moved the ground by ${out.drag}, expected about [90,50]`);
    out.dragDidNotSelect = (await page.textContent('[data-testid="dev-sel"]')) === String(target);
    await page.focus('[data-testid="map-canvas"]');
    const z1 = await page.evaluate(() => window.__atlas.zoom());
    await page.keyboard.press('-');
    await page.waitForTimeout(400);
    out.keyZoom = (await page.evaluate(() => window.__atlas.zoom())) < z1;
    await page.keyboard.press('e');
    await page.waitForTimeout(500);
    out.rotated = Math.abs(await page.evaluate(() => window.__map3d.heading)) > 0.2;
    await page.click('[data-testid="map-north"]');
    await page.waitForTimeout(700);
    out.north = Math.abs(await page.evaluate(() => window.__map3d.heading)) < 0.02;
    if (!out.keyZoom || !out.rotated || !out.north) fail('keyboard zoom / rotate / reset north failed');
    // Map modes through the toggle.
    for (const m of ['terrain', 'resources', 'population', 'political']) {
      await page.click(`[data-testid="map-mode-${m}"]`);
      await page.waitForTimeout(120);
      if ((await page.evaluate(() => window.__atlas.mode())) !== m) fail('mode toggle failed for ' + m);
    }
    // Minimap jump.
    const before = await page.evaluate((id) => window.__atlas.regionScreenCenter(id), target);
    const mm = await page.locator('[data-testid="map-minimap"]').boundingBox();
    await page.mouse.click(mm.x + mm.width * 0.82, mm.y + mm.height * 0.3);
    await page.waitForTimeout(700);
    const after = await page.evaluate((id) => window.__atlas.regionScreenCenter(id), target);
    out.minimap = Math.hypot(after[0] - before[0], after[1] - before[1]) > 80;
    if (!out.minimap) fail('minimap click did not move the view');
    // Fit, then frame pacing while the camera eases (software rendering: indicative only).
    await page.keyboard.press('f');
    await page.waitForTimeout(900);
    out.frame = await page.evaluate(async () => {
      const m = window.__map3d;
      m.lookAt(700, 500, 900, 0);
      const f0 = m.frames, t0 = performance.now();
      // Keep the camera moving for a while; the engine times its own back-to-back frames.
      while (performance.now() - t0 < 2500) { m.panBy(6, 2, true); await new Promise((r) => requestAnimationFrame(r)); }
      return { frames: m.frames - f0, avgMs: +((performance.now() - t0) / Math.max(1, m.frames - f0)).toFixed(1), engineFrameCostMs: +m.frameCost.toFixed(1), cpuSubmitMs: +m.lastDrawMs.toFixed(2) };
    });
    // Idle: with reduced motion nothing may be drawn; otherwise only the slow ambient tick.
    out.idleAmbientFramesPerSec = await page.evaluate(async () => { const m = window.__map3d; const f0 = m.frames; await new Promise((r) => setTimeout(r, 2000)); return (m.frames - f0) / 2; });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(400);
    out.idleReducedMotionFrames = await page.evaluate(async () => { const m = window.__map3d; const f0 = m.frames; await new Promise((r) => setTimeout(r, 1500)); return m.frames - f0; });
    if (out.idleReducedMotionFrames > 1) fail(`reduced motion still animates (${out.idleReducedMotionFrames} frames while idle)`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await ctx.close();
    // Pick mode: banner, an invalid region is ignored, a valid target picks.
    const pk = await open(FX + '&pick=1');
    out.pickBanner = await pk.page.isVisible('.map-pick');
    const tg = await pk.page.evaluate(() => {
      const o = window.__devObs;
      const mine = new Set(o.regions.filter((r) => r.owner === o.seat).map((r) => r.id));
      const t = o.regions.find((r) => !mine.has(r.id) && r.neighbors.some((n) => mine.has(n.region)));
      return { target: t.id, mine: [...mine][0] };
    });
    const clickRegion = async (id) => {
      await pk.page.evaluate((rid) => { const r = window.__devObs.regions.find((x) => x.id === rid); window.__map3d.lookAt(r.center[0], r.center[1], 500, 0); }, id);
      await pk.page.waitForTimeout(500);
      const pt = await pk.page.evaluate((rid) => window.__atlas.regionScreenCenter(rid), id);
      await pk.page.mouse.click(pt[0] + 6, pt[1] + 26);
      await pk.page.waitForTimeout(250);
    };
    await clickRegion(tg.mine);
    out.pickIgnoresInvalid = (await pk.page.textContent('[data-testid="dev-status"]')) === '';
    await pk.page.screenshot({ path: resolve(outDir, '26-pick-mode.png') });
    await clickRegion(tg.target);
    out.picked = await pk.page.textContent('[data-testid="dev-status"]');
    if (!out.pickBanner || !out.pickIgnoresInvalid || out.picked !== 'picked ' + tg.target) fail('pick mode: ' + JSON.stringify(out));
    await pk.ctx.close();
    console.log('interaction', JSON.stringify(out));
  }

  // A lost WebGL context is rebuilt; repeated losses fall back to the flat atlas.
  if (!only || 'context-loss'.includes(only)) {
    const { page, ctx } = await open(FX);
    const lose = async () => {
      await page.evaluate(() => { window.__lost = window.__map3d; window.__map3d.renderer.forceContextLoss(); });
      await page.waitForFunction(() => window.__atlas && (window.__atlas.tier() === 'flat' || (window.__map3d && window.__map3d !== window.__lost && window.__map3d.frames > 2)), null, { timeout: 60000 });
      return page.evaluate(() => window.__atlas.tier());
    };
    const first = await lose();
    if (first !== '3d') fail('the 3D map was not rebuilt after a lost WebGL context');
    else if ((await page.evaluate(() => window.__map3d.probe())) < 12) fail('3D canvas blank after context recovery');
    await lose();
    const third = await lose();
    if (third !== 'flat') fail('repeated context loss did not fall back to the flat atlas');
    console.log('context loss: rebuilt once, then flat after repeated losses');
    await ctx.close();
  }

  // WebGL unavailable: automatic fallback to the flat atlas.
  if (!only || 'fallback'.includes(only)) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 750 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => fail('page error (fallback): ' + String(e)));
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return orig.call(this, type, ...rest);
      };
    });
    await page.goto(`${base}/dev/map.html?bare=1&tier=3d&${FX}`);
    await page.waitForFunction(() => window.__atlas?.tier() === 'flat', null, { timeout: 30000 }).catch(() => fail('no fallback to the flat atlas when WebGL is unavailable'));
    await page.waitForTimeout(500);
    const note = await page.isVisible('[data-testid="map-tier-note"]');
    if (!note) fail('the fallback notice is not shown');
    await page.screenshot({ path: resolve(outDir, '25-webgl-unavailable-fallback.png') });
    console.log('25-webgl-unavailable-fallback.png');
    await ctx.close();
  }
} catch (e) {
  fail('script error: ' + (e && e.stack ? e.stack : String(e)));
} finally {
  await browser.close();
  await server.close();
}
for (const n of notes) console.log('note:', n);
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n- ` + failures.join('\n- '));
  process.exit(1);
}
console.log('\nmap3d shots: all checks passed; images in screenshots/map3d/');
