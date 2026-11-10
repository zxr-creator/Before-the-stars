// Throwaway interaction check for the map dev harness (fixture data only).
import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const out = {};
await page.goto('http://127.0.0.1:5181/dev/map.html?n=72&seed=5');
await page.waitForSelector('[data-testid="map-canvas"]');
await page.waitForTimeout(500);
const log = () => page.textContent('[data-testid="dev-log"]');
// pick a known own region: read from hook by probing ids
const ids = await page.evaluate(() => { const r = []; for (let i = 0; i < 80; i++) if (window.__atlas.regionScreenCenter(i)) r.push(i); return r; });
out.known = ids.length;
const target = ids[Math.floor(ids.length / 2)];
let c = await page.evaluate((id) => window.__atlas.regionScreenCenter(id), target);
out.hitMatches = await page.evaluate(([x, y]) => window.__atlas.regionAt(x, y), c) === target;
await page.mouse.move(c[0], c[1] - 30);
await page.waitForTimeout(100);
out.tooltipVisible = await page.evaluate(() => document.querySelector('[data-testid="map-tooltip"]').classList.contains('is-on'));
out.tooltipText = (await page.textContent('[data-testid="map-tooltip"]')).slice(0, 80);
await page.mouse.click(c[0], c[1] - 30);
out.afterClick = await log();
// click blank paper
await page.mouse.click(1430, 450);
out.afterBlank = await log();
// wheel zoom
const z0 = await page.evaluate(() => window.__atlas.zoom());
await page.mouse.move(700, 450);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(100);
const z1 = await page.evaluate(() => window.__atlas.zoom());
out.wheelZoomIn = z1 > z0;
// drag pan: the region centre should move by the drag delta and no select fired
c = await page.evaluate((id) => window.__atlas.regionScreenCenter(id), target);
await page.mouse.move(700, 450); await page.mouse.down(); await page.mouse.move(760, 480, { steps: 4 }); await page.mouse.up();
const c2 = await page.evaluate((id) => window.__atlas.regionScreenCenter(id), target);
out.dragDelta = [Math.round(c2[0] - c[0]), Math.round(c2[1] - c[1])];
out.afterDrag = await log();
// keyboard
await page.focus('[data-testid="map-canvas"]');
await page.keyboard.press('+');
const z2 = await page.evaluate(() => window.__atlas.zoom());
out.keyZoomIn = z2 > z1;
await page.keyboard.press('ArrowLeft');
const c3 = await page.evaluate((id) => window.__atlas.regionScreenCenter(id), target);
out.keyPanDx = Math.round(c3[0] - c2[0] * 0 - (await page.evaluate((id) => window.__atlas.regionScreenCenter(id), target))[0] + c3[0] - c3[0]);
await page.keyboard.press('f');
await page.waitForTimeout(500);
out.fitZoom = await page.evaluate(() => window.__atlas.zoom());
// buttons
await page.click('[data-testid="map-zoom-in"]');
out.btnZoom = (await page.evaluate(() => window.__atlas.zoom())) > out.fitZoom;
await page.click('[data-testid="map-fit"]');
await page.waitForTimeout(500);
// modes
for (const m of ['terrain', 'resources', 'population', 'political']) {
  await page.click(`[data-testid="map-mode-${m}"]`);
  await page.waitForTimeout(80);
  out['mode_' + m] = await page.evaluate(() => window.__atlas.mode());
}
// pick mode: invalid target does nothing, valid target picks, Esc cancels
await page.click('[data-testid="dev-pick"]');
await page.waitForTimeout(100);
out.pickBanner = await page.isVisible('.map-pick');
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
out.afterEsc = await log();
out.pickBannerGone = !(await page.isVisible('.map-pick'));
// draw timing while panning at DPR 2 with 72 regions
const times = [];
for (let i = 0; i < 12; i++) {
  await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.move(600 + (i % 2 ? 40 : -40), 420, { steps: 2 }); await page.mouse.up();
  times.push(await page.evaluate(() => window.__atlas.lastDrawMs()));
}
out.drawMsMax = Math.max(...times).toFixed(1);
out.drawMsAvg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1);
// no continuous loop: count rAF-driven draws over an idle second
out.idleDraws = await page.evaluate(async () => {
  const c = document.querySelector('[data-testid="map-canvas"]').getContext('2d');
  let n = 0; const orig = c.fillRect.bind(c); c.fillRect = (...a) => { n++; return orig(...a); };
  await new Promise((r) => setTimeout(r, 1000));
  c.fillRect = orig; return n;
});
await page.screenshot({ path: 'screenshots/dev/n72-pol.png' });
console.log(JSON.stringify(out, null, 1));
console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no console errors');
await browser.close();
