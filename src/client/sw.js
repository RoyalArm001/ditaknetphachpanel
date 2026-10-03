'use strict';
const CACHE='ditaknet-shell-v5-__BUILD_ID__';
const SHELL=['/share.html','/share-view.js','/share.css','/maps.css','/maps.js','/handover-pdf.js','/pdfkit.js','/pdfjs/pdf.mjs','/pdfjs/pdf.worker.mjs','/release.json','/open-local.js','/assets/DejaVuSans.ttf','/','/locales.js','/i18n.js','/index.html','/styles.css','/theme.css','/theme.js','/merge-state.js','/domain.js','/personal-store.js','/project-file.js','/live.js','/app-reset.js','/app.js','/rack3d.js','/pwa.js','/manifest.webmanifest','/icon-192.png','/icon-512.png','/favicon.ico','/exceljs.min.js'];
async function digest(response){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await response.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function installSections(){
  const response=await fetch('/asset-manifest.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Update manifest unavailable');
  const manifest=await response.json(),cache=await caches.open(CACHE);
  const oldNames=(await caches.keys()).filter(name=>name.startsWith('ditaknet-shell-')&&name!==CACHE).reverse();
  const oldCaches=await Promise.all(oldNames.map(name=>caches.open(name)));
  for(const url of SHELL){
    const source=url==='/'?'/index.html':url,expected=manifest.files[source]?.sha256;
    if(!/^[a-f0-9]{64}$/.test(expected||''))throw new Error('Missing update file');
    let asset;
    for(const previous of oldCaches){
      const candidate=await previous.match(url);
      if(candidate&&await digest(candidate.clone())===expected){asset=candidate;break;}
    }
    if(!asset){
      asset=await fetch(source+'?v='+expected,{cache:'no-store'});
      if(!asset.ok||await digest(asset.clone())!==expected)throw new Error('Update verification failed');
    }
    await cache.put(url,asset);
  }
  await cache.put('/asset-manifest.json',new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));
  await self.skipWaiting();
}
self.addEventListener('install',event=>event.waitUntil(installSections()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('ditaknet-shell-')&&name!==CACHE)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
async function fresh(request,key){
  const cache=await caches.open(CACHE);
  const installed=await cache.match(key);if(installed)return installed;
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response.ok){try{await cache.put(key,response.clone());}catch{}return response;}
    if(response.status<500)return response;
    return await cache.match(key)||response;
  }catch{
    return await cache.match(key)||new Response('Առաջին բացման համար անհրաժեշտ է ինտերնետ։\nAn internet connection is required to open the app for the first time.\nДля первого запуска приложения необходимо подключение к интернету.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'){event.respondWith(fresh(event.request,url.pathname==='/share.html'?'/share.html':'/index.html'));return;}
  if(SHELL.includes(url.pathname))event.respondWith(fresh(event.request,url.pathname));
});
