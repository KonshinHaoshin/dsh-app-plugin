import{record}from'./protocol.mjs';
export function validateSettings(value){
  if(!record(value)||typeof value.name!=='string'||!value.name.trim()||value.name.length>80||typeof value.lanEnabled!=='boolean'||!Number.isInteger(value.port)||value.port<1024||value.port>65535||typeof value.relayUrl!=='string')throw new Error('请检查设备名称、端口和连接方式');
  let relayUrl='';
  if(value.relayUrl.trim()){
    let url;try{url=new URL(value.relayUrl.trim());}catch{throw new Error('公网服务器地址无效');}
    if(!['https:','wss:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('公网服务器需使用 HTTPS / WSS，且不能包含认证参数');
    url.protocol='wss:';url.pathname='/connect';relayUrl=url.href;
  }
  const patch={name:value.name.trim(),host:value.lanEnabled?'0.0.0.0':'127.0.0.1',port:value.port,relayUrl};
  if(value.relaySecret!==undefined&&value.relaySecret!==''){
    if(typeof value.relaySecret!=='string'||value.relaySecret.length<32||value.relaySecret.length>1024)throw new Error('中继认证密钥至少 32 位');
    patch.relaySecret=value.relaySecret;
  }
  return patch;
}
export function registerDesktopSettings(ctx,getBridge){
  return ctx.connection.fetch.register({path:'/api/mobile-bridge',methods:['POST'],requestBody:'buffered',async fetch(request){
    try{
      const body=await request.json();if(!record(body))throw new Error('请求无效');
      const bridge=getBridge();if(!bridge)throw new Error('手机连接服务正在启动');
      let value;
      switch(body.action){
        case 'status':value={...bridge.status(),editable:!!ctx.get('configEditor')};break;
        case 'pair':if(!['public','lan'].includes(body.mode))throw new Error('连接方式无效');value=await bridge.issuePairing(body.mode);break;
        case 'pairStatus':if(typeof body.id!=='string'||!/^[a-f0-9]{64}$/.test(body.id))throw new Error('配对状态请求无效');value=bridge.pairingStatus(body.id);break;
        case 'save':{
          const patch=validateSettings(body.value);const editor=ctx.get('configEditor');if(!editor)throw new Error('当前 DSH 不支持配置保存');
          const entries=editor.entries().filter(e=>e.options.name==='@shelterhub/dsh-mobile-bridge');
          const entry=entries.find(e=>e.fiber===ctx.fiber)??(entries.length===1?entries[0]:undefined);
          if(!entry)throw new Error('无法定位此插件的配置，请重新打开设置');
          await editor.edit(entry,raw=>({...raw,...patch}));value={saved:true};break;
        }
        default:throw new Error('不支持的设置操作');
      }
      return Response.json({ok:true,value},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({ok:false,error:error.message??'操作失败'},{status:400,headers:{'Cache-Control':'no-store'}});}
  }});
}
