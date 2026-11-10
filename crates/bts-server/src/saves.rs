//! Saves on this machine: named saves in the saves folder, and save files moved in
//! and out through the exports folder.
//!
//! ```text
//! <saves>/autosave.json        the autosave: session text, rewritten at every round
//! <saves>/<name>.btsave        a named save: the portable container (bts_host::portable)
//! <saves>/<name>.json          a named save from before the container: session text, still read
//! <saves>/exports/*.btsave     files the player exported, or put there to import
//! ```
//!
//! Every file that is loaded, whatever its form, goes through `Host::install_file`:
//! checked, unpacked within its limits, rehearsed, and only then made the match.
//! Every file handed out goes through the host's export rule, so a referee with an
//! external seat or required tokens gives out no world, running or stored.
//!
//! The exports folder exists because the desktop window (a system web view) does
//! not download: the referee writes the file itself and tells the client where.

use crate::agents::ServerState;
use crate::{err, json_response};
use bts_host::portable::{self, Kind, Meta};
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub type Response = tiny_http::Response<std::io::Cursor<Vec<u8>>>;

pub struct Dirs {
    pub saves: PathBuf,
    pub exports: PathBuf,
}

/// A reply, and whether a match was installed (agent workers must then be started).
pub struct Outcome {
    pub response: Response,
    pub installed: bool,
}

impl From<Response> for Outcome {
    fn from(response: Response) -> Outcome {
        Outcome { response, installed: false }
    }
}

const AUTOSAVE: &str = "autosave";

pub fn safe_name(s: &str) -> String {
    let n: String = s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').take(40).collect();
    if n.is_empty() {
        "save".into()
    } else {
        n
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn modified_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// `YYYYMMDD-HHMMSS` in UTC, for a file name.
fn stamp(ms: u64) -> String {
    let secs = ms / 1000;
    let (days, rem) = (secs / 86_400, secs % 86_400);
    // civil date from days since 1970-01-01 (Howard Hinnant's algorithm)
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let (d, m) = (doy - (153 * mp + 2) / 5 + 1, if mp < 10 { mp + 3 } else { mp - 9 });
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}{m:02}{d:02}-{:02}{:02}{:02}", rem / 3600, rem % 3600 / 60, rem % 60)
}

/// Write a file so that a crash leaves either the old content or the new, never half.
fn write_whole(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension(format!("{}.tmp", path.extension().and_then(|e| e.to_str()).unwrap_or("part")));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })
}

fn read_capped(path: &Path, cap: usize) -> Result<Vec<u8>, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.take(cap as u64 + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() > cap {
        return Err(format!("the file is larger than the {cap} bytes this game reads"));
    }
    Ok(bytes)
}

/// The front of a file: enough for a container's header.
fn read_front(path: &Path) -> Vec<u8> {
    let mut bytes = Vec::new();
    if let Ok(file) = std::fs::File::open(path) {
        let _ = file.take((portable::PREFIX + portable::MAX_HEADER) as u64).read_to_end(&mut bytes);
    }
    bytes
}

/// Headers of bare session-text saves, which must be parsed whole to be described.
/// Keyed by path, valid while the file's size and time stand.
static TEXT_HEADERS: Mutex<Option<HashMap<PathBuf, (u64, u64, Option<portable::Header>)>>> = Mutex::new(None);

fn text_header(path: &Path, bytes: u64, modified: u64) -> Option<portable::Header> {
    let mut guard = TEXT_HEADERS.lock().unwrap_or_else(|e| e.into_inner());
    let cache = guard.get_or_insert_with(HashMap::new);
    if let Some((b, m, header)) = cache.get(path) {
        if (*b, *m) == (bytes, modified) {
            return header.clone();
        }
    }
    let header = std::fs::read_to_string(path).ok().and_then(|text| bts_host::Session::load(&text).ok().map(|s| portable::describe_text(&s, &text)));
    cache.insert(path.to_path_buf(), (bytes, modified, header.clone()));
    header
}

/// The file that holds a named save: the container if there is one, else the older text.
fn named_path(saves: &Path, name: &str) -> Option<PathBuf> {
    [portable::EXTENSION, "json"].iter().map(|ext| saves.join(format!("{name}.{ext}"))).find(|p| p.is_file())
}

