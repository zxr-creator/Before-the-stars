import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler } from './mcp.mjs';

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
    assert.equal(new URL(calls[0].url, 'http://localhost').searchParams.get('token'), 'secret');
    const args = { cursor: 'c1', request_id: 'turn-1', actions: [], advance: 'round' };
    await call('tools/call', { name: 'submit_turn', arguments: args });
    assert.equal(calls.at(-1).body.seat, 2);
    assert.equal(calls.at(-1).body.advance, 'round');
    assert.equal((await call('tools/call', { name: 'submit_turn', arguments: { ...args, seat: 1 } })).error.code, -32602);
    assert.equal((await call('tools/call', { name: 'submit_turn', arguments: { ...args, actions: Array(33).fill({ kind: 'x' }) } })).error.code, -32602);
    assert.equal((await call('tools/call', { name: 'submit_turn', arguments: { ...args, cursor: 'stale' } })).result.isError, true);
    assert.equal((await call('tools/call', { name: 'spectate' })).error.code, -32602);
  } finally { await new Promise(r => server.close(r)); }
});
