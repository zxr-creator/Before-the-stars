// Economy ledger: screenshots, an interaction pass and an arithmetic check.
//
//   target/release/bts serve --port 7984 --web apps/web/dist --saves .toolchain/econ-saves --fresh
//   cd apps/web && node scripts/economy-shots.mjs
//
// Plays a fully delegated human seat (seed "ledger") to rounds 10, 80 and 180 on
// the referee at BTS_URL, and at each stop:
//   * compares the ledger's recipe-derived estimates with the referee's verified
//     per-round totals, good by good (printed; the model is bundled from
//     src/economy/model.ts so the numbers are the ones the screen shows);
//   * screenshots every tab (plus the supply chain and an opened market row) in
//     English and Simplified Chinese at 1280×720 and 1440×900 into
//     screenshots/economy/.
// At round 80 it also drives the controls: tab keys, a jump from a market line to
// its works, a facility switch and a labour weight through the real API, and Esc;
// and it renders one synthetic "troubled" copy of that state (x-stress-*.png) so the
// shortage, starved-link, power, treaty and project-claim paths are exercised.
// Any page error or console error fails the run.
//
// Env: BTS_URL (default http://127.0.0.1:7984), PORT (Vite, default 5184),
//      SHOTS (default screenshots/economy), STOPS (default "10,80,180"), SKIP_PLAY=1
//      (use the match as it stands; one stop only).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.BTS_URL ?? 'http://127.0.0.1:7984';
const port = Number(process.env.PORT ?? 5184);
const out = resolve(root, process.env.SHOTS ?? 'screenshots/economy');
const stops = (process.env.STOPS ?? '10,80,180').split(',').map(Number);
mkdirSync(out, { recursive: true });

const post = async (path, body) => (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
const observe = async () => (await fetch(base + '/api/observation?seat=0')).json();

// --- the model, bundled for node -------------------------------------------------------
const bundled = await build({ entryPoints: [resolve(root, 'src/economy/model.ts')], bundle: true, format: 'esm', write: false, platform: 'node', logLevel: 'silent' });
const model = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));

const worst = [];
function check(obs, synthetic = false) {
  const L = model.buildLedger(obs);
  const f = (n) => (n / 1000).toFixed(1).padStart(9);
  const ratio = (est, ver) => (ver > 0 ? (est / ver).toFixed(2) : est > 0 ? 'new' : '–').padStart(5);
  console.log(`\nround ${obs.round}: ledger estimate vs referee, units per month (referee = last round's total / ${L.months})`);
  console.log('  good         standing  |  made: referee  ledger ratio |  used: referee  ledger ratio | cover mo');
  for (const r of L.rows.filter((x) => x.active)) {
    const made = r.madePerMonth;
    const used = r.line.consumed / L.months;
    console.log('  ' + r.good.padEnd(12), r.status.padEnd(9), '|', f(made), r.good === 'food' ? '   (plan)' : f(r.makeDerived), r.good === 'food' ? '    –' : ratio(r.makeDerived, made), ' |', f(used), f(r.useDerived), ratio(r.useDerived, used), ' |', r.cover === null ? '–' : r.cover.toFixed(1));
    if (synthetic) continue;
    if (r.good !== 'food' && r.good !== 'materials' && made > 1000) worst.push({ round: obs.round, good: r.good, side: 'made', ratio: r.makeDerived / made });
    if (used > 1000) worst.push({ round: obs.round, good: r.good, side: 'used', ratio: r.useDerived / used });
  }
  const chain = model.buildChain(L.cards);
  console.log(`  works ${L.cards.length} (held back ${L.cards.filter((c) => c.troubled).length}), chain: ${chain.stages.length} stages, ${chain.goods.length} goods, ${chain.cols} columns`);
  return L;
}

// --- browser ---------------------------------------------------------------------------------
const vite = await createServer({
  root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error',
  // no file watching or hot reload: other work in the tree must not reload the page mid-shot
  server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null, proxy: { '/api': base } },
});
await vite.listen();
const browser = await chromium.launch();
const errors = [];
const missing = new Set();
{
  // First load lets Vite finish optimising dependencies (it reloads the page when it does).
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/dev/economy.html`).catch(() => {});
  await page.waitForTimeout(2500);
  await page.close();
}

async function open(lang, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${lang} ${w}] ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${lang} ${w}] console: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${port}/dev/economy.html?lang=${lang}`);
  await page.waitForSelector('[data-testid="economy-ledger"]', { timeout: 20000 });
  await page.waitForTimeout(150);
  return { ctx, page };
}

