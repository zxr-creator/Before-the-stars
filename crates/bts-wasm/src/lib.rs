//! The referee as a WebAssembly module.
//!
//! This is `bts-host` (the same request router and permission rules the HTTP server
//! uses) behind a plain exported ABI, so the browser build needs no bindings
//! generator and no extra build tool. It is meant for `wasm32-unknown-unknown` in a
//! Web Worker: no threads, no clocks, no files, no imports at all. The page supplies
//! entropy with every call (`crypto.getRandomValues`); it is used when a match is made.
//!
//! ```text
//! bts_abi() -> u32                       version of this interface (1)
//! bts_alloc(len) -> ptr                  a buffer the caller fills
//! bts_free(ptr, len)                     release a buffer from bts_alloc
//! bts_call(line, line_len, body, body_len, entropy_hi, entropy_lo) -> status
//!     line  UTF-8 "METHOD /path?query", exactly as over HTTP (docs/agent-api.md)
//!     body  UTF-8 request body, or len 0
//!     returns the HTTP-style status; the reply is read with:
//! bts_result_ptr() / bts_result_len()    reply body, UTF-8 (JSON unless FLAG_TEXT); valid until the next call
//! bts_result_flags() -> u32              FLAG_* bits for the last call
//! bts_tick() -> flags                    one step of observer playback (see FLAG_PENDING)
//! bts_panic_ptr() / bts_panic_len()      the panic message after a trap
//! bts_debug_panic()                      fail on purpose, to test that a failure is reported
//! ```
//!
//! Bodies cross as raw bytes in both directions, so a save (text now, possibly a
//! binary blob later) is never wrapped or escaped a second time.
//!
//! A panic aborts (the module traps). The hook records the message first, so the
//! worker can report it to the page instead of dying silently; after a trap the
//! module's state is undefined and must not be called again.

use bts_host::{Body, Config, Host, NoAgents, Request};
use std::sync::Mutex;

/// The session was changed by the call.
pub const FLAG_CHANGED: u32 = 1;
/// A point where the HTTP referee writes its autosave: a round was resolved.
pub const FLAG_AUTOSAVE: u32 = 2;
/// A match was created or imported.
pub const FLAG_INSTALLED: u32 = 4;
/// Observer playback has steps due: keep calling `bts_tick` (yielding in between).
pub const FLAG_PENDING: u32 = 8;
/// The reply body is plain text (a Markdown export), not JSON.
pub const FLAG_TEXT: u32 = 16;
/// `bts_tick` moved the match.
pub const FLAG_STEPPED: u32 = 32;

struct State {
    host: Host<NoAgents>,
    result: Vec<u8>,
    flags: u32,
}

static STATE: Mutex<Option<State>> = Mutex::new(None);
static PANIC: Mutex<Vec<u8>> = Mutex::new(Vec::new());

fn with_state<T>(f: impl FnOnce(&mut State) -> T) -> T {
    let mut guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
    let state = guard.get_or_insert_with(|| {
        #[cfg(target_arch = "wasm32")]
        std::panic::set_hook(Box::new(|info| {
            if let Ok(mut p) = PANIC.lock() {
                *p = info.to_string().into_bytes();
            }
        }));
        // The browser is one player's own machine: no tokens, nothing to shut down, and
        // playback is stepped by the worker so it can answer the page between steps.
        State { host: Host::new(Config { require_tokens: false, app_mode: false, settle_inline: false }), result: Vec::new(), flags: 0 }
    });
    f(state)
}

#[no_mangle]
pub extern "C" fn bts_abi() -> u32 {
    1
}

#[no_mangle]
pub extern "C" fn bts_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len.max(1));
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// # Safety
/// `ptr` must come from `bts_alloc(len)` with the same `len`, and is not used again.
#[no_mangle]
pub unsafe extern "C" fn bts_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(Vec::from_raw_parts(ptr, 0, len.max(1)));
    }
}