fn list_saves(dirs: &Dirs) -> serde_json::Value {
    // name -> (path, legacy); a container shadows text of the same name
    let mut found: HashMap<String, (PathBuf, bool)> = HashMap::new();
    if let Ok(dir) = std::fs::read_dir(&dirs.saves) {
        for entry in dir.filter_map(|e| e.ok()) {
            let path = entry.path();
            let (Some(stem), Some(ext)) = (path.file_stem().and_then(|s| s.to_str()), path.extension().and_then(|e| e.to_str())) else { continue };
            if !path.is_file() || stem.is_empty() || stem != safe_name(stem) {
                continue;
            }
            match ext {
                e if e == portable::EXTENSION => {
                    found.insert(stem.to_string(), (path.clone(), false));
                }
                "json" => {
                    found.entry(stem.to_string()).or_insert((path.clone(), true));
                }
                _ => {}
            }
        }
    }
    let mut names: Vec<String> = found.keys().cloned().collect();
    names.sort();
    let mut total = 0u64;
    let entries: Vec<serde_json::Value> = names
        .iter()
        .map(|name| {
            let (path, legacy) = &found[name];
            let meta = std::fs::metadata(path).ok();
            let bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified = meta.as_ref().map(modified_ms).unwrap_or(0);
            total += bytes;
            let header = if *legacy { text_header(path, bytes, modified) } else { portable::peek(&read_front(path)).ok() };
            serde_json::json!({
                "name": name,
                "kind": if name == AUTOSAVE { "auto" } else { "manual" },
                "legacy": legacy,
                "bytes": bytes,
                "modified_ms": modified,
                "header": header,
            })
        })
        .collect();
    serde_json::json!({ "saves": names, "entries": entries, "total_bytes": total, "dir": dirs.saves.display().to_string(), "exports_dir": dirs.exports.display().to_string() })
}

/// A file name inside the exports folder, or nothing: no path may be smuggled in.
fn export_path(dirs: &Dirs, file: &str) -> Option<PathBuf> {
    let plain = !file.is_empty() && file.len() <= 200 && !file.starts_with('.') && !file.contains(['/', '\\', '\0']) && !file.contains("..");
    let known = file.ends_with(&format!(".{}", portable::EXTENSION)) || file.ends_with(".json");
    (plain && known).then(|| dirs.exports.join(file))
}

fn list_exports(dirs: &Dirs) -> serde_json::Value {
    let mut files: Vec<(u64, serde_json::Value)> = Vec::new();
    if let Ok(dir) = std::fs::read_dir(&dirs.exports) {
        for entry in dir.filter_map(|e| e.ok()) {
            let Some(name) = entry.file_name().to_str().map(str::to_string) else { continue };
            let Some(path) = export_path(dirs, &name) else { continue };
            let Ok(meta) = std::fs::metadata(&path) else { continue };
            if !meta.is_file() {
                continue;
            }
            // the header only: what the file says it is. It is checked in full when it is chosen.
            let (header, reason) = match portable::peek(&read_front(&path)) {
                Ok(h) => match portable::compatible(&h) {
                    Ok(()) => (Some(h), None),
                    Err(r) => (Some(h), Some(r)),
                },
                Err(r) if name.ends_with(".json") && r.reason == portable::Reason::NotASave => (None, None),
                Err(r) => (None, Some(r)),
            };
            files.push((modified_ms(&meta), serde_json::json!({
                "file": name, "bytes": meta.len(), "modified_ms": modified_ms(&meta), "header": header,
                "reason": reason.as_ref().map(|r| r.reason.code()), "message": reason.map(|r| r.message),
            })));
        }
    }
    files.sort_by(|a, b| b.0.cmp(&a.0));
    files.truncate(100);
    serde_json::json!({ "dir": dirs.exports.display().to_string(), "files": files.into_iter().map(|f| f.1).collect::<Vec<_>>() })
}

/// Show a file (or the folder) in the system's file manager.
fn reveal(path: &Path, is_file: bool) -> bool {
    // automated checks start the referee with this set: they must not open windows
    if std::env::var("BTS_NO_BROWSER").is_ok() {
        return false;
    }
    let spawned = if cfg!(target_os = "macos") {
        let mut c = std::process::Command::new("open");
        if is_file {
            c.arg("-R");
        }
        c.arg(path).spawn()
    } else if cfg!(target_os = "windows") {
        let mut c = std::process::Command::new("explorer");
        if is_file {
            c.arg(format!("/select,{}", path.display()));
        } else {
            c.arg(path);
        }
        c.spawn()
    } else {
        std::process::Command::new("xdg-open").arg(if is_file { path.parent().unwrap_or(path) } else { path }).spawn()
    };
    spawned.is_ok()
}

#[derive(Deserialize)]
struct NameBody {
    name: String,
}

#[derive(Deserialize)]
struct RenameBody {
    name: String,
    to: String,
}

#[derive(Deserialize, Default)]
struct ExportBody {
    /// A named save to export; the running match when absent.
    #[serde(default)]
    name: Option<String>,
}

#[derive(Deserialize, Default)]
struct FileBody {
    #[serde(default)]
    file: Option<String>,
}

