// Screenshots of the ruleset 3.0 shell for review: setup with ten seats, the observer
// console of a ten-seat match late in the calendar, one civilization's view (top bar and
// dock dates, standing orders, people, diplomacy), in English and Simplified Chinese at
// 1440×900 and 1280×720.
//
//   BTS_NO_WINDOW=1 BTS_NO_BROWSER=1 target/release/bts serve --port 7990 --fresh --saves <dir> --web <built client> &
//   BTS_URL=http://127.0.0.1:7990 node apps/web/scripts/r3-shots.mjs [rounds]
//
// PNGs go to apps/web/screenshots/r3-shell/. The match is made through the API: ten seats on
// a Huge Earth-like map, advanced to `rounds` (default 230, about AD 1880).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7990';
const ROUNDS = Number(process.argv[2] ?? 230);
const OUT = fileURLToPath(new URL('../screenshots/r3-shell/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const tid = (id) => `[data-testid="${id}"]`;
const call = async (method, path, body) => {
  const r = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.json();
};

const seats = ['hard', 'medium', 'medium', 'easy', 'hard', 'medium', 'medium', 'easy', 'medium', 'easy'];
await call('POST', '/api/match', { seed: 'r3-shots', regions: 200, world: 'earth_like', calendar: 'standard', controllers: seats });
let m = await call('GET', '/api/match');
while (m.round < ROUNDS) m = await call('POST', '/api/advance', { rounds: Math.min(20, ROUNDS - m.round) });
console.log(`match at round ${m.round}, ${m.date.label}`);

const browser = await chromium.launch();
for (const locale of ['en', 'zh-Hans']) {
  for (const [w, h] of [[1440, 900], [1280, 720]]) {
    const tag = `${locale}-${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript((l) => { try { localStorage.setItem('bts.locale', l); } catch { /* */ } }, locale);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}${tag}-${name}.png` }); };
    await page.goto(BASE + '/');
    await page.waitForSelector(tid('observer-console'), { timeout: 60000 });
    await page.waitForTimeout(1500);
    await shot('01-observer-world');
    await page.click(tid('view-as-0'));
    await page.waitForSelector(tid('map-canvas'));
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
    await shot('02-seat-view-dates');
    await page.keyboard.press('o');
    await page.waitForSelector(tid('overlay-orders'));
    await shot('03-standing-orders');
    await page.click(tid('overlay-close'));
    await page.click(tid('rail-people'));
    await page.waitForSelector(tid('deaths-by-cause')).catch(() => {});
    await shot('04-people-deaths');
    await page.click(tid('rail-diplomacy'));
    await page.waitForTimeout(400);
    const cp = await page.$('[data-testid^="counterpart-"]');
    if (cp) { await cp.click(); await page.waitForSelector(tid('war-policy')).catch(() => {}); }
    await shot('05-diplomacy-war-policy');
    // the setup screen with ten seats
    await page.goto(BASE + '/?title');
    await page.waitForSelector(tid('title-screen'));
    await page.click(tid('title-new'));
    await page.waitForSelector(tid('setup-screen'));
    await page.click(tid('setup-regions-200'));
    while (Number(await page.textContent(tid('setup-seat-count'))) < 10) await page.click(tid('setup-seats-plus'));
    await shot('06-setup-ten-seats');
    await ctx.close();
  }
}
await browser.close();
console.log('screenshots in', OUT);
