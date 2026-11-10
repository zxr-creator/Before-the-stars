// Messages between the page and the worker that hosts the WebAssembly referee.
//
// The worker speaks the referee's HTTP API (docs/agent-api.md) without the HTTP: a
// call names a method and a path with its query, carries the body as text, and is
// answered with a status and the reply body as text. Nothing is interpreted on the
// way, so the worker returns exactly what the server would for the same request.

/** Bits of `Reply.flags` and `Progress.flags` (crates/bts-wasm/src/lib.rs). */
export const FLAG_CHANGED = 1;
/** A point where the HTTP referee writes its autosave: a round was resolved. */
export const FLAG_AUTOSAVE = 2;
/** A match was created or imported. */
export const FLAG_INSTALLED = 4;
/** Observer playback has steps due; the worker keeps stepping on its own. */
export const FLAG_PENDING = 8;
/** The reply body is plain text (a Markdown export), not JSON. */
export const FLAG_TEXT = 16;
export const FLAG_STEPPED = 32;

/** The interface version of the module this client was built with. */
export const ABI = 1;

export type ToWorker =
  /** First message: where the module is. The worker answers `ready` or `fatal`. */
  | { type: 'init'; wasmUrl: string }
  | { type: 'call'; id: number; method: string; target: string; body?: string };

export type FromWorker =
  | { type: 'ready'; abi: number }
  | { type: 'reply'; id: number; status: number; body: string; flags: number }
  /** Observer playback resolved a round (FLAG_AUTOSAVE) or stopped (no FLAG_PENDING). */
  | { type: 'progress'; flags: number }
  /** The engine failed (a panic, or the module could not be loaded). The worker is finished. */
  | { type: 'fatal'; message: string };