fn parse<'a, T: Deserialize<'a>>(body: &'a [u8]) -> Result<T, Response> {
    serde_json::from_slice(body).map_err(|e| err(400, "INVALID_SCHEMA", &e.to_string()))
}

fn refused(refusal: &portable::Refusal) -> Response {
    json_response(400, serde_json::json!({ "error": "INVALID_SAVE", "reason": refusal.reason.code(), "message": refusal.message }).to_string())
}

fn failure((status, code, message): (u16, &'static str, String)) -> Response {
    err(status, code, &message)
}

/// A save file as a download.
pub fn file_response(bytes: Vec<u8>) -> Response {
    let name = portable::peek(&bytes).map(|h| portable::file_name(&h)).unwrap_or_else(|_| format!("before-the-stars.{}", portable::EXTENSION));
    tiny_http::Response::from_data(bytes)
        .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], portable::MIME.as_bytes()).unwrap())
        .with_header(tiny_http::Header::from_bytes(&b"Content-Disposition"[..], format!("attachment; filename=\"{name}\"").as_bytes()).unwrap())
        .with_header(tiny_http::Header::from_bytes(&b"Cache-Control"[..], &b"no-store"[..]).unwrap())
}

/// A named save as a save file for whoever asked, under the host's export rule.
fn named_file(st: &ServerState, dirs: &Dirs, name: &str) -> Result<Vec<u8>, Response> {
    let name = safe_name(name);
    let path = named_path(&dirs.saves, &name).ok_or_else(|| err(404, "NOT_FOUND", "no save has that name"))?;
    let bytes = read_capped(&path, st.host.limits.max_file).map_err(|e| err(500, "IO", &e))?;
    let modified = std::fs::metadata(&path).map(|m| modified_ms(&m)).unwrap_or(0);
    if portable::is_container(&bytes) {
        // unpacked and judged as a session, not taken at its header's word
        let (header, text) = portable::open(&bytes, &st.host.limits).map_err(|r| refused(&r))?;
        st.host.export_text(&text, Meta { kind: header.kind, name: &header.name, created_ms: header.created_ms }).map_err(failure)
    } else {
        let text = String::from_utf8(bytes).map_err(|_| err(400, "INVALID_SAVE", "the save is not text"))?;
        let kind = if name == AUTOSAVE { Kind::Auto } else { Kind::Manual };
        st.host.export_text(&text, Meta { kind, name: &name, created_ms: modified }).map_err(failure)
    }
}

/// Housekeeping that belongs to whoever sits at the machine: not offered by a referee
/// that was started for competing seats.
fn at_the_machine(st: &ServerState) -> Result<(), Response> {
    if st.host.cfg.require_tokens {
        return Err(err(403, "UNAUTHORIZED", "not available on a referee that requires tokens"));
    }
    Ok(())
}

