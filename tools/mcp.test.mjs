import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createHandler, render, PACKET_MARK } from './mcp.mjs';

test('MCP lifecycle, consolidated packet, bound identity, failures and validation', async () => {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    let text = ''; for await (const part of req) text += part;
    calls.push({ url: req.url, body: text ? JSON.parse(text) : null });
    res.setHeader('content-type', 'application/json');
    if (calls.at(-1).body?.cursor === 'stale') { res.statusCode = 409; res.end(JSON.stringify({ error: 'STALE_TURN' })); }
    else res.end(JSON.stringify({ cursor: 'c1', observation: { seat: 2, round: 1, civ: {}, projects: [] }, receipts: [] }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const handle = createHandler({ url: `http://127.0.0.1:${server.address().port}`, seat: 2, token: 'secret' });
    const call = (method, params) => handle({ jsonrpc: '2.0', id: 1, method, params });
    assert.equal((await call('tools/list')).error.code, -32002);
    assert.equal((await call('initialize', { protocolVersion: '2025-06-18' })).result.protocolVersion, '2025-06-18');
    assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
    assert.deepEqual((await call('tools/list')).result.tools.map(x => x.name), ['get_turn', 'submit_turn']);
    const packet = await call('tools/call', { name: 'get_turn' });
    assert.equal(packet.result.structuredContent.observation.seat, 2);
    const first = new URL(calls[0].url, 'http://localhost').searchParams;
    assert.equal(first.get('token'), 'secret');
    assert.equal(first.get('view'), 'brief', 'the brief packet is the default: a full one can exceed a model\'s tool-result limit');
    await call('tools/call', { name: 'get_turn', arguments: { view: 'full', sections: ['regions', 'directives'] } });
    assert.equal(new URL(calls.at(-1).url, 'http://localhost').searchParams.get('sections'), 'regions,directives');
    assert.equal((await call('tools/call', { name: 'get_turn', arguments: { sections: ['spectator'] } })).error.code, -32602);
    const args = { cursor: 'c1', request_id: 'turn-1', actions: [], advance: 'round' };
    await call('tools/call', { name: 'submit_turn', arguments: args });
    assert.equal(calls.at(-1).body.seat, 2);
    assert.equal(calls.at(-1).body.advance, 'round');
    assert.equal(calls.at(-1).body.view, 'brief');
    assert.equal((await call('tools/call', { name: 'submit_turn', arguments: { ...args, seat: 1 } })).error.code, -32602);
    assert.equal((await call('tools/call', { name: 'submit_turn', arguments: { ...args, actions: Array(33).fill({ kind: 'x' }) } })).error.code, -32602);
    assert.equal((await call('tools/call', { name: 'submit_turn', arguments: { ...args, cursor: 'stale' } })).result.isError, true);
    assert.equal((await call('tools/call', { name: 'spectate' })).error.code, -32602);
    // seats 0–9 (ruleset 3: up to ten civilizations), nothing beyond
    assert.doesNotThrow(() => createHandler({ seat: 9 }));
    assert.throws(() => createHandler({ seat: 10 }));
    // the call budget of one run
    const capped = createHandler({ url: `http://127.0.0.1:${server.address().port}`, seat: 0, token: 't', maxCalls: 1 });
    await capped({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    assert.equal((await capped({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_turn' } })).result.isError, undefined);
    const spent = await capped({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_turn' } });
    assert.equal(spent.result.isError, true);
    assert.match(spent.result.content[0].text, /budget/);
  } finally { await new Promise(r => server.close(r)); }
});

test('a brief packet reads as text first, and both MCP servers share one tool definition', () => {
  const text = render({ view: 'brief', briefing: 'AD 1 — round 3', cursor: 'abc', standing_orders: [1] });
  assert.ok(text.startsWith('AD 1 — round 3'));
  const rest = JSON.parse(text.split(PACKET_MARK)[1]);
  assert.equal(rest.cursor, 'abc');
  assert.equal(rest.standing_orders, undefined);
  // the Rust server (`bts mcp`) embeds the same file
  const rust = readFileSync(new URL('../crates/bts-server/src/mcp.rs', import.meta.url), 'utf8');
  assert.match(rust, /include_str!\("\.\.\/\.\.\/\.\.\/tools\/mcp-tools\.json"\)/);
  assert.match(rust, new RegExp(PACKET_MARK.replace(/[()]/g, '\\$&')));
});
