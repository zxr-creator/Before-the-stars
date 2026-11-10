// Throwaway screenshot driver for the map dev harness.
// usage: node dev/map-shots.mjs name "query" [width height dpr]
import { chromium } from 'playwright';
const [name, query = '', w = '1440', h = '900', dpr = '1'] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:5181/dev/map.html?${query}`);
await page.waitForSelector('[data-testid="map-canvas"]');
await page.waitForTimeout(700);
const hoverId = new URLSearchParams(query).get('hover');
if (hoverId) {
  const c = await page.evaluate((id) => window.__atlas.regionScreenCenter(Number(id)), hoverId);
  if (c) await page.mouse.move(c[0] + 14, c[1] - 26);
  await page.waitForTimeout(200);
}
await page.screenshot({ path: `screenshots/dev/${name}.png` });
const info = await page.evaluate(() => ({ zoom: window.__atlas?.zoom(), ms: window.__atlas?.lastDrawMs() }));
console.log(name, JSON.stringify(info), errors.length ? 'ERRORS: ' + errors.join(' | ') : 'ok');
await browser.close();
