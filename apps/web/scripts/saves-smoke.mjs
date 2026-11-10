// Save files in the server-backed game, and between it and the browser build.
//
//   BTS_NO_WINDOW=1 BTS_NO_BROWSER=1 target/release/bts serve --port 7984 --fresh --saves <dir> &
//   node apps/web/scripts/serve-static.mjs dist/pages 8794 /Before-the-stars/ &
//   BTS_URL=http://127.0.0.1:7984 PAGES_URL=http://127.0.0.1:8794/Before-the-stars/ node apps/web/scripts/saves-smoke.mjs
//
// 1. The referee's HTTP API: the save file out and in, what it says about a file
//    without loading it, every refusal with the match untouched, named saves as files
//    on disk (and saves from before the container still loading), the exports folder,
//    and no world handed out by a referee that has an external seat.
// 2. The interface against the server: the storage manager, export as a download,
//    import with its preview, and the desktop window's path (no download: the referee
//    writes the file and the interface says where).
// 3. Both ways between the two builds: a file exported by the browser build loads in
//    the server-backed game and the reverse, byte for byte, and the two then play on
//    identically. Skipped when PAGES_URL is not given.
//
// Needs BTS_NO_BROWSER=1 on the referee (so "show in folder" opens nothing), and a
// saves folder of its own: it writes and deletes saves there.
import { chromium } from 'playwright';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { damagedFiles, readSaveFile, unplayableFile } from './savefile-lib.mjs';

const BASE = (process.env.BTS_URL ?? 'http://127.0.0.1:7984').replace(/\/$/, '');
const PAGES = process.env.PAGES_URL ? process.env.PAGES_URL.replace(/\/?$/, '/') : null;
const TMP = mkdtempSync(join(tmpdir(), 'bts-saves-smoke-'));
const log = (...a) => console.log('[saves]', ...a);
const notes = [];
const note = (s) => { notes.push(s); log(s); };
function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}
const tid = (id) => `[data-testid="${id}"]`;

/** One request to the referee: JSON or bytes in, status and JSON, text or bytes out. */
async function call(method, path, body) {
  const binary = body instanceof Uint8Array;
  const res = await fetch(BASE + path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': binary ? 'application/octet-stream' : 'application/json' },
    body: body === undefined ? undefined : binary || typeof body === 'string' ? body : JSON.stringify(body),
  });
  const type = res.headers.get('content-type') ?? '';
  if (res.ok && type.startsWith('application/x-bts-save')) return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()), headers: res.headers };
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, text, json, headers: res.headers };
}
const state = async () => (await call('GET', '/api/session/export')).text;
const newMatch = async (seed, controllers = ['human', 'medium', 'medium', 'easy']) => {
  const r = await call('POST', '/api/match', { seed, regions: 24, controllers });
  assert(r.status === 200, `a match starts (${r.text})`);
  return r.json;
};
const endRound = async () => (await call('POST', '/api/ready', { seat: 0, token: '', through_round: true })).json;

