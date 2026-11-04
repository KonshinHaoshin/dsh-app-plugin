import test from 'node:test';import assert from 'node:assert/strict';
import {ReliablePipe} from '../reliable.mjs';import {RtcWire} from '../rtc-wire.mjs';import {proof,verify} from '../p2p-auth.mjs';
test('path failure, duplicated packets and cross-path reordering never redispatch commands',()=>{
 const aFrames=[],bFrames=[],received=[],responses=[];const fail=()=>assert.fail('unexpected transport failure');
 const a=new ReliablePipe('session','epoch',{relay:s=>{aFrames.push(s);return true;},deliver:b=>responses.push(b),fatal:fail});
 const b=new ReliablePipe('session','epoch',{relay:s=>{bFrames.push(s);return true;},deliver:body=>{received.push(body);b.send({type:'result',id:body.id});},fatal:fail});
 a.send({type:'call',id:'write-1'});a.send({type:'call',id:'write-2'});
 b.receive(aFrames[1]);b.receive(aFrames[0]);b.receive(aFrames[0]);assert.equal(received.length,2);
 // Simulate a direct path failing after execution but before the result/ACK arrives.
 a.setDirect(s=>{aFrames.push(s);return true;});a.setDirect(null);for(const raw of [...aFrames])b.receive(raw);
 for(const raw of [...bFrames])a.receive(raw);assert.equal(received.length,2);assert.equal(responses.length,2);assert.equal(a.pending.size,0);
});
test('old epochs and signed descriptions cannot be substituted into a new session',()=>{
 let count=0;const p=new ReliablePipe('session','new',{relay:()=>true,deliver:()=>count++,fatal:()=>assert.fail()});p.receive(JSON.stringify({type:'p2p-packet',session:'session',epoch:'old',seq:1,ack:0,body:{type:'call'}}));assert.equal(count,0);
 const token='test-only-high-entropy-pairing-token';const sig=proof(token,'signal','session','epoch','attempt','host','answer','sdp');assert(verify(token,sig,'signal','session','epoch','attempt','host','answer','sdp'));assert(!verify(token,sig,'signal','other','epoch','attempt','host','answer','sdp'));assert(!verify(token,sig,'signal','session','epoch','attempt','phone','answer','sdp'));
});
test('large UTF-8 attachment frames survive bounded binary fragmentation',()=>{
 const frames=[],messages=[];const a=new RtcWire({readyState:'open',bufferedAmount:0,send:b=>frames.push(b)},()=>{},()=>assert.fail());const b=new RtcWire({},raw=>messages.push(raw),()=>assert.fail());
 const text=JSON.stringify({type:'attachment',data:'图片🧩'.repeat(200000)});assert(a.send(text));for(const raw of frames.reverse())b.accept(raw);assert.deepEqual(messages,[text]);assert.equal(b.incoming.size,0);
});
test('oversized or invalid transport input closes its session',()=>{
 let failed=0;const p=new ReliablePipe('s','e',{relay:()=>true,deliver:()=>{},fatal:()=>failed++});p.receive(JSON.stringify({type:'p2p-ack',session:'s',epoch:'e',ack:2}));assert.equal(failed,1);assert(p.closed);
});
