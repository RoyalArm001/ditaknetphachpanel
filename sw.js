'use strict';
const CACHE='ditaknet-shell-v3';
const SHELL=['/','/index.html','/styles.css','/domain.js','/personal-store.js','/app.js','/rack3d.js','/pwa.js','/manifest.webmanifest','/icon-192.png','/icon-512.png','/exceljs.min.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('ditaknet-shell-')&&name!==CACHE)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(async()=>await (await caches.open(CACHE)).match('/index.html')||new Response('Կապ չկա։ Առաջին բացման համար անհրաժեշտ է ինտերնետ։',{status:503})));return;
  }
  if(SHELL.includes(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(url.pathname)||fetch(event.request)));
});
