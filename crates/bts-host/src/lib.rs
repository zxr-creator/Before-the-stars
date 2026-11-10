//! The match host, independent of how requests reach it.
//!
//! One implementation serves every transport: the HTTP referee (`bts-server`) and
//! the browser build (`bts-wasm`, running in a Web Worker). A transport turns
//! whatever it receives into a [`Request`], calls [`Host::handle`], and sends the
//! [`Reply`] back. Every permission rule lives here, so the transports cannot
//! disagree about what a seat, an observer or a stranger may see or do.
//!
//! What stays with a transport: sockets, files on disk, windows, threads, clocks,
//! and the workers that play LLM agent seats (see [`AgentSlot`]). This crate uses
//! none of them, which is what lets it compile to `wasm32-unknown-unknown`.

mod referee;
mod session;
mod turn;

#[cfg(test)]
mod tests;

pub use referee::{
    controller, AgentProvider, AgentSlot, AgentSummary, Body, Config, Effects, Host, MatchSummary, NoAgents, Reply, Request, SeatSummary, Tick,
    AGENT_CONTROLLERS,
};
pub use session::{AgentConfig, Session, SAVE_FORMAT};
pub use turn::{Advance, Submission};
