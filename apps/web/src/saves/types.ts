// Save files as the client sees them. The container itself is written and read by
// the referee (crates/bts-host/src/portable.rs, the same code in the server and in
// the browser's WebAssembly module); the client only stores, lists and moves them.
import type { ControllerKind, SeatId, SeatStatus } from '../protocol';

export type SaveKind = 'manual' | 'auto';

export interface SaveVersions {
  ruleset: string;
  content: string;
  generator: string;
  protocol: string;
  policy: string;
  session: string;
}

export interface SaveSeat {
  seat: SeatId;
  name: string;
  controller: ControllerKind;
  status: SeatStatus;
  /** The provider of a language-model seat (never its credentials). */
  agent?: string;
}

/** The plain header at the front of a `.btsave` file. */
export interface SaveHeader {
  kind: SaveKind;
  name: string;
  /** Milliseconds since the Unix epoch; 0 when unknown. */
  created_ms: number;
  game: string;
  versions: SaveVersions;
  match_id: string;
  /** Present only when the match discloses its seed. */
  seed?: string;
  regions: number;
  round: number;
  month: number;
  year: number;
  /** The historical date the save reached, from a referee with a calendar (ruleset 3.0). */
  date?: { year: number; month?: number; label?: string } | null;
  horizon: number;
  finished: boolean;
  winner: SeatId | null;
  seats: SaveSeat[];
  codec: string;
  /** Bytes of session text once unpacked. */
  length: number;
  /** Bytes of packed payload in the file. */
  stored: number;
  stored_crc32: number;
  sha256: string;
}

/** Why the referee would not load a file (`Reason::code` in portable.rs). */
export type SaveRefusal =
  | 'NOT_A_SAVE' | 'TRUNCATED' | 'FORMAT_VERSION' | 'BAD_HEADER' | 'INCOMPATIBLE' | 'TOO_LARGE' | 'CORRUPT' | 'UNPLAYABLE' | 'NEEDS_SERVER';

/** `POST /api/savefile/describe`: what a file is, without loading it. */
export interface SaveDescription {
  loadable: boolean;
  reason: SaveRefusal | null;
  message: string | null;
  /** Bare session text from before the container existed. */
  legacy: boolean;
  bytes: number;
  header: SaveHeader | null;
  file_name: string | null;
  game?: string;
  build?: SaveVersions;
}

/** One stored save, in the browser's database or on the server's disk. */
export interface SaveEntry {
  /** The handle for load / export / rename / delete. */
  id: string;
  /** The player's name for a manual save; empty for an autosave. */
  name: string;
  kind: SaveKind;
  /** Bytes it occupies where it is stored. */
  bytes: number;
  /** When it was made (ms since the epoch). */
  created: number;
  legacy?: boolean;
  header: SaveHeader | null;
}

/** How much of the save budget is in use (browser build). */
export interface SaveUsage {
  used: number;
  budget: number;
  manualBytes: number;
  autoBytes: number;
}

export interface SaveListing {
  entries: SaveEntry[];
  /** Total bytes of the listed saves. */
  totalBytes: number;
  /** Server-backed game: where the saves and the exported files are on this machine. */
  dir?: string;
  exportsDir?: string;
}

/** A file in the server's exports folder (`GET /api/exports`). */
export interface ExportedFile {
  file: string;
  bytes: number;
  modified_ms: number;
  header: SaveHeader | null;
  reason: SaveRefusal | null;
  message: string | null;
}

export const SAVE_EXTENSION = 'btsave';
export const SAVE_MIME = 'application/x-bts-save';
