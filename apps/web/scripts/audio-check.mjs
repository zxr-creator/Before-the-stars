// End-to-end check of music and interface sound in the real client.
//
//   BTS_URL=http://127.0.0.1:7989 node scripts/audio-check.mjs        (referee build)
//   node scripts/audio-check.mjs http://127.0.0.1:8799/Before-the-stars/   (pages build)
//
// Proves, in headless Chromium with the browser's normal autoplay policy:
//   1. nothing audible exists before a gesture: no AudioContext, the engine chunk not fetched;
//   2. the first click creates and resumes the context, fetches the engine lazily, and the
//      title theme plays;
//   3. M mutes (master to 0, context suspended), the setting persists across a reload, and
//      M again restores the sound; the menu's controls change and persist volumes;
//   4. a hidden page fades out and suspends; visible again resumes;
//   5. starting a match switches to the civilization's era (from the observation), and a
//      forced era change crossfades to the new era;
//   6. the cost: main-thread milliseconds per second spent scheduling over a minute of
//      play with the 3D map on screen, the longest single tick, and live audio nodes over
//      time (no growth);
// and that no console error or page error appears throughout.
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? process.env.BTS_URL ?? 'http://127.0.0.1:7989').replace(/\/?$/, '/');
const SECONDS = Number(process.env.AUDIO_SECONDS ?? 60);
const log = (...a) => console.log('[audio]', ...a);
const errors = [];
let failed = 0;
const check = (ok, what) => { log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failed++; };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const engineRequests = [];
page.on('request', (r) => { if (/\/assets\/engine-[^/]*\.js$/.test(r.url())) engineRequests.push(r.url()); });

