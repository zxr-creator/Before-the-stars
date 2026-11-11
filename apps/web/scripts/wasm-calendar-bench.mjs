// Per-round cost of the WebAssembly referee in Node (design chapter 36, sections 2.4 and 10).
//
//   node apps/web/scripts/wasm-calendar-bench.mjs [seed] [standard|quick]
//
// Loads apps/web/wasm/bts.wasm (scripts/build-wasm.sh), starts an all-native
// 60-region (Standard) observer match (hard, medium, medium, easy) and plays it to the end
// through the module's ABI exactly as the browser worker does (bts_call, bts_tick),
// timing every round. Prints p50/p95/max milliseconds per round and the total.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bytes = readFileSync(join(here, '..', 'wasm', 'bts.wasm'));
const { instance } = await WebAssembly.instantiate(bytes, {});
const x = instance.exports;
const enc = new TextEncoder();
const dec = new TextDecoder();

function call(line, body = '') {
  const lb = enc.encode(line);
  const bb = enc.encode(body);
  const lp = x.bts_alloc(lb.length);
  new Uint8Array(x.memory.buffer, lp, lb.length).set(lb);
  const bp = x.bts_alloc(Math.max(bb.length, 1));
  new Uint8Array(x.memory.buffer, bp, bb.length).set(bb);
  const status = x.bts_call(lp, lb.length, bp, bb.length, 0x1234, 0x5678);
  x.bts_free(lp, lb.length);
  x.bts_free(bp, Math.max(bb.length, 1));
  const out = dec.decode(new Uint8Array(x.memory.buffer, x.bts_result_ptr(), x.bts_result_len()));
  return { status, body: out };
}

const seed = process.argv[2] || 'riverland';
const calendar = process.argv[3] || 'standard';
const created = call('POST /api/match', JSON.stringify({ seed, regions: 60, calendar, controllers: ['hard', 'medium', 'medium', 'easy'] }));
if (created.status !== 200) throw new Error(`new match: ${created.status} ${created.body.slice(0, 300)}`);
const FLAG_AUTOSAVE = 1, FLAG_PENDING = 8;
const per = [];
const start = performance.now();
let t = performance.now();
for (;;) {
  // the host plays at most a few rounds per request, as the page asks again
  const before = JSON.parse(call('GET /api/match').body);
  if (before.finished) break;
  const advance = call('POST /api/advance', JSON.stringify({ rounds: 20 }));
  if (advance.status !== 200) throw new Error(`advance: ${advance.status} ${advance.body.slice(0, 300)}`);
  let moved = false;
  for (;;) {
    const f = x.bts_tick();
    if (f & FLAG_AUTOSAVE) {
      const now = performance.now();
      per.push(now - t);
      t = now;
      moved = true;
    }
    if (!(f & FLAG_PENDING)) break;
  }
  if (!moved) break;
}
const total = (performance.now() - start) / 1000;
const sorted = [...per].sort((a, b) => a - b);
const pct = (p) => sorted[Math.round((sorted.length - 1) * p)];
const summary = JSON.parse(call('GET /api/match').body);
console.log(`wasm ${seed} ${calendar}: ${per.length} rounds to ${summary.date ? summary.date.label : summary.month} in ${total.toFixed(1)} s; per round p50 ${pct(0.5).toFixed(1)} ms, p95 ${pct(0.95).toFixed(1)} ms, max ${pct(1).toFixed(1)} ms; first 60 rounds mean ${(per.slice(0, 60).reduce((a, b) => a + b, 0) / Math.min(60, per.length)).toFixed(1)} ms`);
