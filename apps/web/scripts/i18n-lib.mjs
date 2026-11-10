// Shared helpers for the localization tooling (i18n-coverage.mjs, i18n-shots.mjs):
// a tiny client for the referee's HTTP API, a headless "player" that takes a delegated
// human seat deep into a match while harvesting every piece of server text, and a scripted
// walk through every panel of the web client.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = join(WEB, '..', '..');
export const BASE = (process.env.BTS_URL ?? 'http://127.0.0.1:7983').replace(/\/$/, '');
export const DOMAINS = ['economy', 'research', 'education', 'culture', 'expansion', 'military'];
export const PANELS = ['briefing', 'economy', 'projects', 'people', 'knowledge', 'culture', 'politics', 'diplomacy', 'military', 'objectives', 'chronicle'];

// ---- HTTP -----------------------------------------------------------------------------

export async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}
export const post = (path, body) => call('POST', path, body);
export const get = (path) => call('GET', path);

// ---- proper names that legitimately stay in Latin letters -----------------------------------

/** Region names are generated from syllables (worldgen.rs); they are never translated. */
export function regionNameRe() {
  try {
    const src = readFileSync(join(REPO, 'crates', 'bts-engine', 'src', 'worldgen.rs'), 'utf8');
    const list = (name) => {
      const m = new RegExp(`const ${name}: &\\[&str\\] = &\\[([^\\]]*)\\]`).exec(src);
      return m ? [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : [];
    };
    const a = list('SYL_A'); const b = list('SYL_B'); const c = list('SYL_C');
    if (a.length && c.length) return new RegExp(`\\b(?:${a.join('|')})(?:${b.join('|')})?(?:${c.join('|')})\\b`, 'g');
  } catch { /* sources not available: fall back to names seen in observations */ }
  return null;
}

// ---- harvesting --------------------------------------------------------------------------

// Keys whose values are identifiers, enums or geometry rather than prose.
const SKIP_KEYS = new Set([
  'id', 'handle', 'key', 'kind', 'color', 'match_id', 'protocol_version', 'phase', 'status', 'severity', 'panel', 'art',
  'state', 'class', 'visibility', 'terrain', 'settlement', 'intent', 'order', 'venue', 'epistemic', 'site_key', 'recipe',
  'course', 'target', 'good', 'qual', 'output', 'labor_category', 'links', 'missing', 'code', 'action', 'poly', 'entrants',
  'teachers', 'labor_weights', 'controller',
]);

export class Harvest {
  constructor() {
    /** text → { count, where } */
    this.strings = new Map();
    this.regionNames = new Set();
    this.freeText = new Set();
    this.samples = 0;
  }

  add(text, where) {
    if (typeof text !== 'string' || !/[A-Za-z]/.test(text)) return;
    const hit = this.strings.get(text);
    if (hit) hit.count += 1;
    else this.strings.set(text, { count: 1, where });
  }

  /** Collect every prose string of one seat's observation. */
  observation(obs, nativeSeats) {
    this.samples += 1;
    for (const r of obs.regions ?? []) this.regionNames.add(r.name);
    // path is the full dotted path of the value ("knowledge.techs[].label"); key its property name
    const walk = (v, path, key) => {
      if (v === null || v === undefined) return;
      if (typeof v === 'string') {
        const shownEnum = path === 'catalog.facilities[].category' || path === 'knowledge.techs[].label';
        if (SKIP_KEYS.has(key) && !shownEnum) return;
        if (path === 'regions[].name') return; // generated region names stay as they are
        if (path === 'chronicle[].category') return; // moment category enum
        if (/^[a-z0-9_:]+$/.test(v) && !shownEnum) return; // wire keys
        this.add(v, path);
        return;
      }
      if (Array.isArray(v)) { for (const x of v) walk(x, path + '[]', key); return; }
      if (typeof v === 'object') {
        const freeText = path === 'diplomacy.messages[]' || path === 'diplomacy.offers[]';
        // free text: only what native AI seats wrote is canned (and translated by the client)
        if (freeText && typeof v.text === 'string' && v.text) {
          if (nativeSeats.has(v.from)) this.add(v.text, path + '.text (native AI)');
          else this.freeText.add(v.text);
        }
        for (const [k, x] of Object.entries(v)) {
          if (freeText && k === 'text') continue;
          if (SKIP_KEYS.has(k) && typeof x !== 'string' && !Array.isArray(x)) continue;
          if (SKIP_KEYS.has(k) && Array.isArray(x) && x.every((y) => typeof y !== 'object')) continue;
          walk(x, path ? path + '.' + k : k, k);
        }
      }
    };
    for (const [k, x] of Object.entries(obs)) walk(x, k, k);
  }

  receipts(list) {
    for (const r of list ?? []) if (r && typeof r.reason === 'string') this.add(r.reason, 'receipt.reason');
  }
}

/** A batch of deliberately invalid orders: every one must be rejected with a reason. */
export function invalidActions(obs, variant = 0) {
  const cap = obs.civ.capital;
  const other = obs.others[0]?.seat ?? 1;
  const known = obs.knowledge.techs.find((t) => t.state === 'understood');
  const sets = [
    [
      { kind: 'start_project', spec: { kind: 'build', region: cap, facility: 'no_such_facility', levels: 1 }, priority: null },
      { kind: 'start_project', spec: { kind: 'build', region: 9999, facility: 'workshop', levels: 1 }, priority: null },
      { kind: 'start_project', spec: { kind: 'build', region: cap, facility: 'makers_circle', levels: 99 }, priority: null },
      { kind: 'start_project', spec: { kind: 'build', region: cap, facility: 'jump_yard', levels: 1 }, priority: null },
      { kind: 'start_project', spec: { kind: 'build', region: cap, facility: 'fission', levels: 1 }, priority: null },
      { kind: 'start_project', spec: { kind: 'build', region: cap, facility: 'port', levels: 3 }, priority: null },
      { kind: 'start_project', spec: { kind: 'build', region: cap, facility: 'mine_minerals', levels: 1 }, priority: null },
      { kind: 'start_project', spec: { kind: 'research', tech: 'k0000000' }, priority: null },
      ...(known ? [{ kind: 'start_project', spec: { kind: 'research', tech: known.handle }, priority: null }] : []),
      { kind: 'start_project', spec: { kind: 'survey', region: 9999 }, priority: null },
      { kind: 'start_project', spec: { kind: 'survey', region: cap }, priority: null },
      { kind: 'start_project', spec: { kind: 'settle', from: cap, to: cap, people: 50 }, priority: null },
      { kind: 'start_project', spec: { kind: 'settle', from: cap, to: 9999, people: 50 }, priority: null },
      { kind: 'start_project', spec: { kind: 'study', domain: 'no_such_domain' }, priority: null },
    ],
    [
      { kind: 'start_project', spec: { kind: 'resettle', from: cap, to: cap, people: 10_000_000 }, priority: null },
      { kind: 'start_project', spec: { kind: 'recruit', region: cap, role: 'assault', soldiers: 50, tier: 9 }, priority: null },
      { kind: 'start_project', spec: { kind: 'recruit', region: cap, role: 'assault', soldiers: 1, tier: 0 }, priority: null },
      { kind: 'start_project', spec: { kind: 'recruit', region: cap, role: 'denial', soldiers: 4000, tier: 0 }, priority: null },
      { kind: 'start_project', spec: { kind: 'recruit', region: cap, role: 'maneuver', soldiers: 50, tier: 1 }, priority: null },
      { kind: 'start_project', spec: { kind: 'religion', beliefs: ['no_such_belief'], name: null }, priority: null },
      { kind: 'start_project', spec: { kind: 'religion', beliefs: [], name: null }, priority: null },
      { kind: 'start_project', spec: { kind: 'ftl_trial' }, priority: null },
      { kind: 'start_project', spec: { kind: 'ftl_deployment' }, priority: null },
      { kind: 'start_project', spec: { kind: 'ftl_replacement' }, priority: null },
      { kind: 'manage_project', project: 999999, op: 'cancel', priority: null },
      { kind: 'investigate', lead: 'k0000000' },
      { kind: 'propose_reform', practice: 'p0000000' },
    ],
    [
      { kind: 'start_program', region: cap, course: 'E999', seats: 8 },
      { kind: 'start_program', region: cap, course: 'E001', seats: 0 },
      { kind: 'start_program', region: cap, course: 'E024', seats: 8 },
      { kind: 'start_program', region: cap, course: 'E001', seats: 1900 },
      { kind: 'start_program', region: 9999, course: 'E001', seats: 8 },
      { kind: 'manage_program', program: 999999, op: 'pause', seats: null },
      { kind: 'demolish', region: cap, facility: 'no_such_facility', levels: 1 },
      { kind: 'demolish', region: cap, facility: 'jump_yard', levels: 1 },
      { kind: 'military_order', army: 999999, order: { kind: 'hold' } },
      { kind: 'set_policy', setting: { kind: 'food_reserve_months', months: 99 } },
      { kind: 'set_policy', setting: { kind: 'rename', name: '' } },
      { kind: 'set_policy', setting: { kind: 'move_capital', region: 9999 } },
      { kind: 'set_policy', setting: { kind: 'facility', region: cap, facility: 'no_such_facility', enabled: false } },
    ],
    [
      { kind: 'select_contacts', seats: [9] },
      { kind: 'select_contacts', seats: [0, 1, 2, 3, 1] },
      { kind: 'message', to: 9, text: 'x', intent: null },
      { kind: 'message', to: other, text: 'x'.repeat(2100), intent: 'inquiry' },
      { kind: 'propose_treaty', to: other, clauses: [], text: null },
      { kind: 'propose_treaty', to: 9, clauses: [{ kind: 'peace' }], text: null },
      { kind: 'withdraw_offer', offer: 999999 },
      { kind: 'sign_treaty', offer: 999999 },
      { kind: 'decline_offer', offer: 999999 },
      { kind: 'break_treaty', treaty: 999999 },
    ],
  ];
  return sets[variant % sets.length];
}

/** Proposals that the treaty validator must refuse (sent on an open channel). */
export function invalidProposals(obs, to) {
  const me = obs.seat;
  const cap = obs.civ.capital;
  const mk = (clauses) => ({ kind: 'propose_treaty', to, clauses, text: null });
  return [
    mk([]),
    mk([{ kind: 'goods', from: me, good: 'food', amount_per_month: 0, months: 1 }]),
    mk([{ kind: 'goods', from: me, good: 'food', amount_per_month: 1000, months: 12 }]),
    mk([{ kind: 'knowledge', from: me, tech: 'k0000000' }]),
    mk([{ kind: 'practice', from: me, practice: 'p0000000' }]),
    mk([{ kind: 'maps', from: 9 }]),
    mk([{ kind: 'non_aggression', months: 0 }]),
    mk([{ kind: 'defensive_pact', months: 120 }]),
    mk([{ kind: 'peace' }]),
    mk([{ kind: 'subordination', from: to, tribute_bp: 1000 }]),
    mk([{ kind: 'subordination', from: 9, tribute_bp: 1000 }]),
    mk([{ kind: 'cede_region', from: to, region: cap }]),
    mk([{ kind: 'cede_region', from: me, region: 9999 }]),
  ];
}

/**
 * Create a match and play seat 0 as a fully delegated human. Diplomacy is not a steward
 * domain, so this player selects every known counterpart, signs what the native AI proposes
 * (per `signPolicy`), writes to open channels and proposes pacts — which is what makes treaty,
 * war, tribute and correspondence text appear. Every seat's observation is harvested.
 */
export async function play({ seed, rounds, harvest, disclosed = false, signPolicy = 'all', invalid = true, onRound, onNegotiate, log = () => {}, sampleEvery = 1 }) {
  const m = await post('/api/match', { seed, controllers: ['human', 'hard', 'medium', 'medium'], disclosed_objective: disclosed });
  if (!m.ok) throw new Error(`could not create a match: ${JSON.stringify(m.data)}`);
  const token = m.data.seats?.[0]?.token ?? '';
  const nativeSeats = new Set(m.data.seats.filter((s) => String(s.controller).startsWith('native')).map((s) => s.seat));
  const act = async (actions) => {
    const r = await post('/api/actions', { seat: 0, token, actions });
    if (harvest) {
      if (r.ok) harvest.receipts(r.data?.receipts);
      // whole-batch refusals; JSON parser diagnostics ("… at line 1 column 7") are developer text
      else if (r.data?.message && !/at line \d+ column \d+/.test(r.data.message)) harvest.add(r.data.message, 'api.error');
    }
    return r;
  };
  const ready = (through) => post('/api/ready', { seat: 0, token, through_round: through });
  const observe = async (seat) => {
    const r = await get(`/api/observation?seat=${seat}&token=${seat === 0 ? token : ''}`);
    return r.ok ? r.data : null;
  };
  await post('/api/delegate', { seat: 0, token, domains: DOMAINS });
  let state = m.data;
  let variant = 0;
  let proposed = 0;
  const INTENTS = ['inquiry', 'need', 'warning', 'alliance_proposal', 'quotation', 'claim', 'counteroffer'];
  while (!state.finished && state.round <= rounds) {
    const round = state.round;
    const obs = await observe(0);
    if (!obs) throw new Error('observation unavailable');
    if (harvest && round % sampleEvery === 0) {
      harvest.observation(obs, nativeSeats);
      // other seats are readable on referees that do not require tokens; richer late-game text
      if (round % 4 === 0 || round <= 3) {
        for (const s of [1, 2, 3]) {
          const o = await observe(s);
          if (o) harvest.observation(o, nativeSeats);
        }
      }
    }
    if (onRound) await onRound(round, obs, state);
    // contact phase: ask for a channel with everyone we know
    const known = obs.others.filter((o) => o.status === 'active').map((o) => o.seat).slice(0, 3);
    if (state.phase === 'contact') {
      if (known.length) await act([{ kind: 'select_contacts', seats: known }]);
      if (invalid && harvest && round % 9 === 2) { await act(invalidActions(obs, variant)); variant += 1; }
      state = (await ready(false)).data;
    }
    // negotiation: answer offers, write, and (rarely) propose
    if (state.phase === 'negotiate') {
      const o2 = await observe(0);
      if (onNegotiate) await onNegotiate(round, o2, state);
      const open = o2.diplomacy.channels.filter((c) => c.open).map((c) => c.seat);
      const acts = [];
      for (const off of o2.diplomacy.offers.filter((x) => x.to === 0 && x.status === 'open')) {
        const subord = off.clauses.some((c) => c.kind === 'subordination' && c.from === 0);
        const sign = signPolicy === 'all' ? true : signPolicy === 'no-subordination' ? !subord : false;
        acts.push({ kind: sign ? 'sign_treaty' : 'decline_offer', offer: off.id });
      }
      for (const seat of open) {
        if (round % 5 === 1) acts.push({ kind: 'message', to: seat, text: 'Coverage harvest: please answer.', intent: INTENTS[(round + seat) % INTENTS.length] });
        if (round % 12 === 3) {
          acts.push({ kind: 'propose_treaty', to: seat, clauses: [{ kind: 'non_aggression', months: 60 }, { kind: 'maps', from: 0 }, { kind: 'maps', from: seat }], text: null });
          proposed += 1;
        }
        if (round % 20 === 7) acts.push({ kind: 'propose_treaty', to: seat, clauses: [{ kind: 'goods', from: 0, good: 'food', amount_per_month: 20_000, months: 1 }, { kind: 'goods', from: seat, good: 'tools', amount_per_month: 5_000, months: 1 }], text: null });
      }
      if (acts.length) await act(acts.slice(0, 30));
      if (invalid && harvest && open.length && round % 25 === 4) await act(invalidProposals(o2, open[0]));
    }
    state = (await ready(true)).data;
    if (round % 20 === 0) log(`  ${seed}: round ${round}, ${harvest ? harvest.strings.size + ' strings' : ''}`);
  }
  // final state, all seats
  if (harvest) {
    for (const s of [0, 1, 2, 3]) {
      const o = await observe(s);
      if (o) harvest.observation(o, nativeSeats);
    }
  }
  return { state, token, proposed };
}

// ---- driving the web client ---------------------------------------------------------------

export const tid = (id) => `[data-testid="${id}"]`;

export async function openClient(browser, { locale = 'zh-Hans', width = 1440, height = 900 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // the flat atlas keeps headless runs fast; the panels under test are the same in either map mode
  await page.addInitScript((l) => { try { localStorage.setItem('bts.locale', l); localStorage.setItem('bts.mapTier', 'flat'); } catch { /* ignore */ } }, locale);
  await page.goto(BASE + '/');
  await page.waitForFunction(() => !!window.__btsI18n, null, { timeout: 20000 });
  await page.evaluate((l) => window.__btsI18n.setLocale(l), locale);
  await page.waitForSelector('[data-testid^="rail-"]', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(700);
  await settle(page);
  return { page, errors };
}

/** Close whatever the shell may have put in front of the panels (tutorial cards, result dialog). */
export async function settle(page) {
  for (let i = 0; i < 6; i += 1) {
    const modal = await page.$('[data-tutorial-modal], [data-testid="result-screen"], [data-testid="handover-continue"]');
    if (!modal) break;
    const btn = await page.$('[data-tutorial-modal] [data-testid*="skip"], [data-tutorial-modal] [data-testid*="close"], [data-testid="result-dismiss"], [data-testid="result-screen"] button, [data-testid="handover-continue"]');
    if (btn) await btn.click().catch(() => {});
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
}

async function tryClick(page, selector, wait = 180) {
  const el = await page.$(selector);
  if (!el) return false;
  try { await el.click({ timeout: 1500 }); } catch { return false; }
  await page.waitForTimeout(wait);
  return true;
}

async function expandAll(page) {
  for (let i = 0; i < 12; i += 1) {
    const el = await page.$('.drawer .expander-head[aria-expanded="false"], .inspector .expander-head[aria-expanded="false"]');
    if (!el) break;
    try { await el.click({ timeout: 800 }); } catch { break; }
    await page.waitForTimeout(40);
  }
}

export async function openPanel(page, name) {
  const sel = tid(`panel-${name}`);
  if (!(await page.$(sel))) await page.click(tid(`rail-${name}`), { timeout: 4000 });
  await page.waitForSelector(sel, { timeout: 4000 });
  await page.waitForTimeout(250);
}

export async function closePanel(page) {
  for (let i = 0; i < 4; i += 1) {
    if (!(await page.$('[data-testid^="panel-"], [data-testid="inspector"]'))) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
  }
}

/** Click a region on the map through the renderer's own hit test (window.__atlas). */
export async function selectRegion(page, id) {
  const find = () => page.evaluate((rid) => {
    const a = window.__atlas;
    if (!a || !a.regionScreenCenter) return null;
    const c = a.regionScreenCenter(rid);
    if (!c) return null;
    const tries = [[0, -25], [0, -40], [22, -12], [-22, -12], [0, 26], [34, 8], [-34, 8], [0, 0], [0, -60], [50, -30], [-50, -30]];
    for (const [dx, dy] of tries) {
      const x = c[0] + dx; const y = c[1] + dy;
      const el = document.elementFromPoint(x, y);
      if (a.regionAt(x, y) === rid && el && el.tagName === 'CANVAS') return [x, y];
    }
    return null;
  }, id);
  let pt = await find();
  if (!pt) {
    await closePanel(page);
    await tryClick(page, tid('map-fit'), 400);
    pt = await find();
  }
  if (!pt) return false;
  await page.mouse.click(pt[0], pt[1]);
  try { await page.waitForSelector(tid('inspector'), { timeout: 4000 }); } catch { return false; }
  await page.waitForTimeout(150);
  return true;
}

/**
 * Walk every panel, tab, form and the inspector. `shot(name)` is called at each stop
 * (take a screenshot, or do nothing). Returns the list of stops that could not be reached.
 */
export async function walk(page, obs, shot = async () => {}) {
  const skipped = [];
  const stop = async (name, fn) => {
    try { await fn(); await expandAll(page); await shot(name); } catch (e) { skipped.push(`${name}: ${String(e).split('\n')[0]}`); }
  };
  const scrollDown = async (name) => {
    const moved = await page.evaluate(() => {
      const el = document.querySelector('.drawer .drawer-body') ?? document.querySelector('.drawer');
      if (!el) return false;
      const scroller = [el, ...el.querySelectorAll('*')].find((x) => x.scrollHeight > x.clientHeight + 40 && getComputedStyle(x).overflowY !== 'visible');
      if (!scroller) return false;
      scroller.scrollTo(0, scroller.scrollHeight);
      return true;
    });
    if (moved) { await page.waitForTimeout(120); await shot(name); }
  };

  const back = () => tryClick(page, '.drawer .subnav .linklike');

  await stop('briefing', async () => { await openPanel(page, 'briefing'); await tryClick(page, tid('briefing-more')); });
  await scrollDown('briefing-lower');
  await stop('economy', async () => { await openPanel(page, 'economy'); });
  await scrollDown('economy-lower');
  await stop('projects', async () => { await openPanel(page, 'projects'); });
  await scrollDown('projects-lower');
  for (const kind of ['build', 'survey', 'settle', 'study', 'resettle']) {
    await stop(`projects-new-${kind}`, async () => {
      await openPanel(page, 'projects');
      if (!(await page.$(tid(`newkind-${kind}`)))) await page.click(tid('new-project'), { timeout: 4000 });
      await page.click(tid(`newkind-${kind}`), { timeout: 4000 });
      await page.waitForTimeout(200);
      if (kind === 'build') {
        await tryClick(page, '[data-testid^="fac-"]:not([data-testid^="fac-toggle"]):not([data-testid^="fac-demolish"])');
      }
    });
    if (kind === 'build') await scrollDown('projects-new-build-lower');
    await tryClick(page, tid('newproject-back'));
  }
  await stop('people', async () => { await openPanel(page, 'people'); });
  await scrollDown('people-lower');
  await stop('people-programme', async () => {
    await openPanel(page, 'people');
    await page.click(tid('open-programme'), { timeout: 4000 });
    await page.click('[data-testid^="course-E"]', { timeout: 4000 });
  });
  await scrollDown('people-programme-lower');
  await back();
  for (const tab of ['frontier', 'graph', 'implementation', 'history']) {
    await stop(`knowledge-${tab}`, async () => {
      await openPanel(page, 'knowledge');
      await page.click(tid(`tab-${tab}`), { timeout: 4000 });
      await page.waitForTimeout(250);
      if (tab === 'frontier') await tryClick(page, tid('toggle-study'));
    });
    await scrollDown(`knowledge-${tab}-lower`);
    if (tab === 'graph') {
      await stop('knowledge-tech-detail', async () => { await page.click(tid('graph-node'), { timeout: 4000 }); await page.waitForSelector(tid('tech-detail'), { timeout: 4000 }); });
      await scrollDown('knowledge-tech-detail-lower');
      await back();
    }
  }
  for (const tab of ['practices', 'peoples', 'religion']) {
    await stop(`culture-${tab}`, async () => {
      await openPanel(page, 'culture');
      await page.click(tid(`tab-${tab}`), { timeout: 4000 });
      await page.waitForTimeout(200);
      if (tab === 'practices') await tryClick(page, tid('practice-card'));
    });
    await scrollDown(`culture-${tab}-lower`);
  }
  await stop('politics', async () => { await openPanel(page, 'politics'); });
  await scrollDown('politics-lower');
  await stop('diplomacy', async () => { await openPanel(page, 'diplomacy'); await tryClick(page, tid('diplomacy-rules')); });
  await scrollDown('diplomacy-lower');
  await stop('diplomacy-counterpart', async () => {
    await openPanel(page, 'diplomacy');
    await page.click('[data-testid^="counterpart-"]:not([data-testid="counterpart-view"])', { timeout: 4000 });
    await page.waitForTimeout(250);
  });
  await scrollDown('diplomacy-counterpart-lower');
  await stop('diplomacy-composer', async () => {
    if (!(await tryClick(page, tid('compose-open'), 250))) throw new Error('no composer in this phase');
    for (const k of ['goods', 'knowledge', 'practice', 'maps', 'non_aggression', 'defensive_pact', 'peace', 'subordination', 'cede_region']) {
      const sel = await page.$(tid('clause-kind'));
      if (!sel) break;
      await sel.selectOption(k).catch(() => {});
      await tryClick(page, tid('clause-add'), 60);
    }
  });
  await scrollDown('diplomacy-composer-lower');
  await stop('military', async () => { await openPanel(page, 'military'); });
  await scrollDown('military-lower');
  await stop('military-recruit', async () => { await openPanel(page, 'military'); await tryClick(page, tid('recruit-open'), 250); await tryClick(page, tid('army-card')); });
  await stop('objectives', async () => { await openPanel(page, 'objectives'); });
  await scrollDown('objectives-lower');
  await stop('chronicle', async () => { await openPanel(page, 'chronicle'); await page.waitForTimeout(300); });
  await stop('chronicle-moment', async () => { await page.click(tid('moment-card'), { timeout: 4000 }); await page.waitForTimeout(250); });
  await tryClick(page, tid('chronicle-close'));
  await closePanel(page);

  // the inspector on an own, a foreign and an unclaimed region
  const own = obs.regions.find((r) => r.id === obs.civ.capital);
  const second = obs.regions.find((r) => r.own && r.id !== obs.civ.capital);
  const foreign = obs.regions.find((r) => r.foreign);
  const empty = obs.regions.find((r) => !r.own && r.owner === null);
  for (const [name, r] of [['inspector-capital', own], ['inspector-own', second], ['inspector-foreign', foreign], ['inspector-unclaimed', empty]]) {
    if (!r) continue;
    await stop(name, async () => { if (!(await selectRegion(page, r.id))) throw new Error('region could not be clicked'); });
    const moved = await page.evaluate(() => { const el = document.querySelector('.inspector-body'); if (!el || el.scrollHeight <= el.clientHeight + 40) return false; el.scrollTo(0, el.scrollHeight); return true; }).catch(() => false);
    if (moved) { await page.waitForTimeout(120); await shot(`${name}-lower`); }
    await closePanel(page);
  }
  return skipped;
}
