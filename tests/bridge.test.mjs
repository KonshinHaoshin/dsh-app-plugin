import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket from 'ws';
import {randomBytes} from 'node:crypto';
import {startBridge} from '../host.mjs';
import {createClientChannel,createHarnessAdapter} from '../adapter.mjs';
import {digest} from '../protocol.mjs';

const token='test-only-pairing-key-'+randomBytes(16).toString('hex');
function inbox(ws){const frames=[];const waits=[];ws.on('message',raw=>{const f=JSON.parse(raw);if(waits.length)waits.shift()(f);else frames.push(f);});return async()=>frames.length?frames.shift():await Promise.race([new Promise(r=>waits.push(r)),new Promise((_,reject)=>setTimeout(()=>reject(new Error('frame timeout')),3000).unref())]);}
async function connect(port,hello,options){const ws=new WebSocket(`ws://127.0.0.1:${port}/connect`,options);const next=inbox(ws);await once(ws,'open');ws.send(JSON.stringify(hello));return {ws,next};}
const hello={type:'hello',deviceId:'test-machine',token};
const adapter={async call(endpoint,params){return {endpoint,params};},async *stream(endpoint,params,signal){yield {type:'snapshot',records:[],cursor:-1};await new Promise(r=>signal.addEventListener('abort',r,{once:true}));}};

test('LAN rejects wrong pairing, admits correct pairing, and relays an RPC',async t=>{
 const bridge=await startBridge(adapter,{deviceId:hello.deviceId,token,port:0});t.after(()=>bridge.close());
 const wrong=await connect(bridge.port,{...hello,token:'incorrect'});const [code]=await once(wrong.ws,'close');assert.equal(code,1008);
 const {ws,next}=await connect(bridge.port,hello);t.after(()=>ws.terminate());assert.equal((await next()).type,'ready');
 ws.send(JSON.stringify({type:'call',id:'1',endpoint:'session/list',params:{}}));assert.deepEqual(await next(),{type:'result',id:'1',value:{endpoint:'session/list',params:{}}});
 ws.send(JSON.stringify({type:'call',id:'2',endpoint:'pluginManager/install',params:{}}));assert.equal((await next()).error.code,'invalid');
});
test('browser origins require explicit allowlist even with valid token',async t=>{
 const bridge=await startBridge(adapter,{deviceId:hello.deviceId,token,port:0});t.after(()=>bridge.close());
 const ws=new WebSocket(`ws://127.0.0.1:${bridge.port}/connect`,{origin:'https://evil.example'});
 const [err]=await once(ws,'error');assert.match(err.message,/403/);
});
test('channel isolates cancellation and blocks arbitrary administrative endpoints',async()=>{
 let aborted=false;const frames=[];
 const channel=createClientChannel({async *stream(e,p,signal){yield 'started';await new Promise(r=>signal.addEventListener('abort',()=>{aborted=true;r();},{once:true}));}},f=>{frames.push(f);return true;});
 const work=channel.receive({type:'open',id:'a',endpoint:'$events',params:{}});
 await new Promise(r=>setImmediate(r));await channel.receive({type:'cancel',id:'unknown'});assert.equal(aborted,false);
 await channel.receive({type:'call',id:'blocked',endpoint:'credentials/read',params:{}});assert.equal(frames.at(-1).error.code,'invalid');
 channel.close();await work;assert.equal(aborted,true);
});
test('DSH adapter derives the real named arguments and retains host validation',async()=>{
 let request;const operator={};const ctx={connection:{operator},typert:{local:{get:endpoint=>({parameters:endpoint==='session/modelCatalog'?[]:[{wire:endpoint==='session/list'?'_request':'request',source:'json'}]})}},typertGateway:{async invoke(req){request=req;return 'ok';},wireStream:{open(){}},dispatchRpc:async()=>({ok:true,value:undefined})}};
 const a=(await createHarnessAdapter(ctx)).createClient();const signal=new AbortController().signal;
 await a.call('session/list',{},signal);assert.deepEqual(request.args,{_request:{}});assert.equal(request.peer,operator);assert.equal(request.signal,signal);
 await a.call('session/prompt',{mode:'queue'},signal);assert.deepEqual(request.args,{request:{mode:'queue'}});
 await assert.rejects(()=>a.call('credentials/read',{},signal));
});

