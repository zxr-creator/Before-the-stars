// The map inside the real client, against a running referee: a played seat with
// building work queued, then an AI-only match seen from the observer's world view.
//
//   target/release/bts serve --port 7984 --fresh --web apps/web/dist --saves <dir> &
//   BTS_URL=http://127.0.0.1:7984 node scripts/map-app-shots.mjs [rounds]
//
// Writes screenshots/map-app/*.png (English and Simplified Chinese, 1440x900 and
// 1280x720, flat tier). It creates its own matches on that referee and gives no
// orders through the interface; the played seat is advanced by stewards over the API.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7984';
const ROUNDS = Number(process.argv[2] ?? 60);
const OUT = fileURLToPath(new URL('../screenshots/map-app/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const tid = (id) => `[data-testid="${id}"]`;
async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const browser = await chromium.launch();
const errors = [];
async function open(size, lang) {
  const [width, height] = size;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await ctx.addInitScript((l) => {
    try { localStorage.setItem('bts.tutorial.off', '1'); localStorage.setItem('bts.locale', l); localStorage.setItem('bts.mapTier', 'flat'); } catch { /* ignore */ }
  }, lang);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '/?notitle');
  await page.waitForSelector(tid('map-canvas'));
  await page.waitForTimeout(700);
  return { ctx, page };
}

// --- a played seat, run forward by stewards -----------------------------------------------
await api('POST', '/api/match', { seed: 'map-review', regions: 48, controllers: ['human', 'medium', 'medium', 'medium'], disclosed_objective: false });
await api('POST', '/api/delegate', { seat: 0, domains: ['economy', 'research', 'education', 'culture', 'expansion', 'military'] });
for (let i = 0; i < ROUNDS; i++) {
  const m = await api('POST', '/api/ready', { seat: 0, through_round: true });
  if (m.finished) break;
}
const obs = await api('GET', '/api/observation?seat=0');
const own = obs.regions.filter((r) => r.own);
const building = obs.projects.filter((p) => p.kind === 'build');
console.log(`played seat: round ${obs.round}, ${own.length} governed regions, ${building.length} building projects, queued levels reported by regions: ${own.reduce((n, r) => n + (r.own.construction_sites ?? []).reduce((k, s) => k + s.queued_levels, 0), 0)}`);

for (const [size, lang, tag] of [[[1440, 900], 'en', 'en-1440'], [[1280, 720], 'zh-Hans', 'zh-720']]) {
  const { ctx, page } = await open(size, lang);
  await page.click(tid('map-fit'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + `play-political-${tag}.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.click(tid('map-fit'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + `play-political-wide-${tag}.png` });
  await page.click(tid('map-mode-construction'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + `play-construction-list-${tag}.png` });
  const first = page.locator(tid('province-list') + ' button').first();
  if (await first.count()) {
    await first.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: OUT + `play-construction-region-${tag}.png` });
    const plan = page.locator(tid('province-build'));
    console.log(`  ${tag}: plan button ${await plan.count() ? 'present' : 'MISSING'}`);
    if (await plan.count()) {
      await plan.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: OUT + `play-construction-plan-${tag}.png` });
    }
  }
  await ctx.close();
}

// --- an AI-only match, world view ------------------------------------------------------------
await api('POST', '/api/match', { seed: 'map-review-observer', regions: 72, horizon: 960, pace_bp: 3300, controllers: ['hard', 'medium', 'medium', 'easy'], disclosed_objective: true });
for (let done = 0; done < Math.min(ROUNDS, 60);) {
  const before = (await api('GET', '/api/match')).round;
  await api('POST', '/api/advance', { rounds: 20 });
  for (let k = 0; k < 600; k++) {
    const m = await api('GET', '/api/match');
    if (m.finished || m.round >= before + 20 || (m.autoplay_until ?? 0) <= m.round) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const now = (await api('GET', '/api/match')).round;
  if (now === before) break;
  done += now - before;
}
const sp = await api('GET', '/api/spectator');
console.log(`observer: round ${sp.round}, ${sp.regions.length} regions, ${sp.regions.filter((r) => r.own).length} with works shown`);
for (const [size, lang, tag] of [[[1440, 900], 'en', 'en-1440'], [[1280, 720], 'zh-Hans', 'zh-720']]) {
  const { ctx, page } = await open(size, lang);
  await page.waitForSelector(tid('observer-console'));
  await page.click(tid('map-fit'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + `observer-world-${tag}.png` });
  const toggle = page.locator(tid('observer-side-toggle'));
  if (await toggle.count()) {
    await toggle.click();
    await page.waitForTimeout(300);
    await page.click(tid('map-fit'));
    await page.waitForTimeout(500);
    await page.screenshot({ path: OUT + `observer-world-wide-${tag}.png` });
    await page.click(tid('map-mode-construction'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + `observer-construction-${tag}.png` });
    console.log(`  ${tag}: plan button in observer view ${await page.locator(tid('province-build')).count() ? 'PRESENT (wrong)' : 'absent'}`);
  }
  await ctx.close();
}
await browser.close();
if (errors.length) { console.log('ERRORS\n  ' + [...new Set(errors)].join('\n  ')); process.exit(1); }
console.log('ok');