async function shoot(tag, obs) {
  for (const lang of ['en', 'zh-Hans']) {
    for (const [w, h] of [[1280, 720], [1440, 900]]) {
      const { ctx, page } = await open(lang, w, h);
      const name = (part) => `${out}/${tag}-${lang}-${w}-${part}.png`;
      await page.screenshot({ path: name('1-market') });
      // open the busiest non-food row and the food row
      const pick = obs.civ.goods.filter((g) => g.good !== 'food' && (g.produced || g.consumed)).sort((a, b) => b.consumed - a.consumed)[0]?.good ?? 'materials';
      await page.click(`[data-testid="good-${pick}"]`);
      await page.waitForTimeout(80);
      await page.locator(`[data-good="${pick}"]`).scrollIntoViewIfNeeded();
      await page.screenshot({ path: name('1-market-open') });
      await page.keyboard.press('2');
      await page.waitForSelector('[data-testid="ledger-production"]');
      await page.screenshot({ path: name('2-production') });
      await page.click('[data-testid="prod-group-region"]');
      await page.waitForTimeout(80);
      await page.screenshot({ path: name('2-production-region') });
      await page.click('[data-testid="prod-view-chain"]');
      await page.waitForTimeout(120);
      await page.screenshot({ path: name('2-chain') });
      await page.keyboard.press('3');
      await page.waitForSelector('[data-testid="ledger-workforce"]');
      await page.screenshot({ path: name('3-workforce') });
      await page.keyboard.press('4');
      await page.waitForSelector('[data-testid="ledger-balance"]');
      await page.screenshot({ path: name('4-balance') });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || (document.querySelector('.ledger-body')?.scrollWidth ?? 0) > (document.querySelector('.ledger-body')?.clientWidth ?? 0) + 1);
      if (overflow) errors.push(`[${tag} ${lang} ${w}] horizontal overflow`);
      if (lang !== 'en') for (const s of await page.evaluate(() => window.__btsI18n?.missing() ?? [])) missing.add(s);
      await ctx.close();
    }
  }
}

// A deliberately troubled variant of a real observation, so the shortage, starved-link,
// power-deficit, treaty and project-claim paths are seen at least once. Clearly synthetic:
// it is rendered from a routed JSON file and never sent to the referee.
function troubled(real) {
  const o = structuredClone(real);
  const types = new Map(o.catalog.facilities.map((f) => [f.kind, f]));
  const cards = o.regions.filter((r) => r.own).flatMap((r) => r.own.facilities.map((f) => ({ r, f, type: types.get(f.kind) })));
  const withInputs = cards.filter((c) => c.f.runs[0] && c.type?.recipes.find((x) => x.key === c.f.runs[0].recipe)?.inputs.length);
  const good = (g) => o.civ.goods.find((x) => x.good === g);
  // two works starved of an input
  for (const c of withInputs.slice(0, 2)) {
    const g = c.type.recipes.find((x) => x.key === c.f.runs[0].recipe).inputs[0].good;
    Object.assign(c.f.runs[0], { rate_bp: 0, blockers: ['Short of ' + g.replace('_', ' ')], missing: [g] });
    c.f.utilization_bp = 0;
    good(g).stock = 0;
  }
  // worn plant, missing qualified staff, a works switched off
  const skilled = cards.filter((c) => c.f.runs[0] && c.type?.jobs.some((j) => j.qual) && !c.f.runs[0].missing?.length);
  if (skilled[0]) { skilled[0].f.runs[0].blockers = ['Qualified staff are missing', 'Worn equipment: upkeep has been missed']; skilled[0].f.runs[0].rate_bp = 3100; skilled[0].f.utilization_bp = 3100; skilled[0].f.condition_bp = 6200; skilled[0].f.staffed = Math.floor(skilled[0].f.staff_needed / 2); }
  if (skilled[1]) { skilled[1].f.enabled = false; skilled[1].f.runs = []; skilled[1].f.staffed = 0; skilled[1].f.utilization_bp = 0; }
  // a region short of shaft power
  const powered = cards.find((c) => c.f.runs[0] && c.f.runs[0].rate_bp > 0 && !c.f.runs[0].blockers.length);
  if (powered) { powered.r.own.power.shaft_demand = 64000; powered.r.own.power.shaft_supply = 20000; powered.f.runs[0].blockers = ['Not enough shaft power']; powered.f.runs[0].rate_bp = 3125; powered.f.utilization_bp = 3125; }
  // hunger, and tools running down
  o.civ.food_fulfillment_bp = 8600;
  good('food').stock = Math.round(o.civ.population * 600);
  good('tools').stock = Math.round(good('tools').consumed / 4);
  // goods treaties both ways with the first other civilization
  const other = o.others[0]?.seat ?? 1;
  o.diplomacy.treaties.push({ id: 9001, parties: [o.seat, other], clauses: [
    { kind: 'goods', from: other, good: 'tools', amount_per_month: 2000, months: 24 },
    { kind: 'goods', from: o.seat, good: 'food', amount_per_month: 30000, months: 24 },
  ], summary: [], signed_month: o.month - 12, ends_month: o.month + 12, status: 'active', performance: [] });
  good('tools').traded_in = 24000;
  good('food').traded_out = 360000;
  // a project waiting for more metal than there is
  o.projects.push({ id: 9002, kind: 'build', title: 'Build Steelworks in ' + (o.regions.find((r) => r.own)?.name ?? ''), region: o.regions.find((r) => r.own)?.id ?? null, target: 'steelworks',
    work_needed: 400000, work_done: 20000, inputs_needed: [{ good: 'metal', amount: 400000 }, { good: 'tools', amount: 60000 }], inputs_committed: [{ good: 'metal', amount: 60000 }, { good: 'tools', amount: 60000 }],
    priority: 5, paused: false, started_month: o.month - 3, last_progress: 0, blockers: ['Waiting for metal'], eta_months_low: null, eta_months_high: null });
  return o;
}

