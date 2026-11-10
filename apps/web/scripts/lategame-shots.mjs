// Plays a fully delegated human seat far into a match against the native AI over
// the HTTP API, then screenshots the client on that late-game state.
//   BTS_URL=http://127.0.0.1:7979 ROUNDS=170 node scripts/lategame-shots.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.BTS_URL ?? 'http://127.0.0.1:7979';
const rounds = Number(process.env.ROUNDS ?? 170);
const out = process.env.SHOTS ?? 'screenshots/late';
mkdirSync(out, { recursive: true });
const post = async (path, body) => (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

await post('/api/match', { seed: process.env.SEED ?? 'longstrand', controllers: ['human', 'hard', 'medium', 'medium'], disclosed_objective: false });
await post('/api/delegate', { seat: 0, domains: ['economy', 'research', 'education', 'culture', 'expansion', 'military'] });
for (let i = 0; i < rounds; i++) {
  const m = await post('/api/ready', { seat: 0, through_round: true });
  if (m.finished) break;
}
const obs = await (await fetch(base + '/api/observation?seat=0')).json();
console.log(`round ${obs.round}: population ${obs.civ.population}, regions ${obs.regions.filter((r) => r.own).length}, techs ${obs.knowledge.techs.length}, chronicle ${obs.chronicle.length}, wars ${obs.diplomacy.wars.length}, treaties ${obs.diplomacy.treaties.length}, foreign armies ${obs.foreign_armies.length}, observation ${(JSON.stringify(obs).length / 1024).toFixed(0)} KiB`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '/');
await page.waitForSelector('canvas');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/00-main.png` });
const keys = ['2', '3', '4', '5', '6', '7', '8', '9', '0'];
const names = ['economy', 'projects', 'people', 'knowledge', 'culture', 'politics', 'diplomacy', 'military', 'objectives'];
for (let i = 0; i < keys.length; i++) {
  await page.keyboard.press(keys[i]);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${String(i + 1).padStart(2, '0')}-${names[i]}.png` });
}
await page.keyboard.press('Escape');
await browser.close();
if (errors.length) {
  console.error('page errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`OK — screenshots in ${out}/`);