/// # Safety
/// `line` and `body` must be readable for `line_len` and `body_len` bytes (a null
/// pointer is fine with length 0).
#[no_mangle]
pub unsafe extern "C" fn bts_call(line: *const u8, line_len: usize, body: *const u8, body_len: usize, entropy_hi: u32, entropy_lo: u32) -> u32 {
    let bytes = |ptr: *const u8, len: usize| if ptr.is_null() || len == 0 { &[][..] } else { std::slice::from_raw_parts(ptr, len) };
    let (line, body) = (std::str::from_utf8(bytes(line, line_len)), std::str::from_utf8(bytes(body, body_len)));
    with_state(|st| {
        let (Ok(line), Ok(body)) = (line, body) else {
            st.result = b"{\"error\":\"INVALID_SCHEMA\",\"message\":\"the request is not valid UTF-8\"}".to_vec();
            st.flags = 0;
            return 400;
        };
        let (method, target) = line.split_once(' ').unwrap_or((line, ""));
        let reply = st.host.handle(&Request { method, target, body, entropy: ((entropy_hi as u64) << 32) | entropy_lo as u64 });
        let e = reply.effects;
        st.flags = (e.changed as u32 * FLAG_CHANGED)
            | (e.autosave as u32 * FLAG_AUTOSAVE)
            | (e.installed as u32 * FLAG_INSTALLED)
            | (st.host.pending() as u32 * FLAG_PENDING)
            | ((reply.kind == Body::Markdown) as u32 * FLAG_TEXT);
        st.result = reply.body.into_bytes();
        reply.status as u32
    })
}

#[no_mangle]
pub extern "C" fn bts_result_ptr() -> *const u8 {
    with_state(|st| st.result.as_ptr())
}

#[no_mangle]
pub extern "C" fn bts_result_len() -> usize {
    with_state(|st| st.result.len())
}

#[no_mangle]
pub extern "C" fn bts_result_flags() -> u32 {
    with_state(|st| st.flags)
}

/// One host step of observer playback. Returns `FLAG_STEPPED` when the match moved,
/// `FLAG_AUTOSAVE | FLAG_CHANGED` when that step resolved a round, and `FLAG_PENDING`
/// while more steps are due. The result buffer of the last `bts_call` is left alone.
#[no_mangle]
pub extern "C" fn bts_tick() -> u32 {
    with_state(|st| {
        let t = st.host.tick();
        (t.stepped as u32 * FLAG_STEPPED) | (t.round_completed as u32 * (FLAG_AUTOSAVE | FLAG_CHANGED)) | (t.pending as u32 * FLAG_PENDING)
    })
}

#[no_mangle]
pub extern "C" fn bts_panic_ptr() -> *const u8 {
    PANIC.lock().map(|p| p.as_ptr()).unwrap_or(std::ptr::null())
}

#[no_mangle]
pub extern "C" fn bts_panic_len() -> usize {
    PANIC.lock().map(|p| p.len()).unwrap_or(0)
}

/// Fail the way a bug in the engine would. It exists so the page's handling of an
/// engine failure can be tested; all it can harm is the caller's own match.
#[no_mangle]
pub extern "C" fn bts_debug_panic() {
    with_state(|_| panic!("deliberate failure requested through bts_debug_panic"));
}

#[cfg(test)]
mod tests {
    //! The ABI driven natively, the way the worker drives it: bytes in, bytes out.
    use super::*;

    /// The module holds one match; tests that use it take turns.
    static TURN: Mutex<()> = Mutex::new(());

    fn call(line: &str, body: &str) -> (u32, String, u32) {
        unsafe {
            let copy = |s: &str| {
                let p = bts_alloc(s.len());
                std::ptr::copy_nonoverlapping(s.as_ptr(), p, s.len());
                p
            };
            let (l, b) = (copy(line), copy(body));
            let status = bts_call(l, line.len(), b, body.len(), 0x1234_5678, 0x9abc_def0);
            bts_free(l, line.len());
            bts_free(b, body.len());
            let out = std::slice::from_raw_parts(bts_result_ptr(), bts_result_len());
            (status, String::from_utf8(out.to_vec()).unwrap(), bts_result_flags())
        }
    }

    fn field(json: &str, key: &str) -> String {
        let at = json.find(&format!("\"{key}\":")).unwrap_or_else(|| panic!("no {key} in {json:.200}")) + key.len() + 3;
        json[at..].chars().take_while(|c| !",}".contains(*c)).collect()
    }

