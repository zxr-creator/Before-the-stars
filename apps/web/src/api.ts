// Typed access to the referee. Two transports sit behind the same `api` object:
//
//   http   the local referee's HTTP API. The client is served from the same origin
//          as the API (or through the Vite dev proxy), so every URL is relative.
//   local  the same referee compiled to WebAssembly, running in a Web Worker in
//          this page (the GitHub Pages build; no server at all). See ./local/.
//
// Both carry the same requests (method, path, body) and return the same replies,
// so the rest of the client does not care which one is in use. What only a server
// can do is listed in `api.features`.
import type {
  Action, AgentLogEntry, AgentTestResult, ApiErrorBody, MatchSummary, ProviderDetection, NewMatchRequest, Observation, Receipt, SeatId, SpectatorView,
} from './protocol';
import { EngineFailure, localAvailable, localCall, localFailure, localRestart, onLocalChange, onLocalFailure } from './local/transport';
import type { LocalChange } from './local/transport';
import { readHeader, safeName } from './saves/container';
import type { ExportedFile, SaveDescription, SaveEntry, SaveHeader, SaveKind, SaveListing } from './saves/types';
import { SAVE_MIME } from './saves/types';
import { deleteSave as vaultDelete, manualId, readSave, refreshVault, renameSave as vaultRename, subscribeVault, vaultState, writeSave } from './saves/vault';
import type { StoredSave, WriteFailure } from './saves/vault';

export class ApiError extends Error {
  status: number;
  code: string;
  /** True when the server could not be reached at all. */
  network: boolean;
  /** For a refused save file (`INVALID_SAVE`): which check it failed, e.g. `CORRUPT`. */
  reason?: string;
  constructor(message: string, status: number, code: string, network = false, reason?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.network = network;
    this.reason = reason;
  }
}

/** Browser build: a save was not stored because the vault has no room for it (or the browser refused). */
export class SaveNotStored extends ApiError {
  why: WriteFailure;
  needed: number;
  free: number;
  budget: number;
  constructor(why: WriteFailure, needed: number, free: number, budget: number, detail: string) {
    super(detail || 'The save was not stored: there is no room for it.', 507, 'SAVE_NOT_STORED');
    this.why = why;
    this.needed = needed;
    this.free = free;
    this.budget = budget;
  }
}

// --- transports ------------------------------------------------------------------

type Method = 'GET' | 'POST';
/** A reply: text, or `bytes` when it is a save file. */
interface Raw { status: number; ok: boolean; text: string; bytes?: Uint8Array }
/** A body is JSON text, or the bytes of a save file. */
type Transport = (method: Method, path: string, body?: string | Uint8Array) => Promise<Raw>;

const httpTransport: Transport = async (method, path, body) => {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': typeof body === 'string' ? 'application/json' : 'application/octet-stream' },
      body: typeof body === 'string' || body === undefined ? body : (body.slice().buffer as ArrayBuffer),
      cache: 'no-store',
    });
  } catch (e) {
    throw new ApiError('The local referee is not reachable. Is the game server still running?', 0, 'UNREACHABLE', true);
  }
  if (res.ok && (res.headers.get('content-type') ?? '').startsWith(SAVE_MIME)) {
    return { status: res.status, ok: true, text: '', bytes: new Uint8Array(await res.arrayBuffer()) };
  }
  return { status: res.status, ok: res.ok, text: await res.text() };
};

const localTransport: Transport = async (method, path, body) => {
  try {
    const reply = await localCall(method, path, body);
    return { status: reply.status, ok: reply.status >= 200 && reply.status < 300, text: reply.body, bytes: reply.data };
  } catch (e) {
    const detail = e instanceof EngineFailure ? e.message : String(e);
    throw new ApiError(`The game engine stopped: ${detail}`, 500, 'ENGINE_FAILURE');
  }
};

/**
 * Which referee this page talks to. The GitHub Pages build is made with
 * VITE_BTS_LOCAL=1 and always runs the referee in the page. Any other build that
 * happens to carry the WebAssembly module can be switched with `?local` in the URL.
 */
function chooseLocal(): boolean {
  if (import.meta.env.VITE_BTS_LOCAL === '1') return true;
  let query = '';
  try { query = window.location.search; } catch { /* no location */ }
  if (!/[?&]local\b/.test(query)) return false;
  if (!localAvailable()) {
    console.warn('?local was requested, but this build does not include the WebAssembly referee; using the server.');
    return false;
  }
  return true;
}

