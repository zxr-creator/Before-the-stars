// Reading the plain header of a `.btsave` file in the page, to label a save the
// referee has just made. This is not a check of the file: every file that is loaded
// or imported is verified by the referee (crates/bts-host/src/portable.rs), which is
// the only code that unpacks one.
import type { SaveHeader } from './types';

const MAGIC = [0x89, 0x42, 0x54, 0x53, 0x41, 0x56, 0x45, 0x0a]; // "\x89BTSAVE\n"
const PREFIX = 20;
const MAX_HEADER = 64 * 1024;

/** The header of a container the referee produced, or null when the bytes are not one. */
export function readHeader(file: Uint8Array): SaveHeader | null {
  if (file.length < PREFIX || MAGIC.some((b, i) => file[i] !== b)) return null;
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint16(8, true) !== 1) return null;
  const length = view.getUint32(12, true);
  if (length === 0 || length > MAX_HEADER || PREFIX + length > file.length) return null;
  try {
    const header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.subarray(PREFIX, PREFIX + length))) as SaveHeader;
    return header && typeof header === 'object' && typeof header.match_id === 'string' && Array.isArray(header.seats) ? header : null;
  } catch {
    return null;
  }
}

/** The server's rule for a save name (`safe_name` in crates/bts-server): the browser build keeps to it, so names carry over. */
export function safeName(name: string): string {
  const n = Array.from(name).filter((c) => /[A-Za-z0-9_-]/.test(c)).slice(0, 40).join('');
  return n || 'save';
}

/** A file name for a save: `before-the-stars-<label>-y<year>.btsave` (as `portable::file_name`). */
export function fileNameFor(header: SaveHeader | null, fallback = 'save'): string {
  const label = (header?.name || header?.match_id || fallback).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40).replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || 'save';
  return `before-the-stars-${label}${header ? `-y${header.year}` : ''}.btsave`;
}

/** Hand bytes to the browser as a download. */
export function downloadBytes(bytes: Uint8Array, file: string, type: string): void {
  const copy = bytes.slice();
  const url = URL.createObjectURL(new Blob([copy.buffer as ArrayBuffer], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
