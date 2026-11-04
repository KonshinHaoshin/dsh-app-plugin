import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveBridgeConfig } from '../identity.mjs';

test('fresh installs generate private persistent credentials and preserve pairings across updates', t => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-plugin-identity-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const first = resolveBridgeConfig({}, dir);
  const next = resolveBridgeConfig({ name: '新名称', host: '0.0.0.0' }, dir);
  assert.equal(first.host, '127.0.0.1');
  assert.equal(first.port, 43821);
  assert.equal(first.token, next.token);
  assert.equal(first.deviceId, next.deviceId);
  assert.equal(next.name, '新名称');
  assert.equal(next.host, '0.0.0.0');
  const file = join(dir, '.dsh-mobile-bridge', 'identity.json');
  assert.equal(JSON.parse(readFileSync(file)).token, first.token);
  if (process.platform !== 'win32') {
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(statSync(join(dir, '.dsh-mobile-bridge')).mode & 0o777, 0o700);
  }
  writeFileSync(file, '{invalid');
  assert.throws(() => resolveBridgeConfig({}, dir), /无法读取/);
  assert.equal(readFileSync(file, 'utf8'), '{invalid');
});

test('explicit profile credentials stay unchanged without creating another identity', () => {
  const config = { deviceId: 'existing-device', token: 'existing-pairing-key-at-least-24', port: 44000 };
  assert.deepEqual(resolveBridgeConfig(config), { name: resolveBridgeConfig(config).name, host: '127.0.0.1', ...config });
});
