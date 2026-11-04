import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { startBridge } from '../host.mjs';
import { createPairing } from '../pairing.mjs';

const config = { deviceId: 'package-test', token: randomBytes(32).toString('hex'), host: '0.0.0.0', port: 0, lanAddress: '127.0.0.1' };
const payload = uri => JSON.parse(Buffer.from(new URL(uri).hash.slice(6), 'base64url'));

test('QR codes expire and redeem once without embedding long-term phone credentials', async () => {
  let now = Date.now();
  const pairing = createPairing(config, 43821, () => now);
  const qr = await pairing.issue('lan');
  const data = payload(qr.uri);
  assert.equal(data.deviceId, config.deviceId);
  assert.equal(data.mode, 'lan');
  assert.notEqual(data.code, config.token);
  assert.equal('token' in data, false);
  assert.ok(qr.svg.startsWith('<svg'));
  assert.equal(pairing.redeem(data.code).token, config.token);
  assert.equal(pairing.redeem(data.code), null);
  assert.equal(pairing.status(qr.id).used, true);
  const next = payload((await pairing.issue('lan')).uri);
  now += 300001;
  assert.equal(pairing.redeem(next.code), null);
  assert.equal(pairing.status(qr.id).expired, true);
});

test('local pairing page rejects cross-origin access and issued QR redeems over the bridge', async t => {
  const bridge = await startBridge({}, config);
  t.after(() => bridge.close());
  const origin = `http://127.0.0.1:${bridge.port}`;
  assert.equal((await fetch(origin + '/pair', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  const response = await fetch(origin + '/pair/code', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DSH-Pairing': '1' }, body: JSON.stringify({ mode: 'lan' }) });
  assert.equal(response.status, 200);
  const data = payload((await response.json()).uri);
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/connect`);
  t.after(() => ws.terminate());
  const result = await new Promise((resolve, reject) => {
    ws.once('open', () => ws.send(JSON.stringify({ type: 'pair', deviceId: data.deviceId, code: data.code })));
    ws.once('message', raw => resolve(JSON.parse(raw)));
    ws.once('error', reject);
  });
  assert.equal(result.type, 'paired');
  assert.equal(result.token, config.token);
});