/// Answer a request about saves on this machine; `None` when it is not one.
pub fn handle(st: &mut ServerState, dirs: &Dirs, method: &str, path: &str, query: &str, body: &[u8]) -> Option<Outcome> {
    let arg = |key: &str| query.split('&').filter_map(|p| p.split_once('=')).find(|(k, _)| *k == key).map(|(_, v)| v.to_string());
    let result: Result<Option<Outcome>, Response> = (|| {
        Ok(Some(match (method, path) {
            ("GET", "/api/saves") => json_response(200, list_saves(dirs).to_string()).into(),
            ("POST", "/api/save") => {
                if st.host.session.is_none() {
                    return Err(err(404, "NO_MATCH", "no match is running"));
                }
                let b: NameBody = parse(body)?;
                let name = safe_name(&b.name);
                if name == AUTOSAVE {
                    return Err(err(400, "INVALID_SCHEMA", "'autosave' is the name of the game's own save; choose another"));
                }
                let file = st.host.container(Meta { kind: Kind::Manual, name: &name, created_ms: now_ms() }).expect("a match is running");
                write_whole(&dirs.saves.join(format!("{name}.{}", portable::EXTENSION)), &file).map_err(|e| err(500, "IO", &e.to_string()))?;
                json_response(200, serde_json::json!({ "saved": name, "bytes": file.len() }).to_string()).into()
            }
            ("POST", "/api/load") => {
                let b: NameBody = parse(body)?;
                let path = named_path(&dirs.saves, &safe_name(&b.name)).ok_or_else(|| err(404, "NOT_FOUND", "no save has that name"))?;
                let bytes = read_capped(&path, st.host.limits.max_file).map_err(|e| err(500, "IO", &e))?;
                st.host.install_file(&bytes).map_err(|r| refused(&r))?;
                Outcome { response: json_response(200, serde_json::to_string(&st.host.summary(true)).unwrap()), installed: true }
            }
            ("POST", "/api/saves/delete") => {
                at_the_machine(st)?;
                let b: NameBody = parse(body)?;
                let name = safe_name(&b.name);
                let mut removed = 0;
                while let Some(path) = named_path(&dirs.saves, &name) {
                    std::fs::remove_file(&path).map_err(|e| err(500, "IO", &e.to_string()))?;
                    removed += 1;
                }
                if removed == 0 {
                    return Err(err(404, "NOT_FOUND", "no save has that name"));
                }
                json_response(200, serde_json::json!({ "deleted": name }).to_string()).into()
            }
            ("POST", "/api/saves/rename") => {
                at_the_machine(st)?;
                let b: RenameBody = parse(body)?;
                let (name, to) = (safe_name(&b.name), safe_name(&b.to));
                if name == AUTOSAVE || to == AUTOSAVE {
                    return Err(err(400, "INVALID_SCHEMA", "the autosave keeps its name"));
                }
                let path = named_path(&dirs.saves, &name).ok_or_else(|| err(404, "NOT_FOUND", "no save has that name"))?;
                if name != to && named_path(&dirs.saves, &to).is_some() {
                    return Err(err(409, "CONFLICT", &format!("a save named '{to}' already exists")));
                }
                let bytes = read_capped(&path, st.host.limits.max_file).map_err(|e| err(500, "IO", &e))?;
                if portable::is_container(&bytes) {
                    let renamed = portable::rename(&bytes, &to, &st.host.limits).map_err(|r| refused(&r))?;
                    write_whole(&dirs.saves.join(format!("{to}.{}", portable::EXTENSION)), &renamed).map_err(|e| err(500, "IO", &e.to_string()))?;
                    if name != to {
                        let _ = std::fs::remove_file(&path);
                    }
                } else if name != to {
                    std::fs::rename(&path, dirs.saves.join(format!("{to}.json"))).map_err(|e| err(500, "IO", &e.to_string()))?;
                }
                json_response(200, serde_json::json!({ "renamed": to }).to_string()).into()
            }
            ("GET", "/api/saves/file") => file_response(named_file(st, dirs, &arg("name").unwrap_or_default())?).into(),
            ("GET", "/api/exports") => json_response(200, list_exports(dirs).to_string()).into(),
            ("POST", "/api/exports/write") => {
                let b: ExportBody = if body.iter().all(|c| c.is_ascii_whitespace()) { ExportBody::default() } else { parse(body)? };
                let file = match &b.name {
                    Some(name) => named_file(st, dirs, name)?,
                    None => st.host.export_file(Meta { kind: Kind::Manual, name: "", created_ms: now_ms() }).map_err(failure)?,
                };
                let base = portable::peek(&file).map(|h| portable::file_name(&h)).map_err(|r| refused(&r))?;
                let name = format!("{}-{}.{}", base.trim_end_matches(&format!(".{}", portable::EXTENSION)), stamp(now_ms()), portable::EXTENSION);
                let path = dirs.exports.join(&name);
                write_whole(&path, &file).map_err(|e| err(500, "IO", &e.to_string()))?;
                json_response(200, serde_json::json!({ "file": name, "path": path.display().to_string(), "dir": dirs.exports.display().to_string(), "bytes": file.len() }).to_string()).into()
            }
            ("POST", "/api/exports/describe") | ("POST", "/api/exports/import") => {
                let b: FileBody = parse(body)?;
                let file = b.file.as_deref().and_then(|f| export_path(dirs, f)).filter(|p| p.is_file()).ok_or_else(|| err(404, "NOT_FOUND", "no such file in the exports folder"))?;
                let bytes = read_capped(&file, st.host.limits.max_file).map_err(|e| err(400, "INVALID_SAVE", &e))?;
                if path.ends_with("/describe") {
                    json_response(200, serde_json::to_string(&st.host.describe_file(&bytes, true)).unwrap()).into()
                } else {
                    st.host.install_file(&bytes).map_err(|r| refused(&r))?;
                    Outcome { response: json_response(200, serde_json::to_string(&st.host.summary(true)).unwrap()), installed: true }
                }
            }
            ("POST", "/api/exports/reveal") => {
                at_the_machine(st)?;
                let b: FileBody = if body.iter().all(|c| c.is_ascii_whitespace()) { FileBody::default() } else { parse(body)? };
                let _ = std::fs::create_dir_all(&dirs.exports);
                let target = b.file.as_deref().and_then(|f| export_path(dirs, f)).filter(|p| p.is_file());
                let shown = match &target {
                    Some(path) => reveal(path, true),
                    None => reveal(&dirs.exports, false),
                };
                json_response(200, serde_json::json!({ "revealed": shown, "path": target.unwrap_or_else(|| dirs.exports.clone()).display().to_string() }).to_string()).into()
            }
            _ => return Ok(None),
        }))
    })();
    result.unwrap_or_else(|response| Some(response.into()))
}