const LOCAL = chooseLocal();
const transport: Transport = LOCAL ? localTransport : httpTransport;

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await transport(method, path, body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body));
  let data: unknown = null;
  if (res.text) {
    try {
      data = JSON.parse(res.text);
    } catch {
      if (!res.ok) throw new ApiError(`Server error ${res.status}`, res.status, 'HTTP_' + res.status);
      throw new ApiError('The server sent a reply this client could not read.', res.status, 'BAD_JSON');
    }
  }
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiErrorBody> & { reason?: string };
    throw new ApiError(err.message || `Server error ${res.status}`, res.status, err.error || 'HTTP_' + res.status, false, err.reason);
  }
  return data as T;
}

/** A reply that is a save file: its bytes. */
async function requestBytes(method: Method, path: string, body?: string | Uint8Array): Promise<Uint8Array> {
  const res = await transport(method, path, body);
  if (!res.ok) {
    let err: Partial<ApiErrorBody> & { reason?: string } = {};
    try { err = JSON.parse(res.text) as typeof err; } catch { /* not a JSON error body */ }
    throw new ApiError(err.message || `Server error ${res.status}`, res.status, err.error || 'HTTP_' + res.status, false, err.reason);
  }
  if (!res.bytes) throw new ApiError('The referee did not send a save file.', res.status, 'BAD_SAVE');
  return res.bytes;
}

/** A reply that is text in its own right (a save, a Markdown chronicle): returned as sent. */
async function requestText(method: Method, path: string, body?: string): Promise<string> {
  const res = await transport(method, path, body);
  if (!res.ok) {
    let err: Partial<ApiErrorBody> = {};
    try { err = JSON.parse(res.text) as Partial<ApiErrorBody>; } catch { /* not a JSON error body */ }
    throw new ApiError(err.message || `Server error ${res.status}`, res.status, err.error || 'HTTP_' + res.status);
  }
  return res.text;
}

/**
 * Seat tokens. The referee issues them when a match is created or loaded; with
 * `--require-tokens` it does not repeat them on later replies, so they are kept
 * for the browser session (per match) to survive a page reload.
 */
const tokens = new Map<SeatId, string>();
let tokenMatch: string | undefined;
const tokenKey = (matchId: string) => `bts.tokens.${matchId}`;
export function rememberTokens(summary: MatchSummary): void {
  if (!summary.exists || !summary.match_id) return;
  if (summary.match_id !== tokenMatch) {
    tokens.clear();
    tokenMatch = summary.match_id;
    try {
      const stored = JSON.parse(sessionStorage.getItem(tokenKey(summary.match_id)) ?? '{}') as Record<string, string>;
      for (const [seat, tok] of Object.entries(stored)) tokens.set(Number(seat), tok);
    } catch {
      /* no stored tokens */
    }
  }
  let changed = false;
  for (const s of summary.seats ?? []) {
    if (s.token && tokens.get(s.seat) !== s.token) {
      tokens.set(s.seat, s.token);
      changed = true;
    }
  }
  if (changed) {
    try {
      sessionStorage.setItem(tokenKey(summary.match_id), JSON.stringify(Object.fromEntries(tokens)));
    } catch {
      /* storage unavailable: tokens live for this page only */
    }
  }
}
function tokenOf(seat: SeatId): string {
  return tokens.get(seat) ?? '';
}

const chroniclePath = (seat: SeatId, format: 'md' | 'json') =>
  `/api/export/chronicle?seat=${seat}&format=${format}&token=${encodeURIComponent(tokenOf(seat))}`;