async function stress(real) {
  const json = troubled(real);
  console.log('\nsynthetic troubled state (not from the referee):');
  check(json, true);
  for (const [lang, w, h] of [['en', 1440, 900], ['zh-Hans', 1280, 720]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[stress ${lang}] ${e}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[stress ${lang}] console: ${m.text()}`); });
    await page.route((url) => url.pathname === '/__stress.json', (route) => route.fulfill({ json }));
    await page.goto(`http://127.0.0.1:${port}/dev/economy.html?lang=${lang}&obs=/__stress.json`);
    await page.waitForSelector('[data-testid="economy-ledger"]');
    const name = (part) => `${out}/x-stress-${lang}-${w}-${part}.png`;
    await page.selectOption('[data-testid="market-sort"]', 'status');
    await page.locator('.ledger-row.is-shortage .ledger-row-main').first().click();
    await page.waitForTimeout(80);
    await page.screenshot({ path: name('1-market') });
    await page.keyboard.press('2');
    await page.click('[data-testid="prod-filter-held"]');
    await page.waitForTimeout(80);
    await page.screenshot({ path: name('2-production-held') });
    await page.click('[data-testid="prod-view-chain"]');
    await page.waitForTimeout(120);
    await page.screenshot({ path: name('2-chain') });
    await page.hover('.ledger-node.is-stage.is-starved');
    await page.waitForTimeout(80);
    await page.screenshot({ path: name('2-chain-hover') });
    await page.keyboard.press('4');
    await page.waitForSelector('[data-testid="ledger-balance"]');
    await page.screenshot({ path: name('4-balance') });
    if (lang !== 'en') for (const s of await page.evaluate(() => window.__btsI18n?.missing() ?? [])) missing.add(s);
    await ctx.close();
  }
  console.log('  shots: x-stress-* (synthetic troubles laid over the real round-80 state)');
}

async function interact() {
  const { ctx, page } = await open('en', 1440, 900);
  const expect = async (what, fn) => {
    // state updates render asynchronously: give each expectation a moment to come true
    for (let i = 0; i < 15; i++) { if (await fn()) { console.log('  ok  ' + what); return; } await page.waitForTimeout(100); }
    errors.push('interaction: ' + what);
  };
  const activeTab = () => page.getAttribute('.ledger-tab.is-active', 'data-testid');
  console.log('\ninteractions (round 80, English, 1440×900)');
  for (const [key, tab] of [['2', 'production'], ['3', 'workforce'], ['4', 'balance'], ['1', 'market']]) {
    await page.keyboard.press(key);
    await expect(`key ${key} opens ${tab}`, async () => (await activeTab()) === 'ledger-tab-' + tab);
  }
  // tooltip
  await page.hover('.ledger-row .ledger-big');
  await expect('hovering a figure shows its source', async () => /referee/i.test((await page.textContent('.ledger-tip')) ?? ''));
  // problems-only filter and sorting
  const before = await page.locator('.ledger-row').count();
  await page.check('[data-testid="market-problems"]');
  const after = await page.locator('.ledger-row').count();
  await expect(`problems-only narrows the list (${before} → ${after})`, async () => after <= before);
  await page.uncheck('[data-testid="market-problems"]');
  await page.selectOption('[data-testid="market-sort"]', 'cover');
  await expect('sorting by cover regroups the rows', async () => (await page.locator('.ledger-group-head').count()) === 0);
  await page.selectOption('[data-testid="market-sort"]', 'group');
  // a maker line jumps to its works
  await page.click('[data-testid="good-tools"]');
  await page.click('[data-good="tools"] .ledger-breakdown .ledger-line.is-link');
  await expect('a maker line opens its works card', async () => (await activeTab()) === 'ledger-tab-production' && (await page.locator('.ledger-card.is-flash').count()) === 1);
  // switch a works off and on through the real API
  const key = await page.getAttribute('.ledger-card.is-flash', 'data-card');
  const [region, kind] = key.split(':');
  const enabled = async () => (await observe()).regions.find((r) => r.id === Number(region)).own.facilities.find((f) => f.kind === kind).enabled;
  await page.click(`[data-testid="toggle-${key}"]`);
  await page.waitForFunction((k) => document.querySelector(`[data-testid="toggle-${k}"]`)?.getAttribute('aria-checked') === 'false', key);
  await expect(`switching ${kind} off reaches the referee`, async () => (await enabled()) === false);
  await page.screenshot({ path: `${out}/x-switched-off.png` });
  await page.click(`[data-testid="toggle-${key}"]`);
  await page.waitForFunction((k) => document.querySelector(`[data-testid="toggle-${k}"]`)?.getAttribute('aria-checked') === 'true', key);
  await expect(`switching ${kind} back on reaches the referee`, async () => (await enabled()) === true);
  // labour weight
  await page.keyboard.press('3');
  const weight = async () => (await observe()).civ.policies.labor_weights.find(([c]) => c === 'industry')[1];
  const w0 = await weight();
  await page.click('[data-testid="ledger-weight-industry-inc"]');
  await page.waitForTimeout(400);
  await expect(`industry weight ${w0} → ${w0 + 1} reaches the referee`, async () => (await weight()) === w0 + 1);
  await page.click('[data-testid="ledger-weight-industry-dec"]');
  await page.waitForTimeout(400);
  await expect('and back', async () => (await weight()) === w0);
  // a finding leads somewhere, a held-back card offers a step
  await page.keyboard.press('4');
  const steps = await page.locator('.ledger-findings .ledger-step').count();
  if (steps) {
    await page.locator('.ledger-findings .ledger-step').first().click();
    await expect('a finding’s button leaves the balance sheet', async () => (await page.locator('[data-testid="dev-closed"]').count()) === 1 || (await activeTab()) !== 'ledger-tab-balance');
    if (await page.locator('[data-testid="dev-reopen"]').count()) await page.click('[data-testid="dev-reopen"]');
  }
  await page.keyboard.press('2');
  await page.click('[data-testid="prod-build"]');
  await expect('Build opens the projects panel with a build intent and closes the ledger', async () => (await page.textContent('[data-testid="dev-panel"]')) === 'projects' && /"kind":"build"/.test(await page.textContent('[data-testid="dev-intent"]')));
  await page.click('[data-testid="dev-reopen"]');
  await page.waitForSelector('[data-testid="economy-ledger"]');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await expect('Esc closes the ledger', async () => (await page.locator('[data-testid="dev-closed"]').count()) === 1);
  await ctx.close();
}

try {
  if (!process.env.SKIP_PLAY) {
    await post('/api/match', { seed: process.env.SEED ?? 'ledger', controllers: ['human', 'hard', 'medium', 'medium'] });
    await post('/api/delegate', { seat: 0, domains: ['economy', 'research', 'education', 'culture', 'expansion', 'military'] });
  }
  let round = (await observe()).round ?? 0;
  for (const stop of process.env.SKIP_PLAY ? [round] : stops) {
    while (round < stop) {
      const m = await post('/api/ready', { seat: 0, through_round: true });
      if (m.finished) break;
      round = m.round ?? round + 1;
    }
    const obs = await observe();
    const L = check(obs);
    const tag = 'r' + String(obs.round).padStart(3, '0');
    await shoot(tag, obs);
    console.log(`  shots: ${tag}-{en,zh-Hans}-{1280,1440}-*.png (${L.rows.filter((r) => r.active).length} goods)`);
    if (stop === 80 || process.env.SKIP_PLAY) { await interact(); await stress(await observe()); }
  }
} catch (e) {
  errors.push(String(e));
} finally {
  await browser.close();
  await vite.close();
}

const off = worst.filter((x) => x.ratio < 0.5 || x.ratio > 2);
console.log(`\narithmetic: ${worst.length} comparisons above 1 unit/month; ${worst.filter((x) => x.ratio >= 0.8 && x.ratio <= 1.25).length} within 0.8–1.25×, ${off.length} off by more than 2×`);
for (const x of off) console.log(`  round ${x.round} ${x.good} ${x.side}: ledger/referee = ${x.ratio.toFixed(2)}`);
if (missing.size) console.log(`\nuntranslated strings seen in zh-Hans (${missing.size}):\n  ` + [...missing].join('\n  '));
if (errors.length) {
  console.error('\nFAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`\nOK — screenshots in ${out}/`);
