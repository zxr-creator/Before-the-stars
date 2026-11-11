// The Earth-like map in the running game (not the dev harness): one civilization's view and
// the world view, early and late, far, middle and close, across the date line, flat and 3D,
// in English and Simplified Chinese. PNGs go to apps/web/screenshots/r3-map-live/.
//
//   BTS_URL=http://127.0.0.1:7990 node apps/web/scripts/r3-map-live.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7990';
const OUT = fileURLToPath(new URL('../screenshots/r3-map-live/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const tid = (id) => `[data-testid="${id}"]`;
const call = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.json();
};
async function advanceTo(round) {
  let m = await call('GET', '/api/match');
  while (m.round < round) m = await call('POST', '/api/advance', { rounds: Math.min(20, round - m.round) });
  return m;
}

const browser = await chromium.launch();
for (const [stage, round] of [['early', 4], ['late', 300]]) {
  await call('POST', '/api/match', { seed: 'r3-live-map', regions: 60, world: 'earth_like', calendar: 'standard', controllers: ['hard', 'medium', 'medium', 'easy'] });
  const m = await advanceTo(round);
  console.log(stage, m.round, m.date.label);
  for (const [locale, w, h] of [['en', 1440, 900], ['zh-Hans', 1440, 900], ['en', 1280, 720]]) {
    if (stage === 'early' && w === 1280) continue;
    const tag = `${stage}-${locale}-${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript((l) => { try { localStorage.setItem('bts.locale', l); } catch { /* */ } }, locale);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}${tag}-${name}.png` }); };
    await page.goto(BASE + '/');
    await page.waitForSelector(tid('observer-console'), { timeout: 60000 });
    await page.waitForTimeout(1500);
    if (await page.$(tid('map-tier-flat'))) await page.click(tid('map-tier-flat'));
    await page.click(tid('map-fit'));
    await shot('01-world-far');
    // across the date line: pan by half the screen twice
    await page.evaluate(() => window.__atlas?.panBy?.(window.innerWidth * 0.45, 0));
    await shot('02-world-dateline');
    await page.click(tid('view-as-0'));
    await page.waitForSelector(tid('map-canvas'));
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
    await page.click(tid('map-fit'));
    await shot('03-seat-far');
    for (let i = 0; i < 3; i++) await page.click(tid('map-zoom-in'));
    await shot('04-seat-mid');
    for (let i = 0; i < 3; i++) await page.click(tid('map-zoom-in'));
    await shot('05-seat-close');
    if (locale === 'en' && w === 1440) {
      await page.click(tid('map-mode-resources')).catch(() => {});
      await shot('06-seat-close-resources');
      await page.click(tid('map-mode-political')).catch(() => {});
      if (await page.$(tid('map-tier-3d'))) {
        await page.click(tid('map-tier-3d'));
        await page.waitForTimeout(6000);
        await shot('07-seat-3d');
        await page.click(tid('map-tier-flat'));
      }
    }
    await ctx.close();
  }
}
await browser.close();
console.log('screenshots in', OUT);
