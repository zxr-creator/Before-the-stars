// Typed fetch wrapper around the local referee's HTTP API. The client is always
// served from the same origin as the API (or through the Vite dev proxy), so
// every URL is relative.
import type {
  Action, ApiErrorBody, MatchSummary, NewMatchRequest, Observation, Receipt, SeatId,
} from './protocol';

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

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch (e) {
    throw new ApiError('The local referee is not reachable. Is the game server still running?', 0, 'UNREACHABLE', true);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
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

export const api = {
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
  saves: () => request<{ saves: string[] }>('GET', '/api/saves'),
  save: (name: string) => request<{ saved: string }>('POST', '/api/save', { name }),
  load: (name: string) => request<MatchSummary>('POST', '/api/load', { name }),
  chronicleUrl: (seat: SeatId, format: 'md' | 'json') =>
    `/api/export/chronicle?seat=${seat}&format=${format}&token=${encodeURIComponent(tokenOf(seat))}`,
};
