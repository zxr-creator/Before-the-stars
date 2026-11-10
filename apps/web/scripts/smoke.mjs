// End-to-end smoke test for the web client against a running referee.
//
//   source scripts/env.sh
//   .toolchain/bts-ui-snapshot serve --port 7979 --web apps/web/dist --saves .toolchain/ui-saves --fresh &
//   (cd apps/web && npm run build && node scripts/smoke.mjs)
//
// Part A plays a single-human match through the interface for SMOKE_ROUNDS
// rounds (build, policy, study, leads, research, reform, programmes, survey,
// settle, recruit), screenshots every panel, and checks rejections surface.
// Part B plays a two-human match to exercise diplomacy: the browser acts for
// seat 0 through the interface, the script acts for seat 1 through the API.
// Part C uses a disclosed objective and a ten-round horizon to reach the
// victory contract and the end-of-match result screen (and stewards, where the
// referee offers them). Part D cuts the connection to check the unreachable and
// failed-order states. Part E exercises idle/demolish, pause/resume/cancel,
// rename, and save/load.
// Any console error or page error fails the run.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BTS_URL ?? 'http://127.0.0.1:7979';
const ROUNDS = Number(process.env.SMOKE_ROUNDS ?? 24);
const SHOTS = process.env.SMOKE_SHOTS ? process.env.SMOKE_SHOTS.replace(/\/?$/, '/') : fileURLToPath(new URL('../screenshots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const errors = [];
let expectNetworkErrors = false;
const notes = [];
const log = (...a) => console.log('[smoke]', ...a);
const note = (s) => { notes.push(s); log(s); };

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

// --- API helpers (used for setup, for reading state, and for the second seat) ---
async function apiCall(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return data;
}
const getObs = (seat = 0) => apiCall('GET', `/api/observation?seat=${seat}`);
const getMatch = () => apiCall('GET', '/api/match');
const apiAct = (seat, ...actions) => apiCall('POST', '/api/actions', { seat, token: '', actions });
const apiReady = (seat, through) => apiCall('POST', '/api/ready', { seat, token: '', through_round: through });

// --- browser helpers ---------------------------------------------------------------
const tid = (id) => `[data-testid="${id}"]`;
let page;
let shotNo = 0;

async function shot(name) {
  const file = `${SHOTS}${name}.png`;
  await page.waitForTimeout(140);
  await page.screenshot({ path: file });
  shotNo++;
}

/** Click something that submits to the server, and wait for the refetch that follows. */
async function clickAndSettle(selector, { expect = '/api/actions' } = {}) {
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(expect) && r.request().method() === 'POST', { timeout: 15000 }),
    page.waitForResponse((r) => r.url().includes('/api/observation'), { timeout: 15000 }),
    page.click(selector, { timeout: 10000 }),
  ]);
  await page.waitForTimeout(60);
  return res.json().catch(() => null);
}

async function openPanel(name) {
  const sel = tid(`panel-${name}`);
  if (!(await page.$(sel))) await page.click(tid(`rail-${name}`));
  await page.waitForSelector(sel);
}

async function closePanel() {
  for (let i = 0; i < 4; i++) {
    if (!(await page.$('[data-testid^="panel-"]'))) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(60);
  }
}

async function clearToasts() {
  for (const b of await page.$$('.toast-x')) await b.click().catch(() => {});
}

/** Click a region on the canvas using the renderer's own hit test. */
async function clickRegion(id) {
  const pt = await page.evaluate((rid) => {
    const a = window.__atlas;
    const c = a.regionScreenCenter(rid);
    if (!c) return null;
    const tries = [[0, -25], [0, -40], [22, -12], [-22, -12], [0, 26], [34, 8], [-34, 8], [0, 0], [0, -60], [50, -30], [-50, -30]];
    for (const [dx, dy] of tries) {
      const x = c[0] + dx, y = c[1] + dy;
      const el = document.elementFromPoint(x, y);
      if (a.regionAt(x, y) === rid && el && el.tagName === 'CANVAS') return [x, y];
    }
    return null;
  }, id);
  if (!pt) return false;
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForTimeout(80);
  return true;
}

async function selectRegion(id) {
  let ok = await clickRegion(id);
  if (!ok) {
    await closePanel();
    await page.click(tid('map-fit'));
    await page.waitForTimeout(350);
    ok = await clickRegion(id);
  }
  if (!ok) return false;
  await page.waitForSelector(tid('inspector'));
  return true;
}

async function endRound() {
  const before = (await getMatch()).round;
  await clickAndSettle(tid('end-round'), { expect: '/api/ready' });
  await page.waitForFunction((b) => document.querySelector('[data-testid="year"]')?.textContent !== `Year ${b}`, before, { timeout: 15000 });
  await clearToasts();
}

async function buildViaUi(regionId, kind, levels = 1) {
  await openPanel('projects');
  if (!(await page.$(tid('build-region')))) {
    if (await page.$(tid('newproject-back'))) await page.click(tid('newkind-build'));
    else await page.click(tid('new-project'));
  }
  await page.selectOption(tid('build-region'), String(regionId));
  await page.click(tid(`fac-${kind}`));
  await page.waitForSelector(tid('build-detail'));
  for (let i = 1; i < levels; i++) await page.click(tid('build-levels-inc'));
  const res = await clickAndSettle(tid('build-submit'));
  return res?.receipts?.[0];
}

