// Screenshots of the ruleset 3.0 client views: the building tree and the market (English, 1440x900).
//   BTS_NO_WINDOW=1 BTS_NO_BROWSER=1 target/release/bts serve --port 7996 --fresh --saves <dir> &
//   BTS_URL=http://127.0.0.1:7996 OUT=<dir> node apps/web/scripts/r3-client-shots.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7996';
const OUT = process.env.OUT ?? 'apps/web/screenshots/r3-client';
mkdirSync(OUT, { recursive: true });
const tid = (x) => `[data-testid="${x}"]`;
await fetch(BASE + '/api/match', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seed: 'r3-client', regions: 24, controllers: ['human', 'medium', 'medium', 'medium'] }) });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE + '/');
await page.waitForSelector(tid('map-canvas'));
await page.keyboard.press('u');
await page.waitForSelector(tid('building-tree'));
await page.click(tid('bt-node-fields'));
await page.waitForSelector(tid('bt-detail'));
await page.screenshot({ path: `${OUT}/building-tree.png` });
await page.keyboard.press('Escape');
await page.keyboard.press('m');
await page.waitForSelector(tid('market'));
await page.click(tid('mo-submit'));
await page.waitForSelector(tid('market-orders'));
await page.screenshot({ path: `${OUT}/market.png` });
await browser.close();
console.log('ok', OUT);
