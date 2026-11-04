import { createHash, timingSafeEqual } from 'node:crypto';
export const PROTOCOL_VERSION = 1;
export const MAX_FRAME = 8 * 1024 * 1024;
export const METHODS = new Set(['session/list','session/create','session/prompt','session/cancel','session/rename','session/fork','session/modelCatalog','session/selectModel','session/page','session/projections','workspace/create','$events/result']);
export const STREAMS = new Set(['$events','session/follow','session/control','workspace/follow']);
export const digest = value => createHash('sha256').update(value).digest('hex');
export function secretEqual(a, b) {
  return typeof a === 'string' && typeof b === 'string' && timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
}
export function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function parseFrame(raw) {
  if (Buffer.byteLength(raw) > MAX_FRAME) throw new Error('消息过大');
  const value = JSON.parse(String(raw));
  if (!record(value) || typeof value.type !== 'string') throw new Error('无效的消息');
  return value;
}
export function send(ws, frame) {
  if (ws.readyState !== 1) return false;
  const json = JSON.stringify(frame);
  if (Buffer.byteLength(json) > MAX_FRAME || ws.bufferedAmount > MAX_FRAME * 2) { ws.close(1013, '消息积压，请重新连接'); return false; }
  ws.send(json); return true;
}
export function allowedOrigin(origin, configured = []) {
  if (!origin) return true; // Native clients may omit Origin; they still must authenticate.
  return configured.includes(origin);
}
