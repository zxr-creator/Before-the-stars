//! The portable save file (`.btsave`): one container for every transport.
//!
//! A file written by the browser build loads in the desktop game and the reverse,
//! because both run this module. The container wraps the session save text
//! ([`Session::save`], treated here as opaque) with what a reader needs before it
//! trusts the content: what the file is, which build wrote it, how large it will be
//! once unpacked, and a checksum of exactly those unpacked bytes.
//!
//! ```text
//! offset  size  field
//!      0     8  magic            89 42 54 53 41 56 45 0A   ("\x89BTSAVE\n")
//!      8     2  format version   little-endian; this build reads and writes 1
//!     10     2  flags            reserved, must be 0
//!     12     4  header length H  little-endian; 1 ..= 65536
//!     16     4  header CRC-32    IEEE CRC-32 of the H header bytes
//!     20     H  header           UTF-8 JSON object, see `Header`
//!   20+H     S  payload          raw DEFLATE stream of the session save text;
//!                                S is `stored` in the header and runs to the end of the file
//! ```
//!
//! The first byte is not ASCII and the magic ends with a line feed, so a transfer
//! that treated the file as text is caught at the first field. Nothing follows the
//! payload: a longer or shorter file is refused.
//!
//! Reading is strict and bounded ([`open`]): the header is at most 64 KiB, the
//! declared unpacked length is checked against [`Limits`] before a single byte is
//! inflated, inflation stops at the declared length (so a deflate bomb cannot grow
//! past what the header admits to, and that is itself capped), and the SHA-256 of
//! the unpacked bytes must match the header. The packed bytes have a CRC-32 of
//! their own in the header, checked first, so any changed byte anywhere in the file
//! is caught (a DEFLATE stream ends in padding bits that unpacking alone ignores). Only then is the session text parsed
//! and rehearsed by the host, and only after that does it replace a running match.
//!
//! Integrity uses two kinds of check. The header and the packed payload each carry
//! a CRC-32: the header is read and shown to the player before anything else is
//! verified, and a CRC is enough to catch accidental damage to either part before
//! any work is done. The unpacked session text carries a SHA-256 because it also
//! serves as the save's identity (two files with the same hash hold the same game:
//! the browser's autosave uses it to skip writing a save it already has). Neither is
//! a signature: a save file is not authenticated, and a file edited on purpose with
//! its checksum recomputed is caught by the rehearsal, or not at all.
//!
//! What a save never holds: API keys (see [`crate::session::AgentConfig`] and
//! `Session::save`). What it does hold is the whole world, including each seat's
//! token, which is why a referee with an external seat or with required tokens
//! never exports one (`Host::session_portable`).

use crate::session::{Session, SAVE_FORMAT};
use bts_protocol::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const MAGIC: [u8; 8] = *b"\x89BTSAVE\n";
/// The container format this build writes, and the only one it reads.
pub const FORMAT_VERSION: u16 = 1;
/// The file name extension, without the dot.
pub const EXTENSION: &str = "btsave";
pub const MIME: &str = "application/x-bts-save";
/// Bytes before the header: magic, version, flags, header length, header CRC.
pub const PREFIX: usize = 20;
/// The header is a description, not a payload: anything larger is refused unread.
pub const MAX_HEADER: usize = 64 * 1024;
const CODEC: &str = "deflate";
/// DEFLATE cannot expand by more than about 1032:1; a header that claims more is lying.
const MAX_RATIO: u64 = 1100;
/// miniz_oxide's levels run 0..=10. 6 is zlib's default trade; see docs/saves.md for measurements.
const LEVEL: u8 = 6;

/// How much a reader is prepared to handle. A transport may tighten or widen it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Limits {
    /// Largest file accepted, in bytes.
    pub max_file: usize,
    /// Largest session text accepted once unpacked, in bytes. Checked against the
    /// declared length before inflating and enforced while inflating.
    pub max_unpacked: usize,
}

impl Default for Limits {
    /// 64 MiB each way. A late-game session is about 1.4 MB of text and 0.2 MB packed.
    fn default() -> Limits {
        Limits { max_file: 64 << 20, max_unpacked: 64 << 20 }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    /// Made because the player asked for it. Never deleted automatically.
    Manual,
    /// Made by the game at a round boundary. Rotated and evicted by the store that holds it.
    Auto,
}

impl Kind {
    pub fn parse(s: &str) -> Option<Kind> {
        match s {
            "manual" => Some(Kind::Manual),
            "auto" => Some(Kind::Auto),
            _ => None,
        }
    }
}

/// The versions of everything that decides whether a session can be played.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Versions {
    pub ruleset: String,
    pub content: String,
    pub generator: String,
    pub protocol: String,
    pub policy: String,
    /// The format of the session text inside (`bts-save/1`).
    pub session: String,
}

