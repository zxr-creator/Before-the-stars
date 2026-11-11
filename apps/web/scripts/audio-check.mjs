// End-to-end check of music and interface sound in the real client.
//
//   BTS_URL=http://127.0.0.1:7989 node scripts/audio-check.mjs        (referee build)
//   node scripts/audio-check.mjs http://127.0.0.1:8799/Before-the-stars/   (pages build)
//
// Proves, in headless Chromium with the browser's normal autoplay policy:
//   1. nothing audible exists before a gesture: no AudioContext, the engine chunk not fetched,
//      no recording fetched;
//   2. the first click creates and resumes the context, fetches the engine lazily, and the
//      title recording starts (the "Now playing" notice shows it);
//   3. M mutes (master to 0, context suspended), the setting persists across a reload, and
//      M again restores the sound; the menu's controls change and persist volumes;
//   4. a hidden page fades out, suspends and pauses the recording; visible again resumes it;
//   5. recorded music: starting a match plays a recording of the civilization's era; a forced
//      era change crossfades (old recording fading while the new one plays); war plays a war
//      recording; a sting ducks the recording and lets it back up; with every recording file
//      missing (404), the composed score takes over without an error;
//      composed score (source "generated"): the era's piece plays, an era change crossfades;
//   6. the cost: main-thread milliseconds per second spent scheduling over a minute of
//      play with the 3D map on screen, the longest single tick, and live audio nodes over
//      time (no growth);
// and that no console error or page error appears throughout (the deliberate 404s of the
// missing-file check excepted).
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.argv[2] ?? process.env.BTS_URL ?? 'http://127.0.0.1:7989').replace(/\/?$/, '/');
const SECONDS = Number(process.env.AUDIO_SECONDS ?? 60);
const log = (...a) => console.log('[audio]', ...a);
const errors = [];
let failed = 0;
const check = (ok, what) => { log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failed++; };

