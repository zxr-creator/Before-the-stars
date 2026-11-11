#!/usr/bin/env node
// Dependency-free stdio MCP adapter, bound to one seat. Credentials remain in process environment.
// All world authority and observation filtering stay in the Rust referee.
// The game binary serves the same tools itself (`bts mcp`); both read tools/mcp-tools.json.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const DEFS = JSON.parse(readFileSync(new URL('./mcp-tools.json', import.meta.url), 'utf8'));
const SECTIONS = DEFS.tools[0].inputSchema.properties.sections.items.enum;
/** The line that separates a brief packet's briefing from its JSON part. */
export const PACKET_MARK = '--- decision packet (JSON) ---';

/** A packet as the model reads it: a brief packet's briefing as plain text, then the rest as JSON. */
export function render(packet) {
  if (packet?.view !== 'brief') return JSON.stringify(packet);
  const { briefing = '', standing_orders: _orders, ...rest } = packet;
  return `${briefing}\n\n${PACKET_MARK}\n${JSON.stringify(rest)}`;
}

export function createHandler({
  url = process.env.BTS_URL || 'http://127.0.0.1:7878',
  seat = Number(process.env.BTS_SEAT || 0),
  token = process.env.BTS_SEAT_TOKEN || '',
  maxCalls = Number(process.env.BTS_MAX_CALLS || 0),
} = {}) {
  if (!Number.isInteger(seat) || seat < 0 || seat > 9) throw new Error('BTS_SEAT must be 0–9');
  let initialized = false;
  let calls = 0;
  const tools = DEFS.tools;
  const request = async (body, view = 'brief', sections = []) => {
    const endpoint = new URL('/api/turn', url);
    if (!body) {
      endpoint.searchParams.set('seat', String(seat)); endpoint.searchParams.set('token', token); endpoint.searchParams.set('view', view);
      if (sections.length) endpoint.searchParams.set('sections', sections.join(','));
    }
    const res = await fetch(endpoint, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, seat, token }), signal: AbortSignal.timeout(180000) } : { signal: AbortSignal.timeout(60000) });
    const data = await res.json();
    return { content: [{ type: 'text', text: res.ok ? render(data) : JSON.stringify(data) }], ...(res.ok ? { structuredContent: data } : { isError: true }) };
  };
  const budget = () => ({ isError: true, content: [{ type: 'text', text: `The tool-call budget of this run (${maxCalls} calls) is spent. Make no more calls. Orders you already submitted stay applied.` }] });
  return async (m) => {
    const reply = result => ({ jsonrpc: '2.0', id: m.id, result });
    const error = (code, message) => ({ jsonrpc: '2.0', id: m?.id ?? null, error: { code, message } });
    if (!m || typeof m !== 'object' || Array.isArray(m) || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return error(-32600, 'Invalid JSON-RPC request');
    if (m.id === undefined) { return null; } // notifications never receive a response
    try {
      if (m.method === 'initialize') {
        initialized = true;
        const supported = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
        return reply({ protocolVersion: supported.includes(m.params?.protocolVersion) ? m.params.protocolVersion : '2025-06-18', capabilities: { tools: {} }, serverInfo: DEFS.server, instructions: DEFS.instructions });
      }
      if (!initialized) return error(-32002, 'Initialize the server first');
      if (m.method === 'ping') return reply({});
      if (m.method === 'tools/list') return reply({ tools });
      if (m.method !== 'tools/call') return error(-32601, 'Method not found');
      const args = m.params?.arguments ?? {};
      const view = args.view ?? 'brief';
      if (!['brief', 'full'].includes(view)) return error(-32602, 'view must be "brief" or "full"');
      const spent = maxCalls > 0 && calls >= maxCalls;
      if (m.params?.name === 'get_turn') {
        if (Object.keys(args).some(k => !['view', 'sections'].includes(k))) return error(-32602, 'get_turn takes only view and sections');
        const sections = args.sections ?? [];
        if (!Array.isArray(sections) || sections.length > SECTIONS.length || sections.some(s => !SECTIONS.includes(s))) return error(-32602, 'sections must name parts of the observation');
        if (spent) return reply(budget());
        calls++;
        return reply(await request(null, view, sections));
      }
      if (m.params?.name !== 'submit_turn') return error(-32602, 'Unknown tool');
      if (Object.keys(args).some(k => !['cursor', 'request_id', 'actions', 'advance', 'view'].includes(k)) || typeof args.cursor !== 'string' || typeof args.request_id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(args.request_id ?? '') || !Array.isArray(args.actions) || args.actions.length > 32 || args.actions.some(a => !a || typeof a.kind !== 'string') || !['none', 'phase', 'round'].includes(args.advance ?? 'phase')) return error(-32602, 'Invalid submission arguments');
      if (spent) return reply(budget());
      calls++;
      return reply(await request({ ...args, advance: args.advance ?? 'phase', view }));
    } catch (e) { return reply({ isError: true, content: [{ type: 'text', text: `Referee request failed: ${e.message}. Use the same request_id and payload if retrying a submission.` }] }); }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const handle = createHandler();
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  // Serialize messages: action order must never depend on HTTP completion timing.
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      const response = await handle(JSON.parse(line));
      if (response) process.stdout.write(JSON.stringify(response) + '\n');
    } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); }
  }
}
