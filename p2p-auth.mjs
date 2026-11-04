import {createHmac,timingSafeEqual} from 'node:crypto';
export const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
export const authText=(...parts)=>['dsh-p2p-v1',...parts].join('\n');
export const proof=(token,...parts)=>createHmac('sha256',token).update(authText(...parts)).digest('hex');
export function verify(token,signature,...parts){return typeof signature==='string'&&/^[a-f0-9]{64}$/.test(signature)&&timingSafeEqual(Buffer.from(signature),Buffer.from(proof(token,...parts)));}
