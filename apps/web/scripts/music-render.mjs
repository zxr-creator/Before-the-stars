// Render the composed score offline and analyse it — the way to check music without
// listening. The engine (src/audio/engine) is bundled with esbuild and run in headless
// Chromium on an OfflineAudioContext, through the same conductor, instruments and master
// chain as the game. For each render it writes
//
//   apps/web/screenshots/music/<name>.wav        16-bit stereo, 44.1 kHz (git-ignored)
//   apps/web/screenshots/music/<name>.png        log-frequency spectrogram
//   apps/web/screenshots/music/report.json       every number below
//
// and prints peak / RMS / integrated loudness (BS.1770, LUFS), clipped samples, DC
// offset, suspected clicks (curvature spikes 40x above their surroundings), silence
// gaps inside the music, band energy shares, spectral centroid, and whether the last
// seconds settle on the tonic (strongest pitch class of the final chord).
//
//   node scripts/music-render.mjs              all renders
//   node scripts/music-render.mjs main war     only renders whose name contains "main" or "war"
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const web = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(web, 'screenshots', 'music');
mkdirSync(OUT, { recursive: true });

const ERAS = ['ancient', 'classical', 'earlyModern', 'industrial', 'modern', 'space'];
const SPECS = [
  { name: 'main-title', kind: 'main', key: 'title', mood: 'title' },
  ...ERAS.map((e, i) => ({ name: `main-${i + 1}-${e}`, kind: 'main', key: e, mood: 'peace' })),
  ...ERAS.map((e, i) => ({ name: `war-${i + 1}-${e}`, kind: 'main', key: e, mood: 'war' })),
  { name: 'piece-title', kind: 'piece', key: 'title', mood: 'title', seed: 3 },
  ...ERAS.map((e, i) => ({ name: `piece-${i + 1}-${e}`, kind: 'piece', key: e, mood: 'peace', seed: 5 + i })),
  { name: 'layers-industrial', kind: 'layers', key: 'industrial', mood: 'peace' },
  { name: 'layers-ancient', kind: 'layers', key: 'ancient', mood: 'peace' },
  { name: 'crossfade-ancient-to-classical', kind: 'crossfade', key: 'ancient', mood: 'peace', to: 'classical', at: 22, seconds: 50 },
  { name: 'crossfade-modern-peace-to-war', kind: 'crossfade', key: 'modern', mood: 'peace', toMood: 'war', at: 20, seconds: 45 },
  { name: 'sting-moment', kind: 'sting', key: 'classical', mood: 'peace', sting: 'moment', at: 14, seconds: 28 },
  { name: 'sting-victory', kind: 'sting', key: 'industrial', mood: 'peace', sting: 'victory', at: 14, seconds: 34 },
  { name: 'sting-defeat', kind: 'sting', key: 'earlyModern', mood: 'war', sting: 'defeat', at: 14, seconds: 34 },
];

const filters = process.argv.slice(2);
const specs = filters.length ? SPECS.filter((s) => filters.some((f) => s.name.includes(f))) : SPECS;

const bundle = await build({
  entryPoints: [join(web, 'src/audio/engine/render.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'BTSRender',
  target: 'es2020',
  plugins: [{
    // the recorded-track catalogue uses Vite's import.meta.glob; recordings are not rendered
    name: 'no-tracks',
    setup(b) {
      b.onLoad({ filter: /engine[\\/]tracks\.ts$/ }, () => ({
        contents: 'export const RECORDED_TRACKS = []; export function fitting() { return []; }',
        loader: 'ts',
      }));
    },
  }],
});
const code = bundle.outputFiles[0].text;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: code });

// Self-test of the click detector: a sine with one hard phase jump must be caught, the
// same sine with clean envelopes must not.
const selftest = await page.evaluate(() => {
  const sr = 44100;
  const mk = (jump) => {
    const L = new Float32Array(sr * 3);
    for (let i = 0; i < L.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.005) * Math.min(1, (3 - t) / 0.05);
      L[i] = 0.3 * env * Math.sin(2 * Math.PI * 220 * t + (jump && t > 1.5 ? Math.PI / 2 : 0));
    }
    return window.BTSRender.analyse(L, L, sr, 9, null).clicks;
  };
  return { withJump: mk(true), clean: mk(false) };
});
console.log(`click detector self-test: phase jump -> ${selftest.withJump} click(s), clean -> ${selftest.clean}`);
if (selftest.withJump < 1 || selftest.clean !== 0) { console.error('click detector self-test FAILED'); process.exit(1); }

const report = {};
let bad = 0;
for (const spec of specs) {
  const t0 = Date.now();
  const res = await page.evaluate((s) => window.BTSRender.render(s), spec);
  writeFileSync(join(OUT, spec.name + '.wav'), Buffer.from(res.wav, 'base64'));
  writeFileSync(join(OUT, spec.name + '.png'), Buffer.from(res.spectrogram.split(',')[1], 'base64'));
  const a = res.analysis;
  report[spec.name] = { form: res.form, seconds: +res.seconds.toFixed(1), scheduleMs: +res.schedMs.toFixed(1), ...a };
  const flags = [];
  if (a.clippedSamples) flags.push(`CLIP ${a.clippedSamples}`);
  if (a.peakDb > -0.5) flags.push('HOT');
  if (Math.abs(a.dc) > 1e-3) flags.push('DC');
  if (a.clicks) flags.push(`clicks ${a.clicks} @ ${a.clickTimes.join(',')}`);
  if (a.silenceGaps) flags.push(`gaps ${a.silenceGaps} (longest ${a.longestGapS}s)`);
  if (!a.resolvesToTonic && spec.kind !== 'crossfade' && spec.kind !== 'sting') flags.push(`ends on pc ${a.finalTopPcs[0]} not ${a.tonicPc}`);
  if (flags.some((f) => f.startsWith('CLIP') || f === 'DC')) bad++;
  console.log(`${spec.name.padEnd(34)} ${res.seconds.toFixed(0).padStart(4)}s  peak ${a.peakDb.toFixed(1).padStart(6)}  rms ${a.rmsDb.toFixed(1).padStart(6)}  ${a.lufs.toFixed(1).padStart(6)} LUFS  centroid ${String(a.centroidHz).padStart(5)} Hz  bands ${Object.values(a.bands).join('/')}  [${Date.now() - t0} ms] ${flags.join('; ')}`);
  console.log(`${''.padEnd(34)} form: ${res.form}`);
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
const eraLufs = Object.entries(report).filter(([k]) => k.startsWith('main-')).map(([k, v]) => [k, v.lufs]);
if (eraLufs.length > 1) {
  const vals = eraLufs.map(([, v]) => v);
  console.log(`\nmain-theme loudness spread: ${(Math.max(...vals) - Math.min(...vals)).toFixed(2)} dB (${eraLufs.map(([k, v]) => `${k.replace('main-', '')} ${v}`).join(', ')})`);
}
await browser.close();
console.log(`\nwrote ${specs.length} renders to ${OUT}`);
process.exit(bad ? 1 : 0);