test('rc.5 channels supply independent owner Peers to RPCs, streams and event answers',async()=>{
 const peers=[];const seen=[];
 class Peer {
  constructor(ctx,options){assert.equal(ctx,context);this.principal=options.principal;this.controller=new AbortController();this.signal=this.controller.signal;peers.push(this);}
  async dispose(){this.disposed=(this.disposed??0)+1;this.controller.abort();}
 }
 const verify=peer=>{assert.equal(peer.principal.kind,'owner');assert.equal(peer.signal.aborted,false);seen.push(peer);};
 const context={connection:{createPeer:options=>new Peer(context,options)},typert:{local:{get:()=>({parameters:[]})}},typertGateway:{
  invoke:async request=>{verify(request.peer);return 'ok';},
  dispatchRpc:async(e,p,s,peer)=>{verify(peer);return {ok:true};},
  wireStream:{open:async function*(e,p,u,peer,signal){verify(peer);yield {type:'ready'};await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));}}
 }};
 const adapter=createHarnessAdapter(context);
 assert.equal(peers.length,0);
 const first=createClientChannel(adapter,()=>true);const second=createClientChannel(adapter,()=>true);
 await first.receive({type:'call',id:'list',endpoint:'session/list',params:{}});
 await second.receive({type:'call',id:'catalog',endpoint:'session/modelCatalog',params:{}});
 await first.receive({type:'call',id:'answer',endpoint:'$events/result',params:{}});
 const stream=first.receive({type:'open',id:'events',endpoint:'$events',params:{}});
 await new Promise(r=>setImmediate(r));
 assert.deepEqual(seen,[peers[0],peers[1],peers[0],peers[0]]);
 first.close();first.close();await stream;
 assert.equal(peers[0].disposed,1);assert.equal(peers[0].signal.aborted,true);assert.equal(peers[1].signal.aborted,false);
 await second.receive({type:'call',id:'still-live',endpoint:'session/list',params:{}});
 second.close();assert.equal(peers[1].signal.aborted,true);
});

test('rc.2 retains the existing shared operator without disposing it',async()=>{
 const operator={};const context={connection:{operator},typertGateway:{invoke:async()=>{},wireStream:{open(){}},dispatchRpc:async()=>{}},typert:{local:{get:()=>({parameters:[]})}}};
 const adapter=createHarnessAdapter(context);
 const channel=createClientChannel(adapter,()=>true);await channel.receive({type:'call',id:'models',endpoint:'session/modelCatalog',params:{}});channel.close();
});

test('uploads resolve the receiving Agent through Gateway and heartbeat needs no request id',async()=>{
 const operator={};let request;
 const context={connection:{operator},typert:{local:{get:()=>({parameters:[{wire:'agentId',source:'lookup',lookup:'agent'},{wire:'request',source:'json'}]})}},typertGateway:{invoke:async r=>{request=r;return {receiptId:'receipt'};},wireStream:{open(){}},dispatchRpc:async()=>{}}};
 const frames=[];const channel=createClientChannel(createHarnessAdapter(context),f=>{frames.push(f);return true;});
 await channel.receive({type:'ping'});assert.deepEqual(frames,[{type:'pong'}]);
 await channel.receive({type:'call',id:'upload',endpoint:'fileUploads/upload',params:{sessionId:'test-session',data:'aGk=',name:'notes.txt'}});
 assert.deepEqual(request.args,{agentId:'test-session',request:{data:'aGk=',name:'notes.txt'}});assert.equal(request.peer,operator);assert.equal(frames.at(-1).value.receiptId,'receipt');
 await channel.receive({type:'call',id:'bad',endpoint:'fileUploads/upload',params:{sessionId:'test-session',data:'aGk='}});assert.equal(frames.at(-1).type,'error');channel.close();
});
