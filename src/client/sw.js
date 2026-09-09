'use strict';
const CACHE='ditaknet-shell-v4-__BUILD_ID__';
const SHELL=['/release.json','/open-local.js','/assets/DejaVuSans.ttf','/','/locales.js','/i18n.js','/index.html','/styles.css','/theme.css','/theme.js','/domain.js','/personal-store.js','/drive-store.js','/app.js','/rack3d.js','/pwa.js','/manifest.webmanifest','/icon-192.png','/icon-512.png','/favicon.ico','/exceljs.min.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('ditaknet-shell-')&&name!==CACHE)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
async function fresh(request,key){
  const cache=await caches.open(CACHE);
  try{
    const response=await fetch(request);
    if(response.ok){try{await cache.put(key,response.clone());}catch{}return response;}
    if(response.status<500)return response;
    return await cache.match(key)||response;
  }catch{
    return await cache.match(key)||new Response('Առաջին բացման համար անհրաժեշտ է ինտերնետ։',{status:503});
  }
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'){event.respondWith(fresh(event.request,'/index.html'));return;}
  if(SHELL.includes(url.pathname))event.respondWith(fresh(event.request,url.pathname));
});
