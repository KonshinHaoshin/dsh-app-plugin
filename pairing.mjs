import {randomBytes} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import QRCode from 'qrcode';
import {digest} from './protocol.mjs';

export function createPairing(config, port, now = Date.now) {
  const codes = new Map();
  function prune(){for(const [id,entry] of codes)if(entry.expiresAt<=now())codes.delete(id);}
  return {
    async issue(mode='public'){
      prune();
      if(codes.size>=20)codes.delete(codes.keys().next().value);
      let url;
      if(mode==='public'){
        if(!config.relayUrl)throw new Error('当前电脑未启用公网连接，请选择局域网');
        url=new URL(config.relayUrl);url.protocol=url.protocol==='wss:'?'https:':'http:';url.pathname='/';
      }else if(mode==='lan'){
        if(config.host!=='0.0.0.0')throw new Error('当前电脑未启用局域网连接');
        const ip=config.lanAddress??Object.values(networkInterfaces()).flat().find(n=>n&&!n.internal&&n.family==='IPv4'&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address))?.address;
        if(!ip)throw new Error('未找到局域网地址，请使用公网连接');
        url=new URL(`http://${ip}:${port}/`);
      }else throw new Error('连接方式无效');
      const code=randomBytes(32).toString('base64url');const id=digest(code);const expiresAt=now()+5*60*1000;
      const payload={v:1,url:url.origin,mode,deviceId:config.deviceId,name:config.name??config.deviceId,code,expiresAt};
      // URL fragment avoids sending the one-time credential to web access logs.
      const uri='https://dshapi.shelterhub.moe/#pair='+Buffer.from(JSON.stringify(payload)).toString('base64url');
      const svg=await QRCode.toString(uri,{type:'svg',errorCorrectionLevel:'M',margin:3,width:300,color:{dark:'#202633',light:'#ffffff'}});
      codes.set(id,{expiresAt,used:false});
      return {uri,svg,expiresAt,id};
    },
    redeem(code){
      if(typeof code!=='string'||code.length<24||code.length>128)return null;
      prune();const entry=codes.get(digest(code));
      if(!entry||entry.used)return null;
      entry.used=true;
      return {type:'paired',protocol:1,deviceId:config.deviceId,name:config.name??config.deviceId,token:config.token};
    },
    status(id){prune();const entry=codes.get(id);return entry?{used:entry.used,expiresAt:entry.expiresAt}:{expired:true};},
    clear(){codes.clear();}
  };
}

export function isLocalPairRequest(req){
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return false;
  try{
    const origin=new URL('http://'+req.headers.host);
    if(!['localhost','127.0.0.1','[::1]'].includes(origin.hostname))return false;
    if(req.headers['sec-fetch-site']==='cross-site')return false;
    return !req.headers.origin||req.headers.origin===origin.origin;
  }catch{return false;}
}

export const pairingPage=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DSH · 手机配对</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7f9fc;color:#262626;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:380px;max-width:100%;background:#fff;border:1px solid #e8ecf2;border-radius:18px;padding:28px;text-align:center}h1{font-size:21px;font-weight:600;margin:0 0 5px}p{color:#737b8b;font-size:13px;margin:0 0 20px}.modes{display:flex;gap:4px;padding:4px;background:#f5f7fc;border-radius:9px}.modes button{flex:1;background:none;color:#6b7280}.modes button.active{background:white;color:#4d6bfe;box-shadow:0 1px 5px #00000008}button{font:inherit;border:0;border-radius:7px;min-height:44px;padding:8px 14px;cursor:pointer}#qr{min-height:300px;display:grid;place-items:center;margin:14px 0}#qr svg{width:100%;max-width:300px;height:auto}#state{font-size:12px;color:#6b7280;min-height:24px}#refresh{background:#4d6bfe;color:#fff;margin-top:16px;width:100%}#copy{background:none;color:#4d6bfe;font-size:12px;margin-top:5px}button:focus-visible{outline:2px solid #4d6bfe;outline-offset:3px}button:disabled{opacity:.5;cursor:default}.error{color:#b43d36!important}
</style></head><body><main><h1>连接手机</h1><p>打开手机 DSH，扫一扫</p><div class="modes"><button id="public" class="active">公网</button><button id="lan">局域网</button></div><div id="qr">正在生成配对码…</div><div id="state" role="status"></div><button id="refresh">刷新配对码</button><button id="copy">复制配对链接</button></main><script>
let mode='public',current,loading=false;const el=id=>document.getElementById(id);
async function refresh(){if(loading)return;loading=true;el('refresh').disabled=true;el('state').className='';try{const response=await fetch('/pair/code',{method:'POST',headers:{'Content-Type':'application/json','X-DSH-Pairing':'1'},body:JSON.stringify({mode})});const value=await response.json();if(!response.ok)throw Error(value.error);current=value;el('qr').innerHTML=value.svg;el('state').textContent='配对码 5 分钟内有效，仅可使用一次';}catch(e){el('qr').textContent='无法生成配对码';el('state').className='error';el('state').textContent=e.message;}finally{loading=false;el('refresh').disabled=false;}}
for(const value of ['public','lan'])el(value).onclick=()=>{mode=value;for(const other of ['public','lan'])el(other).classList.toggle('active',other===mode);refresh();};
el('refresh').onclick=refresh;el('copy').onclick=async()=>{if(!current)return;try{await navigator.clipboard.writeText(current.uri);el('state').textContent='配对链接已复制';}catch{el('state').textContent='无法访问剪贴板，请直接扫码';}};
setInterval(async()=>{if(!current)return;try{const response=await fetch('/pair/status?id='+current.id);const status=await response.json();if(status.used){el('state').textContent='已配对';el('qr').style.opacity='.2';}else if(status.expired||Date.now()>current.expiresAt){el('state').textContent='配对码已过期，请刷新';el('qr').style.opacity='.2';}else el('qr').style.opacity='1';}catch{}},2000);refresh();
</script></body></html>`;
