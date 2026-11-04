import { startBridge } from './host.mjs';
import { createHarnessAdapter } from './adapter.mjs';
import{registerDesktopSettings}from'./settings.mjs';
import { resolveBridgeConfig } from './identity.mjs';
export const name = 'shelterhub-mobile-bridge';
export const inject = ['typertGateway','typert','connection','profileContext'];
export function apply(ctx, config) {
  config = resolveBridgeConfig(config, ctx.profileContext.dir);
  let bridge; let disposed = false;
  ctx.effect(() => () => {disposed=true;return bridge?.close();}, 'mobile bridge lifetime');
  registerDesktopSettings(ctx,()=>bridge);
  return startBridge(createHarnessAdapter(ctx),config).then(async instance => {
    bridge=instance;
    if(disposed) await bridge.close();
    else ctx.logger?.info?.(`DSH Mobile 已监听端口 ${bridge.port}；设备 ${config.deviceId}。配对密钥不会写入日志。`);
  });
}
