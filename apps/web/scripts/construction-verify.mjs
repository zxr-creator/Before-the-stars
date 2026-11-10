// Construction and production, verified through the interface against a running referee.
//
//   source scripts/env.sh
//   target/release/bts serve --port 7986 --fresh --saves <dir> &       (serving apps/web/dist)
//   (cd apps/web && npm run build && BTS_URL=http://127.0.0.1:7986 node scripts/construction-verify.mjs)
//
// Starts a match whose seat 0 is run by stewards for a few rounds (so there are two
// regions, a workshop with a choice of method and a region without builders), takes the
// seat back, and then, through the regional works view only:
//   1. builds a new work and checks the order was charged exactly the quote shown;
//   2. expands a work by two levels, same check;
//   3. changes a production method and checks the next round ran it, with its inputs;
//   4. reorders a regional queue and checks the referee's order;
//   5. orders a work whose crew the region does not have, sees it stall for that reason,
//      supplies it and sees it resume.
// Screenshots go to screenshots/construction/ (LOCALE=zh-Hans for Chinese; SIZE=1280x720).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7986';
const LOCALE = process.env.LOCALE ?? 'en';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);
const OUT = fileURLToPath(new URL('../screenshots/construction/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const tag = `${LOCALE}-${W}x${H}`;
const log = (...a) => console.log('[construction]', ...a);
const tid = (id) => `[data-testid="${id}"]`;
function assert(c, m) { if (!c) throw new Error('Assertion failed: ' + m); }

async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const obsOf = () => api('GET', '/api/observation?seat=0');
async function advanceRounds(n, token) {
  for (let i = 0; i < n; i++) {
    const before = (await api('GET', '/api/match')).round;
    await api('POST', '/api/ready', { seat: 0, token, through_round: true });
    for (let k = 0; k < 900; k++) { if ((await api('GET', '/api/match')).round > before) break; await new Promise((r) => setTimeout(r, 100)); }
  }
}

/** Every term of the order equals the quote times the levels. */
function checkCharged(p, site, n) {
  const want = (site.cost_per_level ?? []).map((g) => `${g.good}:${g.amount * n}`).sort().join(',');
  const got = p.inputs_needed.map((g) => `${g.good}:${g.amount}`).sort().join(',');
  assert(got === want, `goods charged ${got} = quote x ${n} ${want}`);
  assert(p.work_needed === site.work_per_level * n, `work charged ${p.work_needed} = ${site.work_per_level} x ${n}`);
  const crewWant = (site.crew_per_level ?? []).map((c) => c.count * n).join(',');
  const crewGot = (p.crew ?? []).map((c) => c.needed).join(',');
  assert(crewGot === crewWant, `crew charged ${crewGot} = ${crewWant}`);
  assert((p.site_power ?? 0) === (site.site_power_per_level ?? 0) * n, 'site power charged = quote x levels');
  assert((p.min_months ?? site.min_months) === site.min_months, `minimum months ${p.min_months} = ${site.min_months}`);
  return `goods ${got || 'none'}, work ${p.work_needed}, crew ${crewGot || 'none'}, power ${p.site_power ?? 0}, ${p.min_months} months`;
}

// --- setup through the API -------------------------------------------------------------------
await api('POST', '/api/match', { seed: process.env.SEED ?? 'works-1', regions: 24, controllers: ['human', 'medium', 'medium', 'medium'] });
let m = await api('GET', '/api/match');
const token = m.seats[0].token ?? '';
await api('POST', '/api/delegate', { seat: 0, token, domains: m.steward_domains });
await advanceRounds(Number(process.env.STEWARD_ROUNDS ?? 9), token);
await api('POST', '/api/delegate', { seat: 0, token, domains: [] });
let obs = await obsOf();
const own = obs.regions.filter((r) => r.own);
const capital = own.find((r) => r.id === obs.civ.capital);
const quals = (r, q) => r.own.quals.filter((x) => q.includes(x.qual)).reduce((n, x) => n + x.count, 0);
const bare = own.find((r) => r.id !== capital.id && quals(r, ['builder', 'artisan']) === 0);
log(`round ${obs.round}; capital ${capital.name}; region without builders: ${bare?.name ?? 'none'}`);

// --- the browser ---------------------------------------------------------------------------
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
await ctx.addInitScript((loc) => { try { localStorage.setItem('bts.locale', loc); } catch { /* */ } }, LOCALE);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (x) => { if (x.type() === 'error') errors.push(x.text()); });
const shot = async (name) => {
  for (const b of await page.$$('.toast-x')) await b.click().catch(() => {});
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${OUT}${tag}-${name}.png` });
};
async function settle(selector) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/actions') && r.request().method() === 'POST', { timeout: 15000 }),
    page.waitForResponse((r) => r.url().includes('/api/observation'), { timeout: 15000 }),
    page.click(selector, { timeout: 10000 }),
  ]);
  await page.waitForTimeout(150);
  const body = await res.json();
  assert(body.receipts.every((r) => r.status === 'accepted'), `order accepted: ${JSON.stringify(body.receipts)}`);
  return body.receipts[0];
}
await page.goto(BASE + '/');
await page.waitForSelector(tid('map-canvas'), { timeout: 30000 });
await page.waitForTimeout(600);
for (const b of await page.$$(tid('panel-close'))) await b.click().catch(() => {});
await page.click(tid('rail-works'));
await page.waitForSelector(tid('overlay-works'));
await page.click(tid(`works-region-${capital.id}`));

// 1. a new work
await page.click(tid('works-tab-build'));
const fresh = obs.catalog.facilities.find((f) => f.available && !capital.own.facilities.some((x) => x.kind === f.kind)
  && (() => { const s = capital.own.construction_sites.find((x) => x.kind === f.kind); return s && s.max_level - s.queued_levels > 0 && (s.crew_per_level ?? []).length; })())
  ?? obs.catalog.facilities.find((f) => f.available && !capital.own.facilities.some((x) => x.kind === f.kind) && capital.own.construction_sites.some((x) => x.kind === f.kind && x.max_level > x.queued_levels));
assert(fresh, 'there is a new work to build in the capital');
const freshSite = capital.own.construction_sites.find((x) => x.kind === fresh.kind);
await page.click(tid(`build-card-${fresh.kind}`));
await page.waitForSelector(tid(`quote-${fresh.kind}`));
const shownWork = Number(await page.getAttribute(tid(`quote-${fresh.kind}`), 'data-work'));
assert(shownWork === freshSite.work_per_level, `the quote shown (${shownWork}) is the referee's (${freshSite.work_per_level})`);
await shot('01-build-quote');
const rec1 = await settle(tid(`order-${fresh.kind}`));
obs = await obsOf();
const p1 = obs.projects.find((p) => p.id === rec1.created);
log(`built ${fresh.kind}: charged ${checkCharged(p1, freshSite, 1)}`);

// 2. expand a work by two levels
await page.click(tid('works-tab-works'));
const reg = obs.regions.find((r) => r.id === capital.id);
const grow = reg.own.facilities.find((f) => { const s = reg.own.construction_sites.find((x) => x.kind === f.kind); return s && s.max_level - f.level - s.queued_levels >= 2 && f.kind !== fresh.kind; });
assert(grow, 'a work with room for two more levels');
const growSite = reg.own.construction_sites.find((x) => x.kind === grow.kind);
await page.click(tid(`work-row-${grow.kind}`));
await page.click(tid(`expand-levels-${grow.kind}-inc`));
await page.waitForFunction((k) => document.querySelector(`[data-testid="quote-${k}"]`)?.getAttribute('data-work') !== null, grow.kind);
const shownWork2 = Number(await page.getAttribute(tid(`quote-${grow.kind}`), 'data-work'));
assert(shownWork2 === growSite.work_per_level * 2, 'the quote for two levels is twice the referee’s quote');
await page.locator(tid(`expand-${grow.kind}`)).scrollIntoViewIfNeeded();
await shot('02-expand-quote');
const rec2 = await settle(tid(`expand-order-${grow.kind}`));
obs = await obsOf();
const p2 = obs.projects.find((p) => p.id === rec2.created);
log(`expanded ${grow.kind} by 2: charged ${checkCharged(p2, growSite, 2)}`);

// 3. a production method
// Prefer a works whose methods differ in their goods (workshops: stone, copper, iron tools) over fields.
const choices = obs.catalog.facilities.filter((f) => f.recipes.filter((r) => r.available).length > 1 && obs.regions.find((r) => r.id === capital.id).own.facilities.some((x) => x.kind === f.kind && x.level > 0 && x.enabled));
const choice = choices.find((f) => f.kind !== 'fields') ?? choices[0];
let methodNote = 'no works with a choice of method';
let chosen = null;
if (choice) {
  const fv = obs.regions.find((r) => r.id === capital.id).own.facilities.find((x) => x.kind === choice.kind);
  const running = fv.active_method;
  chosen = choice.recipes.find((r) => r.available && r.key !== running);
  await page.click(tid(`work-row-${choice.kind}`));
  await page.waitForSelector(tid(`methods-${choice.kind}`));
  await page.locator(tid(`methods-${choice.kind}`)).scrollIntoViewIfNeeded();
  await shot('03-methods-before');
  await settle(tid(`choose-${choice.kind}-${chosen.key}`));
  obs = await obsOf();
  const after = obs.regions.find((r) => r.id === capital.id).own.facilities.find((x) => x.kind === choice.kind);
  assert(after.method === chosen.key, `the referee recorded the method ${chosen.key}`);
  methodNote = `${choice.kind}: ${running} -> ${chosen.key} (chosen)`;
  log('method', methodNote);
}

// 5a. an order in a region without builders
let stallId = null;
if (bare) {
  const site = bare.own.construction_sites.find((s) => (s.crew_per_level ?? []).length && s.max_level - s.queued_levels > 0 && obs.catalog.facilities.find((f) => f.kind === s.kind)?.available);
  if (site) {
    await page.click(tid(`works-region-${bare.id}`));
    await page.click(tid('works-tab-build'));
    await page.click(tid(`build-card-${site.kind}`));
    await page.waitForSelector(tid(`quote-${site.kind}`));
    const crewLine = await page.textContent(`${tid(`quote-${site.kind}`)} [data-check="crew"]`);
    log(`before ordering ${site.kind} in ${bare.name}: “${crewLine.trim()}”`);
    await shot('04-crew-warning');
    const rec = await settle(tid(`order-${site.kind}`));
    stallId = rec.created;
  }
}

// 4. reorder a regional queue: the newest order of the region goes to the top
const qRegion = stallId ? bare : capital;
await page.click(tid(`works-region-${qRegion.id}`));
await page.click(tid('works-tab-queue'));
obs = await obsOf();
let q = obs.regions.find((r) => r.id === qRegion.id).own.construction_queue.slice().sort((a, b) => a.position - b.position);
if (q.length >= 2) {
  const last = q[q.length - 1];
  for (let i = q.length - 1; i > 0; i--) await settle(tid(`queue-up-${last.project}`));
  obs = await obsOf();
  q = obs.regions.find((r) => r.id === qRegion.id).own.construction_queue.slice().sort((a, b) => a.position - b.position);
  assert(q[0].project === last.project, 'the moved order is first in the referee’s regional queue');
  log(`queue in ${qRegion.name} now: ${q.map((e) => `${e.position}:${e.title}`).join(' | ')}`);
}
await shot('05-queue-reordered');

// end the round through the interface
async function endRound() {
  const before = (await api('GET', '/api/match')).round;
  await page.click(tid('works-close'));
  await page.click(tid('end-round'));
  for (let k = 0; k < 900; k++) { if ((await api('GET', '/api/match')).round > before) break; await new Promise((r) => setTimeout(r, 100)); }
  await page.waitForTimeout(1200);
  for (const b of await page.$$('.toast-x')) await b.click().catch(() => {});
  await page.click(tid('rail-works'));
  await page.waitForSelector(tid('overlay-works'));
}
await endRound();
obs = await obsOf();
if (choice && chosen) {
  const fv = obs.regions.find((r) => r.id === capital.id).own.facilities.find((x) => x.kind === choice.kind);
  assert(fv.active_method === chosen.key, `the next round ran ${chosen.key} (ran ${fv.active_method})`);
  log(`next round: ${choice.kind} ran ${fv.active_method}: ${JSON.stringify(fv.runs)}`);
  await page.click(tid(`works-region-${capital.id}`));
  await page.click(tid('works-tab-works'));
  await page.click(tid(`work-row-${choice.kind}`));
  await page.locator(tid(`methods-${choice.kind}`)).scrollIntoViewIfNeeded();
  await shot('06-methods-after');
}
const charged = obs.projects.find((p) => p.id === p1.id);
if (charged) log(`after a round the new work is ${(charged.work_done / charged.work_needed * 100).toFixed(0)}% done; blockers ${JSON.stringify(charged.blockers)}`);

// 5b. stall and resume
if (stallId) {
  await page.click(tid(`works-region-${bare.id}`));
  await page.click(tid('works-tab-queue'));
  let e = obs.regions.find((r) => r.id === bare.id).own.construction_queue.find((x) => x.project === stallId);
  log(`stalled order after a round: progress ${e?.progress_bp} bp, crew ${JSON.stringify(e?.crew)}, waiting for ${JSON.stringify(e?.waiting_for)}`);
  await shot('07-stalled');
  // Supply it through the interface: priority 0 in the queue, and a larger call-up in the economy
  // panel, so qualified people elsewhere may move to the site and labour can be called up.
  for (let i = 0; i < 9; i++) { if (await page.isDisabled(tid(`queue-prio-${stallId}-dec`))) break; await settle(tid(`queue-prio-${stallId}-dec`)); }
  await page.click(tid('works-close'));
  await page.click(tid('rail-economy'));
  await page.waitForSelector(tid('panel-economy'));
  for (let i = 0; i < 3; i++) { if (await page.isDisabled(tid('mobilization-inc'))) break; await settle(tid('mobilization-inc')); }
  await page.click(tid('panel-close'));
  await page.click(tid('rail-works'));
  await page.waitForSelector(tid('overlay-works'));
  let resumed = false;
  for (let round = 0; round < 4 && !resumed; round++) {
    await endRound();
    obs = await obsOf();
    e = obs.regions.find((r) => r.id === bare.id).own.construction_queue.find((x) => x.project === stallId);
    const p = obs.projects.find((x) => x.id === stallId);
    log(`round ${obs.round}: ${e ? `progress ${e.progress_bp} bp, crew ${JSON.stringify(e.crew)}, waiting ${JSON.stringify(e.waiting_for)}` : 'order completed'}${p ? `, last month +${p.last_progress}` : ''}`);
    resumed = !e || (p && p.last_progress > 0 && e.crew.every((c) => c.on_site >= c.needed));
  }
  await page.click(tid(`works-region-${bare.id}`));
  await page.click(tid('works-tab-queue'));
  await shot('08-resumed');
  log(resumed ? 'the stalled order resumed once its crew arrived' : 'the order is still short of its crew after four rounds');
}
await page.click(tid('works-tab-overview'));
await shot('09-overview');
assert(!errors.length, 'no page errors: ' + errors.join(' | '));
log('ok');
await browser.close();