const A = (fn, arg) => page.evaluate(fn, arg);
const status = () => A(() => window.__btsAudio?.status());
const stats = () => A(() => window.__btsAudio?.stats());
const ctxState = () => A(() => window.__btsAudio?.contextState());
const waitFor = (fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

await page.goto(BASE);
await page.waitForSelector('[data-testid="title-screen"], [data-testid="map-canvas"]');
await page.evaluate(() => { try { localStorage.removeItem('bts.audio'); } catch {} });
await page.reload();
await page.waitForSelector('[data-testid="title-screen"], [data-testid="map-canvas"]');
await page.waitForTimeout(800);

// 1. before any gesture
check((await status()) === 'idle', 'before a gesture the audio is idle');
check((await ctxState()) === null, 'before a gesture no AudioContext exists');
check(engineRequests.length === 0, 'before a gesture the engine chunk is not fetched');

// 2. first gesture: a click on an empty part of the page
await page.mouse.click(1300, 120);
await waitFor(() => window.__btsAudio.status() === 'running');
check(engineRequests.length === 1, `the first click fetched the engine chunk lazily (${engineRequests.map((u) => u.split('/').pop()).join(', ')})`);
await waitFor(() => window.__btsAudio.contextState() === 'running');
check(true, 'the AudioContext is running after the click');
const onTitle = await page.$('[data-testid="title-screen"]');
if (onTitle) {
  await waitFor(() => window.__btsAudio.stats()?.key === 'title');
  check(true, `title theme playing (${(await stats()).form})`);
}

// 3. mute with M, persistence, unmute
await page.keyboard.press('m');
await page.waitForTimeout(1200);
let st = await stats();
check(st.master < 0.01, `M mutes: master gain ${st.master.toFixed(4)}`);
check((await ctxState()) === 'suspended', 'muted: the context is suspended (no audio-thread work)');
const saved = await A(() => JSON.parse(localStorage.getItem('bts.audio') ?? 'null'));
check(saved?.muted === true, 'the mute is stored in localStorage');
await page.reload();
await page.waitForSelector('[data-testid="title-screen"], [data-testid="map-canvas"]');
await page.waitForTimeout(500);
await page.mouse.click(1300, 120);
await page.waitForTimeout(600);
check((await ctxState()) === null, 'after a reload the stored mute holds: a click starts no audio');
await page.keyboard.press('m');
await waitFor(() => window.__btsAudio.contextState() === 'running');
await page.waitForTimeout(800);
st = await stats();
check(st.master > 0.3, `M again unmutes and starts the sound: master gain ${st.master.toFixed(3)}`);

// volumes through the title screen's Sound panel, if there is one
if (await page.$('[data-testid="title-sound"]')) {
  await page.click('[data-testid="title-sound"]');
  await page.waitForSelector('[data-testid="title-sound-pane"]');
  await page.$eval('[data-testid="sound-music"]', (el) => { el.value = '30'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(700);
  const music = (await stats()).music;
  check(Math.abs(music - 0.09 * 0.8) < 0.01, `the music slider sets the music gain (0.30² × mix = ${music.toFixed(3)})`);
  const s2 = await A(() => JSON.parse(localStorage.getItem('bts.audio') ?? 'null'));
  check(s2?.music === 0.3, 'the music volume is stored');
  await page.$eval('[data-testid="sound-music"]', (el) => { el.value = '70'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('[data-testid="title-sound"]');
}

// 4. hidden page
const setHidden = (h) => A((hh) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hh });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hh ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}, h);
await setHidden(true);
await page.waitForTimeout(1300);
st = await stats();
check(st.hidden && st.master < 0.01, `hidden: faded out (master ${st.master.toFixed(4)})`);
check((await ctxState()) === 'suspended', 'hidden: context suspended');
await setHidden(false);
await waitFor(() => window.__btsAudio.contextState() === 'running');
await page.waitForTimeout(900);
st = await stats();
check(!st.hidden && st.master > 0.3, `visible again: resumed (master ${st.master.toFixed(3)})`);

// 5. a match: the era comes from the observation
if (onTitle) {
  await page.click('[data-testid="title-new"]');
  await page.waitForSelector('[data-testid="setup-screen"]');
  const r24 = await page.$('[data-testid="setup-regions-24"]');
  if (r24) await r24.click();
  await page.click('[data-testid="setup-start"]');
}
await page.waitForSelector('[data-testid="map-canvas"]', { timeout: 60000 });
await waitFor(() => { const s = window.__btsAudio.stats(); return s && s.target && s.target.mood !== 'title'; }, null, 20000);
st = await stats();
check(st.target.key === 'ancient' && st.target.mood === 'peace', `in a fresh match the score follows the era: ${st.target.key}/${st.target.mood}, intensity ${st.target.intensity.toFixed(2)}`);
await waitFor(() => window.__btsAudio.stats().key === 'ancient', null, 20000);
check(true, `ancient piece playing: ${(await stats()).form}`);

// forced era change: the classical piece takes over within a few seconds
await A(() => window.__btsAudio.force({ key: 'classical', mood: 'peace', intensity: 1 }));
await waitFor(() => window.__btsAudio.stats().key === 'classical', null, 8000);
check(true, 'forced era change: the classical piece is playing (crossfade from ancient)');
await A(() => window.__btsAudio.force({ key: 'classical', mood: 'war', intensity: 1 }));
await waitFor(() => window.__btsAudio.stats().mood === 'war', null, 8000);
check(true, 'peace to war: the war arrangement of the same era is playing');
await A(() => window.__btsAudio.force(undefined));
await waitFor(() => window.__btsAudio.stats().key === 'ancient', null, 8000);
check(true, 'released: back to the game\'s own era');
await A(() => window.__btsAudio.sting('moment'));
check(true, 'a moment sting plays without error');

// 6. cost over time, with the map on screen; the map is panned now and then to keep it busy
log(`measuring for ${SECONDS} s …`);
const samples = [];
const t0 = Date.now();
while (Date.now() - t0 < SECONDS * 1000) {
  await page.waitForTimeout(5000);
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, (samples.length % 2 ? 1 : -1) * 120);
  const s = await stats();
  samples.push({ t: Math.round((Date.now() - t0) / 1000), nodes: s.liveNodes, voices: s.voices, ms: s.schedMsPerSec, max: s.maxTickMs, pieces: s.pieces });
}
console.table(samples);
const last = await stats();
check(last.schedMsPerSec < 2, `scheduling cost ${last.schedMsPerSec.toFixed(3)} ms per second (target < 2), longest tick ${last.maxTickMs.toFixed(2)} ms (composing a piece: ${last.composeMs.toFixed(2)} ms), ${last.ticks} ticks`);
const half = samples.slice(Math.floor(samples.length / 2));
const firstHalf = samples.slice(0, Math.floor(samples.length / 2));
const maxN = (xs) => Math.max(...xs.map((x) => x.nodes));
check(maxN(half) < 4000 && maxN(half) <= maxN(firstHalf) * 1.6 + 200, `live audio nodes stay bounded (first half max ${maxN(firstHalf)}, second half max ${maxN(half)})`);
// the densest arrangements (all four layers): modern and industrial at full intensity
for (const key of ['modern', 'industrial']) {
  await A((k) => window.__btsAudio.force({ key: k, mood: 'peace', intensity: 1 }), key);
  await waitFor((k) => window.__btsAudio.stats().key === k, key, 10000);
  // let the transition pass, then one full 10 s measuring window
  await page.waitForTimeout(23000);
  const d = await stats();
  check(d.schedMsPerSec < 2, `${key} at full intensity: ${d.schedMsPerSec.toFixed(3)} ms per second scheduling, ${d.voices} voices, ${d.liveNodes} live nodes`);
}
await A(() => window.__btsAudio.force(undefined));
const heap = await A(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
if (heap !== null) log(`JS heap in use: ${heap} MB`);

check(errors.length === 0, `no console or page errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await browser.close();
log(failed ? `${failed} check(s) failed` : 'all audio checks passed');
process.exit(failed ? 1 : 0);