// =====================================================================================
async function partA(browser) {
  log('Part A: single human seat, played through the interface');
  await apiCall('POST', '/api/match', { seed: 'smoke-prelude', regions: 24, controllers: ['human', 'medium', 'medium', 'medium'] });
  await page.goto(BASE + '/');
  await page.waitForSelector(tid('map-canvas'));

  // Setup screen, reached from the menu; then start the real match through it.
  await page.click(tid('menu-button'));
  await page.waitForSelector(tid('game-menu'));
  await shot('00-menu');
  await page.click(tid('menu-new-match'));
  await page.waitForSelector(tid('setup-screen'));
  await page.fill(tid('setup-seed'), 'smoke-atlas');
  await page.click(tid('setup-regions-24'));
  await page.click(tid('setup-length-standard'));
  await page.click(tid('setup-objective-discovery'));
  await shot('01-setup');
  const created = page.waitForResponse((r) => r.url().endsWith('/api/match') && r.request().method() === 'POST');
  await page.click(tid('setup-start'));
  await created;
  await page.waitForSelector(tid('map-canvas'));
  await page.waitForTimeout(500);
  let obs = await getObs();
  assert(obs.round === 1 && obs.phase === 'contact', 'fresh match starts in round 1, contact phase');
  const capital = obs.civ.capital;
  assert((await page.textContent(tid('civ-name'))) === obs.civ.name, 'top bar shows the civilization name');
  await shot('02-main-briefing-round1');
  await closePanel();
  await shot('03-map-start');

  // Region inspector via a real canvas click.
  assert(await selectRegion(capital), 'capital can be clicked on the map');
  assert((await page.textContent(tid('inspector-name'))) === obs.regions.find((r) => r.id === capital).name, 'inspector shows the clicked region');
  await shot('04-inspector-capital');

  // Build through the inspector's quick action.
  await page.click(tid('qa-build'));
  await page.waitForSelector(tid('build-region'));
  await page.click(tid('fac-fishery'));
  await page.waitForSelector(tid('build-detail'));
  await shot('05-new-project-build');
  let rec = (await clickAndSettle(tid('build-submit'))).receipts[0];
  note(`build fishery -> ${rec.status}: ${rec.reason}`);
  if (rec.status !== 'accepted') {
    // No fishing site in this capital; a workshop level can be built anywhere.
    await page.click(tid('fac-workshop'));
    rec = (await clickAndSettle(tid('build-submit'))).receipts[0];
    note(`build workshop -> ${rec.status}: ${rec.reason}`);
  }
  assert(rec.status === 'accepted', 'a build order was accepted through the interface');
  await page.waitForSelector(tid('project-card'));

  // A locked facility explains itself and cannot be ordered.
  obs = await getObs();
  const locked = obs.catalog.facilities.find((f) => !f.available);
  if (locked) {
    await page.click(tid('new-project'));
    await page.click(tid(`fac-${locked.kind}`));
    assert(await page.isDisabled(tid('build-submit')), 'unavailable facility disables the order button');
    assert(await page.locator('.form-actions .why').count() > 0, 'the reason is shown beside the disabled button');
    await shot('06-build-locked-reason');
    await page.click(tid('newproject-back'));
  }

  // Labour weight through the economy panel.
  await openPanel('economy');
  const before = obs.civ.policies.labor_weights.find((w) => w[0] === 'industry')[1];
  await clickAndSettle(tid('weight-industry-inc'));
  obs = await getObs();
  const after = obs.civ.policies.labor_weights.find((w) => w[0] === 'industry')[1];
  assert(after === before + 1, `industry labour weight ${before} -> ${after}`);
  await clickAndSettle(tid('food-reserve-inc'));

  // A rejection must be surfaced: no teaching venue exists yet.
  await openPanel('people');
  await page.click(tid('open-programme'));
  await page.click(tid('course-E001'));
  await page.waitForSelector(tid('course-detail'));
  if (!(await page.isDisabled(tid('program-submit')))) {
    const r = (await clickAndSettle(tid('program-submit'))).receipts[0];
    note(`open programme without a venue -> ${r.status}: ${r.reason}`);
    if (r.status === 'rejected') {
      await page.waitForSelector(tid('toast-bad'));
      assert(await page.locator('.action-note.is-bad').count() > 0, 'rejection reason shown inline');
      await shot('07-rejection-surfaced');
    }
  }
  await clearToasts();

  // Exploratory study from the frontier.
  await openPanel('knowledge');
  await page.click(tid('tab-frontier'));
  await page.click(tid('toggle-study'));
  const studyBtn = page.locator('[data-testid^="study-"]:not([disabled])').first();
  if (await studyBtn.count()) {
    const id = await studyBtn.getAttribute('data-testid');
    const r = (await clickAndSettle(tid(id))).receipts[0];
    note(`fund ${id} -> ${r.status}`);
  }
  await shot('08-knowledge-frontier-round1');

  // Phase stepping: contact -> negotiate (window 1) -> ... then end the round.
  await clickAndSettle(tid('next-phase'), { expect: '/api/ready' });
  assert((await page.getAttribute(tid('phase'), 'data-phase')) === 'negotiate', 'next-phase moves to negotiation');
  await clickAndSettle(tid('next-phase'), { expect: '/api/ready' });
  assert((await page.getAttribute(tid('phase'), 'data-window')) === '2', 'next window advances the window counter');
  await shot('09-phase-negotiate-window2');
  await endRound();
  obs = await getObs();
  assert(obs.round === 2, 'end round resolves twelve months');
  assert(await page.$(tid('panel-briefing')), 'briefing is the default panel after a round');

  // --- play on --------------------------------------------------------------------
  const done = { surveyed: new Set(), settled: false, recruited: false, programmes: new Set(), reforms: 0, research: 0, leads: 0, builds: [] };
  for (let round = 2; round <= ROUNDS; round++) {
    obs = await getObs();
    const cap = obs.regions.find((r) => r.id === capital);
    const projects = obs.projects;

    // Knowledge: follow leads, investigate open questions.
    await openPanel('knowledge');
    await page.click(tid('tab-frontier'));
    for (let i = 0; i < 3; i++) {
      const b = page.locator(`${tid('follow-up')}:not([disabled])`).first();
      if (!(await b.count())) break;
      await Promise.all([page.waitForResponse((r) => r.url().includes('/api/observation')), b.click()]);
      done.leads++;
      await page.waitForTimeout(60);
    }
    let researching = projects.filter((p) => p.kind === 'research').length;
    while (researching < 2) {
      const b = page.locator(`${tid('investigate')}:not([disabled])`).first();
      if (!(await b.count())) break;
      await Promise.all([page.waitForResponse((r) => r.url().includes('/api/observation')), b.click()]);
      researching++;
      done.research++;
      await page.waitForTimeout(60);
    }

    // Culture: propose a reform when one is possible.
    if (!projects.some((p) => p.kind === 'reform') && obs.culture.practices.some((p) => p.can_reform)) {
      await openPanel('culture');
      await page.click(tid('tab-practices'));
      const b = page.locator(`${tid('propose-reform')}:not([disabled])`).first();
      if (await b.count()) {
        await Promise.all([page.waitForResponse((r) => r.url().includes('/api/observation')), b.click()]);
        done.reforms++;
      }
    }

    // Building: food first, then a teaching lodge, then stores.
    obs = await getObs();
    const pendingBuild = (k) => obs.projects.some((p) => p.kind === 'build' && p.target === k);
    const level = (k) => cap.own.facilities.find((f) => f.kind === k)?.level ?? 0;
    for (const [kind, want, levels] of [['fields', 4, 2], ['lodge', 1, 1], ['granary', 1, 1], ['pasture', 2, 1], ['kiln', 1, 1]]) {
      const def = obs.catalog.facilities.find((f) => f.kind === kind);
      if (!def || !def.available || level(kind) >= want || pendingBuild(kind)) continue;
      if (obs.projects.filter((p) => p.kind === 'build').length >= 2) break;
      const r = await buildViaUi(capital, kind, levels);
      note(`round ${round}: build ${kind} x${levels} -> ${r?.status}: ${r?.reason}`);
      if (r?.status === 'accepted') done.builds.push(kind);
      else if (await page.$(tid('newproject-back'))) await page.click(tid('newproject-back'));
      await clearToasts();
      obs = await getObs();
    }

    // Education: open programmes once the lodge stands.
    if (level('lodge') >= 1) {
      for (const course of ['E001', 'E002']) {
        if (done.programmes.has(course) || obs.programs.some((p) => p.course === course)) continue;
        const def = obs.catalog.courses.find((c) => c.key === course);
        if (!def || !def.available) continue;
        await openPanel('people');
        await page.click(tid('open-programme'));
        await page.click(tid(`course-${course}`));
        await page.fill(tid('program-seats'), '4');
        if (course === 'E001') await shot('20-open-programme');
        const r = (await clickAndSettle(tid('program-submit'))).receipts[0];
        note(`round ${round}: open programme ${course} -> ${r.status}: ${r.reason}`);
        if (r.status === 'accepted') done.programmes.add(course);
        else await page.click('.subnav .linklike');
        await clearToasts();
      }
    }

    // Exploration: survey a neighbour, then settle it.
    obs = await getObs();
    const byId = new Map(obs.regions.map((r) => [r.id, r]));
    const neighbours = cap.neighbors.map((n) => ({ link: n.kind, r: byId.get(n.region) })).filter((x) => x.r && x.r.owner === null && x.link !== 'sea');
    const toSurvey = neighbours.find((x) => !x.r.survey && !done.surveyed.has(x.r.id) && !obs.projects.some((p) => p.kind === 'survey' && p.region === x.r.id));
    if (toSurvey && obs.projects.filter((p) => p.kind === 'survey').length < 1 && round <= 10) {
      await closePanel();
      if (await selectRegion(toSurvey.r.id)) {
        const r = (await clickAndSettle(tid('qa-survey'))).receipts[0];
        note(`round ${round}: survey ${toSurvey.r.name} -> ${r.status}: ${r.reason}`);
        done.surveyed.add(toSurvey.r.id);
        await clearToasts();
      }
    }
    const ownCount = obs.regions.filter((r) => r.own).length;
    const target = neighbours.find((x) => x.r.survey);
    if (!done.settled && ownCount < 2 && target && cap.own.population >= 150 && !obs.projects.some((p) => p.kind === 'settle')) {
      await closePanel();
      if (await selectRegion(target.r.id)) {
        await page.click(tid('qa-settle-to'));
        await page.waitForSelector(tid('settle-people'));
        await page.fill(tid('settle-people'), '30');
        await shot('21-new-project-settle');
        const r = (await clickAndSettle(tid('settle-submit'))).receipts[0];
        note(`round ${round}: settle ${target.r.name} -> ${r.status}: ${r.reason}`);
        if (r.status === 'accepted') done.settled = true;
        else await page.click(tid('newproject-back'));
        await clearToasts();
      }
    }

    // Military: raise one small formation, then give it an order via the map.
    if (!done.recruited && round >= 6 && round <= 14 && !obs.projects.some((p) => p.kind === 'recruit')) {
      await openPanel('military');
      await page.click(tid('recruit-open'));
      await page.waitForSelector(tid('recruit-form'));
      await page.click(tid('role-denial'));
      await page.fill(tid('recruit-soldiers'), '10');
      if (round === 6) await shot('22-recruit-form');
      // The form itself refuses a formation larger than the number of people who would serve.
      const blocked = await page.$eval(tid('recruit-submit'), (b) => (b.disabled ? b.title : ''));
      const r = blocked ? { status: 'blocked', reason: blocked } : (await clickAndSettle(tid('recruit-submit'))).receipts[0];
      note(`round ${round}: recruit -> ${r.status}: ${r.reason}`);
      done.recruited = r.status === 'accepted';
      if (!done.recruited) await page.click(tid('recruit-open'));
      await clearToasts();
      if (done.recruited && r.created) {
        // Move it up the queue with the stepper on the project card (lower numbers are served first).
        await openPanel('projects');
        for (let i = 0; i < 4; i++) await clickAndSettle(tid(`prio-${r.created}-dec`));
        const pr = (await getObs()).projects.find((p) => p.id === r.created);
        assert(pr && pr.priority === 1, 'priority stepper moved the recruit project to 1');
      }
    }

    await endRound();
    if (round === 3) await shot('10-briefing-round4');
  }

  obs = await getObs();
  note(`after ${obs.round - 1} rounds: pop ${obs.civ.population}, regions governed ${obs.regions.filter((r) => r.own).length}, known ${obs.regions.length}, techs ${obs.knowledge.techs.length}, practices ${obs.culture.practices.length}, projects ${obs.projects.length}, programmes ${obs.programs.length}, armies ${obs.armies.length}, chronicle ${obs.chronicle.length}, briefing ${obs.briefing.length}, others ${obs.others.length}`);
  note(`projects: ${obs.projects.map((p) => `${p.kind} ${Math.round((100 * p.work_done) / Math.max(1, p.work_needed))}%${p.blockers.length ? ' [' + p.blockers[0] + ']' : ''}`).join('; ')}`);
  note(`done: leads ${done.leads}, research ${done.research}, reforms ${done.reforms}, builds ${done.builds.join(',')}, programmes ${[...done.programmes].join(',')}, surveyed ${done.surveyed.size}, settled ${done.settled}, recruited ${done.recruited}`);
  assert(obs.round > ROUNDS, 'played the requested number of rounds');
  assert(obs.chronicle.length > 0, 'chronicle has entries after play');

  // Pause and resume a teaching programme.
  if (obs.programs.length) {
    const prog = obs.programs[0];
    await openPanel('people');
    await clickAndSettle(tid(`prog-pause-${prog.id}`));
    assert((await getObs()).programs.find((p) => p.id === prog.id).paused === true, 'programme paused');
    await clickAndSettle(tid(`prog-pause-${prog.id}`));
    assert((await getObs()).programs.find((p) => p.id === prog.id).paused === false, 'programme resumed');
  }

  // --- every panel, with real content ---------------------------------------------------
  await clearToasts();
  await openPanel('briefing');
  await shot('30-briefing');
  if (await page.$(tid('briefing-more'))) {
    await page.click(tid('briefing-more'));
    await shot('30b-briefing-more');
  }
  await openPanel('economy');
  await shot('31-economy');
  await page.locator('.drawer-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await shot('31b-economy-lower');
  await openPanel('projects');
  await shot('32-projects');
  await openPanel('people');
  await shot('33-people');
  await page.locator('.drawer-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await shot('33b-people-lower');
  await openPanel('knowledge');
  await page.click(tid('tab-frontier'));
  await shot('34-knowledge-frontier');
  await page.click(tid('tab-graph'));
  await page.waitForSelector(tid('known-graph'));
  assert(await page.locator(tid('graph-node')).count() === obs.knowledge.techs.length, 'graph renders exactly the disclosed cards');
  await shot('35-knowledge-graph');
  await page.locator(tid('graph-node')).last().click();
  await page.waitForSelector(tid('tech-detail'));
  await shot('36-knowledge-card-detail');
  await page.click('.subnav .linklike');
  await page.click(tid('tab-implementation'));
  await shot('37-knowledge-implementation');
  await page.click(tid('tab-history'));
  await shot('38-knowledge-history');
  await openPanel('culture');
  await page.click(tid('tab-practices'));
  await shot('39-culture-practices');
  await page.click(tid('tab-peoples'));
  await shot('40-culture-peoples');
  await page.click(tid('tab-religion'));
  await shot('41-culture-religion');
  await openPanel('politics');
  await shot('42-politics');
  await openPanel('diplomacy');
  await shot('43-diplomacy');
  await openPanel('military');
  await shot('44-military');
  if (obs.armies.length) {
    // Order controls: hold, then move via a map pick, then cancel a pick with Esc.
    await clickAndSettle(tid('order-hold'));
    await page.click(tid('order-attack'));
    await page.waitForSelector(tid('map-pick-cancel'));
    await shot('44b-military-pick-on-map');
    await page.keyboard.press('Escape');
    await page.waitForSelector(tid('map-pick-cancel'), { state: 'detached' });
    const own = obs.regions.filter((r) => r.own && r.id !== obs.armies[0].region);
    if (own.length) {
      await page.click(tid('order-move'));
      await page.waitForSelector(tid('map-pick-cancel'));
      const posted = page.waitForResponse((r) => r.url().includes('/api/actions'));
      if (await clickRegion(own[0].id)) {
        const r = (await (await posted).json()).receipts[0];
        note(`move order via map pick -> ${r.status}: ${r.reason}`);
        await page.waitForTimeout(200);
      } else await page.keyboard.press('Escape');
    }
    await clearToasts();
  }
  await openPanel('objectives');
  await shot('45-objectives');

  // Chronicle sheet: timeline, detail drawer, show on map, exports.
  await closePanel();
  await page.click(tid('chronicle-tab'));
  await page.waitForSelector(tid('panel-chronicle'));
  await page.waitForTimeout(300);
  await shot('46-chronicle-timeline');
  const cards = page.locator(tid('moment-card'));
  assert(await cards.count() === obs.chronicle.length, 'timeline shows every chronicle entry');
  await cards.last().click();
  await page.waitForSelector(tid('moment-detail'));
  await shot('47-chronicle-detail');
  if (await page.$(tid('moment-show-map'))) await page.click(tid('moment-show-map'));
  await shot('47b-chronicle-show-on-map');
  for (const fmt of ['md', 'json']) {
    const href = await page.getAttribute(tid(`export-${fmt}`), 'href');
    const res = await page.request.get(BASE + href);
    assert(res.ok() && (await res.text()).length > 20, `chronicle export ${fmt} works`);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Keyboard: number keys switch panels, Esc closes.
  await page.keyboard.press('2');
  await page.waitForSelector(tid('panel-economy'));
  await page.keyboard.press('5');
  await page.waitForSelector(tid('panel-knowledge'));
  await page.keyboard.press('Escape');
  await page.waitForSelector(tid('panel-knowledge'), { state: 'detached' });

  // Map modes and inspectors.
  await closePanel();
  await page.keyboard.press('Escape');
  await page.click(tid('map-fit'));
  await page.waitForTimeout(400);
  for (const mode of ['political', 'terrain', 'resources', 'population']) {
    await page.click(tid(`map-mode-${mode}`));
    await shot(`50-map-${mode}`);
  }
  await page.click(tid('map-mode-political'));
  obs = await getObs();
  await selectRegion(capital);
  await shot('51-inspector-own-region');
  await page.locator('.inspector-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await shot('51b-inspector-own-region-lower');
  const foreign = obs.regions.find((r) => r.owner !== null && r.owner !== obs.seat);
  if (foreign && (await selectRegion(foreign.id))) await shot('52-inspector-foreign-region');
  const remembered = obs.regions.find((r) => r.visibility === 'remembered');
  if (remembered && (await selectRegion(remembered.id))) await shot('53-inspector-remembered-region');
  await page.keyboard.press('Escape');

  // Save through the menu.
  await page.click(tid('menu-button'));
  await page.waitForSelector(tid('game-menu'));
  const saved = page.waitForResponse((r) => r.url().includes('/api/save'));
  await page.click('.menu form button[type="submit"]');
  assert((await saved).ok(), 'save accepted');
  await page.keyboard.press('Escape');

  // 1280×720 must not break.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(300);
  await openPanel('briefing');
  await selectRegion(capital);
  await shot('60-1280x720-briefing-inspector');
  await openPanel('economy');
  await shot('61-1280x720-economy');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.click(tid('chronicle-tab'));
  await page.waitForSelector(tid('panel-chronicle'));
  await shot('62-1280x720-chronicle');
  await page.keyboard.press('Escape');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.querySelector('.topbar').scrollWidth > window.innerWidth + 1);
  assert(!overflow, 'no horizontal overflow at 1280×720');
  await page.setViewportSize({ width: 1440, height: 900 });
}

// =====================================================================================
async function partB() {
  log('Part B: two human seats; diplomacy through the interface for seat 0, API for seat 1');
  await apiCall('POST', '/api/match', { seed: 'duo-3', regions: 24, controllers: ['human', 'human', 'medium', 'medium'] });
  // Explore until the two human seats have met.
  let met = false;
  for (let i = 0; i < 12 && !met; i++) {
    for (const seat of [0, 1]) {
      const o = await getObs(seat);
      const known = new Set(o.regions.map((r) => r.id));
      const running = new Set(o.projects.filter((p) => p.kind === 'survey').map((p) => p.region));
      const targets = [];
      for (const r of o.regions) {
        if (!r.survey && !running.has(r.id)) targets.push(r.id);
        for (const n of r.neighbors) if (!known.has(n.region) && !running.has(n.region)) targets.push(n.region);
      }
      const acts = [...new Set(targets)].slice(0, 3).map((region) => ({ kind: 'start_project', spec: { kind: 'survey', region }, priority: 8 }));
      if (acts.length) await apiAct(seat, ...acts);
    }
    await apiReady(0, true);
    await apiReady(1, true);
    const o0 = await getObs(0);
    met = o0.others.some((x) => x.seat === 1 && x.contacted);
  }
  assert(met, 'the two human seats made contact');
  let o0 = await getObs(0);
  const them = o0.others.find((x) => x.seat === 1);
  assert(o0.phase === 'contact', 'round starts in the contact phase');

  await page.goto(BASE + '/');
  await page.waitForSelector(tid('map-canvas'));
  await page.waitForTimeout(400);
  assert(await page.$(tid('seat-1')), 'hot-seat switcher is shown with two human seats');
  await clearToasts();

  // Contact phase: messages are blocked with a visible reason; choose the counterpart.
  await openPanel('diplomacy');
  await page.waitForSelector(tid('diplomacy-rules'));
  await page.check(tid('contact-1'));
  await shot('70-diplomacy-contact-phase');
  let rec = (await clickAndSettle(tid('contacts-submit'))).receipts[0];
  assert(rec.status === 'accepted', 'contact selection accepted');
  await page.click(tid('counterpart-1'));
  await page.waitForSelector(tid('counterpart-view'));
  assert(await page.isDisabled(tid('message-text')), 'message box disabled outside negotiation');
  assert(await page.locator('.composer .why').count() > 0, 'the phase rule that blocks messaging is stated');
  await shot('71-counterpart-contact-phase-blocked');
  await clearToasts();
  await apiAct(1, { kind: 'select_contacts', seats: [0] });

  // Seat 0 finishes the phase -> hand-over prompt; seat 1 finishes by API.
  await clickAndSettle(tid('diplomacy-next'), { expect: '/api/ready' });
  await page.waitForSelector(tid('handover-continue'));
  await shot('72-hotseat-handover');
  await page.click('.overlay .btn-ghost');
  assert(await page.$(tid('waiting')), 'top bar says who we are waiting for');
  await apiReady(1, false);
  await page.waitForFunction(() => document.querySelector('[data-testid="phase"]')?.getAttribute('data-phase') === 'negotiate', null, { timeout: 15000 });
  await page.waitForTimeout(200);

  // Window 1: send a message with an intent tag.
  await page.waitForSelector(`${tid('message-text')}:not([disabled])`);
  await page.fill(tid('message-text'), 'Greetings from the river. We can spare food this year; what do you need most?');
  await page.selectOption(tid('message-intent'), 'inquiry');
  rec = (await clickAndSettle(tid('message-send'))).receipts[0];
  assert(rec.status === 'accepted', 'message accepted: ' + rec.reason);
  await page.waitForTimeout(150);
  assert(await page.isDisabled(tid('message-text')), 'one envelope per counterpart per window is enforced in the interface');
  await shot('73-negotiate-window1-sent');
  await clearToasts();
  await apiAct(1, { kind: 'message', to: 0, text: 'We need tools more than food. We could describe how we keep our stores.', intent: 'need' });

  const nextWindow = async (expectWindow) => {
    await clickAndSettle(tid('diplomacy-next'), { expect: '/api/ready' });
    if (await page.$(tid('handover-continue'))) await page.click('.overlay .btn-ghost');
    await apiReady(1, false);
    await page.waitForFunction((w) => document.querySelector('[data-testid="phase"]')?.getAttribute('data-window') === String(w), expectWindow, { timeout: 15000 });
    if (await page.$(tid('handover-continue'))) await page.click('.overlay .btn-ghost');
    await page.waitForTimeout(150);
  };
  await nextWindow(2);
  assert(await page.locator('.msg.is-theirs').count() >= 1, 'their reply appears in the thread');

  // Window 2: draft and send a structured proposal with several clause kinds.
  await page.click(tid('compose-open'));
  await page.waitForSelector(tid('treaty-composer'));
  await page.selectOption(tid('clause-kind'), 'goods');
  await page.click(tid('clause-add'));
  await page.fill(tid('clause-amount'), '25');
  for (const kind of ['knowledge', 'practice', 'maps', 'non_aggression', 'defensive_pact', 'peace', 'subordination']) {
    await page.selectOption(tid('clause-kind'), kind);
    await page.click(tid('clause-add'));
    assert(await page.$(tid(`clause-${kind}`)), `clause builder offers ${kind}`);
  }
  await shot('74-treaty-composer-clause-kinds');
  assert(await page.isDisabled(tid('clause-add')), 'the eight-clause limit is enforced in the builder');
  assert(await page.isDisabled(tid('proposal-send')), 'an invalid draft cannot be sent');
  // The ninth kind, after making room. Then keep a draft that is valid between two camps.
  for (const kind of ['subordination', 'peace', 'defensive_pact', 'practice', 'knowledge']) {
    await page.click(`${tid(`clause-${kind}`)} .clause-head .linklike`);
  }
  await page.selectOption(tid('clause-kind'), 'cede_region');
  await page.click(tid('clause-add'));
  assert(await page.$(tid('clause-cede_region')), 'clause builder offers cede_region');
  await page.click(`${tid('clause-cede_region')} .clause-head .linklike`);
  await page.fill(tid('proposal-text'), 'Food now, maps both ways would be better, and five years of quiet between us.');
  await shot('75-treaty-composer-ready');
  rec = (await clickAndSettle(tid('proposal-send'))).receipts[0];
  note(`proposal -> ${rec.status}: ${rec.reason}`);
  assert(rec.status === 'accepted', 'proposal accepted: ' + rec.reason);
  await clearToasts();
  // The other seat proposes something of its own.
  const r1 = await apiAct(1, { kind: 'propose_treaty', to: 0, clauses: [{ kind: 'maps', from: 1 }, { kind: 'goods', from: 0, good: 'tools', amount_per_month: 5000, months: 1 }], text: 'Our maps for a few of your tools.' });
  assert(r1.receipts[0].status === 'accepted', 'seat 1 proposal accepted: ' + r1.receipts[0].reason);
  await nextWindow(3);

  // Window 3: an incoming offer is on the table; sign it. Seat 1 signs ours.
  await page.waitForSelector(tid('offer-sign'));
  await shot('76-offers-on-the-table');
  rec = (await clickAndSettle(tid('offer-sign'))).receipts[0];
  note(`sign -> ${rec.status}: ${rec.reason}`);
  assert(rec.status === 'accepted', 'signature accepted: ' + rec.reason);
  await clearToasts();
  const o1 = await getObs(1);
  const ours = o1.diplomacy.offers.find((o) => o.from === 0 && o.status === 'open');
  if (ours) {
    const s = await apiAct(1, { kind: 'sign_treaty', offer: ours.id });
    note(`seat 1 signs our offer -> ${s.receipts[0].status}: ${s.receipts[0].reason}`);
  }
  await nextWindow(4);
  await page.waitForSelector(tid('treaty-card'));
  await page.locator('.drawer-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await shot('77-treaties-signed');

  // Withdraw / decline paths.
  await apiAct(1, { kind: 'propose_treaty', to: 0, clauses: [{ kind: 'non_aggression', months: 120 }], text: null });
  await page.click(tid('compose-open'));
  await page.selectOption(tid('clause-kind'), 'maps');
  await page.click(tid('clause-add'));
  rec = (await clickAndSettle(tid('proposal-send'))).receipts[0];
  assert(rec.status === 'accepted', 'second proposal accepted: ' + rec.reason);
  await clearToasts();
  rec = (await clickAndSettle(tid('offer-withdraw'))).receipts[0];
  assert(rec.status === 'accepted', 'withdraw accepted');
  await clearToasts();
  await nextWindow(5);
  await page.waitForSelector(tid('offer-decline'));
  rec = (await clickAndSettle(tid('offer-decline'))).receipts[0];
  assert(rec.status === 'accepted', 'decline accepted');
  await clearToasts();

  // Back at the list: counterparts, treaties in force.
  await page.click('.subnav .linklike');
  await page.locator('.drawer-body').evaluate((el) => el.scrollTo(0, 0));
  await shot('78-diplomacy-overview');

  // Resolve the round on both seats, then look at the performance record and repudiate.
  await clickAndSettle(tid('end-round'), { expect: '/api/ready' });
  if (await page.$(tid('handover-continue'))) await page.click('.overlay .btn-ghost');
  const roundBefore = (await getMatch()).round;
  await apiReady(1, true);
  await page.waitForFunction((b) => document.querySelector('[data-testid="year"]')?.textContent !== `Year ${b}`, roundBefore, { timeout: 15000 });
  if (await page.$(tid('handover-continue'))) await page.click('.overlay .btn-ghost');
  await clearToasts();
  await shot('79-briefing-after-diplomacy-round');
  await openPanel('diplomacy');
  await page.click(tid('counterpart-1'));
  await page.waitForSelector(tid('counterpart-view'));
  await page.locator('.drawer-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await shot('80-treaty-performance');
  if (await page.$(tid('treaty-break'))) {
    await page.locator(tid('treaty-break')).first().click();
    rec = (await clickAndSettle(tid('treaty-break-confirm'))).receipts[0];
    note(`repudiate -> ${rec.status}: ${rec.reason}`);
    assert(rec.status === 'accepted', 'repudiation accepted');
    await page.locator('.drawer-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await shot('81-treaty-repudiated');
  }
  await clearToasts();

  // Seat switcher.
  const nameBefore = await page.textContent(tid('civ-name'));
  await page.click(tid('seat-1'));
  await page.waitForFunction((n) => document.querySelector('[data-testid="civ-name"]')?.textContent !== n, nameBefore);
  assert((await page.textContent(tid('civ-name'))) === them.name, 'switched to the other human seat');
  await page.waitForTimeout(300);
  await openPanel('diplomacy');
  await shot('82-hotseat-other-seat');
  await page.keyboard.press('Escape');

  // Chronicle should now hold the first-contact moment; look at it from this seat.
  await page.click(tid('chronicle-tab'));
  await page.waitForSelector(tid('panel-chronicle'));
  await page.waitForTimeout(250);
  await shot('83-chronicle-with-contact');
  await page.keyboard.press('Escape');
}


// =====================================================================================
async function partC() {
  log('Part C: disclosed objective and a short horizon, to reach the victory contract and the result screen');
  await apiCall('POST', '/api/match', { seed: 'disc-1', regions: 24, horizon: 120, pace_bp: 3300, controllers: ['human', 'medium', 'medium', 'medium'], disclosed_objective: true });
  await page.goto(BASE + '/');
  await page.waitForSelector(tid('map-canvas'));
  await page.waitForTimeout(300);
  let obs = await getObs();
  assert(obs.objectives.victory, 'disclosed mode reveals the victory contract');
  await openPanel('objectives');
  await page.waitForSelector(tid('victory-summary'));
  await shot('90-objectives-victory-contract');
  await page.locator('.drawer-body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await shot('90b-objectives-victory-lower');
  // Jump orders are real buttons. Where the interface already knows an order cannot
  // proceed it says why; otherwise the referee's rejection is surfaced.
  let order = 'ftl-trial';
  if (await page.isDisabled(tid('ftl-trial'))) {
    const why = await page.getAttribute(tid('ftl-trial'), 'title');
    assert(why && why.length > 5, 'a disabled jump order states its reason');
    note(`jump trial disabled in the interface: ${why}`);
    order = 'ftl-deployment';
  }
  const rec = (await clickAndSettle(tid(order))).receipts[0];
  note(`${order} order -> ${rec.status}: ${rec.reason}`);
  assert(rec.status === 'rejected', 'a jump order is rejected for a camp');
  await page.waitForSelector(tid('toast-bad'));
  await shot('91-objectives-rejection');
  await clearToasts();

  // Stewards (only where the referee offers them): delegate two domains, see them act, dismiss.
  const summary = await getMatch();
  let stewarded = false;
  if ((summary.steward_domains ?? []).length) {
    await openPanel('politics');
    await page.waitForSelector(tid('stewards'));
    await page.locator(tid('stewards')).scrollIntoViewIfNeeded();
    await page.check(tid('steward-economy'));
    await page.check(tid('steward-research'));
    await Promise.all([page.waitForResponse((r) => r.url().includes('/api/delegate')), page.click(tid('stewards-apply'))]);
    await page.waitForTimeout(300);
    const after = await getMatch();
    assert(after.seats[0].delegates.includes('economy') && after.seats[0].delegates.includes('research'), 'delegation recorded by the referee');
    await shot('91b-politics-stewards');
    stewarded = true;
    await clearToasts();
  } else note('this referee does not offer stewards; skipping the delegation check');

  await closePanel();
  for (let i = 0; i < 12; i++) {
    const m = await getMatch();
    if (m.finished) break;
    if (stewarded && i === 2) {
      const o = await getObs();
      note(`with stewards after ${i} rounds: ${o.projects.length} projects, ${o.receipts.length} receipts this round`);
      await openPanel('briefing');
      await shot('91c-briefing-with-steward');
      await closePanel();
    }
    await clickAndSettle(tid('end-round'), { expect: '/api/ready' });
    await page.waitForTimeout(80);
    await clearToasts();
  }
  await page.waitForSelector(tid('result-screen'));
  obs = await getObs();
  assert(obs.phase === 'finished' && obs.outcome, 'match finished with an outcome');
  assert((await page.textContent(tid('result-screen'))).includes(obs.outcome.reason), 'result screen states the outcome reason');
  await shot('92-result-screen');
  await page.click('.result-card .btn-primary');
  await page.waitForSelector(tid('panel-chronicle'));
  await page.waitForTimeout(250);
  await shot('93-result-chronicle');
  assert(!(await page.$(tid('end-round'))), 'no end-round button once the match has finished');
}

// =====================================================================================
async function partD() {
  log('Part D: the referee is unreachable, then comes back');
  await apiCall('POST', '/api/match', { seed: 'offline-1', regions: 24, controllers: ['human', 'medium', 'medium', 'medium'] });
  expectNetworkErrors = true;
  await page.route('**/api/**', (r) => r.abort());
  await page.goto(BASE + '/');
  await page.waitForSelector('.splash-error');
  await shot('95-referee-unreachable');
  await page.unroute('**/api/**');
  await page.click('.splash .btn-primary');
  await page.waitForSelector(tid('map-canvas'));
  await page.waitForTimeout(300);
  // An order that cannot be delivered is reported, never silently dropped.
  await openPanel('economy');
  await page.route('**/api/**', (r) => r.abort());
  await page.click(tid('weight-services-inc'));
  await page.waitForSelector(tid('toast-bad'));
  await page.waitForSelector('.offline-bar');
  assert(await page.locator('.action-note.is-bad').count() > 0, 'failed order is reported beside the control');
  await shot('96-order-not-delivered');
  await page.unroute('**/api/**');
  await page.waitForSelector('.offline-bar', { state: 'detached', timeout: 10000 });
  await clearToasts();
  const before = (await getObs()).civ.policies.labor_weights.find((w) => w[0] === 'services')[1];
  await clickAndSettle(tid('weight-services-inc'));
  const after = (await getObs()).civ.policies.labor_weights.find((w) => w[0] === 'services')[1];
  assert(after === before + 1, 'orders work again once the referee answers');
  expectNetworkErrors = false;
}

// =====================================================================================
async function partE() {
  log('Part E: housekeeping controls — idle/demolish works, pause/cancel a project, rename, save and load');
  await apiCall('POST', '/api/match', { seed: 'house-1', regions: 24, controllers: ['human', 'medium', 'medium', 'medium'] });
  await page.goto(BASE + '/');
  await page.waitForSelector(tid('map-canvas'));
  await page.waitForTimeout(300);
  let obs = await getObs();
  const capital = obs.civ.capital;
  const fac = () => obs.regions.find((r) => r.id === capital).own.facilities;
  await closePanel();
  assert(await selectRegion(capital), 'capital selected');

  // Idle a works and put it back.
  await clickAndSettle(tid('fac-toggle-workshop'));
  obs = await getObs();
  assert(fac().find((f) => f.kind === 'workshop').enabled === false, 'workshop idled through the inspector');
  await shot('97-inspector-facility-idled');
  await clickAndSettle(tid('fac-toggle-workshop'));
  obs = await getObs();
  assert(fac().find((f) => f.kind === 'workshop').enabled === true, 'workshop put back to work');

  // Demolish asks for confirmation, then reports the referee's verdict.
  await page.click(tid('fac-demolish-camp'));
  const rec = (await clickAndSettle(tid('fac-demolish-confirm-camp'))).receipts[0];
  note(`demolish one level of camps -> ${rec.status}: ${rec.reason}`);
  await clearToasts();

  // Project: pause, resume, cancel.
  const built = await buildViaUi(capital, 'workshop', 1);
  assert(built.status === 'accepted', 'workshop level ordered: ' + built.reason);
  const pid = built.created;
  await page.waitForSelector(tid(`proj-pause-${pid}`));
  await clickAndSettle(tid(`proj-pause-${pid}`));
  assert((await getObs()).projects.find((p) => p.id === pid).paused === true, 'project paused');
  await shot('98-project-paused');
  await clickAndSettle(tid(`proj-pause-${pid}`));
  assert((await getObs()).projects.find((p) => p.id === pid).paused === false, 'project resumed');
  await page.click(tid(`proj-cancel-${pid}`));
  await clickAndSettle(tid(`cancel-confirm-${pid}`));
  assert(!(await getObs()).projects.some((p) => p.id === pid), 'project cancelled');
  await clearToasts();

  // Rename the civilization.
  await openPanel('politics');
  await page.fill(tid('rename-input'), 'Smokehaven');
  const rn = (await clickAndSettle(tid('rename-submit'))).receipts[0];
  note(`rename -> ${rn.status}: ${rn.reason}`);
  if (rn.status === 'accepted') assert((await page.textContent(tid('civ-name'))) === 'Smokehaven', 'top bar shows the new name');
  await clearToasts();

  // Save, play a round, then load the save from the setup screen: the round comes back.
  await closePanel();
  await page.click(tid('menu-button'));
  await page.fill(tid('save-name'), 'smoke-save');
  await Promise.all([page.waitForResponse((r) => r.url().includes('/api/save')), page.click('.menu form button[type="submit"]')]);
  await page.keyboard.press('Escape');
  await endRound();
  assert((await getMatch()).round === 2, 'a round was played after saving');
  await page.click(tid('menu-button'));
  await page.click(tid('menu-new-match'));
  await page.waitForSelector(tid('load-smoke-save'));
  await Promise.all([page.waitForResponse((r) => r.url().includes('/api/load')), page.click(tid('load-smoke-save'))]);
  await page.waitForSelector(tid('map-canvas'));
  await page.waitForTimeout(300);
  assert((await getMatch()).round === 1, 'loading the save restored round 1');
  assert((await page.textContent(tid('year'))) === 'Year 1', 'the interface shows the loaded match');
}

// =====================================================================================
const browser = await chromium.launch();
let failed = null;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Part D cuts the network on purpose; the browser logs those failed requests itself.
    if (expectNetworkErrors && /Failed to load resource|net::ERR_/.test(m.text())) return;
    errors.push('console: ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await apiCall('GET', '/api/health');
  if (!process.env.SMOKE_ONLY || process.env.SMOKE_ONLY === 'A') await partA(browser);
  if (!process.env.SMOKE_ONLY || process.env.SMOKE_ONLY === 'B') await partB();
  if (!process.env.SMOKE_ONLY || process.env.SMOKE_ONLY === 'C') await partC();
  if (!process.env.SMOKE_ONLY || process.env.SMOKE_ONLY === 'D') await partD();
  if (!process.env.SMOKE_ONLY || process.env.SMOKE_ONLY === 'E') await partE();
} catch (e) {
  failed = e;
  try {
    await page.screenshot({ path: `${SHOTS}zz-failure.png` });
  } catch { /* ignore */ }
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(`[smoke] ${errors.length} console/page error(s):`);
  for (const e of errors.slice(0, 20)) console.error('  ' + e);
}
if (failed) {
  console.error('[smoke] FAILED:', failed.message);
  console.error(failed.stack?.split('\n').slice(1, 6).join('\n'));
  process.exit(1);
}
if (errors.length) process.exit(1);
log(`OK — ${shotNo} screenshots in ${SHOTS}`);
