import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostname } from 'node:os';

// Keep automatically generated credentials outside the package and Git checkout.
// Updating or reinstalling the package must not revoke existing phone pairings.
export function resolveBridgeConfig(config = {}, profileDir) {
  let identity = {};
  if (!config.deviceId || !config.token) {
    if (!profileDir) throw new Error('DSH 未提供 profileContext，无法保存手机配对配置');
    const directory = join(profileDir, '.dsh-mobile-bridge');
    const path = join(directory, 'identity.json');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    try {
      identity = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('无法读取手机配对配置，请检查 profile 下的 .dsh-mobile-bridge/identity.json');
      identity = { deviceId: `dsh-${randomUUID()}`, token: randomBytes(32).toString('hex') };
      try {
        writeFileSync(path, JSON.stringify(identity) + '\n', { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        identity = JSON.parse(readFileSync(path, 'utf8'));
      }
    }
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(identity.deviceId) || typeof identity.token !== 'string' || identity.token.length < 24) {
      throw new Error('手机配对配置无效；不会自动覆盖已有配对密钥');
    }
  }
  return { name: hostname(), host: '127.0.0.1', port: 43821, ...identity, ...config };
}
