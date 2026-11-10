// The referee in a Web Worker: the Rust engine and its permission rules compiled to
// WebAssembly (crates/bts-wasm), so a match runs with no server and never on the
// interface thread.
//
// Calls are answered in the order they arrive. Observer playback ("run N rounds")
// is not one long call: the referee records how far to run and the worker steps it
// one phase at a time, returning to the event loop between steps, so the page can
// read the match, show each round as it lands, and pause promptly.
import { ABI, FLAG_AUTOSAVE, FLAG_BINARY, FLAG_PENDING } from './protocol';
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
  /** The reply when it is binary (FLAG_BINARY): a copy, safe to transfer. */
  data?: ArrayBuffer;
}

const scope = self as unknown as { postMessage(message: FromWorker, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null };
const post = (message: FromWorker) => scope.postMessage(message, message.type === 'reply' && message.data ? [message.data] : []);
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

function put(x: Exports, body: string | Uint8Array): [number, number] {
  if (!body.length) return [0, 0];
  const data = typeof body === 'string' ? encoder.encode(body) : body;
  const ptr = x.bts_alloc(data.length);
  new Uint8Array(x.memory.buffer, ptr, data.length).set(data);
  return [ptr, data.length];
}

/** One request to an instance of the module. Throws when the engine traps. */
function invoke(x: Exports, line: string, body: string | Uint8Array): Answer {
  // fresh entropy with every call; the referee uses it only when it makes a match
  const entropy = crypto.getRandomValues(new Uint32Array(2));
  const [linePtr, lineLen] = put(x, line);
  const [bodyPtr, bodyLen] = put(x, body);
  const status = x.bts_call(linePtr, lineLen, bodyPtr, bodyLen, entropy[0], entropy[1]);
  if (lineLen) x.bts_free(linePtr, lineLen);
  if (bodyLen) x.bts_free(bodyPtr, bodyLen);
  // the memory may have grown during the call: take a fresh view of it
  const result = new Uint8Array(x.memory.buffer, x.bts_result_ptr(), x.bts_result_len());
  const flags = x.bts_result_flags();
  // a save file leaves as bytes, copied out of the module's memory
  if (flags & FLAG_BINARY) return { status, body: '', flags, data: result.slice().buffer };
  return { status, body: decoder.decode(result), flags };
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
function rehearse(path: string, save: string | Uint8Array): Answer | null {
  let scratch: Exports;
  try {
    scratch = new WebAssembly.Instance(compiled!, {}).exports as unknown as Exports;
  } catch {
    return null; // no room for a second instance: let the referee judge the save itself
  }
  try {
    const answer = invoke(scratch, `POST ${path}`, save);
    return answer.status === 200 ? null : answer;
  } catch (e) {
    const message = `the save cannot be played: ${panicMessage(scratch, e)}`;
    return { status: 400, body: JSON.stringify({ error: 'INVALID_SAVE', reason: 'UNPLAYABLE', message }), flags: 0 };
  }
}

/**
 * "What is this file?" is answered entirely in a scratch instance: describing a save
 * rehearses it, and nothing about a file somebody handed the page should run in the
 * instance that holds the match. If the rehearsal makes the engine fail, the file is
 * described again without it (in another scratch instance) and marked unplayable.
 */
function describe(target: string, file: Uint8Array): Answer | null {
  let scratch: Exports;
  try {
    scratch = new WebAssembly.Instance(compiled!, {}).exports as unknown as Exports;
  } catch {
    return null; // no room for a second instance: the referee describes it, without the rehearsal
  }
  try {
    return invoke(scratch, `POST ${target}`, file);
  } catch (e) {
    const message = `the save cannot be played: ${panicMessage(scratch, e)}`;
    try {
      const plain = invoke(new WebAssembly.Instance(compiled!, {}).exports as unknown as Exports, 'POST /api/savefile/describe?rehearse=0', file);
      const described = JSON.parse(plain.body) as Record<string, unknown>;
      return { status: 200, body: JSON.stringify({ ...described, loadable: false, reason: described.reason ?? 'UNPLAYABLE', message: described.message ?? message }), flags: 0 };
    } catch {
      return { status: 200, body: JSON.stringify({ loadable: false, reason: 'UNPLAYABLE', message, legacy: false, bytes: file.length, header: null, file_name: null }), flags: 0 };
    }
  }
}

/** Requests that replace the match with a saved one: each is rehearsed in a scratch instance first. */
const IMPORTS = new Set(['/api/session/import', '/api/savefile/import']);

function call(id: number, method: string, target: string, text: string | undefined, data: ArrayBuffer | undefined): void {
  const x = wasm;
  const body: string | Uint8Array = data ? new Uint8Array(data) : text ?? '';
  const path = target.split('?')[0];
  if (dead !== null || !x) {
    post({ type: 'reply', id, ...refusal(500, 'ENGINE_FAILURE', dead ?? 'the game engine is not loaded') });
    return;
  }
  if (method === 'POST' && IMPORTS.has(path)) {
    const refused = rehearse(path, body);
    if (refused) {
      post({ type: 'reply', id, ...refused });
      return;
    }
  }
  if (method === 'POST' && path === '/api/savefile/describe') {
    const described = describe(target, typeof body === 'string' ? encoder.encode(body) : body);
    if (described) {
      post({ type: 'reply', id, ...described });
      return;
    }
    target = '/api/savefile/describe?rehearse=0';
  }
  try {
    const answer = invoke(x, `${method} ${target}`, body);
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
    const { id, method, target, body, data } = message;
    // calls sent before the module is in wait for it, in order
    if (wasm || dead !== null || !loading) call(id, method, target, body, data);
    else loading = loading.then(() => call(id, method, target, body, data));
  }
};
