// Screenshots of the regional works view against a running referee with a match loaded.
//   BTS_URL=http://127.0.0.1:7986 node scripts/construction-shots.mjs [prefix] [locale] [WxH]
// Writes to screenshots/construction/ (git-ignored). Read-only: gives no orders.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7986';
const prefix = process.argv[2] ?? 'works';
const locale = process.argv[3] ?? 'en';
const [w, h] = (process.argv[4] ?? '1440x900').split('x').map(Number);
const OUT = fileURLToPath(new URL('../screenshots/construction/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const tid = (id) => `[data-testid="${id}"]`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: w, height: h } });
await ctx.addInitScript((loc) => { try { localStorage.setItem('bts.locale', loc); } catch { /* */ } }, locale);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE + '/');
await page.waitForSelector(tid('map-canvas'), { timeout: 30000 });
await page.waitForTimeout(800);
for (const b of await page.$$('[data-testid="panel-close"]')) await b.click().catch(() => {});
const tag = `${prefix}-${locale}-${w}x${h}`;
await page.click(tid('rail-works'));
await page.waitForSelector(tid('overlay-works'));
const tabs = (process.env.TABS ?? 'overview,works,build,queue').split(',');
for (const tab of tabs) {
  await page.click(tid(`works-tab-${tab}`));
  await page.waitForTimeout(300);
  if (tab === 'works' && process.env.PICK_WORK) await page.click(tid(`work-row-${process.env.PICK_WORK}`)).catch(() => {});
  if (tab === 'build' && process.env.PICK_BUILD) await page.click(tid(`build-card-${process.env.PICK_BUILD}`)).catch(() => {});
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}${tag}-${tab}.png` });
}
console.log('shots', tag, 'errors:', errors.length ? errors : 'none');
await browser.close();
