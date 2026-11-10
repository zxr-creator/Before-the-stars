// One screenshot of the map dev harness, for iterating on the 3D map's look.
//   node scripts/map3d-shot.mjs <name> "<query>" [width height dpr]
// Expects the Vite dev server (BTS_DEV_PORT, default 5183) to serve /dev/map.html.
// Headless Chromium renders WebGL through SwiftShader.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [name, query = '', w = '1440', h = '900', dpr = '1'] = process.argv.slice(2);
const port = process.env.BTS_DEV_PORT ?? '5183';
mkdirSync('screenshots/map3d', { recursive: true });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
await page.goto(`http://127.0.0.1:${port}/dev/map.html?bare=1&${query}`);
await page.waitForSelector('[data-testid="map-canvas"]');
try {
  await page.waitForFunction(() => window.__atlas && (window.__atlas.tier() === 'flat' || (window.__map3d && window.__map3d.frames > 2)), null, { timeout: 60000 });
} catch (e) {
  errors.push('timeout waiting for the map');
}
await page.waitForTimeout(600);
const p = new URLSearchParams(query);
// at=capital|city|coast|mountain|occupied|fog|<region id> with dist=<camera distance>
if (p.get('at')) {
  const where = await page.evaluate((at) => {
    const o = window.__devObs;
    if (!o) return null;
    const rs = o.regions;
    const rank = { wilderness: 0, camp: 1, village: 2, town: 3, city: 4, metropolis: 5 };
    let r = null;
    if (at === 'capital') r = rs.find((x) => x.id === o.civ.capital);
    else if (at === 'city') r = rs.filter((x) => x.visibility !== 'remembered').sort((a, b) => rank[b.settlement] - rank[a.settlement] || (b.own?.facilities.length ?? 0) - (a.own?.facilities.length ?? 0))[0];
    else if (at === 'coast') r = rs.filter((x) => x.coastal && x.own).sort((a, b) => (b.own.facilities.some((f) => f.kind === 'port') ? 9 : 0) + b.own.facilities.length - ((a.own.facilities.some((f) => f.kind === 'port') ? 9 : 0) + a.own.facilities.length))[0] ?? rs.find((x) => x.coastal);
    else if (at === 'mountain') r = rs.filter((x) => x.visibility !== 'remembered').sort((a, b) => (b.terrain === 'mountains' ? 1000 : b.terrain === 'hills' ? 500 : 0) + b.elevation - ((a.terrain === 'mountains' ? 1000 : a.terrain === 'hills' ? 500 : 0) + a.elevation))[0];
    else if (at === 'occupied') r = rs.find((x) => x.controller != null && x.controller !== x.owner && o.armies.some((a) => a.region === x.id)) ?? rs.find((x) => x.controller != null && x.controller !== x.owner) ?? rs.find((x) => o.armies.some((a) => a.region === x.id));
    else if (at === 'army') r = rs.map((x) => [x, o.armies.filter((a) => a.region === x.id).length + o.foreign_armies.filter((a) => a.region === x.id).length]).sort((a, b) => b[1] - a[1])[0]?.[0];
    else if (at === 'fog') r = rs.filter((x) => x.visibility === 'remembered').sort((a, b) => a.id - b.id)[0] ?? rs.find((x) => x.neighbors.some((n) => !rs.some((y) => y.id === n.region)));
    else r = rs.find((x) => x.id === Number(at));
    return r ? { id: r.id, x: r.center[0], z: r.center[1], name: r.name } : null;
  }, p.get('at'));
  if (where) {
    await page.evaluate(([w, dist, hd, dx, dz]) => window.__map3d?.lookAt(w.x + dx, w.z + dz, dist, (hd * Math.PI) / 180), [where, Number(p.get('dist') ?? 420), Number(p.get('hd') ?? 0), Number(p.get('dx') ?? 0), Number(p.get('dz') ?? 0)]);
    console.log('  at', JSON.stringify(where));
  }
}
await page.waitForTimeout(1500);
if (p.get('hover')) {
  const c = await page.evaluate((id) => window.__atlas.regionScreenCenter(Number(id)), p.get('hover'));
  if (c) await page.mouse.move(c[0] + 14, c[1] - 6);
  await page.waitForTimeout(500);
}
await page.screenshot({ path: `screenshots/map3d/${name}.png` });
const info = await page.evaluate(() => ({
  tier: window.__atlas?.tier?.(), zoom: window.__atlas?.zoom(), ms: window.__atlas?.lastDrawMs(),
  stats: window.__map3d?.stats, build: window.__map3d?.buildMs, frames: window.__map3d?.frames,
}));
console.log(name, JSON.stringify(info), errors.length ? '\n  ' + errors.join('\n  ') : 'ok');
await browser.close();
