import http from 'node:http';
import { hostname } from 'node:os';
import WebSocket, { WebSocketServer } from 'ws';
import { MAX_FRAME, PROTOCOL_VERSION, allowedOrigin, digest, parseFrame, secretEqual, send } from './protocol.mjs';
import { createClientChannel } from './adapter.mjs';
import {createPairing,isLocalPairRequest,pairingPage} from './pairing.mjs';
import {createHybridHost} from './hybrid-host.mjs';

export async function startBridge(adapter, config) {
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(config.deviceId) || typeof config.token !== 'string' || config.token.length < 24) throw new Error('deviceId 需要 3–80 个字母数字，配对密钥至少 24 位');
  if(config.relayUrl && (typeof config.relaySecret!=='string'||config.relaySecret.length<32))throw new Error('启用公网中继需要至少 32 位 relaySecret');
  const origins = config.allowedOrigins ?? ['https://localhost','capacitor://localhost','http://localhost'];
  const clients = new Set(); const channels = new Map();let authenticatedCount=0;
  let pairing;
  const server = http.createServer(async(req,res) => {
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
    if(req.url?.startsWith('/pair')){
      if(!isLocalPairRequest(req)){res.writeHead(403);res.end();return;}
      try{
        if(req.method==='GET'&&req.url==='/pair'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(pairingPage);return;}
        if(req.method==='POST'&&req.url==='/pair/code'&&req.headers['x-dsh-pairing']==='1'){
          let text='';for await(const chunk of req){text+=chunk;if(text.length>1024)throw new Error('请求过大');}
          const result=await pairing.issue(JSON.parse(text).mode);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));return;
        }
        if(req.method==='GET'&&req.url.startsWith('/pair/status?')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(pairing.status(new URL(req.url,'http://localhost').searchParams.get('id'))));return;}
      }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));return;}
      res.writeHead(404);res.end();return;
    }
    if (req.url === '/health') { res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({service:'dsh-mobile-bridge',protocol:PROTOCOL_VERSION})); }
    else { res.writeHead(404);res.end(); }
  });
  const wss = new WebSocketServer({noServer:true,maxPayload:MAX_FRAME});
  server.on('upgrade',(req,socket,head) => {
    if (req.url !== '/connect' || !allowedOrigin(req.headers.origin, origins)) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return; }
    if (clients.size >= 20) {socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws => wss.emit('connection',ws));
  });
  wss.on('connection', ws => {
    clients.add(ws);ws.mobileAlive=true;ws.on('pong',()=>{ws.mobileAlive=true;}); let authenticated = false; let channel;
    const timer = setTimeout(() => ws.close(1008,'配对超时'),5000); timer.unref();
    ws.on('error',()=>{});
    ws.on('message',raw => {
      try {
        const frame = parseFrame(raw);
        if (!authenticated) {
          if(frame.type==='pair'&&frame.deviceId===config.deviceId){const result=pairing.redeem(frame.code);if(result){send(ws,result);ws.close(1000);}else ws.close(1008,'配对码已失效，请在电脑端刷新');return;}
          if (frame.type !== 'hello' || frame.deviceId !== config.deviceId || !secretEqual(frame.token,config.token)) {ws.close(1008,'配对信息不正确');return;}
          authenticated = true;authenticatedCount++;clearTimeout(timer);
          channel = createClientChannel(adapter, frame => send(ws,frame));
          send(ws,{type:'ready',protocol:PROTOCOL_VERSION,deviceId:config.deviceId,name:config.name ?? hostname()});
        } else void channel.receive(frame);
      } catch {ws.close(1008,'无效的协议消息');}
    });
    ws.on('close',() => {clearTimeout(timer);clients.delete(ws);if(authenticated)authenticatedCount--;channel?.close();});
  });
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(config.port ?? 43821,config.host ?? '127.0.0.1',resolve);});
  const heartbeat=setInterval(()=>{for(const ws of clients){if(ws.mobileAlive===false){ws.terminate();continue;}ws.mobileAlive=false;ws.ping();}},15000);heartbeat.unref();
  pairing=createPairing(config,server.address().port);
  let relay; let retry; let stopped = false; let attempt = 0;let relayReady=false;
  const hybrid=createHybridHost(adapter,config,(clientId,body)=>!!relay&&send(relay,{type:'forward',clientId,body}));
  function connectRelay() {
    if (!config.relayUrl || stopped) return;
    const url = new URL(config.relayUrl);
    if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('公网中继必须使用 wss://');
    relay = new WebSocket(url,{maxPayload:MAX_FRAME});
    relay.on('open',() => send(relay,{type:'host',deviceId:config.deviceId,hostSecret:config.relaySecret,tokenDigest:digest(config.token),features:['p2p-v1'],name:config.name ?? hostname()}));
    relay.on('message',raw => {
      try {
        const frame = parseFrame(raw);
        if (frame.type === 'registered') {attempt=0;relayReady=true;return;}
        if(frame.type==='pair'&&typeof frame.requestId==='string'){
          const result=pairing.redeem(frame.code);
          send(relay,{type:'pair-result',requestId:frame.requestId,result:result??{type:'pair-error',message:'配对码已失效，请在电脑端刷新'}});return;
        }
        if (frame.type === 'leave') {hybrid.leave(frame.clientId);channels.get(frame.clientId)?.close();channels.delete(frame.clientId);return;}
        if (frame.type !== 'forward' || typeof frame.clientId !== 'string') return;
        if(hybrid.receive(frame.clientId,frame.body))return;
        let channel = channels.get(frame.clientId);
        if (!channel) {if (channels.size >= 20) return;channel=createClientChannel(adapter,body=>send(relay,{type:'forward',clientId:frame.clientId,body}));channels.set(frame.clientId,channel);}
        void channel.receive(frame.body);
      } catch {relay.close(1008,'无效的中继消息');}
    });
    relay.on('error',()=>{});
    relay.on('close',() => {
      relayReady=false;
      hybrid.relayLost();
      for (const channel of channels.values()) channel.close();channels.clear();
      if (!stopped) {retry=setTimeout(connectRelay, Math.min(1000*2**attempt++,15000));retry.unref();}
    });
  }
  try {connectRelay();} catch(error) {hybrid.close();clearInterval(heartbeat);await new Promise(resolve => server.close(resolve));throw error;}
  return {
    port:server.address().port,
    status(){return {deviceId:config.deviceId,name:config.name??hostname(),lanEnabled:config.host==='0.0.0.0',port:server.address()?.port??config.port,relayUrl:config.relayUrl??'',relayConfigured:!!config.relaySecret,relayConnected:relayReady,activeConnections:authenticatedCount+channels.size+hybrid.status().sessions,p2pConnections:hybrid.status().direct};},
    issuePairing:mode=>pairing.issue(mode),
    pairingStatus:id=>pairing.status(id),
    async close() {stopped=true;hybrid.close();clearInterval(heartbeat);clearTimeout(retry);pairing.clear();for(const channel of channels.values())channel.close();relay?.terminate();for(const client of clients)client.terminate();wss.close();await new Promise(resolve=>server.close(resolve));}
  };
}