function downloadText(text: string, file: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// --- saves --------------------------------------------------------------------------
//
// A save is a `.btsave` container made by the referee (docs/saves.md). The server
// keeps named saves as files in its saves folder; the browser build keeps them in the
// vault (./saves/vault.ts: IndexedDB, with a budget). Either way the same calls list,
// load, export, rename and delete them, and a file from one loads in the other.

function entryOf(e: StoredSave): SaveEntry {
  return { id: e.id, name: e.name, kind: e.kind, bytes: e.cost, created: e.created, header: e.header };
}

interface ServerSaves {
  saves: string[];
  entries?: { name: string; kind: SaveKind; legacy: boolean; bytes: number; modified_ms: number; header: SaveHeader | null }[];
  total_bytes?: number;
  dir?: string;
  exports_dir?: string;
}

/** Store a file the referee has just made in the vault, or say why it was not stored. */
async function keep(file: Uint8Array, kind: SaveKind, name: string): Promise<StoredSave> {
  const header = readHeader(file);
  if (!header) throw new ApiError('The referee did not send a save file.', 500, 'BAD_SAVE');
  const result = await writeSave({ kind, name, created: header.created_ms || Date.now(), data: file, header });
  if (!result.ok) throw new SaveNotStored(result.reason, result.needed, result.free, result.budget, result.detail);
  return result.entry;
}

/** What this referee can do beyond running a match. False entries need the server-backed game. */
export interface ApiFeatures {
  /** The referee runs in this page (WebAssembly in a Web Worker); there is no server. */
  local: boolean;
  /** Seats played by a language model (Claude, Codex, an OpenAI-compatible API), and their logs. */
  llmSeats: boolean;
  /** External agents can join over HTTP or MCP (`/api/turn`, seat tokens). */
  externalAgents: boolean;
  /**
   * Saves outlive the page: files beside the server, or IndexedDB in the browser build
   * (false there only when the browser refuses to store anything).
   */
  durableSaves: boolean;
}

export type SessionChange = LocalChange;

export const api = {
  /** 'local' when the referee runs in this page, 'http' when it is a server. */
  mode: (LOCAL ? 'local' : 'http') as 'local' | 'http',
  // durableSaves is corrected once the vault has opened: false when the browser refuses IndexedDB
  features: { local: LOCAL, llmSeats: !LOCAL, externalAgents: !LOCAL, durableSaves: true } as ApiFeatures,

  match: () => request<MatchSummary>('GET', '/api/match'),
  newMatch: (req: NewMatchRequest) => request<MatchSummary>('POST', '/api/match', req),
  observation: (seat: SeatId) =>
    request<Observation>('GET', `/api/observation?seat=${seat}&token=${encodeURIComponent(tokenOf(seat))}`),
  actions: (seat: SeatId, actions: Action[]) =>
    request<{ receipts: Receipt[] }>('POST', '/api/actions', { seat, token: tokenOf(seat), actions }),
  ready: (seat: SeatId, throughRound: boolean) =>
    request<MatchSummary>('POST', '/api/ready', { seat, token: tokenOf(seat), through_round: throughRound }),
  delegate: (seat: SeatId, domains: string[]) =>
    request<MatchSummary>('POST', '/api/delegate', { seat, token: tokenOf(seat), domains }),
  /** Observer matches only (403 otherwise; 404 on referees that predate observer mode). */
  spectator: () => request<SpectatorView>('GET', '/api/spectator'),
  /** Observer matches: run 1–20 more rounds (0 pauses). Answers at once; the match moves as its seats answer. */
  advance: (rounds: number) => request<MatchSummary>('POST', '/api/advance', { rounds }),
  /** App mode only: save and stop the local referee. */
  shutdown: () => request<unknown>('POST', '/api/shutdown', {}),
  agentLog: (seat: SeatId) => request<{ entries: AgentLogEntry[] }>('GET', `/api/agent-log?seat=${seat}`),
  /** Resume an agent seat that stopped after repeated failures, or stop one. */
  agentControl: (seat: SeatId, op: 'resume' | 'stop') => request<MatchSummary>('POST', '/api/agent/control', { seat, op }),
  /** Which agent CLIs are installed and signed in here (cheap status checks; cached for half a minute). */
  agentProviders: (refresh = false) => request<ProviderDetection>('GET', `/api/agents/providers${refresh ? '?refresh=1' : ''}`),
  /** One tiny real call with a seat's settings. A typed key is sent once and not kept. */
  agentTest: (req: { provider: string; model?: string; effort?: string; auth?: string; api_key?: string; base_url?: string }) =>
    request<AgentTestResult>('POST', '/api/agents/test', req),

  /** The names of the saves the player can load by name (in the server-backed game, the autosave among them). */
  saves: async (): Promise<{ saves: string[] }> => {
    if (!LOCAL) return request<{ saves: string[] }>('GET', '/api/saves');
    return { saves: (await refreshVault()).filter((e) => e.kind === 'manual').map((e) => e.name).sort() };
  },
  /**
   * Save the match under a name; a save of that name is replaced. In the browser
   * build the save goes to the vault and may be refused for lack of room
   * (`SaveNotStored`): a manual save is never made to fit by deleting another.
   */
  save: async (name: string): Promise<{ saved: string }> => {
    if (!LOCAL) return request<{ saved: string }>('POST', '/api/save', { name });
    const saved = safeName(name);
    await keep(await api.exportSave({ kind: 'manual', name: saved }), 'manual', saved);
    return { saved };
  },
  load: (name: string): Promise<MatchSummary> => {
    if (!LOCAL) return request<MatchSummary>('POST', '/api/load', { name });
    return api.loadSave(manualId(safeName(name)));
  },

  /** Every stored save, manual and automatic, newest first, with what each one is. */
  saveList: async (): Promise<SaveListing> => {
    if (LOCAL) {
      const entries = (await refreshVault()).map(entryOf);
      return { entries, totalBytes: entries.reduce((sum, e) => sum + e.bytes, 0) };
    }
    const r = await request<ServerSaves>('GET', '/api/saves');
    // a referee from before save files only lists names
    const entries: SaveEntry[] = (r.entries ?? r.saves.map((name) => ({ name, kind: (name === 'autosave' ? 'auto' : 'manual') as SaveKind, legacy: true, bytes: 0, modified_ms: 0, header: null })))
      .map((e) => ({ id: e.name, name: e.name, kind: e.kind, bytes: e.bytes, created: e.header?.created_ms || e.modified_ms, legacy: e.legacy, header: e.header }))
      .sort((a, b) => b.created - a.created);
    return { entries, totalBytes: r.total_bytes ?? entries.reduce((sum, e) => sum + e.bytes, 0), dir: r.dir, exportsDir: r.exports_dir };
  },
  /** Replace the match with a stored save. Checked like any import; a refusal leaves the match alone. */
  loadSave: async (id: string): Promise<MatchSummary> => {
    if (!LOCAL) return request<MatchSummary>('POST', '/api/load', { name: id });
    const file = await readSave(id);
    if (!file) throw new ApiError('No save has that name.', 404, 'NOT_FOUND');
    return api.importSave(file);
  },
  /** A stored save as a `.btsave` file. */
  saveFile: async (id: string): Promise<Uint8Array> => {
    if (!LOCAL) return requestBytes('GET', `/api/saves/file?name=${encodeURIComponent(id)}`);
    const file = await readSave(id);
    if (!file) throw new ApiError('No save has that name.', 404, 'NOT_FOUND');
    return file;
  },
  deleteSave: async (id: string): Promise<void> => {
    if (LOCAL) await vaultDelete(id);
    else await request<unknown>('POST', '/api/saves/delete', { name: id });
  },
  /** Give a manual save another name. Refused (409) when the name is taken. */
  renameSave: async (id: string, name: string): Promise<{ renamed: string }> => {
    const to = safeName(name);
    if (!LOCAL) return request<{ renamed: string }>('POST', '/api/saves/rename', { name: id, to });
    const file = await readSave(id);
    if (!file) throw new ApiError('No save has that name.', 404, 'NOT_FOUND');
    // the name is part of the file: the referee rewrites the header
    const renamed = await requestBytes('POST', `/api/savefile/rename?name=${encodeURIComponent(to)}`, file);
    const header = readHeader(renamed);
    if (!header) throw new ApiError('The referee did not send a save file.', 500, 'BAD_SAVE');
    const result = await vaultRename(id, { kind: 'manual', name: to, created: header.created_ms || Date.now(), data: renamed, header });
    if (!result.ok) {
      throw result.reason === 'taken' ? new ApiError(`a save named '${to}' already exists`, 409, 'CONFLICT') : new ApiError('The save could not be renamed.', 500, 'IO');
    }
    return { renamed: to };
  },

  /**
   * The running match as a `.btsave` file (docs/saves.md): the same bytes from either
   * referee. Refused (403) by a referee that has an external seat or requires tokens.
   */
  exportSave: (options: { kind?: SaveKind; name?: string } = {}): Promise<Uint8Array> =>
    requestBytes('GET', `/api/savefile?kind=${options.kind ?? 'manual'}&name=${encodeURIComponent(options.name ?? '')}&created=${Date.now()}`),
  /** What a file is and whether it would load, without loading it. Never throws for a bad file: it says why. */
  describeSave: (file: Uint8Array) => request<SaveDescription>('POST', '/api/savefile/describe', file),
  /**
   * Replace the match with the one in a save file. The file is verified, unpacked
   * within its limits and rehearsed first; when it is refused (400 `INVALID_SAVE`,
   * with `reason`) the match in progress is untouched.
   */
  importSave: (file: Uint8Array) => request<MatchSummary>('POST', '/api/savefile/import', file),

  /**
   * Server-backed game: the exports folder on the referee's machine. The desktop
   * window cannot download, so there the referee writes the file itself and says
   * where; files placed in the folder can be imported from it.
   */
  exportsFolder: {
    list: () => request<{ dir: string; files: ExportedFile[] }>('GET', '/api/exports'),
    /** Write the running match, or the named save, into the folder. */
    write: (name?: string) => request<{ file: string; path: string; dir: string; bytes: number }>('POST', '/api/exports/write', name === undefined ? {} : { name }),
    describe: (file: string) => request<SaveDescription>('POST', '/api/exports/describe', { file }),
    import: (file: string) => request<MatchSummary>('POST', '/api/exports/import', { file }),
    /** Show the file (or the folder) in the system's file manager. */
    reveal: (file?: string) => request<{ revealed: boolean; path: string }>('POST', '/api/exports/reveal', file === undefined ? {} : { file }),
  },

  /**
   * The whole session as save text (the format of the server's save files). Refused
   * (403) by a referee that has an external seat or requires tokens.
   */
  exportSession: () => requestText('GET', '/api/session/export'),
  /**
   * Replace the match with one from save text. The save is checked first; when it is
   * refused (400 INVALID_SAVE) the match in progress is untouched.
   */
  importSession: (text: string) => request<MatchSummary>('POST', '/api/session/import', text),
  /**
   * Local mode: called after every request that changed the match and after every
   * round resolved by observer playback (`roundResolved` marks the points where the
   * server would write its autosave). Never called in http mode, where the server
   * keeps its own autosave. Returns the function that removes the listener.
   */
  onSessionChange: (listener: (change: SessionChange) => void): (() => void) => (LOCAL ? onLocalChange(listener) : () => undefined),

  /** Local mode: the engine failed (the message says how). Calls are refused until `restartEngine`. */
  onEngineFailure: (listener: (message: string) => void): (() => void) => (LOCAL ? onLocalFailure(listener) : () => undefined),
  /** Local mode, after a failure: let the next call start a fresh engine. The match it held is gone. */
  restartEngine: (): void => { if (LOCAL && localFailure() !== null) localRestart(); },

  /** A seat's chronicle as text, exactly as the referee writes it. */
  chronicleText: (seat: SeatId, format: 'md' | 'json') => requestText('GET', chroniclePath(seat, format)),
  /** The chronicle's address. Only a server has one; use `chronicleLink` for a download link. */
  chronicleUrl: (seat: SeatId, format: 'md' | 'json') => chroniclePath(seat, format),
  /**
   * Attributes for an `<a>` that downloads a seat's chronicle: a plain link to the
   * server, or, without a server, a click that fetches the text and saves it.
   */
  chronicleLink: (seat: SeatId, format: 'md' | 'json', file: string): { href: string; download: string; onClick?: (e: Event) => void } => {
    if (!LOCAL) return { href: chroniclePath(seat, format), download: file };
    return {
      href: '#',
      download: file,
      onClick: (e: Event) => {
        e.preventDefault();
        void api.chronicleText(seat, format)
          .then((text) => downloadText(text, file, format === 'json' ? 'application/json' : 'text/markdown;charset=utf-8'))
          .catch((err) => console.error(err));
      },
    };
  },
};

if (LOCAL) {
  subscribeVault(() => {
    if (vaultState().ready) api.features.durableSaves = vaultState().durable;
  });
}

// For the browser console and the automated checks (scripts/pages-smoke.mjs): the same
// calls the interface makes, under the same rules. It opens nothing the page cannot already do.
if (typeof window !== 'undefined') (window as unknown as { __btsApi?: typeof api }).__btsApi = api;