// =====================================================================================
async function part1() {
  log('1: the referee’s save-file API');
  const made = await newMatch('saves-smoke');
  await endRound();
  await endRound();
  const text = await state();
  const got = await call('GET', '/api/savefile?kind=manual&name=first%20export&created=1700000000000');
  assert(got.status === 200 && got.bytes, 'GET /api/savefile answers with a save file');
  assert(/attachment; filename="before-the-stars-first-export-y3\.btsave"/.test(got.headers.get('content-disposition') ?? ''), `it is offered as a download with a name (${got.headers.get('content-disposition')})`);
  const file = got.bytes;
  const read = readSaveFile(file);
  assert(read.text === text, 'the file unpacks (in Node) to exactly the session export');
  assert(read.header.match_id === made.match_id && read.header.round === 3 && read.header.name === 'first export' && read.header.created_ms === 1700000000000, 'its header describes the match and carries what the caller said');
  note(`server export: ${file.length} bytes for ${text.length} bytes of session text (${(text.length / file.length).toFixed(1)}:1)`);

  const described = await call('POST', '/api/savefile/describe', file);
  assert(described.json.loadable === true && described.json.header.sha256 === read.header.sha256 && described.json.build.ruleset === read.header.versions.ruleset, 'describe says it is loadable, and what it is');

  await endRound();
  const later = await state();
  for (const bad of [...damagedFiles(file), { name: 'unplayable-session', reason: 'UNPLAYABLE', bytes: unplayableFile(file) }]) {
    const d = await call('POST', '/api/savefile/describe', bad.bytes);
    assert(d.status === 200 && d.json.loadable === false && d.json.reason === bad.reason && d.json.message.length > 10, `${bad.name}: describe gives ${bad.reason} (${d.text.slice(0, 160)})`);
    const r = await call('POST', '/api/savefile/import', bad.bytes);
    assert(r.status === 400 && r.json.error === 'INVALID_SAVE' && r.json.reason === bad.reason, `${bad.name}: import is refused as ${bad.reason} (${r.text.slice(0, 160)})`);
    assert((await state()) === later, `${bad.name}: the match is unchanged`);
  }
  note('server: eleven damaged, foreign and hostile files each refused with its reason; the match byte-identical after every one');

  const back = await call('POST', '/api/savefile/import', file);
  assert(back.status === 200 && back.json.round === 3 && (await state()) === text, 'the good file restores the saved state exactly');
  assert((await call('POST', '/api/savefile/import', Buffer.from(later, 'utf8'))).status === 200 && (await state()) === later, 'bare session text is still accepted as a save file');
  assert((await call('POST', '/api/session/import', text)).status === 200 && (await state()) === text, 'the session text routes still work');

  // named saves are files on disk
  const listing0 = (await call('GET', '/api/saves')).json;
  const dir = listing0.dir;
  assert(dir && existsSync(dir), `the listing says where the saves are (${dir})`);
  const auto = listing0.entries.find((e) => e.name === 'autosave');
  assert(auto && auto.kind === 'auto' && auto.legacy && auto.header?.match_id === made.match_id, 'the autosave is listed with what it holds');
  assert((await call('POST', '/api/save', { name: 'srv one!' })).json.saved === 'srvone', 'POST /api/save saves under the sanitised name');
  assert(readSaveFile(readFileSync(join(dir, 'srvone.btsave'))).text === text, 'the named save on disk is a save file holding the current state');
  assert((await call('POST', '/api/save', { name: 'autosave' })).status === 400, "'autosave' is not a name for a manual save");
  // a save from before the container: bare session text in <name>.json
  await endRound();
  const oldText = await state();
  writeFileSync(join(dir, 'oldstyle.json'), oldText);
  let listing = (await call('GET', '/api/saves')).json;
  assert(listing.saves.includes('srvone') && listing.saves.includes('oldstyle') && listing.saves.includes('autosave'), `the names are listed (${listing.saves})`);
  const one = listing.entries.find((e) => e.name === 'srvone');
  const old = listing.entries.find((e) => e.name === 'oldstyle');
  assert(one.kind === 'manual' && !one.legacy && one.header.round === 3 && one.header.name === 'srvone' && one.bytes === readFileSync(join(dir, 'srvone.btsave')).length, 'the new save is listed with its header and size');
  assert(old.legacy && old.header.round === 4, 'the old-format save is listed, described from its contents');
  assert((await call('POST', '/api/load', { name: 'srvone' })).json.round === 3 && (await state()) === text, 'the named save loads');
  assert((await call('POST', '/api/load', { name: 'oldstyle' })).json.round === 4 && (await state()) === oldText, 'a save from before the container still loads');
  assert((await call('POST', '/api/load', { name: 'no-such-save' })).status === 404, 'an unknown name is 404');
  // rename, export one, delete
  assert((await call('POST', '/api/saves/rename', { name: 'srvone', to: 'oldstyle' })).status === 409, 'renaming onto a name that is taken is refused');
  assert((await call('POST', '/api/saves/rename', { name: 'srvone', to: 'srv two' })).json.renamed === 'srvtwo', 'a save is renamed');
  assert(!existsSync(join(dir, 'srvone.btsave')) && readSaveFile(readFileSync(join(dir, 'srvtwo.btsave'))).header.name === 'srvtwo', 'the file moved and its header carries the new name');
  const two = await call('GET', '/api/saves/file?name=srvtwo');
  assert(two.status === 200 && readSaveFile(two.bytes).text === text, 'a named save is handed out as a save file');
  const oldFile = await call('GET', '/api/saves/file?name=oldstyle');
  assert(oldFile.status === 200 && readSaveFile(oldFile.bytes).text === oldText && readSaveFile(oldFile.bytes).header.kind === 'manual', 'an old-format save is handed out as a save file too');
  assert((await call('POST', '/api/saves/delete', { name: 'oldstyle' })).status === 200 && !existsSync(join(dir, 'oldstyle.json')), 'a save is deleted');
  assert((await call('POST', '/api/saves/delete', { name: 'oldstyle' })).status === 404, 'deleting what is not there is 404');
  note(`server named saves: saved as a .btsave file (${one.bytes} bytes), listed with its header, loaded, renamed, exported, deleted; an old-format .json save listed, loaded and exported`);

  // the exports folder
  const written = (await call('POST', '/api/exports/write', {})).json;
  assert(written.path.endsWith('.btsave') && existsSync(written.path) && written.path.startsWith(listing.exports_dir), `the referee writes an export where it says (${written.path})`);
  assert(readSaveFile(readFileSync(written.path)).text === (await state()), 'the exported file holds the current state');
  const named = (await call('POST', '/api/exports/write', { name: 'srvtwo' })).json;
  assert(readSaveFile(readFileSync(named.path)).text === text, 'a named save can be exported to the folder');
  const damaged = damagedFiles(file).find((b) => b.name === 'flipped-byte');
  writeFileSync(join(written.dir, 'damaged.btsave'), damaged.bytes);
  writeFileSync(join(written.dir, 'notes.txt'), 'not a save');
  const folder = (await call('GET', '/api/exports')).json;
  assert(folder.files.some((f) => f.file === written.file && f.header?.match_id === made.match_id) && folder.files.some((f) => f.file === 'damaged.btsave') && !folder.files.some((f) => f.file === 'notes.txt'), 'the folder lists save files with what they say they are');
  assert((await call('POST', '/api/exports/describe', { file: 'damaged.btsave' })).json.reason === 'CORRUPT', 'a damaged file in the folder is recognised when it is chosen');
  const here = await state();
  const refusedImport = await call('POST', '/api/exports/import', { file: 'damaged.btsave' });
  assert(refusedImport.status === 400 && refusedImport.json.reason === 'CORRUPT' && (await state()) === here, 'importing it is refused and the match is unchanged');
  assert((await call('POST', '/api/exports/import', { file: named.file })).status === 200 && (await state()) === text, 'a good file is imported from the folder');
  for (const sneaky of ['../autosave.json', '..%2Fautosave.json', '/etc/passwd', 'sub/x.btsave', '.hidden.btsave', '']) {
    assert((await call('POST', '/api/exports/describe', { file: sneaky })).status === 404, `no path can be smuggled in ("${sneaky}")`);
  }
  const shown = (await call('POST', '/api/exports/reveal', { file: written.file })).json;
  assert(shown.revealed === false && shown.path === written.path, 'reveal names the file (and opens nothing while BTS_NO_BROWSER is set)');
  note(`server exports folder: ${written.dir}; files written by the referee, listed, described and imported from it; a damaged file refused; path tricks refused`);

  // a referee with an external seat hands out no world, running or stored
  await newMatch('saves-external', ['external', 'medium', 'medium', 'easy']);
  assert((await call('GET', '/api/savefile')).status === 403 && (await call('GET', '/api/session/export')).status === 403 && (await call('POST', '/api/exports/write', {})).status === 403, 'with an external seat the running match is not exported');
  assert((await call('POST', '/api/save', { name: 'withexternal' })).status === 200, 'the referee may still keep its own save of it');
  assert((await call('GET', '/api/saves/file?name=withexternal')).status === 403 && (await call('POST', '/api/exports/write', { name: 'withexternal' })).status === 403, 'and that stored save is not handed out either');
  assert((await call('GET', '/api/saves/file?name=srvtwo')).status === 200, 'a stored save of an ordinary match still is');
  await call('POST', '/api/saves/delete', { name: 'withexternal' });
  note('server: with an external seat neither the running match nor a stored save of it leaves the referee (403)');
  return { file, text, dir, exportsDir: written.dir };
}

