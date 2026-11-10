// The page's side of the in-browser referee: owns the worker, matches replies to
// calls, and reports engine failures. See ./worker.ts and ./protocol.ts.
import { FLAG_AUTOSAVE, FLAG_CHANGED, FLAG_INSTALLED, FLAG_PENDING } from './protocol';
import type { FromWorker, ToWorker } from './protocol';

// The module is a build product (scripts/build-wasm.sh writes apps/web/wasm/bts.wasm).
// A build made without it simply has no in-browser referee; the glob is then empty.
const modules = import.meta.glob('../../wasm/bts.wasm', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const wasmUrl: string | undefined = Object.values(modules)[0];

/** Whether this build carries the WebAssembly referee. */
export function localAvailable(): boolean {
  return wasmUrl !== undefined && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
}

export interface LocalReply {
  status: number;
  body: string;
  flags: number;
  /** A binary reply (a save file); `body` is then empty. */
  data?: Uint8Array;
}

/** Something changed the match held by the worker. */
export interface LocalChange {
  /** A request made by the page, or a round resolved by observer playback. */
  cause: 'request' | 'playback';
  /** For a request: its method and path, for example `POST /api/ready`. */
  request?: string;
  /** A round was resolved: the point at which the server-backed referee writes its autosave. */
  roundResolved: boolean;
  /** A match was created or imported. */
  installed: boolean;
  /** Observer playback is still running. */
  running: boolean;
}

export class EngineFailure extends Error {}

interface Waiting {
  resolve: (reply: LocalReply) => void;
  reject: (error: EngineFailure) => void;
  request: string;
}

let worker: Worker | null = null;
let failed: string | null = null;
let nextId = 1;
const waiting = new Map<number, Waiting>();
const changeListeners = new Set<(change: LocalChange) => void>();
const failureListeners = new Set<(message: string) => void>();

function emit(change: LocalChange): void {
  for (const l of [...changeListeners]) {
    try {
      l(change);
    } catch (e) {
      console.error(e);
    }
  }
}

function engineFailed(message: string): void {
  if (failed !== null) return;
  failed = message;
  worker?.terminate();
  worker = null;
  const error = new EngineFailure(message);
  for (const w of waiting.values()) w.reject(error);
  waiting.clear();
  for (const l of [...failureListeners]) l(message);
}

function onMessage(message: FromWorker): void {
  if (message.type === 'reply') {
    const w = waiting.get(message.id);
    if (!w) return;
    waiting.delete(message.id);
    w.resolve({ status: message.status, body: message.body, flags: message.flags, data: message.data ? new Uint8Array(message.data) : undefined });
    if (message.status === 200 && message.flags & FLAG_CHANGED) {
      emit({
        cause: 'request', request: w.request, roundResolved: (message.flags & FLAG_AUTOSAVE) !== 0,
        installed: (message.flags & FLAG_INSTALLED) !== 0, running: (message.flags & FLAG_PENDING) !== 0,
      });
    }
  } else if (message.type === 'progress') {
    emit({ cause: 'playback', roundResolved: (message.flags & FLAG_AUTOSAVE) !== 0, installed: false, running: (message.flags & FLAG_PENDING) !== 0 });
  } else if (message.type === 'fatal') {
    engineFailed(message.message);
  }
}

function start(): Worker {
  if (worker) return worker;
  // A module worker, addressed relative to this script so it loads under any subpath.
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<FromWorker>) => onMessage(e.data);
  w.onerror = (e) => engineFailed(e.message || 'the game engine worker could not be started');
  w.onmessageerror = () => engineFailed('a message from the game engine could not be read');
  const init: ToWorker = { type: 'init', wasmUrl: new URL(wasmUrl!, document.baseURI).href };
  w.postMessage(init);
  worker = w;
  return w;
}

/** Send one request to the referee in the worker. Rejects only when the engine itself has failed. */
export function localCall(method: string, target: string, body?: string | Uint8Array): Promise<LocalReply> {
  if (!localAvailable()) return Promise.reject(new EngineFailure('This build does not include the in-browser game engine.'));
  if (failed !== null) return Promise.reject(new EngineFailure(failed));
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject, request: `${method} ${target.split('?')[0]}` });
    // bytes go as a copy that is handed over, so the caller keeps its own
    const data = typeof body === 'string' || body === undefined ? undefined : (body.slice().buffer as ArrayBuffer);
    const message: ToWorker = { type: 'call', id, method, target, body: typeof body === 'string' ? body : undefined, data };
    try {
      start().postMessage(message, data ? [data] : []);
    } catch (e) {
      waiting.delete(id);
      reject(new EngineFailure(e instanceof Error ? e.message : String(e)));
    }
  });
}

/** After a failure: forget it, so the next call starts a fresh engine (with no match). */
export function localRestart(): void {
  failed = null;
}

export function localFailure(): string | null {
  return failed;
}

export function onLocalChange(listener: (change: LocalChange) => void): () => void {
  changeListeners.add(listener);
  return () => { changeListeners.delete(listener); };
}

export function onLocalFailure(listener: (message: string) => void): () => void {
  failureListeners.add(listener);
  return () => { failureListeners.delete(listener); };
}