    #[test]
    fn a_human_match_plays_through_the_abi_and_keeps_the_observer_door_shut() {
        let _turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        assert_eq!(bts_abi(), 1);
        assert_eq!(call("GET /api/health", ""), (200, "{\"ok\":true}".into(), 0));
        let (status, summary, flags) = call("POST /api/match", "{\"seed\":\"abi\",\"regions\":24,\"controllers\":[\"human\",\"easy\",\"medium\",\"hard\"]}");
        assert_eq!(status, 200, "{summary}");
        assert_eq!(flags, FLAG_CHANGED | FLAG_INSTALLED);
        assert_eq!(field(&summary, "observer_allowed"), "false");
        // the person at this page cannot open the whole-world view of their own match
        assert_eq!(call("GET /api/spectator", "").0, 403);
        assert_eq!(call("POST /api/advance", "{\"rounds\":5}").0, 403);
        assert_eq!(call("GET /api/observation?seat=1&token=", "").0, 403);
        assert_eq!(call("GET /api/observation?seat=0&token=", "").0, 200);
        let (status, after, flags) = call("POST /api/ready", "{\"seat\":0,\"token\":\"\",\"through_round\":true}");
        assert_eq!((status, field(&after, "round").as_str()), (200, "2"));
        assert_eq!(flags, FLAG_CHANGED | FLAG_AUTOSAVE);
        assert_eq!(bts_tick(), 0, "nothing is deferred in a match a person plays");
        let (status, markdown, flags) = call("GET /api/export/chronicle?seat=0&format=md", "");
        assert_eq!((status, flags), (200, FLAG_TEXT));
        assert!(markdown.starts_with("# Chronicle of "));
        // the save text crosses as the raw body in both directions
        let (status, save, _) = call("GET /api/session/export", "");
        assert_eq!(status, 200);
        assert_eq!(call("POST /api/session/import", &save[..save.len() - 9]).0, 400);
        assert_eq!(field(&call("GET /api/match", "").1, "round"), "2", "a refused import leaves the match alone");
        let (status, restored, flags) = call("POST /api/session/import", &save);
        assert_eq!((status, field(&restored, "round").as_str(), flags), (200, "2", FLAG_CHANGED | FLAG_INSTALLED));
        assert_eq!(call("POST /api/match", "{\"controllers\":[\"human\",\"claude-api\",\"easy\",\"easy\"]}").0, 400);
        assert_eq!(call("POST /api/shutdown", "{}").0, 403);
        assert_eq!(call("BOGUS", "").0, 404);
        unsafe {
            let bad = [0xffu8, 0xfe];
            assert_eq!(bts_call(bad.as_ptr(), 2, std::ptr::null(), 0, 0, 0), 400);
        }
    }

    #[test]
    fn an_observer_match_is_stepped_by_ticks() {
        let _turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let (status, summary, _) = call("POST /api/match", "{\"seed\":\"abi-watch\",\"regions\":24,\"controllers\":[\"easy\",\"medium\",\"medium\",\"hard\"]}");
        assert_eq!((status, field(&summary, "observer_allowed").as_str()), (200, "true"));
        assert_eq!(call("GET /api/spectator", "").0, 200);
        assert_eq!(bts_tick(), 0, "an observer match waits to be asked");
        let (status, answer, flags) = call("POST /api/advance", "{\"rounds\":2}");
        assert_eq!((status, field(&answer, "round").as_str()), (200, "1"), "the call answers before the rounds are resolved");
        assert_eq!(flags, FLAG_CHANGED | FLAG_PENDING);
        let (mut steps, mut rounds) = (0, 0);
        loop {
            let f = bts_tick();
            assert_ne!(f & FLAG_STEPPED, 0);
            steps += 1;
            rounds += (f & FLAG_AUTOSAVE != 0) as u32;
            // the page is answered between steps
            assert_eq!(call("GET /api/match", "").0, 200);
            if f & FLAG_PENDING == 0 {
                break;
            }
            assert!(steps < 200);
        }
        assert_eq!(rounds, 2);
        assert_eq!(field(&call("GET /api/match", "").1, "round"), "3");
        assert_eq!(bts_tick(), 0);
    }
}