impl Versions {
    /// What this build runs.
    pub fn current() -> Versions {
        Versions {
            ruleset: bts_engine::content::RULESET_VERSION.into(),
            content: bts_engine::content::CONTENT_VERSION.into(),
            generator: bts_engine::content::GENERATOR_VERSION.into(),
            protocol: PROTOCOL_VERSION.into(),
            policy: bts_ai::POLICY_VERSION.into(),
            session: SAVE_FORMAT.into(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Seat {
    pub seat: SeatId,
    pub name: String,
    pub controller: ControllerKind,
    pub status: SeatStatus,
    /// The provider of an LLM agent seat (never its credentials).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
}

/// The plain description at the front of a save file. Unknown fields are ignored,
/// so a later build may add some without changing the format version.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Header {
    pub kind: Kind,
    /// The name the player gave a manual save; empty otherwise.
    #[serde(default)]
    pub name: String,
    /// When it was made, in milliseconds since the Unix epoch, as the caller said
    /// (the host has no clock). 0 when unknown.
    #[serde(default)]
    pub created_ms: u64,
    /// The game version that wrote the file.
    pub game: String,
    pub versions: Versions,
    pub match_id: String,
    /// Present only when the match discloses its seed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seed: Option<String>,
    pub regions: u16,
    pub round: u32,
    pub month: Month,
    /// `month / 12 + 1`, for a person reading the header.
    pub year: u32,
    pub horizon: Month,
    pub finished: bool,
    #[serde(default)]
    pub winner: Option<SeatId>,
    pub seats: Vec<Seat>,
    /// How the payload is packed: `deflate` (raw, no zlib wrapper).
    pub codec: String,
    /// Bytes of session text once unpacked.
    pub length: u64,
    /// Bytes of payload in the file.
    pub stored: u64,
    /// IEEE CRC-32 of the payload as stored, so damage is caught before anything is unpacked.
    pub stored_crc32: u32,
    /// SHA-256 of the unpacked session text, lowercase hex.
    pub sha256: String,
}

/// What the caller knows that the session does not.
#[derive(Clone, Copy, Debug)]
pub struct Meta<'a> {
    pub kind: Kind,
    pub name: &'a str,
    pub created_ms: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reason {
    /// Not a save file at all (wrong magic).
    NotASave,
    /// The file ends before its own lengths say it should.
    Truncated,
    /// A container format, flag or codec this build does not read.
    FormatVersion,
    /// The header cannot be read or breaks its own rules.
    BadHeader,
    /// Written by different rules, content or session format.
    Incompatible,
    /// Larger than this reader accepts.
    TooLarge,
    /// A checksum, a length or the compressed stream is wrong.
    Corrupt,
    /// The container is sound but the session inside cannot be played.
    Unplayable,
    /// The session has a seat this referee cannot run (an LLM agent seat in the browser build).
    NeedsServer,
}

impl Reason {
    pub fn code(self) -> &'static str {
        match self {
            Reason::NotASave => "NOT_A_SAVE",
            Reason::Truncated => "TRUNCATED",
            Reason::FormatVersion => "FORMAT_VERSION",
            Reason::BadHeader => "BAD_HEADER",
            Reason::Incompatible => "INCOMPATIBLE",
            Reason::TooLarge => "TOO_LARGE",
            Reason::Corrupt => "CORRUPT",
            Reason::Unplayable => "UNPLAYABLE",
            Reason::NeedsServer => "NEEDS_SERVER",
        }
    }
}

/// Why a file was not loaded. The message is for the player.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Refusal {
    pub reason: Reason,
    pub message: String,
}

impl Refusal {
    pub fn new(reason: Reason, message: impl Into<String>) -> Refusal {
        Refusal { reason, message: message.into() }
    }
}

fn refuse<T>(reason: Reason, message: impl Into<String>) -> Result<T, Refusal> {
    Err(Refusal::new(reason, message))
}

/// IEEE CRC-32 (the one in zip and PNG).
pub fn crc32(data: &[u8]) -> u32 {
    let mut table = [0u32; 256];
    for (i, entry) in table.iter_mut().enumerate() {
        let mut c = i as u32;
        for _ in 0..8 {
            c = (c >> 1) ^ (0xEDB8_8320 & (c & 1).wrapping_neg());
        }
        *entry = c;
    }
    !data.iter().fold(!0u32, |crc, &byte| table[((crc ^ byte as u32) & 0xff) as usize] ^ (crc >> 8))
}

pub fn sha256_hex(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    let mut out = String::with_capacity(64);
    for b in digest {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// Whether the bytes begin like a container (as opposed to bare session text).
pub fn is_container(bytes: &[u8]) -> bool {
    bytes.len() >= MAGIC.len() && bytes[..MAGIC.len()] == MAGIC
}

fn clip(s: &str, max: usize) -> String {
    s.chars().filter(|c| !c.is_control()).take(max).collect()
}

/// The header for a session, without the payload fields (`length`, `stored`, `sha256`).
fn describe_session(s: &Session, meta: Meta) -> Header {
    let cfg = s.m.config();
    let seats = s
        .m
        .diagnostics()
        .into_iter()
        .map(|d| Seat {
            seat: d.seat,
            name: d.name,
            controller: s.m.controller(d.seat),
            status: d.status,
            agent: s.agent_cfgs.get(d.seat as usize).and_then(|c| c.as_ref()).map(|c| c.provider.clone()),
        })
        .collect();
    Header {
        kind: meta.kind,
        name: clip(meta.name, 80),
        created_ms: meta.created_ms,
        game: env!("CARGO_PKG_VERSION").into(),
        versions: Versions::current(),
        match_id: s.m.match_id().to_string(),
        seed: cfg.public_seed.then(|| cfg.seed.clone()),
        regions: cfg.regions,
        round: s.m.round(),
        month: s.m.month(),
        year: s.m.month() / 12 + 1,
        horizon: cfg.horizon,
        finished: s.m.finished(),
        winner: s.m.winner(),
        seats,
        codec: CODEC.into(),
        length: 0,
        stored: 0,
        stored_crc32: 0,
        sha256: String::new(),
    }
}

/// Wrap session text in a container. `text` must be the save text of `session`.
pub fn pack(session: &Session, text: &str, meta: Meta) -> Vec<u8> {
    pack_at(session, text, meta, LEVEL)
}

/// [`pack`] at a chosen DEFLATE level (0..=10), for measuring the trade.
pub fn pack_at(session: &Session, text: &str, meta: Meta, level: u8) -> Vec<u8> {
    let mut header = describe_session(session, meta);
    let payload = miniz_oxide::deflate::compress_to_vec(text.as_bytes(), level);
    header.length = text.len() as u64;
    header.stored = payload.len() as u64;
    header.stored_crc32 = crc32(&payload);
    header.sha256 = sha256_hex(text.as_bytes());
    assemble(&header, &payload)
}

fn assemble(header: &Header, payload: &[u8]) -> Vec<u8> {
    let head = serde_json::to_vec(header).expect("header serializes");
    assert!(head.len() <= MAX_HEADER, "a save header is a few hundred bytes");
    let mut out = Vec::with_capacity(PREFIX + head.len() + payload.len());
    out.extend_from_slice(&MAGIC);
    out.extend_from_slice(&FORMAT_VERSION.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&(head.len() as u32).to_le_bytes());
    out.extend_from_slice(&crc32(&head).to_le_bytes());
    out.extend_from_slice(&head);
    out.extend_from_slice(payload);
    out
}

/// The same save under another name: only the header changes, the payload is not
/// unpacked. The file must be structurally sound.
pub fn rename(bytes: &[u8], name: &str, limits: &Limits) -> Result<Vec<u8>, Refusal> {
    let (mut header, payload) = read_header(bytes, limits)?;
    header.name = clip(name, 80);
    Ok(assemble(&header, payload))
}

/// The header of bare session text (a save from before the container existed, or
/// the server's `autosave.json`), so it can be shown and judged like any other file.
pub fn describe_text(session: &Session, text: &str) -> Header {
    let mut header = describe_session(session, Meta { kind: Kind::Manual, name: "", created_ms: 0 });
    header.codec = "none".into();
    header.length = text.len() as u64;
    header.stored = text.len() as u64;
    header.stored_crc32 = crc32(text.as_bytes());
    header.sha256 = sha256_hex(text.as_bytes());
    header
}

/// Read and check everything up to the payload: magic, format version, header
/// (bounded, CRC-checked, parsed, sane) and that the file is exactly as long as it
/// says. Nothing is inflated. Returns the header and the still-packed payload.
pub fn read_header<'a>(bytes: &'a [u8], limits: &Limits) -> Result<(Header, &'a [u8]), Refusal> {
    if bytes.len() > limits.max_file {
        return refuse(Reason::TooLarge, format!("the file is {} bytes; this game reads save files up to {} bytes", bytes.len(), limits.max_file));
    }
    let (header, at) = front(bytes)?;
    let payload = &bytes[at..];
    if (payload.len() as u64) < header.stored {
        return refuse(Reason::Truncated, format!("the file is incomplete: it holds {} of {} bytes", bytes.len(), at as u64 + header.stored));
    }
    if payload.len() as u64 > header.stored {
        return refuse(Reason::Corrupt, format!("the file is damaged: {} bytes follow the end of the save", payload.len() as u64 - header.stored));
    }
    Ok((header, payload))
}

/// The header alone, from the first bytes of a file (at most `PREFIX + MAX_HEADER`
/// are needed): what a listing shows without reading every file whole. The payload
/// is not looked at, so this says what a file claims to be, not that it is intact.
pub fn peek(start: &[u8]) -> Result<Header, Refusal> {
    front(start).map(|(header, _)| header)
}

/// The preamble and header; returns the header and where the payload begins.
fn front(bytes: &[u8]) -> Result<(Header, usize), Refusal> {
    let seen = bytes.len().min(MAGIC.len());
    if bytes[..seen] != MAGIC[..seen] || bytes.is_empty() {
        return refuse(Reason::NotASave, "this is not a Before the Stars save file");
    }
    if bytes.len() < PREFIX {
        return refuse(Reason::Truncated, format!("the file is incomplete: it ends after {} bytes, inside its own preamble", bytes.len()));
    }
    let version = u16::from_le_bytes([bytes[8], bytes[9]]);
    if version != FORMAT_VERSION {
        return refuse(Reason::FormatVersion, format!("the file uses save-file format {version}; this build reads format {FORMAT_VERSION}. It was probably written by a newer version of the game"));
    }
    let flags = u16::from_le_bytes([bytes[10], bytes[11]]);
    if flags != 0 {
        return refuse(Reason::FormatVersion, format!("the file uses save-file options ({flags:#06x}) this build does not know"));
    }
    let head_len = u32::from_le_bytes([bytes[12], bytes[13], bytes[14], bytes[15]]) as usize;
    if head_len == 0 || head_len > MAX_HEADER {
        return refuse(Reason::BadHeader, format!("the file declares a {head_len}-byte description; at most {MAX_HEADER} bytes are allowed"));
    }
    let Some(head) = bytes.get(PREFIX..PREFIX + head_len) else {
        return refuse(Reason::Truncated, format!("the file is incomplete: it ends after {} bytes, inside its {head_len}-byte description", bytes.len()));
    };
    let crc = u32::from_le_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    if crc32(head) != crc {
        return refuse(Reason::Corrupt, "the file is damaged: its description does not match its checksum");
    }
    let header: Header = serde_json::from_slice(head).map_err(|e| Refusal::new(Reason::BadHeader, format!("the file's description cannot be read: {e}")))?;
    if header.codec != CODEC {
        return refuse(Reason::FormatVersion, format!("the file is packed with '{}', which this build does not read", clip(&header.codec, 24)));
    }
    if header.sha256.len() != 64 || !header.sha256.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
        return refuse(Reason::BadHeader, "the file's description carries no usable checksum");
    }
    if header.seats.len() > 16 || header.name.chars().count() > 200 || header.match_id.len() > 200 {
        return refuse(Reason::BadHeader, "the file's description is not one this game would write");
    }
    Ok((header, PREFIX + head_len))
}

/// Whether this build can play what the header describes. The message names both sides.
pub fn compatible(header: &Header) -> Result<(), Refusal> {
    let ours = Versions::current();
    let theirs = &header.versions;
    for (what, saved, running) in [("rules", &theirs.ruleset, &ours.ruleset), ("content", &theirs.content, &ours.content), ("session format", &theirs.session, &ours.session)] {
        if saved != running {
            return refuse(Reason::Incompatible, format!("this file was saved by {what} {}; this build runs {what} {running}", clip(saved, 48)));
        }
    }
    Ok(())
}

/// Unpack a payload whose header has been read. The declared length is checked
/// against the limit first; inflation then stops at the declared length whatever
/// the stream holds, and the result must have exactly that length and that hash.
pub fn unpack(header: &Header, payload: &[u8], limits: &Limits) -> Result<String, Refusal> {
    if header.length > limits.max_unpacked as u64 {
        return refuse(Reason::TooLarge, format!("the save would unpack to {} bytes; this game accepts at most {} bytes", header.length, limits.max_unpacked));
    }
    if header.length > (payload.len() as u64).saturating_mul(MAX_RATIO).saturating_add(64) {
        return refuse(Reason::Corrupt, format!("the file is damaged: {} packed bytes cannot hold the {} bytes it declares", payload.len(), header.length));
    }
    if crc32(payload) != header.stored_crc32 {
        return refuse(Reason::Corrupt, "the file is damaged: its packed data does not match its checksum");
    }
    let declared = header.length as usize;
    // The output buffer grows as data arrives and never past `declared`.
    let data = match miniz_oxide::inflate::decompress_to_vec_with_limit(payload, declared) {
        Ok(data) => data,
        Err(e) if matches!(e.status, miniz_oxide::inflate::TINFLStatus::HasMoreOutput) => {
            return refuse(Reason::Corrupt, format!("the file is damaged or hostile: it unpacks to more than the {declared} bytes it declares"));
        }
        Err(_) => return refuse(Reason::Corrupt, "the file is damaged: its packed data cannot be read"),
    };
    if data.len() != declared {
        return refuse(Reason::Corrupt, format!("the file is damaged: it unpacks to {} bytes, not the {declared} it declares", data.len()));
    }
    if sha256_hex(&data) != header.sha256 {
        return refuse(Reason::Corrupt, "the file is damaged: its contents do not match its checksum");
    }
    String::from_utf8(data).map_err(|_| Refusal::new(Reason::Corrupt, "the file is damaged: its contents are not text"))
}

/// Everything short of playing it: structure, compatibility, bounded unpacking, checksum.
pub fn open(bytes: &[u8], limits: &Limits) -> Result<(Header, String), Refusal> {
    let (header, payload) = read_header(bytes, limits)?;
    compatible(&header)?;
    let text = unpack(&header, payload, limits)?;
    Ok((header, text))
}

/// A file name for a save, safe on every system: `before-the-stars-<label>-y<year>.btsave`.
pub fn file_name(header: &Header) -> String {
    let label: String = if header.name.is_empty() { header.match_id.clone() } else { header.name.clone() };
    let mut safe: String = label.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' }).take(40).collect();
    while safe.contains("--") {
        safe = safe.replace("--", "-");
    }
    let safe = safe.trim_matches('-');
    format!("before-the-stars-{}-y{}.{EXTENSION}", if safe.is_empty() { "save" } else { safe }, header.year)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bts_engine::MatchConfig;

    fn session(rounds: u32) -> Session {
        let mut s = Session::new(MatchConfig { seed: "portable".into(), regions: 24, controllers: vec![ControllerKind::NativeMedium; 4], ..Default::default() }, 11);
        s.run_rounds(rounds);
        s
    }

    fn packed(rounds: u32) -> (Session, String, Vec<u8>) {
        let s = session(rounds);
        let text = s.save();
        let file = pack(&s, &text, Meta { kind: Kind::Manual, name: "My save: año 3", created_ms: 1_700_000_000_000 });
        (s, text, file)
    }

    /// Rebuild a file around an edited header, with correct lengths and CRC.
    fn reheader(file: &[u8], edit: impl FnOnce(&mut serde_json::Value)) -> Vec<u8> {
        let head_len = u32::from_le_bytes(file[12..16].try_into().unwrap()) as usize;
        let mut header: serde_json::Value = serde_json::from_slice(&file[PREFIX..PREFIX + head_len]).unwrap();
        edit(&mut header);
        let head = serde_json::to_vec(&header).unwrap();
        let mut out = file[..12].to_vec();
        out.extend_from_slice(&(head.len() as u32).to_le_bytes());
        out.extend_from_slice(&crc32(&head).to_le_bytes());
        out.extend_from_slice(&head);
        out.extend_from_slice(&file[PREFIX + head_len..]);
        out
    }

    fn reason(bytes: &[u8]) -> Reason {
        open(bytes, &Limits::default()).expect_err("must be refused").reason
    }

    #[test]
    fn crc32_matches_the_standard_check_value() {
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
        assert_eq!(crc32(b""), 0);
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn a_container_round_trips_and_describes_its_match() {
        let (s, text, file) = packed(3);
        assert!(is_container(&file));
        assert_eq!(&file[..8], b"\x89BTSAVE\n");
        let (header, back) = open(&file, &Limits::default()).unwrap();
        assert_eq!(back, text, "the session text comes back byte for byte");
        assert_eq!(header.kind, Kind::Manual);
        assert_eq!(header.name, "My save: año 3");
        assert_eq!(header.created_ms, 1_700_000_000_000);
        assert_eq!(header.game, env!("CARGO_PKG_VERSION"));
        assert_eq!(header.versions, Versions::current());
        assert_eq!(header.versions.ruleset, bts_engine::content::RULESET_VERSION);
        assert_eq!((header.match_id.as_str(), header.round, header.month), (s.m.match_id(), s.m.round(), s.m.month()));
        assert_eq!(header.year, s.m.month() / 12 + 1);
        assert_eq!(header.seats.len(), 4);
        assert!(header.seats.iter().all(|x| x.controller == ControllerKind::NativeMedium && !x.name.is_empty() && x.agent.is_none()));
        assert_eq!((header.length as usize, header.stored as usize), (text.len(), file.len() - PREFIX - u32::from_le_bytes(file[12..16].try_into().unwrap()) as usize));
        assert!(file.len() * 3 < text.len(), "a save packs to well under a third: {} of {}", file.len(), text.len());
        // the same session packs to the same bytes: nothing in the container depends on when or where
        assert_eq!(pack(&s, &text, Meta { kind: Kind::Manual, name: "My save: año 3", created_ms: 1_700_000_000_000 }), file);
        assert_eq!(file_name(&header), format!("before-the-stars-My-save-a-o-3-y{}.btsave", header.year));
    }

    #[test]
    fn a_save_is_renamed_without_unpacking_and_its_header_can_be_read_alone() {
        let (_, text, file) = packed(2);
        let renamed = rename(&file, "second\tthoughts", &Limits::default()).unwrap();
        let (header, back) = open(&renamed, &Limits::default()).unwrap();
        assert_eq!((header.name.as_str(), back.as_str()), ("secondthoughts", text.as_str()));
        assert_eq!(header.sha256, open(&file, &Limits::default()).unwrap().0.sha256, "the same game under another name");
        assert_eq!(rename(&file[..file.len() - 1], "x", &Limits::default()).unwrap_err().reason, Reason::Truncated);
        // a listing reads only the front of each file
        let head_len = u32::from_le_bytes(file[12..16].try_into().unwrap()) as usize;
        assert_eq!(peek(&file[..PREFIX + head_len]).unwrap(), open(&file, &Limits::default()).unwrap().0);
        assert_eq!(peek(&file[..PREFIX + head_len - 1]).unwrap_err().reason, Reason::Truncated);
        assert_eq!(peek(b"{\"format\":\"bts-save/1\"").unwrap_err().reason, Reason::NotASave);
        // every level packs to something that reads back
        for level in [1, 6, 9] {
            let at = pack_at(&session(2), &text, Meta { kind: Kind::Auto, name: "", created_ms: 0 }, level);
            assert_eq!(open(&at, &Limits::default()).unwrap().1, text);
        }
    }

    /// Sizes and times behind the choice of level, early and late in a standard match:
    ///   cargo test --release -p bts-host -- --ignored --nocapture measure
    #[test]
    #[ignore = "a measurement, not a check"]
    fn measure_levels_early_and_late() {
        let mut s = Session::new(MatchConfig { seed: "measure".into(), regions: 48, controllers: vec![ControllerKind::NativeHard, ControllerKind::NativeMedium, ControllerKind::NativeMedium, ControllerKind::NativeEasy], ..Default::default() }, 7);
        for rounds in [3u32, 57, 60, 120] {
            s.run_rounds(rounds);
            let text = s.save();
            println!("round {:>3}: session text {} bytes", s.m.round(), text.len());
            for level in [1u8, 3, 6, 9] {
                let t = std::time::Instant::now();
                let file = pack_at(&s, &text, Meta { kind: Kind::Auto, name: "", created_ms: 0 }, level);
                let packed = t.elapsed();
                let t = std::time::Instant::now();
                let (_, back) = open(&file, &Limits::default()).unwrap();
                let opened = t.elapsed();
                assert_eq!(back, text);
                println!("    level {level}: {:>7} bytes ({:>4.1}:1), pack {:>5.1} ms, verify+unpack {:>4.1} ms", file.len(), text.len() as f64 / file.len() as f64, packed.as_secs_f64() * 1e3, opened.as_secs_f64() * 1e3);
            }
        }
    }

    #[test]
    fn the_seed_is_in_the_header_only_when_the_match_discloses_it() {
        let sealed = Session::new(MatchConfig { seed: "a-secret-seed".into(), regions: 24, public_seed: false, ..Default::default() }, 3);
        let open_seed = Session::new(MatchConfig { seed: "a-known-seed".into(), regions: 24, public_seed: true, ..Default::default() }, 3);
        let head = |s: &Session| {
            let file = pack(s, &s.save(), Meta { kind: Kind::Auto, name: "", created_ms: 0 });
            let n = u32::from_le_bytes(file[12..16].try_into().unwrap()) as usize;
            String::from_utf8(file[PREFIX..PREFIX + n].to_vec()).unwrap()
        };
        assert!(!head(&sealed).contains("a-secret-seed") && !head(&sealed).contains("\"seed\""));
        assert!(head(&open_seed).contains("\"seed\":\"a-known-seed\""));
    }

    #[test]
    fn every_truncation_is_refused() {
        let (_, _, file) = packed(2);
        let head_len = u32::from_le_bytes(file[12..16].try_into().unwrap()) as usize;
        assert_eq!(reason(&[]), Reason::NotASave);
        for cut in [1, 7, 8, 12, 19, PREFIX, PREFIX + 5, PREFIX + head_len - 1, PREFIX + head_len, file.len() / 2, file.len() - 1] {
            assert_eq!(reason(&file[..cut]), Reason::Truncated, "cut at {cut} of {}", file.len());
        }
        // and one byte too many is not ignored either
        let mut long = file.clone();
        long.push(0);
        assert_eq!(reason(&long), Reason::Corrupt);
    }

    #[test]
    fn a_flipped_bit_anywhere_is_refused() {
        let (_, _, file) = packed(2);
        let head_len = u32::from_le_bytes(file[12..16].try_into().unwrap()) as usize;
        // every byte of the preamble and header, then a spread through the payload
        let payload_step = ((file.len() - PREFIX - head_len) / 257).max(1);
        let places = (0..PREFIX + head_len).chain((PREFIX + head_len..file.len()).step_by(payload_step)).chain([file.len() - 1]);
        let mut tried = 0;
        for at in places {
            for bit in [0x01u8, 0x80] {
                let mut bad = file.clone();
                bad[at] ^= bit;
                assert!(open(&bad, &Limits::default()).is_err(), "a file with byte {at} changed by {bit:#x} was accepted");
                tried += 1;
            }
        }
        assert!(tried > 1000);
        let mut bad = file.clone();
        *bad.last_mut().unwrap() ^= 0x10;
        assert_eq!(reason(&bad), Reason::Corrupt);
        let mut bad = file.clone();
        bad[PREFIX + 3] ^= 0x20;
        assert_eq!(reason(&bad), Reason::Corrupt, "a damaged header fails its CRC before it is parsed");
    }

    #[test]
    fn foreign_files_and_future_formats_are_refused_by_name() {
        let (_, text, file) = packed(1);
        for foreign in [&b"PK\x03\x04 a zip archive"[..], b"\x89PNG\r\n\x1a\n0000000000000", text.as_bytes(), b"\x89BTSAVX\n00000000000000"] {
            assert_eq!(reason(foreign), Reason::NotASave);
        }
        let mut future = file.clone();
        future[8] = 2;
        let r = open(&future, &Limits::default()).unwrap_err();
        assert_eq!(r.reason, Reason::FormatVersion);
        assert!(r.message.contains("format 2") && r.message.contains("reads format 1"), "{}", r.message);
        let mut flagged = file.clone();
        flagged[10] = 1;
        assert_eq!(reason(&flagged), Reason::FormatVersion);
        assert_eq!(reason(&reheader(&file, |h| h["codec"] = "zstd".into())), Reason::FormatVersion);
    }

    #[test]
    fn a_file_from_other_rules_is_refused_with_both_versions_named() {
        let (_, _, file) = packed(1);
        let other = reheader(&file, |h| h["versions"]["ruleset"] = "bts-rules/0.4.2".into());
        let r = open(&other, &Limits::default()).unwrap_err();
        assert_eq!(r.reason, Reason::Incompatible);
        assert_eq!(r.message, format!("this file was saved by rules bts-rules/0.4.2; this build runs rules {}", bts_engine::content::RULESET_VERSION));
        assert_eq!(reason(&reheader(&file, |h| h["versions"]["content"] = "bts-content/9".into())), Reason::Incompatible);
        assert_eq!(reason(&reheader(&file, |h| h["versions"]["session"] = "bts-save/2".into())), Reason::Incompatible);
        // versions that do not decide whether the world can be played are recorded, not enforced
        assert!(open(&reheader(&file, |h| h["versions"]["generator"] = "bts-worldgen/0.1".into()), &Limits::default()).is_ok());
        // a header field this build has never heard of is tolerated
        assert!(open(&reheader(&file, |h| h["thumbnail"] = "later".into()), &Limits::default()).is_ok());
    }

    #[test]
    fn header_rules_are_enforced() {
        let (_, _, file) = packed(1);
        let mut huge = file.clone();
        huge[12..16].copy_from_slice(&(MAX_HEADER as u32 + 1).to_le_bytes());
        assert_eq!(reason(&huge), Reason::BadHeader);
        let mut none = file.clone();
        none[12..16].copy_from_slice(&0u32.to_le_bytes());
        assert_eq!(reason(&none), Reason::BadHeader);
        assert_eq!(reason(&reheader(&file, |h| h["sha256"] = "zz".into())), Reason::BadHeader);
        assert_eq!(reason(&reheader(&file, |h| h["kind"] = "weekly".into())), Reason::BadHeader);
        assert_eq!(reason(&reheader(&file, |h| { h.as_object_mut().unwrap().remove("length"); })), Reason::BadHeader);
        assert_eq!(reason(&reheader(&file, |h| *h = serde_json::json!([1, 2, 3]))), Reason::BadHeader);
        // a valid CRC around bytes that are not JSON
        let mut junk = file[..12].to_vec();
        let head = b"\xff\xfe not json";
        junk.extend_from_slice(&(head.len() as u32).to_le_bytes());
        junk.extend_from_slice(&crc32(head).to_le_bytes());
        junk.extend_from_slice(head);
        assert_eq!(reason(&junk), Reason::BadHeader);
    }

    #[test]
    fn declared_and_actual_sizes_are_both_capped() {
        let (_, text, file) = packed(2);
        let tight = Limits { max_file: 64 << 20, max_unpacked: text.len() - 1 };
        let r = open(&file, &tight).unwrap_err();
        assert_eq!(r.reason, Reason::TooLarge);
        assert!(r.message.contains(&text.len().to_string()), "{}", r.message);
        assert!(open(&file, &Limits { max_file: 64 << 20, max_unpacked: text.len() }).is_ok());
        assert_eq!(open(&file, &Limits { max_file: file.len() - 1, max_unpacked: 64 << 20 }).unwrap_err().reason, Reason::TooLarge);
        // an absurd declared length is refused before anything is inflated
        assert_eq!(reason(&reheader(&file, |h| h["length"] = (1u64 << 40).into())), Reason::TooLarge);
        // a declared length the payload could never reach
        assert_eq!(reason(&reheader(&file, |h| h["length"] = (60u64 << 20).into())), Reason::Corrupt);
        // lying about the length in either direction
        assert_eq!(reason(&reheader(&file, |h| h["length"] = (text.len() as u64 - 1).into())), Reason::Corrupt);
        assert_eq!(reason(&reheader(&file, |h| h["length"] = (text.len() as u64 + 1).into())), Reason::Corrupt);
    }

    #[test]
    fn a_deflate_bomb_stops_at_the_declared_length() {
        let (_, _, file) = packed(1);
        // 48 MiB of zeros packs to about 47 KB
        let bomb = vec![0u8; 48 << 20];
        let packed_bomb = miniz_oxide::deflate::compress_to_vec(&bomb, 9);
        assert!(packed_bomb.len() < 100_000);
        let head_len = u32::from_le_bytes(file[12..16].try_into().unwrap()) as usize;
        let around = |declared: u64, sha: String| {
            let mut swapped = file[..PREFIX + head_len].to_vec();
            swapped.extend_from_slice(&packed_bomb);
            reheader(&swapped, |h| {
                h["length"] = declared.into();
                h["stored"] = (packed_bomb.len() as u64).into();
                h["stored_crc32"] = crc32(&packed_bomb).into();
                h["sha256"] = sha.into();
            })
        };
        // it admits to a small size: inflation is cut off there
        let small = around(4096, sha256_hex(&bomb[..4096]));
        let r = open(&small, &Limits::default()).unwrap_err();
        assert_eq!(r.reason, Reason::Corrupt);
        assert!(r.message.contains("more than the 4096 bytes"), "{}", r.message);
        // it admits to its real size: over the cap, refused unread
        let honest = around(bomb.len() as u64, sha256_hex(&bomb));
        assert_eq!(open(&honest, &Limits { max_file: 64 << 20, max_unpacked: 16 << 20 }).unwrap_err().reason, Reason::TooLarge);
        // under a cap that allows it, it unpacks, and is then not a session: the caller's parse refuses it
        let (_, zeros) = open(&honest, &Limits::default()).unwrap();
        assert!(Session::load(&zeros).is_err());
    }
}