// =====================================================================================
async function part2(browser, { exportsDir }) {
  log('2: the interface against the server');
  await newMatch('saves-ui');
  await endRound();
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push('page error: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console error: ' + m.text()); });
  };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(BASE + '/');
  await page.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  const openManager = async (p) => {
    if (await p.$(tid('saves-manager'))) return;
    if (!(await p.$(tid('game-menu')))) await p.click(tid('menu-button'));
    await p.click(tid('menu-saves'));
    await p.waitForSelector(`${tid('saves-manager')}[data-mode="http"]`);
    await p.waitForTimeout(250);
  };
  await openManager(page);
  assert(/Saves are files in /.test((await page.textContent(tid('saves-folder'))) ?? ''), 'the manager says where the saves are');
  assert((await page.$(tid('saves-usage'))) === null && (await page.$(tid('saves-budget'))) === null, 'the browser-only budget is not shown for files on disk');
  await page.fill(tid('saves-name'), 'ui-save');
  await page.click(tid('saves-save'));
  await page.waitForSelector(tid('saves-row-ui-save'));
  assert(((await page.textContent(tid('saves-row-ui-save'))) ?? '').includes('Year 2'), 'the new save is listed with its year');
  assert((await page.$(tid('saves-row-autosave'))) !== null, 'the autosave is listed');

  // export as a download
  const before = await state();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(tid('saves-export-current'))]);
  const path = join(TMP, download.suggestedFilename());
  await download.saveAs(path);
  assert(readSaveFile(readFileSync(path)).text === before, 'the downloaded file holds the current state');
  const [stored] = await Promise.all([page.waitForEvent('download'), page.click(tid('saves-export-ui-save'))]);
  assert(/ui-save/.test(stored.suggestedFilename()), `a stored save downloads under its name (${stored.suggestedFilename()})`);

  // play on, then import the file through the picker: preview, then confirm
  await endRound();
  await endRound();
  await page.setInputFiles(tid('saves-import-input'), path);
  await page.waitForSelector(`${tid('saves-preview')}[data-loadable="true"]`);
  assert(/Replace the current game/.test((await page.textContent(tid('saves-preview-confirm'))) ?? ''), 'the preview asks before replacing the game');
  await page.screenshot({ path: join(TMP, 'http-preview.png') });
  await page.click(tid('saves-preview-confirm'));
  await page.waitForSelector(tid('saves-manager'), { state: 'detached' });
  assert((await state()) === before, 'the import restored the exported state on the referee');
  await page.waitForFunction(() => /2/.test(document.querySelector('[data-testid="year"]')?.textContent ?? ''));

  // a damaged file is refused in the preview
  const bad = join(TMP, 'bad.btsave');
  writeFileSync(bad, readFileSync(path).subarray(0, 900));
  await openManager(page);
  await page.setInputFiles(tid('saves-import-input'), bad);
  await page.waitForSelector(`${tid('saves-preview')}[data-reason="TRUNCATED"]`);
  assert((await page.isVisible(tid('saves-preview-reason'))) && (await page.$(tid('saves-preview-confirm'))) === null, 'a truncated file is refused with its reason and cannot be loaded');
  await page.click(tid('saves-preview-cancel'));
  assert((await state()) === before, 'and the match is unchanged');

  // rename and delete (with its confirmation) through the interface
  await page.click(tid('saves-rename-ui-save'));
  await page.fill(tid('saves-rename-input-ui-save'), 'ui-renamed');
  await page.click(tid('saves-rename-confirm-ui-save'));
  await page.waitForSelector(tid('saves-row-ui-renamed'));
  await page.click(tid('saves-delete-ui-renamed'));
  assert((await call('GET', '/api/saves')).json.saves.includes('ui-renamed'), 'deleting asks first');
  await page.click(tid('saves-delete-confirm-ui-renamed'));
  await page.waitForSelector(tid('saves-row-ui-renamed'), { state: 'detached' });
  assert(!(await call('GET', '/api/saves')).json.saves.includes('ui-renamed'), 'and then deletes');

  // a file in the exports folder is imported from the list
  await endRound();
  await page.reload();
  await page.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  writeFileSync(join(exportsDir, 'from-elsewhere.btsave'), readFileSync(path));
  await openManager(page);
  await page.click(tid('saves-exported-import-from-elsewhere.btsave'));
  await page.waitForSelector(`${tid('saves-preview')}[data-loadable="true"]`);
  await page.click(tid('saves-preview-confirm'));
  await page.waitForSelector(tid('saves-manager'), { state: 'detached' });
  assert((await state()) === before, 'a file placed in the exports folder was imported from the list');
  note('server interface: save, export by download, import with preview and confirmation, a refused file, rename, delete with confirmation, import from the exports folder');
  await ctx.close();

  // the desktop window: no downloads, so the referee writes the file and the interface says where
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await desk.addInitScript(() => { window.__btsDesktop = { fullscreen() {}, quit() {} }; });
  const d = await desk.newPage();
  watch(d);
  let downloads = 0;
  d.on('download', () => { downloads++; });
  await d.goto(BASE + '/?notitle');
  await d.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  await openManager(d);
  await d.click(tid('saves-export-current'));
  await d.waitForSelector(`${tid('saves-message')}[data-tone="ok"]`);
  const said = ((await d.textContent(tid('saves-message'))) ?? '').trim();
  const where = said.match(/Exported to (.*\.btsave)/)?.[1];
  assert(where && existsSync(where) && readSaveFile(readFileSync(where)).text === before, `the desktop export says where the file is, and it is there (${said})`);
  assert(downloads === 0 && (await d.isVisible(tid('saves-reveal'))), 'nothing was downloaded; a "show in folder" action is offered');
  await d.click(tid('saves-reveal'));
  await d.click(tid('saves-reveal-folder'));
  await d.screenshot({ path: join(TMP, 'desktop-export.png') });
  note(`desktop shell (simulated in a browser): export wrote ${where} and showed the path with "Show in folder"; no download was attempted`);
  await desk.close();
  assert(errors.length === 0, 'no page or console errors:\n  ' + errors.join('\n  '));
}