const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
let expect404 = false;
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // the missing-file check answers recordings with 404 on purpose
  if (expect404 && /Failed to load resource/.test(m.text()) && /\.webm$/.test(m.location()?.url ?? '')) return;
  errors.push('console: ' + m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const engineRequests = [];
const musicRequests = [];
page.on('request', (r) => {
  if (/\/assets\/engine-[^/]*\.js$/.test(r.url())) engineRequests.push(r.url());
  if (/\.webm$/.test(r.url())) musicRequests.push(r.url());
});
// the recordings of each era and mood, from the catalogue the game ships
const catalogue = JSON.parse(readFileSync(new URL('../src/audio/tracks/tracks.json', import.meta.url), 'utf8'));
const fits = (key, mood) => catalogue.filter((x) => x.eras.includes(key) && x.moods.includes(mood)).map((x) => x.id);

const A = (fn, arg) => page.evaluate(fn, arg);
const status = () => A(() => window.__btsAudio?.status());
const stats = () => A(() => window.__btsAudio?.stats());
const ctxState = () => A(() => window.__btsAudio?.contextState());
const waitFor = (fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
let st = null;

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
check(musicRequests.length === 0, 'before a gesture no recording is fetched');

// 2. first gesture: a click on an empty part of the page
await page.mouse.click(1300, 120);
await waitFor(() => window.__btsAudio.status() === 'running');
check(engineRequests.length === 1, `the first click fetched the engine chunk lazily (${engineRequests.map((u) => u.split('/').pop()).join(', ')})`);
await waitFor(() => window.__btsAudio.contextState() === 'running');
check(true, 'the AudioContext is running after the click');
const onTitle = await page.$('[data-testid="title-screen"]');
if (onTitle) {
  await waitFor((ids) => ids.includes(window.__btsAudio.stats()?.rec.playing), fits('title', 'title'), 20000);
  st = await stats();
  check(st.source === 'recorded' && st.rec.gain > 0, `after the first click the title recording plays: ${st.rec.playing} (${musicRequests.length} file fetched, gain ${st.rec.gain.toFixed(2)})`);
  const np = await A(() => window.__btsAudio.nowPlaying());
  const notice = await page.$('[data-testid="now-playing"]');
  check(!!np && !!notice && (await notice.innerText()).includes(np.composer), `"Now playing" shows it: ${notice ? (await notice.innerText()).replace(/\s+/g, ' ') : '(none)'}`);
}

// 3. mute with M, persistence, unmute
await page.keyboard.press('m');
await page.waitForTimeout(1200);
st = await stats();
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
// the reload above made a new engine: let its title recording start before hiding the page
if (onTitle) await waitFor(() => !!window.__btsAudio.stats()?.rec.playing, null, 20000).catch(() => {});
const playingBefore = (await stats()).rec.playing;
await setHidden(true);
await page.waitForTimeout(1300);
st = await stats();
check(st.hidden && st.master < 0.01, `hidden: faded out (master ${st.master.toFixed(4)})`);
check((await ctxState()) === 'suspended', 'hidden: context suspended');
check(!playingBefore || st.rec.paused, `hidden: the recording is paused (${playingBefore ?? 'none playing'})`);
await setHidden(false);
await waitFor(() => window.__btsAudio.contextState() === 'running');
await page.waitForTimeout(900);
st = await stats();
check(!st.hidden && st.master > 0.3, `visible again: resumed (master ${st.master.toFixed(3)})`);
check(!st.rec.paused && st.rec.playing === playingBefore, `visible again: the same recording carries on (${st.rec.playing})`);

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
check(st.target.key === 'ancient' && st.target.mood === 'peace', `in a fresh match the music follows the era: ${st.target.key}/${st.target.mood}, intensity ${st.target.intensity.toFixed(2)}`);

// 5a. recorded music (the default source)
await waitFor((ids) => ids.includes(window.__btsAudio.stats().rec.playing), fits('ancient', 'peace'), 20000);
st = await stats();
check(st.scoreTarget === null, `an ancient recording plays (${st.rec.playing}) and the composed score is silent`);
// era change: sample every 100 ms; the old recording must still be fading while the new one plays
const classical = fits('classical', 'peace');
await A(() => window.__btsAudio.force({ key: 'classical', mood: 'peace', intensity: 1 }));
let overlap = false;
const tx = Date.now();
while (Date.now() - tx < 12000) {
  const s = await stats();
  if (classical.includes(s.rec.playing) && s.rec.fading > 0) { overlap = true; break; }
  await page.waitForTimeout(100);
}
st = await stats();
check(classical.includes(st.rec.playing) && overlap, `era change crossfades: ${st.rec.playing} came in while the ancient recording faded out`);
await A(() => window.__btsAudio.force({ key: 'classical', mood: 'war', intensity: 1 }));
await waitFor((ids) => ids.includes(window.__btsAudio.stats().rec.playing), fits('classical', 'war'), 15000);
check(true, `peace to war: a war recording plays (${(await stats()).rec.playing})`);
// a sting ducks the recording and lets it back up
await page.waitForTimeout(3500);
const before = await stats();
await A(() => window.__btsAudio.sting('victory'));
await page.waitForTimeout(700);
const ducked = await stats();
check(before.duck > 0.95 && ducked.duck < 0.5 && ducked.rec.playing === before.rec.playing, `a sting ducks the recording (${before.duck.toFixed(2)} → ${ducked.duck.toFixed(2)}, still ${ducked.rec.playing})`);
await waitFor(() => window.__btsAudio.stats().duck > 0.9, null, 20000);
check(true, 'after the sting the recording comes back up');
// a missing file: every recording answers 404; the composed score takes over, no page error
expect404 = true;
await page.route('**/*.webm', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'missing' }));
await A(() => window.__btsAudio.force({ key: 'modern', mood: 'peace', intensity: 1 }));
await waitFor(() => { const s = window.__btsAudio.stats(); return s.key === 'modern' && s.rec.playing === null; }, null, 20000);
st = await stats();
const modern = fits('modern', 'peace');
check(modern.length > 0 && modern.every((id) => st.rec.failed.includes(id)) && st.scoreTarget?.key === 'modern', `missing files: ${st.rec.failed.join(', ')} set aside; the composed modern piece plays (${st.form})`);
await page.unroute('**/*.webm');
await page.waitForTimeout(500);
expect404 = false;
check(errors.length === 0, `missing files raised no page or console error${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);

// 5b. the composed score (source "generated"), as before
await A(() => window.__btsAudio.source('generated'));
await A(() => window.__btsAudio.force(undefined));
await waitFor(() => window.__btsAudio.stats().key === 'ancient' && window.__btsAudio.stats().rec.playing === null, null, 20000);
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
// optional soak (AUDIO_SOAK=seconds): every era in turn at full intensity, a minute each, with
// crossfades, stings and interface sounds; JS heap (after a forced GC) and live audio nodes sampled
const SOAK = Number(process.env.AUDIO_SOAK ?? 0);
if (SOAK > 0) {
  const eras = ['ancient', 'classical', 'earlyModern', 'industrial', 'modern', 'space', 'title'];
  const soak = [];
  const s0 = Date.now();
  let k = 0;
  while (Date.now() - s0 < SOAK * 1000) {
    const key = eras[k % eras.length];
    await A((kk) => window.__btsAudio.force({ key: kk, mood: kk === 'title' ? 'title' : (Math.random() < 0.3 ? 'war' : 'peace'), intensity: 1 }), key);
    for (let j = 0; j < 4 && Date.now() - s0 < SOAK * 1000; j++) {
      await page.waitForTimeout(15000);
      if (j === 1) await A(() => window.__btsAudio.sting('moment'));
    }
    const m = await A(() => { if (window.gc) window.gc(); return performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null; });
    const s = await stats();
    soak.push({ t: Math.round((Date.now() - s0) / 1000), era: key, heapMB: m === null ? null : +m.toFixed(1), liveNodes: s.liveNodes, voices: s.voices, msPerSec: +s.schedMsPerSec.toFixed(3), pieces: s.pieces });
    k++;
  }
  console.table(soak);
  const h = soak.map((x) => x.heapMB).filter((x) => x !== null);
  if (h.length >= 4) {
    const early = Math.max(...h.slice(1, 3));
    const late = Math.max(...h.slice(-2));
    check(late < early + 8, `soak: JS heap does not grow (early ${early.toFixed(1)} MB, late ${late.toFixed(1)} MB)`);
  }
  check(Math.max(...soak.map((x) => x.liveNodes)) < 4000, `soak: live audio nodes bounded (max ${Math.max(...soak.map((x) => x.liveNodes))})`);
}
// "Both, in turn": a recording first, the composed score after it
await A(() => window.__btsAudio.source('both'));
await A(() => window.__btsAudio.force({ key: 'industrial', mood: 'peace', intensity: 1 }));
await waitFor((ids) => ids.includes(window.__btsAudio.stats().rec.playing), fits('industrial', 'peace'), 20000);
st = await stats();
check(st.source === 'both' && st.turn === 'rec', `"both": an industrial recording takes the first turn (${st.rec.playing})`);
await A(() => window.__btsAudio.source('recorded'));
await A(() => window.__btsAudio.force(undefined));
const heap =await A(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
if (heap !== null) log(`JS heap in use: ${heap} MB`);

check(errors.length === 0, `no console or page errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
await browser.close();
log(failed ? `${failed} check(s) failed` : 'all audio checks passed');
process.exit(failed ? 1 : 0);
