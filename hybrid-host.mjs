import {randomUUID} from 'node:crypto';
import {createClientChannel} from './adapter.mjs';
import {ReliablePipe} from './reliable.mjs';
import {RtcWire} from './rtc-wire.mjs';
import {uuid,proof,verify} from './p2p-auth.mjs';

const DEFAULT_ICE=[{urls:'stun:38.76.193.106:3478'},{urls:'stun:stun.cloudflare.com:3478'}];
export function createHybridHost(adapter,config,forward,createPeerConnection=async options=>new(await import('werift')).RTCPeerConnection(options)){
  const peers=new Map(),bindings=new Map();let closed=false;
  const iceServers=config.iceServers??DEFAULT_ICE;
  function destroy(peer){
    if(peer.closed)return;peer.closed=true;peers.delete(peer.session);if(peer.clientId)bindings.delete(peer.clientId);
    peer.pipe.close();peer.channel.close();dropDirect(peer);clearTimeout(peer.expire);
  }
  function relay(peer,raw){return !!peer.clientId&&forward(peer.clientId,JSON.parse(raw));}
  function dropDirect(peer){
    peer.wire?.close();peer.wire=null;peer.direct=false;peer.pipe.setDirect(null);
    clearTimeout(peer.directTimer);peer.directTimer=null;const pc=peer.pc;peer.pc=null;peer.attempt='';peer.candidates=[];if(pc)void pc.close().catch(()=>{});
    if(!peer.clientId&&!peer.expire)peer.expire=setTimeout(()=>destroy(peer),60000).unref();
  }
  function signal(peer,kind,data){
    const frame={type:'p2p-signal',session:peer.session,epoch:peer.epoch,attempt:peer.attempt,role:'host',kind,data};
    frame.proof=proof(config.token,'signal',frame.session,frame.epoch,frame.attempt,frame.role,kind,data);
    if(peer.clientId)forward(peer.clientId,frame);
  }
  async function negotiate(peer,frame){
    if(frame.role!=='phone'||!uuid(frame.attempt)||typeof frame.data!=='string'||frame.data.length>65536||!['offer','candidate'].includes(frame.kind)||!verify(config.token,frame.proof,'signal',peer.session,peer.epoch,frame.attempt,'phone',frame.kind,frame.data))return;
    if(frame.kind==='offer'){
      dropDirect(peer);peer.attempt=frame.attempt;
      const pc=await createPeerConnection({iceServers});if(peer.closed||peer.attempt!==frame.attempt){void pc.close();return;}
      peer.pc=pc;peer.directTimer=setTimeout(()=>{if(peer.pc===pc&&!peer.direct)dropDirect(peer);},15000).unref();
      pc.onicecandidate=e=>{if(peer.pc===pc&&e.candidate)signal(peer,'candidate',JSON.stringify(e.candidate.toJSON()));};
      pc.onconnectionstatechange=()=>{if(peer.pc===pc&&['failed','closed','disconnected'].includes(pc.connectionState))dropDirect(peer);};
      pc.ondatachannel=e=>{
        const dc=e.channel;if(peer.pc!==pc||dc.label!=='dsh-p2p-v1'){dc.close();return;}
        const wire=new RtcWire({get readyState(){return dc.readyState;},get bufferedAmount(){return dc.bufferedAmount;},send:data=>dc.send(Buffer.from(data))},raw=>{
          if(peer.pc!==pc)return;
          let f;try{f=JSON.parse(raw);}catch{dropDirect(peer);return;}
          if(f.type==='p2p-probe'){wire.send(JSON.stringify({type:'p2p-pong',at:f.at}));return;}
          peer.pipe.receive(raw);
        },()=>{if(peer.pc===pc)dropDirect(peer);});peer.wire=wire;
        dc.onmessage=e=>{if(typeof e.data==='string'){dropDirect(peer);return;}wire.accept(e.data);};
        dc.onopen=()=>{if(peer.pc!==pc)return;peer.direct=true;clearTimeout(peer.directTimer);clearTimeout(peer.expire);peer.expire=null;peer.pipe.setDirect(raw=>wire.send(raw));wire.send(JSON.stringify({type:'p2p-direct',session:peer.session,epoch:peer.epoch,attempt:peer.attempt}));};
        dc.onclose=()=>{if(peer.pc===pc)dropDirect(peer);};dc.onerror=()=>{if(peer.pc===pc)dropDirect(peer);};
      };
      const offer=JSON.parse(frame.data);if(offer.type!=='offer'||typeof offer.sdp!=='string')throw Error();
      await pc.setRemoteDescription(offer);if(peer.pc!==pc)return;
      for(const c of peer.candidates)await pc.addIceCandidate(c);peer.candidates=[];
      const answer=await pc.createAnswer();signal(peer,'answer',JSON.stringify({type:answer.type,sdp:answer.sdp}));
      await pc.setLocalDescription(answer);
    }else if(peer.attempt===frame.attempt){
      const candidate=JSON.parse(frame.data);
      if(peer.pc?.remoteDescription)await peer.pc.addIceCandidate(candidate);
      else if(peer.candidates.length<100)peer.candidates.push(candidate);
    }
  }
  const ticker=setInterval(()=>{for(const peer of peers.values()){peer.wire?.tick();if(Date.now()-peer.replayed>2000&&!peer.wire?.queued){peer.replayed=Date.now();peer.pipe.replay();}}},50);ticker.unref();
  return {
    receive(clientId,frame){
      if(closed||typeof frame?.type!=='string')return false;
      if(frame.type==='p2p-join'){
        if(!uuid(frame.session)||!uuid(frame.nonce)||!verify(config.token,frame.proof,'join',frame.session,frame.nonce))return true;
        let peer=peers.get(frame.session);
        if(!peer){
          if(peers.size>=20)return true;
          peer={session:frame.session,epoch:randomUUID(),clientId:null,closed:false,pc:null,direct:false,candidates:[],attempt:'',nonces:new Set(),replayed:Date.now()};
          const p=peer;
          p.pipe=new ReliablePipe(p.session,p.epoch,{relay:raw=>relay(p,raw),deliver:body=>void p.channel.receive(body),fatal:()=>{if(p.clientId)forward(p.clientId,{type:'p2p-reset',session:p.session});destroy(p);}});
          p.channel=createClientChannel(adapter,body=>p.pipe.send(body));peers.set(p.session,p);
        }
        if(peer.nonces.has(frame.nonce))return true;peer.nonces.add(frame.nonce);if(peer.nonces.size>256)peer.nonces.delete(peer.nonces.values().next().value);
        if(peer.clientId)bindings.delete(peer.clientId);peer.clientId=clientId;bindings.set(clientId,peer.session);clearTimeout(peer.expire);peer.expire=null;
        forward(clientId,{type:'p2p-joined',session:peer.session,epoch:peer.epoch,nonce:frame.nonce,iceServers,proof:proof(config.token,'joined',peer.session,peer.epoch,frame.nonce,JSON.stringify(iceServers))});
        peer.pipe.replay();return true;
      }
      if(!frame.type.startsWith('p2p-'))return false;
      const peer=peers.get(bindings.get(clientId));if(!peer||frame.session!==peer.session||frame.epoch!==peer.epoch)return true;
      if(frame.type==='p2p-signal')void negotiate(peer,frame).catch(()=>dropDirect(peer));
      else if(frame.type==='p2p-close')destroy(peer);
      else if(['p2p-packet','p2p-ack'].includes(frame.type))peer.pipe.receive(JSON.stringify(frame));
      return true;
    },
    leave(clientId){const peer=peers.get(bindings.get(clientId));bindings.delete(clientId);if(peer?.clientId===clientId){peer.clientId=null;if(!peer.direct&&!peer.expire)peer.expire=setTimeout(()=>destroy(peer),60000).unref();}},
    relayLost(){for(const id of [...bindings.keys()])this.leave(id);},
    status(){return {sessions:peers.size,direct:[...peers.values()].filter(p=>p.direct).length};},
    close(){closed=true;clearInterval(ticker);for(const peer of [...peers.values()])destroy(peer);}
  };
}
