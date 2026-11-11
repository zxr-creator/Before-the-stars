// "An agent I run myself": how to attach your own Claude Code or Codex session (or any
// MCP client, or plain HTTP) to an external seat. Shows each such seat's token and
// ready-made configurations for the game's MCP server, bound to that seat.
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import type { SeatSummary } from '../protocol';
import { Btn } from '../ui';
import { Icon } from '../icons';
import { useApp } from '../store';
import { t, tc } from '../i18n';
import { Emblem } from '../theme/emblem';
import './agents.css';

let open = false;
const listeners = new Set<() => void>();
/** Show the connection panel (after a match with an external seat starts, or from the game menu). */
export function openConnect(): void { open = true; listeners.forEach((l) => l()); }
function closeConnect(): void { open = false; listeners.forEach((l) => l()); }

/** Seats an agent outside the game plays, with their tokens. */
export function externalSeats(seats: SeatSummary[] | undefined): SeatSummary[] {
  return (seats ?? []).filter((s) => s.controller === 'external' && !s.agent && s.status === 'active');
}

function Code({ text, id }: { text: string; id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the text can still be selected by hand */ }
  };
  return (
    <div class="connect-code">
      <pre data-testid={id}>{text}</pre>
      <Btn small kind="ghost" nav icon={copied ? 'check' : 'layers'} onClick={() => void copy()}>{copied ? t('Copied') : t('Copy')}</Btn>
    </div>
  );
}

export function ConnectHost() {
  const s = useApp();
  const [, bump] = useState(0);
  const [exe, setExe] = useState<string>('bts');
  useEffect(() => { const l = () => bump((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeConnect(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => { if (open) void api.agentProviders().then((d) => { if (d?.mcp_command?.[0]) setExe(d.mcp_command[0]); }).catch(() => undefined); }, [open]);
  if (!open) return null;
  const seats = externalSeats(s.summary?.seats);
  const url = window.location.origin;
  const quote = (x: string) => JSON.stringify(x);
  return (
    <div class="connect-scrim" onClick={closeConnect}>
      <div class="connect" role="dialog" aria-label={t('Connect your agent')} data-testid="connect-agents" data-esc-layer onClick={(e) => e.stopPropagation()}>
        <header>
          <h2><Icon name="agent" size={16} /> {t('Connect your agent')}</h2>
          <Btn kind="ghost" small nav icon="close" title={t('Close (Esc)')} onClick={closeConnect} />
        </header>
        <p>{t('These seats wait for an agent you run yourself: your own Claude Code or Codex session, or any MCP client. Give it the game’s MCP server bound to the seat; it then has two tools, get_turn and submit_turn, and plays only that civilization. The match waits for it at every phase.')}</p>
        {!seats.length ? <p class="empty">{t('This match has no seat for an agent you run yourself.')}</p> : null}
        {seats.map((seat) => {
          const env = { BTS_URL: url, BTS_SEAT: String(seat.seat), BTS_SEAT_TOKEN: seat.token ?? '' };
          const mcpJson = JSON.stringify({ mcpServers: { 'before-the-stars': { command: exe, args: ['mcp'], env } } }, null, 2);
          const claude = `claude --mcp-config bts-seat-${seat.seat + 1}.json --allowedTools mcp__before-the-stars__get_turn,mcp__before-the-stars__submit_turn`;
          const codex = `codex -c 'mcp_servers.bts.command=${quote(exe)}' -c 'mcp_servers.bts.args=["mcp"]' -c 'mcp_servers.bts.env={BTS_URL=${quote(url)},BTS_SEAT="${seat.seat}",BTS_SEAT_TOKEN=${quote(env.BTS_SEAT_TOKEN)}}'`;
          const node = `BTS_URL=${url} BTS_SEAT=${seat.seat} BTS_SEAT_TOKEN=${env.BTS_SEAT_TOKEN} node tools/mcp.mjs`;
          const prompt = t('You govern {name} in the strategy game Before the Stars. When I say “your turn”, call get_turn, decide, and submit_turn with advance "phase"; read the receipts and fix rejected orders. Rounds last up to fifty years: use standing orders (action kind "directive") for what must keep happening.', { name: tc(seat.name) });
          return (
            <section class="connect-seat" data-testid={`connect-seat-${seat.seat}`}>
              <h3><Emblem seat={seat.seat} color={seat.color} name={seat.name} size={20} /> {t('Seat {n}', { n: seat.seat + 1 })} · {tc(seat.name)}</h3>
              <span class="connect-k">{t('Seat token')}</span>
              <Code text={seat.token ?? ''} id={`connect-token-${seat.seat}`} />
              <span class="connect-k">{t('Claude Code: save this as bts-seat-{n}.json, then start Claude Code with it', { n: seat.seat + 1 })}</span>
              <Code text={mcpJson} id={`connect-mcp-${seat.seat}`} />
              <Code text={claude} id={`connect-claude-${seat.seat}`} />
              <span class="connect-k">{t('Codex: the same server for one session, without changing your Codex settings')}</span>
              <Code text={codex} id={`connect-codex-${seat.seat}`} />
              <span class="connect-k">{t('Or, from a checkout of the game with Node.js')}</span>
              <Code text={node} id={`connect-node-${seat.seat}`} />
              <span class="connect-k">{t('A first message for your agent')}</span>
              <Code text={prompt} id={`connect-prompt-${seat.seat}`} />
            </section>
          );
        })}
        <p class="muted small">{t('The token admits this seat only. Plain HTTP works too: GET /api/turn?seat=N&token=… and POST /api/turn (docs/agent-api.md). Start the game with --require-tokens if other programs on this computer must not play these seats without the token.')}</p>
      </div>
    </div>
  );
}
