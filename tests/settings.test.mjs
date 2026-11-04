import test from'node:test';import assert from'node:assert/strict';import{validateSettings,registerDesktopSettings}from'../settings.mjs';
const valid={name:'我的 DSH',lanEnabled:true,port:43821,relayUrl:'https://dshapi.shelterhub.moe',relaySecret:''};
test('desktop settings validate public fields and retain existing secrets when password is blank',()=>{
 const result=validateSettings({...valid,token:'attempt-to-replace-token'});assert.equal(result.relayUrl,'wss://dshapi.shelterhub.moe/connect');assert.equal(result.host,'0.0.0.0');assert.equal('relaySecret'in result,false);assert.equal('token'in result,false);
 for(const patch of [{port:80},{name:''},{relayUrl:'http://example.com'},{relayUrl:'wss://u:secret@example.com'},{relaySecret:'short'}])assert.throws(()=>validateSettings({...valid,...patch}));
});
test('desktop API uses the DSH config editor, exposes safe status, and preserves unrelated configuration',async()=>{
 let route;let saved;const entry={options:{name:'@shelterhub/dsh-mobile-bridge'},fiber:{}};
 const editor={entries:()=>[entry],async edit(e,change){assert.equal(e,entry);saved=change({token:'existing-pairing-key',relaySecret:'existing-relay-key',unrelated:'preserved'});}};
 const ctx={fiber:{},get:key=>key==='configEditor'?editor:undefined,connection:{fetch:{register:value=>{route=value;return()=>{};}}}};
 registerDesktopSettings(ctx,()=>({status:()=>({name:'test',relayConfigured:true}),issuePairing:async()=>({uri:'temporary',svg:'<svg/>'}),pairingStatus:()=>({used:false})}));
 async function call(body){return(await route.fetch(new Request('http://localhost/api/mobile-bridge',{method:'POST',body:JSON.stringify(body)}))).json();}
 assert.deepEqual((await call({action:'status'})).value,{name:'test',relayConfigured:true,editable:true});
 assert.equal((await call({action:'save',value:valid})).ok,true);assert.equal(saved.token,'existing-pairing-key');assert.equal(saved.relaySecret,'existing-relay-key');assert.equal(saved.unrelated,'preserved');
 assert.equal((await call({action:'save',value:{...valid,port:1}})).ok,false);assert.equal((await call({action:'unknown'})).ok,false);
});
