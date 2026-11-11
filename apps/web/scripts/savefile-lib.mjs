// The `.btsave` container, read and damaged in Node for the save checks
// (pages-smoke.mjs, saves-smoke.mjs). The format is documented in docs/saves.md and
// implemented once, in crates/bts-host/src/portable.rs; this file exists so the
// checks do not have to take the game's word for what it wrote.
import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export const MAGIC = Buffer.from([0x89, 0x42, 0x54, 0x53, 0x41, 0x56, 0x45, 0x0a]);
export const PREFIX = 20;

const TABLE = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  return c >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Take a container apart, checking everything the format promises. Throws on any mismatch. */
export function readSaveFile(file) {
  const bytes = Buffer.from(file);
  if (!bytes.subarray(0, 8).equals(MAGIC)) throw new Error('not a save file: wrong magic');
  const version = bytes.readUInt16LE(8);
  const flags = bytes.readUInt16LE(10);
  const headerLength = bytes.readUInt32LE(12);
  const headerBytes = bytes.subarray(PREFIX, PREFIX + headerLength);
  if (crc32(headerBytes) !== bytes.readUInt32LE(16)) throw new Error('header CRC mismatch');
  const header = JSON.parse(headerBytes.toString('utf8'));
  const payload = bytes.subarray(PREFIX + headerLength);
  if (payload.length !== header.stored) throw new Error(`payload is ${payload.length} bytes, header says ${header.stored}`);
  if (crc32(payload) !== header.stored_crc32) throw new Error('payload CRC mismatch');
  const text = inflateRawSync(payload);
  if (text.length !== header.length) throw new Error(`unpacked ${text.length} bytes, header says ${header.length}`);
  if (createHash('sha256').update(text).digest('hex') !== header.sha256) throw new Error('SHA-256 mismatch');
  return { version, flags, header, headerLength, payload, text: text.toString('utf8') };
}

/** The same file with its header edited (and its length and CRC made right again). */
export function reheader(file, edit, payload = null) {
  const bytes = Buffer.from(file);
  const headerLength = bytes.readUInt32LE(12);
  const header = JSON.parse(bytes.subarray(PREFIX, PREFIX + headerLength).toString('utf8'));
  edit(header);
  const head = Buffer.from(JSON.stringify(header), 'utf8');
  const front = Buffer.alloc(PREFIX);
  bytes.copy(front, 0, 0, 12);
  front.writeUInt32LE(head.length, 12);
  front.writeUInt32LE(crc32(head), 16);
  return Buffer.concat([front, head, payload ?? bytes.subarray(PREFIX + headerLength)]);
}

/**
 * Files that must each be refused, with the reason the referee should give. Made
 * from one good file.
 */
export function damagedFiles(file) {
  const good = Buffer.from(file);
  const headerLength = good.readUInt32LE(12);
  const flip = (at, mask) => { const b = Buffer.from(good); b[at] ^= mask; return b; };
  const zeros = deflateRawSync(Buffer.alloc(40 << 20), { level: 6 });
  return [
    { name: 'truncated', reason: 'TRUNCATED', bytes: good.subarray(0, Math.floor(good.length / 2)) },
    { name: 'cut-in-header', reason: 'TRUNCATED', bytes: good.subarray(0, PREFIX + 9) },
    { name: 'flipped-byte', reason: 'CORRUPT', bytes: flip(PREFIX + headerLength + Math.floor((good.length - PREFIX - headerLength) / 2), 0x08) },
    { name: 'flipped-header-byte', reason: 'CORRUPT', bytes: flip(PREFIX + 12, 0x01) },
    { name: 'wrong-magic', reason: 'NOT_A_SAVE', bytes: flip(2, 0xff) },
    { name: 'not-a-save', reason: 'NOT_A_SAVE', bytes: Buffer.from('PK\u0003\u0004 this is some other kind of file entirely') },
    { name: 'future-format', reason: 'FORMAT_VERSION', bytes: (() => { const b = Buffer.from(good); b.writeUInt16LE(9, 8); return b; })() },
    { name: 'other-rules', reason: 'INCOMPATIBLE', bytes: reheader(good, (h) => { h.versions.ruleset = 'bts-rules/0.0.1'; }) },
    { name: 'oversized-declared-length', reason: 'TOO_LARGE', bytes: reheader(good, (h) => { h.length = 2 ** 40; }) },
    { name: 'deflate-bomb', reason: 'CORRUPT', bytes: reheader(good, (h) => { h.stored = zeros.length; h.stored_crc32 = crc32(zeros); }, zeros) },
  ];
}

/** A sound container around session text that cannot be played (most of its regions removed). */
export function unplayableFile(file) {
  const { text } = readSaveFile(file);
  const save = JSON.parse(text);
  const world = JSON.parse(save.world);
  // the map presets of ruleset 3.0 (30, 60, 90, 120, 200) and the earlier 24, 48, 72; prefer the key named for them
  const sizes = [30, 60, 90, 120, 200, 24, 48, 72];
  const list = (world.regions && Array.isArray(world.regions) ? [['regions', world.regions]] : []).concat(Object.entries(world))
    .find(([, v]) => Array.isArray(v) && sizes.includes(v.length));
  if (!list) throw new Error('the world does not list its regions');
  world[list[0]] = list[1].slice(0, 3);
  save.world = JSON.stringify(world);
  const broken = Buffer.from(JSON.stringify(save), 'utf8');
  const payload = deflateRawSync(broken, { level: 6 });
  return reheader(file, (h) => {
    h.length = broken.length;
    h.stored = payload.length;
    h.stored_crc32 = crc32(payload);
    h.sha256 = createHash('sha256').update(broken).digest('hex');
  }, payload);
}
