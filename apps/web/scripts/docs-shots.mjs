// Screenshots for the README, taken from the late-game state that
// lategame-shots.mjs leaves on the referee.
//   BTS_URL=http://127.0.0.1:7979 node scripts/docs-shots.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.BTS_URL ?? 'http://127.0.0.1:7979';
const out = process.env.SHOTS ?? '../../docs/screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];
async function open(locale) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((l) => { try { localStorage.setItem('bts.locale', l); } catch { /* ignore */ } }, locale);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + '/?notitle');
  await page.waitForSelector('canvas');
  await page.waitForTimeout(1500);
  return page;
}

let page = await open('en');
// pull the camera back from the capital so the picture shows a province, not a street
for (let i = 0; i < 3; i++) { await page.mouse.move(980, 450); await page.mouse.wheel(0, 240); await page.waitForTimeout(250); }
await page.mouse.move(300, 760);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/world.png` });
await page.keyboard.press('l');
await page.mouse.move(300, 118);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/economy-ledger.png` });
await page.keyboard.press('Escape');
await page.context().close();

page = await open('zh-Hans');
for (let i = 0; i < 3; i++) { await page.mouse.move(980, 450); await page.mouse.wheel(0, 240); await page.waitForTimeout(250); }
await page.mouse.move(300, 760);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/chinese.png` });
await page.context().close();
await browser.close();
if (errors.length) { console.error('page errors:\n' + errors.join('\n')); process.exit(1); }
console.log(`OK — screenshots in ${out}/`);
