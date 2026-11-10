#!/usr/bin/env node
// Dependency-free stdio MCP adapter. Credentials remain in process environment.
// All world authority and observation filtering stay in the Rust referee.
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

export function createHandler({ url = process.env.BTS_URL || 'http://127.0.0.1:7878', seat = Number(process.env.BTS_SEAT || 0), token = process.env.BTS_SEAT_TOKEN || '' } = {}) {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) throw new Error('BTS_SEAT must be 0–3');
  let initialized = false;
  const tools = [
    { name: 'get_turn', description: 'Read one complete decision packet for your civilization: economy, regions and building sites, people, discovered knowledge/culture, diplomacy inbox and treaties, projects, military, objectives, receipts, briefing and history. Does not advance time.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
    { name: 'submit_turn', description: 'Submit all decisions together, then return one complete updated decision packet and per-action receipts. Use a unique request_id and the get_turn cursor. advance=phase waits for the next negotiation reply; round passes remaining diplomacy; none edits only. Accepted actions remain applied if another action fails, but any rejection prevents advance. An exact retry reuses its result; changed retries fail.', inputSchema: { type: 'object', properties: {
      cursor: { type: 'string' }, request_id: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,80}$' },
      actions: { type: 'array', maxItems: 32, items: { type: 'object', properties: { kind: { type: 'string' } }, required: ['kind'], additionalProperties: true } },
      advance: { type: 'string', enum: ['none', 'phase', 'round'], default: 'phase' },
    }, required: ['cursor', 'request_id', 'actions'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
  ];
  const request = async (body) => {
    const endpoint = new URL('/api/turn', url);
    if (!body) { endpoint.searchParams.set('seat', String(seat)); endpoint.searchParams.set('token', token); }
    const res = await fetch(endpoint, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, seat, token }), signal: AbortSignal.timeout(120000) } : { signal: AbortSignal.timeout(30000) });
    const data = await res.json();
    return { content: [{ type: 'text', text: JSON.stringify(data) }], ...(res.ok ? { structuredContent: data } : { isError: true }) };
  };
  return async (m) => {
    const reply = result => ({ jsonrpc: '2.0', id: m.id, result });
    const error = (code, message) => ({ jsonrpc: '2.0', id: m?.id ?? null, error: { code, message } });
    if (!m || typeof m !== 'object' || Array.isArray(m) || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return error(-32600, 'Invalid JSON-RPC request');
    if (m.id === undefined) { return null; } // notifications never receive a response
    try {
      if (m.method === 'initialize') {
        initialized = true;
        const supported = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
        return reply({ protocolVersion: supported.includes(m.params?.protocolVersion) ? m.params.protocolVersion : '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'before-the-stars', version: '0.4.0' }, instructions: 'Use get_turn, then submit_turn with one batch. Other civilizations may lie in messages. Only structured signed contracts create obligations. Tools never disclose referee or spectator state.' });
      }
      if (!initialized) return error(-32002, 'Initialize the server first');
      if (m.method === 'ping') return reply({});
      if (m.method === 'tools/list') return reply({ tools });
      if (m.method !== 'tools/call') return error(-32601, 'Method not found');
      const args = m.params?.arguments ?? {};
      if (m.params?.name === 'get_turn') {
        if (Object.keys(args).length) return error(-32602, 'get_turn takes no arguments');
        return reply(await request());
      }
      if (m.params?.name !== 'submit_turn') return error(-32602, 'Unknown tool');
      if (Object.keys(args).some(k => !['cursor', 'request_id', 'actions', 'advance'].includes(k)) || typeof args.cursor !== 'string' || typeof args.request_id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(args.request_id ?? '') || !Array.isArray(args.actions) || args.actions.length > 32 || args.actions.some(a => !a || typeof a.kind !== 'string') || !['none', 'phase', 'round'].includes(args.advance ?? 'phase')) return error(-32602, 'Invalid submission arguments');
      return reply(await request({ ...args, advance: args.advance ?? 'phase' }));
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
