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
 const a=createHarnessAdapter(ctx);const signal=new AbortController().signal;
 await a.call('session/list',{},signal);assert.deepEqual(request.args,{_request:{}});assert.equal(request.peer,operator);assert.equal(request.signal,signal);
 await a.call('session/prompt',{mode:'queue'},signal);assert.deepEqual(request.args,{request:{mode:'queue'}});
 await assert.rejects(()=>a.call('credentials/read',{},signal));
});