// =====================================================================================
async function part3(browser) {
  if (!PAGES) {
    note('3: skipped (PAGES_URL not given)');
    return;
  }
  log('3: between the browser build and the server-backed game');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('page error: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  await page.goto(PAGES);
  await page.waitForSelector(tid('title-screen'), { timeout: 30000 });
  assert(await page.evaluate(() => window.__btsApi.mode === 'local'), 'PAGES_URL is the browser build');
  const inPage = (fn) => page.evaluate(fn);
  const bytesOut = async (fn) => Buffer.from(await page.evaluate(async (f) => {
    const bytes = await window.__btsApi[f]();
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, fn), 'base64');
  const bytesIn = (fn, bytes) => page.evaluate(([f, data]) => window.__btsApi[f](Uint8Array.from(atob(data), (c) => c.charCodeAt(0))), [fn, Buffer.from(bytes).toString('base64')]);

  // browser -> desktop
  await inPage(async () => {
    const api = window.__btsApi;
    await api.newMatch({ seed: 'from-the-browser', regions: 24, controllers: ['human', 'hard', 'medium', 'easy'] });
    for (let i = 0; i < 4; i++) await api.ready(0, true);
  });
  const browserText = await inPage(() => window.__btsApi.exportSession());
  const browserFile = await bytesOut('exportSave');
  assert(readSaveFile(browserFile).text === browserText, 'the browser build’s file holds its session');
  const intoServer = await call('POST', '/api/savefile/import', browserFile);
  assert(intoServer.status === 200 && intoServer.json.round === 5, `the server-backed game loads the browser's file (${intoServer.text?.slice(0, 120)})`);
  assert((await state()) === browserText, 'and then holds exactly the browser’s match');
  await endRound();
  await inPage(() => window.__btsApi.ready(0, true));
  const [serverNext, browserNext] = [await state(), await inPage(() => window.__btsApi.exportSession())];
  assert(serverNext === browserNext, 'both play the next round to the same state');
  note(`browser -> desktop: a ${browserFile.length}-byte file exported in the browser loaded on the referee byte-identical (round 5), and both reached the same state a round later`);

  // desktop -> browser
  await newMatch('from-the-desktop', ['human', 'easy', 'hard', 'medium']);
  for (let i = 0; i < 6; i++) await endRound();
  const serverText = await state();
  const serverFile = (await call('GET', '/api/savefile?name=desk')).bytes;
  const intoBrowser = await bytesIn('importSave', serverFile);
  assert(intoBrowser.round === 7 && (await inPage(() => window.__btsApi.exportSession())) === serverText, 'the browser build loads the server’s file and holds exactly its match');
  await endRound();
  await inPage(() => window.__btsApi.ready(0, true));
  assert((await state()) === (await inPage(() => window.__btsApi.exportSession())), 'both play the next round to the same state');
  note(`desktop -> browser: a ${serverFile.length}-byte file from the referee loaded in the browser build byte-identical (round 7), and both reached the same state a round later`);

  // the same two trips through the interfaces: a file written by the referee's export
  // folder picked in the browser build, and a file downloaded there picked on the server
  const written = (await call('POST', '/api/exports/write', {})).json;
  const deskState = await state();
  await page.goto(PAGES + '?title');
  await page.waitForSelector(tid('title-screen'), { timeout: 30000 });
  await page.click(tid('title-load'));
  await page.click(tid('title-saves-manage'));
  await page.waitForSelector(`${tid('saves-manager')}[data-mode="local"]`);
  await page.setInputFiles(tid('saves-import-input'), written.path);
  await page.waitForSelector(`${tid('saves-preview')}[data-loadable="true"]`);
  await page.click(tid('saves-preview-confirm'));
  await page.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  assert((await inPage(() => window.__btsApi.exportSession())) === deskState, 'a file from the desktop exports folder, picked in the browser build, loads there exactly');
  await page.click(tid('end-round'));
  await page.waitForFunction(() => window.__btsApi.match().then((m) => m.round === 9));
  await page.click(tid('menu-button'));
  await page.click(tid('menu-saves'));
  await page.waitForSelector(tid('saves-manager'));
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(tid('saves-export-current'))]);
  const fromPage = join(TMP, download.suggestedFilename());
  await download.saveAs(fromPage);
  const pageState = await inPage(() => window.__btsApi.exportSession());
  const server = await ctx.newPage();
  await server.goto(BASE + '/?notitle');
  await server.waitForSelector(tid('map-canvas'), { timeout: 30000 });
  await server.click(tid('menu-button'));
  await server.click(tid('menu-saves'));
  await server.waitForSelector(`${tid('saves-manager')}[data-mode="http"]`);
  await server.setInputFiles(tid('saves-import-input'), fromPage);
  await server.waitForSelector(`${tid('saves-preview')}[data-loadable="true"]`);
  await server.click(tid('saves-preview-confirm'));
  await server.waitForSelector(tid('saves-manager'), { state: 'detached' });
  assert((await state()) === pageState, 'a file downloaded in the browser build, picked in the server-backed interface, loads there exactly');
  note('through the interfaces: a file from the referee’s exports folder imported in the browser build, played a round, downloaded, and imported in the server-backed interface, each time byte-identical');
  // leave the browser build's database as it was found
  await page.evaluate(async () => {
    window.__btsSaves.settings({ autosaves: 0 });
    await window.__btsSaves.settled();
    for (const e of (await window.__btsApi.saveList()).entries) if (e.kind === 'auto') await window.__btsApi.deleteSave(e.id);
    window.__btsSaves.resetSettings();
  });
  await ctx.close();
  assert(errors.length === 0, 'no page or console errors:\n  ' + errors.join('\n  '));
}

// =====================================================================================
const started = Date.now();
let failed = null;
const browser = await chromium.launch();
try {
  assert((await call('GET', '/api/health')).json?.ok, `the referee answers at ${BASE}`);
  const one = await part1();
  await part2(browser, one);
  await part3(browser);
  for (const name of (await call('GET', '/api/saves')).json.saves) {
    if (name !== 'autosave') await call('POST', '/api/saves/delete', { name });
  }
} catch (e) {
  failed = e;
} finally {
  await browser.close();
  rmSync(TMP, { recursive: true, force: true });
}
console.log('\n[saves] summary');
for (const n of notes) console.log('  - ' + n);
if (failed) {
  console.error(`\n[saves] FAILED after ${((Date.now() - started) / 1000).toFixed(0)} s: ${failed.message}`);
  process.exit(1);
}
console.log(`\n[saves] PASSED in ${((Date.now() - started) / 1000).toFixed(0)} s`);
