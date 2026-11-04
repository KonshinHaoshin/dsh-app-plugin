import { METHODS, STREAMS, record } from './protocol.mjs';

// Keep version-dependent DSH calls here. rc.5 requires an explicit scoped Peer;
// rc.2 supplies the shared connection.operator instead.
export function createHarnessAdapter(ctx) {
  const gateway = ctx.typertGateway;
  if (!gateway || typeof gateway.invoke !== 'function' || typeof gateway.wireStream?.open !== 'function' || typeof gateway.dispatchRpc !== 'function') {
    throw new Error('当前 DSH 版本没有兼容的 Remote Gateway，请使用已验证的 0.2.0-rc.2 或 0.2.1-rc.5 运行时');
  }
  const scopedPeers = typeof ctx.connection.createPeer === 'function';
  const operator = ctx.connection.operator;
  if (!scopedPeers && operator === undefined) throw new Error('当前 DSH 缺少手机连接需要的 Peer 接口，请更新配套插件和 DSH');
  function argsFor(endpoint, params) {
    const descriptor = ctx.typert.local.get(endpoint);
    if (!descriptor) throw new Error(`当前 DSH 未启用 ${endpoint}`);
    const parameters = descriptor.parameters;
    if (parameters.length === 0) return {};
    if (parameters.length !== 1 || parameters[0].source !== 'json') throw new Error(`不支持的 DSH 方法签名：${endpoint}`);
    return { [parameters[0].wire]: params };
  }
  return {
    createClient() {
      // Only authenticated channels reach this factory. Each phone gets a distinct
      // owner scope, disposed on disconnect so streams and event answers cannot leak.
      const peer = scopedPeers ? ctx.connection.createPeer({principal: {kind: 'owner'}}) : operator;
      return {
        close: scopedPeers ? () => peer.dispose() : undefined,
        async call(endpoint, params, signal) {
          if (!METHODS.has(endpoint)) throw new Error('手机端未开放此操作');
          if (endpoint === '$events/result') {
            const result = await gateway.dispatchRpc(endpoint, {args: params}, signal, peer);
            if (!result.ok) throw Object.assign(new Error(result.error.message), {code: result.error.code});
            return result.value;
          }
          const [namespace, method] = endpoint.split('/');
          return gateway.invoke({namespace, method, args: argsFor(endpoint, params), signal, peer});
        },
        async stream(endpoint, params, signal) {
          if (!STREAMS.has(endpoint)) throw new Error('手机端未开放此事件流');
          return gateway.wireStream.open(endpoint, {args: endpoint === '$events' ? {} : argsFor(endpoint, params)}, empty(), peer, signal);
        }
      };
    }
  };
}

async function* empty() {}

export function createClientChannel(adapter, emit) {
  adapter = adapter.createClient?.() ?? adapter;
  const pending = new Map();
  let closed = false;
  return {
    async receive(frame) {
      if (closed || !record(frame)) return;
      if (typeof frame.id !== 'string' || frame.id.length > 128) return;
      if (frame.type === 'cancel') { pending.get(frame.id)?.abort(); return; }
      if (!['call','open'].includes(frame.type)) return;
      if (pending.has(frame.id)) return emit({type:'error',id:frame.id,error:{code:'duplicate',message:'请求标识重复'}});
      if (pending.size >= 32) return emit({type:'error',id:frame.id,error:{code:'busy',message:'并发请求过多'}});
      const allow = frame.type === 'call' ? METHODS : STREAMS;
      if (!allow.has(frame.endpoint) || !record(frame.params)) return emit({type:'error',id:frame.id,error:{code:'invalid',message:'不支持的请求'}});
      const control = new AbortController(); pending.set(frame.id, control);
      try {
        if (frame.type === 'call') {
          const value = await adapter.call(frame.endpoint, frame.params, control.signal);
          if (!control.signal.aborted && !closed) emit({type:'result',id:frame.id,value});
        } else {
          const source = await adapter.stream(frame.endpoint, frame.params, control.signal);
          for await (const value of source) {
            if (control.signal.aborted || closed) break;
            if (emit({type:'item',id:frame.id,value}) === false) { control.abort(); break; }
          }
          if (!closed) emit({type:'end',id:frame.id});
        }
      } catch (error) {
        if (!closed && !control.signal.aborted) emit({type:'error',id:frame.id,error:{code:error.code ?? 'harness/error',message:error.message ?? 'DSH 请求失败'}});
      } finally { pending.delete(frame.id); }
    },
    close() { if (closed) return; closed = true; for (const control of pending.values()) control.abort(); pending.clear(); void Promise.resolve(adapter.close?.()).catch(() => {}); }
  };
}
