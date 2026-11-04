import{build}from'esbuild';import{writeFile}from'node:fs/promises';
const result=await build({entryPoints:['client-entry.cjs'],bundle:true,write:false,format:'cjs',platform:'browser',target:'es2020',external:['react'],minify:false,legalComments:'none'});
const body=result.outputFiles[0].text;
if(!/module\.exports\s*=\s*\{\s*apply\s*,\s*inject\s*\}/.test(body))throw new Error('Client exports must use the DSH plain CJS contract');
await writeFile('client.js',`window.__ModuleLoader__.load({id:"@shelterhub/dsh-mobile-bridge",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${body}\nreturn module.exports;}});\n`);
console.log('DSH desktop settings client built');
