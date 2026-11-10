// The referee in a Web Worker: the Rust engine and its permission rules compiled to
// WebAssembly (crates/bts-wasm), so a match runs with no server and never on the
// interface thread.
//
// Calls are answered in the order they arrive. Observer playback ("run N rounds")
// is not one long call: the referee records how far to run and the worker steps it
// one phase at a time, returning to the event loop between steps, so the page can
// read the match, show each round as it lands, and pause promptly.
import { ABI, FLAG_AUTOSAVE, FLAG_PENDING } from './protocol';
import type { FromWorker, ToWorker } from './protocol';

interface Exports {
  memory: WebAssembly.Memory;
  bts_abi(): number;
  bts_alloc(len: number): number;
  bts_free(ptr: number, len: number): void;
  bts_call(line: number, lineLen: number, body: number, bodyLen: number, entropyHi: number, entropyLo: number): number;
  bts_result_ptr(): number;
  bts_result_len(): number;
  bts_result_flags(): number;
  bts_tick(): number;
  bts_panic_ptr(): number;
  bts_panic_len(): number;
  bts_debug_panic(): void;
}

interface Answer {
  status: number;
  body: string;
  flags: number;
}

const scope = self as unknown as { postMessage(message: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null };
const post = (message: FromWorker) => scope.postMessage(message);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The compiled module: the referee is one instance of it; a save is rehearsed in another. */
let compiled: WebAssembly.Module | null = null;
let wasm: Exports | null = null;
/** Set once the engine has failed; every later call is answered with it. */
let dead: string | null = null;
let loading: Promise<void> | null = null;
let pumping = false;

async function load(url: string): Promise<void> {
  try {
    compiled = await WebAssembly.compileStreaming(fetch(url));
  } catch {
    // a static host that serves .wasm with another content type: read it whole instead
    const res = await fetch(url);
    if (!res.ok) throw new Error(`could not download the game engine (${res.status})`);
    compiled = await WebAssembly.compile(await res.arrayBuffer());
  }
  const x = (await WebAssembly.instantiate(compiled, {})).exports as unknown as Exports;
  if (x.bts_abi() !== ABI) throw new Error(`the game engine is version ${x.bts_abi()} but this page expects ${ABI}; reload the page`);
  wasm = x;
}

function put(x: Exports, text: string): [number, number] {
  if (!text) return [0, 0];
  const data = encoder.encode(text);
  const ptr = x.bts_alloc(data.length);
  new Uint8Array(x.memory.buffer, ptr, data.length).set(data);
  return [ptr, data.length];
}

/** One request to an instance of the module. Throws when the engine traps. */
function invoke(x: Exports, line: string, body: string): Answer {
  // fresh entropy with every call; the referee uses it only when it makes a match
  const entropy = crypto.getRandomValues(new Uint32Array(2));
  const [linePtr, lineLen] = put(x, line);
  const [bodyPtr, bodyLen] = put(x, body);
  const status = x.bts_call(linePtr, lineLen, bodyPtr, bodyLen, entropy[0], entropy[1]);
  if (lineLen) x.bts_free(linePtr, lineLen);
  if (bodyLen) x.bts_free(bodyPtr, bodyLen);
  // the memory may have grown during the call: take a fresh view of it
  const text = decoder.decode(new Uint8Array(x.memory.buffer, x.bts_result_ptr(), x.bts_result_len()));
  return { status, body: text, flags: x.bts_result_flags() };
}

/** What the engine said as it failed, if it got as far as saying anything. */
function panicMessage(x: Exports, thrown: unknown): string {
  try {
    const len = x.bts_panic_len();
    if (len) return decoder.decode(new Uint8Array(x.memory.buffer, x.bts_panic_ptr(), len));
  } catch {
    /* the module is past answering */
  }
  return thrown instanceof Error ? thrown.message : String(thrown);
}

function fail(message: string): void {
  if (dead !== null) return;
  dead = message;
  post({ type: 'fatal', message });
}

const refusal = (status: number, error: string, message: string): Answer => ({ status, body: JSON.stringify({ error, message }), flags: 0 });

/**
 * A save is tried in a scratch instance of the module before the referee sees it. The
 * host rehearses a save as it imports it (it builds every view and resolves a round);
 * here a save that makes the engine fail takes down only the scratch instance, and the
 * match in progress is untouched. Returns the refusal, or null when the save is good.
 */
function rehearse(save: string): Answer | null {
  let scratch: Exports;
  try {
    scratch = new WebAssembly.Instance(compiled!, {}).exports as unknown as Exports;
  } catch {
    return null; // no room for a second instance: let the referee judge the save itself
  }
  try {
    const answer = invoke(scratch, 'POST /api/session/import', save);
    return answer.status === 200 ? null : answer;
  } catch (e) {
    return refusal(400, 'INVALID_SAVE', `the save cannot be played: ${panicMessage(scratch, e)}`);
  }
}

function call(id: number, method: string, target: string, body: string | undefined): void {
  const x = wasm;
  if (dead !== null || !x) {
    post({ type: 'reply', id, ...refusal(500, 'ENGINE_FAILURE', dead ?? 'the game engine is not loaded') });
    return;
  }
  if (method === 'POST' && target.split('?')[0] === '/api/session/import') {
    const refused = rehearse(body ?? '');
    if (refused) {
      post({ type: 'reply', id, ...refused });
      return;
    }
  }
  try {
    const answer = invoke(x, `${method} ${target}`, body ?? '');
    post({ type: 'reply', id, ...answer });
    if (answer.flags & FLAG_PENDING) void pump();
  } catch (e) {
    const message = panicMessage(x, e);
    fail(message);
    post({ type: 'reply', id, ...refusal(500, 'ENGINE_FAILURE', message) });
  }
}

/** A turn of the event loop, so calls that arrived meanwhile are answered first. */
const breather = new MessageChannel();
let resume: (() => void) | null = null;
breather.port1.onmessage = () => {
  const go = resume;
  resume = null;
  go?.();
};
function breathe(): Promise<void> {
  return new Promise((resolve) => {
    resume = resolve;
    breather.port2.postMessage(0);
  });
}

/** Step observer playback until nothing is due, yielding between steps. */
async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      await breathe();
      const x = wasm;
      if (dead !== null || !x) return;
      let flags: number;
      try {
        flags = x.bts_tick();
      } catch (e) {
        fail(panicMessage(x, e));
        return;
      }
      const more = (flags & FLAG_PENDING) !== 0;
      if (flags & FLAG_AUTOSAVE || !more) post({ type: 'progress', flags });
      if (!more) return;
    }
  } finally {
    pumping = false;
  }
}

// For the automated checks (apps/web/scripts/pages-smoke.mjs): how much memory the
// engine holds, and a way to make it fail on purpose to see the failure reported.
(self as unknown as { __btsEngine?: unknown }).__btsEngine = {
  memoryBytes: () => wasm?.memory.buffer.byteLength ?? 0,
  panic: () => {
    const x = wasm;
    if (!x || dead !== null) return;
    try {
      x.bts_debug_panic();
    } catch (e) {
      fail(panicMessage(x, e));
    }
  },
};

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'init') {
    loading = load(message.wasmUrl).then(
      () => post({ type: 'ready', abi: ABI }),
      (e) => fail(e instanceof Error ? e.message : String(e)),
    );
    return;
  }
  if (message.type === 'call') {
    const { id, method, target, body } = message;
    // calls sent before the module is in wait for it, in order
    if (wasm || dead !== null || !loading) call(id, method, target, body);
    else loading = loading.then(() => call(id, method, target, body));
  }
};
