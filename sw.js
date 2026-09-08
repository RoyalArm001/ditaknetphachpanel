'use strict';
// Always use the server's current code and data. No company data is cached.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.mode!=='navigate')return;
  event.respondWith(fetch(event.request).catch(()=>new Response(
    '<!doctype html><html lang="hy"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ditaknet փաչ պանել</title><body><h1>Ditaknet փաչ պանել</h1><p>Սերվերի հետ կապ չկա։ Միացեք աշխատանքային ցանցին և համոզվեք, որ սերվերը միացված է։</p><a href="/">Կրկին փորձել</a><p>Ditaknet-ի մաս · © Ditaknet</p></body></html>',
    {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
