// Encode the recorded music: cut, trim silence, fade, normalise loudness, Opus in WebM.
//
//   node scripts/music-encode.mjs <sources dir> [id …]
//
// <sources dir> holds the original files as downloaded from their source pages (see
// src/audio/tracks/CREDITS.md), named <id>.<ext>. They are not kept in the repository.
// Needs ffmpeg with libopus on PATH (repo-local: .toolchain/ffmpeg).
//
// For each track below:
//   1. cut [start, end) seconds of the original (an excerpt where the work is long);
//   2. 48 kHz stereo; remove leading and trailing silence (below -60 dBFS);
//   3. fade in and out (gentle; an excerpt that stops mid-work fades over several seconds);
//   4. bring the integrated loudness to -18 LUFS with one linear gain, and hold true peaks
//      at or below -1.5 dBTP with a look-ahead limiter (4x oversampled) where peaks need it;
//   5. encode Opus at 96 kbit/s (VBR) in WebM, measure, and repeat with a corrected gain or
//      a lower limiter ceiling until the encoded file meets both (at most four passes);
// then measure the result (EBU R128 integrated loudness, loudness range, true peak) and
// print a table, which is also written to src/audio/tracks/loudness.json.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(web, 'src', 'audio', 'tracks');
const SRC = process.argv[2];
const only = process.argv.slice(3);
if (!SRC) { console.error('usage: node scripts/music-encode.mjs <sources dir> [id …]'); process.exit(2); }

const TARGET = -18;
const PEAK = -1.5;
const BITRATE = '96k';

// id; start and end in seconds of the original (end null: to the end); fade in and out in seconds
export const CUTS = [
  { id: 'vltava', start: 0, end: 210, fadeIn: 0.5, fadeOut: 9 },
  { id: 'danse-sacree', start: 0, end: null, fadeIn: 0.3, fadeOut: 2 },
  { id: 'lamentation', start: 0, end: 180, fadeIn: 0.3, fadeOut: 6 },
  { id: 'coriolan', start: 0, end: 180, fadeIn: 0.2, fadeOut: 8 },
  { id: 'breves-dies', start: 0, end: null, fadeIn: 0.3, fadeOut: 2 },
  { id: 'veni-sancte', start: 0, end: null, fadeIn: 0.3, fadeOut: 2 },
  { id: 'dies-irae', start: 0, end: 180, fadeIn: 0.3, fadeOut: 6 },
  { id: 'byrd-ave-verum', start: 0, end: null, fadeIn: 0.5, fadeOut: 3 },
  { id: 'albinoni-adagio', start: 0, end: null, fadeIn: 0.3, fadeOut: 2 },
  { id: 'water-music-sarabande', start: 0, end: null, fadeIn: 0.3, fadeOut: 2 },
  { id: 'vivaldi-summer-presto', start: 0, end: null, fadeIn: 0.2, fadeOut: 2 },
  { id: 'haydn-lark-adagio', start: 0, end: null, fadeIn: 0.3, fadeOut: 2 },
  { id: 'holberg-air', start: 0, end: null, fadeIn: 0.3, fadeOut: 3 },
  { id: 'brahms-tragic', start: 0, end: 180, fadeIn: 0.2, fadeOut: 8 },
  { id: 'elgar-serenade', start: 205.5, end: 557, fadeIn: 0.5, fadeOut: 3 },
  { id: 'holst-chaconne', start: 0, end: null, fadeIn: 0.3, fadeOut: 2 },
  { id: 'pathetique-march', start: 343, end: null, fadeIn: 5, fadeOut: 2 },
  { id: 'bach-busoni-nun-komm', start: 0, end: null, fadeIn: 0.3, fadeOut: 3 },
  { id: 'mendelssohn-quartet-6', start: 0, end: 180, fadeIn: 0.2, fadeOut: 8 },
];

/** Run ffmpeg; returns its log (stderr), throws with the end of the log on failure. */
function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 1 << 27 });
  if (r.status !== 0) throw new Error(r.stderr.slice(-2000));
  return r.stderr;
}

