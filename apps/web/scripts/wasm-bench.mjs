// Measure the WebAssembly referee outside a browser (Node runs the same V8 as Chromium).
//
//   scripts/build-wasm.sh
//   node apps/web/scripts/wasm-bench.mjs [path/to/bts.wasm]
//
// Plays an observer match (four built-in AIs, 48 regions, standard length) to its end
// through the module's ABI, exactly as the worker does, and prints: module size, time
// per round early / middle / late, the slowest single step (how long the worker cannot
// answer the page), reply sizes and the module's memory.
//
// Environment: BENCH_SEED (default bench-48), BENCH_REGIONS (48), BENCH_ROUNDS (240).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const file = process.argv[2] ?? fileURLToPath(new URL('../wasm/bts.wasm', import.meta.url));
const bytes = readFileSync(file);
const { instance } = await WebAssembly.instantiate(bytes, {});
const x = instance.exports;
const enc = new TextEncoder();
const dec = new TextDecoder();

function put(text) {
  const data = enc.encode(text);
  const ptr = x.bts_alloc(data.length);
  new Uint8Array(x.memory.buffer, ptr, data.length).set(data);
  return [ptr, data.length];
}
function call(line, body = '') {
  const [lp, ll] = put(line);
  const [bp, bl] = put(body);
  const status = x.bts_call(lp, ll, bp, bl, 0x1234, 0x5678);
  x.bts_free(lp, ll);
  x.bts_free(bp, bl);
  const text = dec.decode(new Uint8Array(x.memory.buffer, x.bts_result_ptr(), x.bts_result_len()));
  if (status !== 200) throw new Error(`${line} -> ${status} ${text}`);
  return text;
}
const PENDING = 8, ROUND = 2;

const seed = process.env.BENCH_SEED ?? 'bench-48';
const regions = Number(process.env.BENCH_REGIONS ?? 48);
const total = Number(process.env.BENCH_ROUNDS ?? 240);
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`module      ${file}`);
console.log(`size        ${bytes.length} bytes raw (${mb(bytes.length)}), ${gzipSync(bytes, { level: 9 }).length} bytes gzip -9`);

let t = performance.now();
call('POST /api/match', JSON.stringify({ seed, regions, controllers: ['hard', 'medium', 'medium', 'easy'] }));
console.log(`new match   ${(performance.now() - t).toFixed(1)} ms (${regions} regions, 4 AIs)`);

const perRound = [];
let worstStep = 0;
let steps = 0;
let finished = false;
while (!finished && perRound.length < total) {
  const summary = JSON.parse(call('POST /api/advance', JSON.stringify({ rounds: 20 })));
  if (summary.finished) break;
  let roundStart = performance.now();
  for (;;) {
    const s0 = performance.now();
    const flags = x.bts_tick();
    const now = performance.now();
    worstStep = Math.max(worstStep, now - s0);
    steps++;
    if (flags & ROUND) {
      perRound.push(now - roundStart);
      roundStart = now;
    }
    if (!(flags & PENDING)) break;
  }
  finished = JSON.parse(call('GET /api/match')).finished;
}
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const slice = (from, to) => perRound.slice(from, to);
const n = perRound.length;
console.log(`rounds      ${n} resolved in ${steps} steps, ${(perRound.reduce((s, v) => s + v, 0) / 1000).toFixed(2)} s in all`);
console.log(`per round   early (1-20) ${avg(slice(0, 20)).toFixed(1)} ms · middle ${avg(slice(Math.floor(n / 2) - 10, Math.floor(n / 2) + 10)).toFixed(1)} ms · late (last 20) ${avg(slice(-20)).toFixed(1)} ms · slowest round ${Math.max(...perRound).toFixed(1)} ms`);
console.log(`worst step  ${worstStep.toFixed(1)} ms (the longest the worker is busy between two messages)`);

const time = (line) => { const t0 = performance.now(); const out = call(line); return [out, performance.now() - t0]; };
const [spectator, ts] = time('GET /api/spectator');
const [obs, to] = time('GET /api/observation?seat=0&token=');
const [save, tx] = time('GET /api/session/export');
console.log(`late replies  spectator ${kb(spectator.length)} in ${ts.toFixed(1)} ms · observation ${kb(obs.length)} in ${to.toFixed(1)} ms · session export ${kb(save.length)} in ${tx.toFixed(1)} ms`);
t = performance.now();
call('POST /api/session/import', save);
console.log(`import      ${(performance.now() - t).toFixed(1)} ms`);
console.log(`memory      ${mb(x.memory.buffer.byteLength)} of linear memory at the end of the match`);
