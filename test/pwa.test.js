const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('install prompt, fallback guidance and secure worker registration',async()=>{
  const listeners={},actions={},registrations=[];let body='',prompts=0;
  const context={window:{isSecureContext:true,matchMedia:()=>({matches:false}),addEventListener:(k,f)=>listeners[k]=f},navigator:{serviceWorker:{register:async(...args)=>registrations.push(args)}},document:{querySelector:()=>({})},location:{protocol:'https:'},actions,toast:()=>{},modal:(title,text)=>{body=text;}};
  vm.runInNewContext(fs.readFileSync('pwa.js','utf8'),context);
  assert.equal(registrations[0][0],'/sw.js');
  await actions['install-app']();assert.match(body,/Safari/);
  let prevented=false;listeners.beforeinstallprompt({preventDefault(){prevented=true;},async prompt(){prompts++;},userChoice:Promise.resolve({outcome:'accepted'})});
  await actions['install-app']();assert.equal(prompts,1);assert.equal(prevented,true);
  context.window.isSecureContext=false;await actions['install-app']();assert.match(body,/HTTPS/);
});
test('offline navigation fallback leaves API traffic and data uncached',async()=>{
  const listeners={};
  vm.runInNewContext(fs.readFileSync('sw.js','utf8'),{self:{location:{origin:'https://app.test'},addEventListener:(k,f)=>listeners[k]=f},caches:{open:async()=>({match:async()=>new Response('Ditaknet cached shell')})},fetch:async()=>{throw Error('offline');},Response,URL});
  let response;listeners.fetch({request:{mode:'navigate',method:'GET',url:'https://app.test/'},respondWith:p=>response=p});
  const offline=await response;assert.equal(offline.status,200);assert.match(await offline.text(),/Ditaknet/);
  listeners.fetch({request:{mode:'cors',method:'GET',url:'https://app.test/api/state'},respondWith:()=>assert.fail('API intercepted')});
});