/** EBU R128 of a file (optionally through a filter first): integrated loudness, range, true peak. */
function measure(file, pre = '') {
  const log = ffmpeg(['-i', file, '-af', (pre ? pre + ',' : '') + 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']);
  const summary = log.slice(log.lastIndexOf('Summary:'));
  return {
    I: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]),
    LRA: Number(/LRA:\s+(-?[\d.]+) LU/.exec(summary)?.[1]),
    TP: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary.slice(summary.indexOf('True peak')))?.[1]),
  };
}

function source(id) {
  const f = readdirSync(SRC).find((x) => x.startsWith(id + '.') && !x.endsWith('.json'));
  if (!f) throw new Error(`no source file for ${id} in ${SRC}`);
  return join(SRC, f);
}

const report = [];
const tmp = mkdtempSync(join(tmpdir(), 'bts-music-'));
for (const c of CUTS) {
  if (only.length && !only.includes(c.id)) continue;
  const src = source(c.id);
  // cut, 48 kHz stereo, silence trimmed at both ends, into a float WAV whose size gives the length
  const cut = join(tmp, `${c.id}.wav`);
  const trim = `atrim=start=${c.start}${c.end ? `:end=${c.end}` : ''},asetpts=PTS-STARTPTS`;
  const silence = 'silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.3,areverse';
  ffmpeg(['-y', '-i', src, '-vn', '-af', `aresample=48000,aformat=channel_layouts=stereo,${trim},${silence}`, '-c:a', 'pcm_f32le', '-bitexact', '-map_metadata', '-1', cut]);
  const dur = (statSync(cut).size - 44) / (48000 * 2 * 4);
  const fades = `afade=t=in:d=${c.fadeIn},afade=t=out:st=${Math.max(0, dur - c.fadeOut).toFixed(3)}:d=${c.fadeOut}`;
  const m0 = measure(cut, fades);
  let gain = TARGET - m0.I;
  // the Opus encoder adds a little overshoot, so the limiter aims 1 dB under the true-peak ceiling
  let ceiling = PEAK - 1;
  let needLimit = m0.TP + gain > ceiling;
  const out = join(OUT, `${c.id}.webm`);
  let m;
  // encode, measure; make up loudness the limiter took, or lower the ceiling if a peak got through
  for (let pass = 0; pass < 4; pass++) {
    // alimiter works on sample peaks: 4x oversampling around it approximates a true-peak limit
    const limit = needLimit ? `,aresample=192000,alimiter=limit=${Math.pow(10, ceiling / 20).toFixed(4)}:attack=5:release=80:level=false,aresample=48000` : '';
    ffmpeg(['-y', '-i', cut, '-af', `${fades},volume=${gain.toFixed(2)}dB${limit}`, '-ar', '48000', '-ac', '2', '-c:a', 'libopus', '-b:a', BITRATE, '-vbr', 'on', '-application', 'audio', '-map_metadata', '-1', '-f', 'webm', out]);
    m = measure(out);
    const loudOk = Math.abs(m.I - TARGET) <= 0.4;
    const peakOk = m.TP <= PEAK;
    if (loudOk && peakOk) break;
    if (!peakOk) { needLimit = true; ceiling -= m.TP - PEAK + 0.2; }
    if (!loudOk) gain += TARGET - m.I;
  }
  rmSync(cut);
  const size = statSync(out).size;
  const row = { id: c.id, seconds: +dur.toFixed(1), kB: Math.round(size / 1024), lufs: +m.I.toFixed(1), lra: +m.LRA.toFixed(1), truePeak: +m.TP.toFixed(1), gainDb: +gain.toFixed(1), limited: needLimit };
  report.push(row);
  console.log(JSON.stringify(row));
}
rmSync(tmp, { recursive: true, force: true });
console.table(report);
const totalKB = report.reduce((s, r) => s + r.kB, 0);
console.log(`total ${(totalKB / 1024).toFixed(1)} MiB, ${(report.reduce((s, r) => s + r.seconds, 0) / 60).toFixed(1)} min`);
if (!only.length) writeFileSync(join(OUT, 'loudness.json'), JSON.stringify(report, null, 1) + '\n');
