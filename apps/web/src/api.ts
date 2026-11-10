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
  Action, AgentLogEntry, ApiErrorBody, MatchSummary, NewMatchRequest, Observation, Receipt, SeatId, SpectatorView,
} from './protocol';
import { EngineFailure, localAvailable, localCall, localFailure, localRestart, onLocalChange, onLocalFailure } from './local/transport';
import type { LocalChange } from './local/transport';

export class ApiError extends Error {
  status: number;
  code: string;
  /** True when the server could not be reached at all. */
  network: boolean;
  constructor(message: string, status: number, code: string, network = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.network = network;
  }
}

// --- transports ------------------------------------------------------------------

type Method = 'GET' | 'POST';
interface Raw { status: number; ok: boolean; text: string }
type Transport = (method: Method, path: string, body?: string) => Promise<Raw>;

const httpTransport: Transport = async (method, path, body) => {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body,
      cache: 'no-store',
    });
  } catch (e) {
    throw new ApiError('The local referee is not reachable. Is the game server still running?', 0, 'UNREACHABLE', true);
  }
  return { status: res.status, ok: res.ok, text: await res.text() };
};

const localTransport: Transport = async (method, path, body) => {
  try {
    const reply = await localCall(method, path, body);
    return { status: reply.status, ok: reply.status >= 200 && reply.status < 300, text: reply.body };
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
  const res = await transport(method, path, body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body));
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
    const err = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(err.message || `Server error ${res.status}`, res.status, err.error || 'HTTP_' + res.status);
  }
  return data as T;
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

// --- named saves without a server --------------------------------------------------
//
// The server keeps named saves as files. In the browser the same three calls work on
// session text held in this page's memory: they last until the page is closed. They
// are built on exportSession/importSession, which is where durable storage belongs.
const localSaves = new Map<string, string>();
/** The server's rule for a save name (crates/bts-server, `safe_name`). */
function safeName(name: string): string {
  const n = Array.from(name).filter((c) => /[A-Za-z0-9_-]/.test(c)).slice(0, 40).join('');
  return n || 'save';
}

/** What this referee can do beyond running a match. False entries need the server-backed game. */
export interface ApiFeatures {
  /** The referee runs in this page (WebAssembly in a Web Worker); there is no server. */
  local: boolean;
  /** Seats played by a language model (Claude, Codex, an OpenAI-compatible API), and their logs. */
  llmSeats: boolean;
  /** External agents can join over HTTP or MCP (`/api/turn`, seat tokens). */
  externalAgents: boolean;
  /** Named saves are files that outlive the page. */
  durableSaves: boolean;
}

export type SessionChange = LocalChange;

export const api = {
  /** 'local' when the referee runs in this page, 'http' when it is a server. */
  mode: (LOCAL ? 'local' : 'http') as 'local' | 'http',
  features: { local: LOCAL, llmSeats: !LOCAL, externalAgents: !LOCAL, durableSaves: !LOCAL } as ApiFeatures,

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

  saves: (): Promise<{ saves: string[] }> =>
    LOCAL ? Promise.resolve({ saves: [...localSaves.keys()].sort() }) : request<{ saves: string[] }>('GET', '/api/saves'),
  save: async (name: string): Promise<{ saved: string }> => {
    if (!LOCAL) return request<{ saved: string }>('POST', '/api/save', { name });
    const saved = safeName(name);
    localSaves.set(saved, await api.exportSession());
    return { saved };
  },
  load: (name: string): Promise<MatchSummary> => {
    if (!LOCAL) return request<MatchSummary>('POST', '/api/load', { name });
    const text = localSaves.get(safeName(name));
    if (text === undefined) return Promise.reject(new ApiError('No save has that name.', 404, 'NOT_FOUND'));
    return api.importSession(text);
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

// For the browser console and the automated checks (scripts/pages-smoke.mjs): the same
// calls the interface makes, under the same rules. It opens nothing the page cannot already do.
if (typeof window !== 'undefined') (window as unknown as { __btsApi?: typeof api }).__btsApi = api;
