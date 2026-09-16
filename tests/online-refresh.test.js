'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const source=file=>fs.readFileSync(require.resolve('../'+file),'utf8');

function pwa(){
  const events={},documentEvents={},workerEvents={},intervals=[];
  const control={},dialog={addEventListener(){}};
  let updates=0,reloads=0,editing=false;
  const registration={update:async()=>{updates++;},addEventListener(){}};
  const context={
    actions:{},dirty:false,saving:null,portDraftDirty:false,
    location:{protocol:'https:',reload(){reloads++;}},
    navigator:{onLine:true,serviceWorker:{controller:{},addEventListener:(k,f)=>workerEvents[k]=f,register:async()=>registration}},
    window:{isSecureContext:true,matchMedia:()=>({matches:false}),addEventListener:(k,f)=>events[k]=f},
    document:{visibilityState:'visible',querySelector:s=>s==='[data-action="install-app"]'?control:s==='#dialog'?dialog:editing?{}:null,addEventListener:(k,f)=>documentEvents[k]=f},
    setTimeout(){},setInterval:f=>intervals.push(f),toast(){},modal(){},
  };
  vm.createContext(context);vm.runInContext(source('src/client/js/pwa.js'),context);
  return {context,events,documentEvents,workerEvents,intervals,control,setEditing:v=>editing=v,updates:()=>updates,reloads:()=>reloads};
}

test('checks for app updates without cloud login on startup, reconnect and resume',async()=>{
  const app=pwa();await tick();assert.equal(app.updates(),1);
  await app.events.online();await app.events.focus();await app.events.pageshow();
  app.documentEvents.visibilitychange();await tick();assert.equal(app.updates(),5);
  await app.intervals[0]();assert.equal(app.updates(),5,'periodic checks are throttled');
  app.context.navigator.onLine=false;await app.events.online();assert.equal(app.updates(),5);
  app.context.navigator.onLine=true;app.context.document.visibilityState='hidden';
  await app.events.focus();assert.equal(app.updates(),5);
});

test('activated updates wait for unsaved work and forms, then reload once',async()=>{
  const app=pwa();await tick();app.context.dirty=true;
  app.workerEvents.controllerchange();assert.equal(app.reloads(),0);
  assert.match(app.control.textContent,/Թարմացնել/);
  app.context.dirty=false;app.setEditing(true);await app.events.focus();assert.equal(app.reloads(),0);
  app.setEditing(false);await app.events.focus();assert.equal(app.reloads(),1);
  await app.events.focus();assert.equal(app.reloads(),1);
});

test('manual update works after a controller change even with no waiting worker',async()=>{
  const app=pwa();await tick();app.context.portDraftDirty=true;
  app.workerEvents.controllerchange();assert.equal(app.reloads(),0);
  await app.context.actions['install-app']();assert.equal(app.reloads(),0);
  app.context.portDraftDirty=false;
  await app.context.actions['install-app']();assert.equal(app.reloads(),1);
});

test('service worker uses the network without HTTP cache, with offline fallback',async()=>{
  const stored=new Map(),events={};let offline=false,options;
  const context={Response,URL,self:{addEventListener:(k,f)=>events[k]=f,location:{origin:'https://example.com'}},
    caches:{open:async()=>({match:async key=>stored.get(key)?.clone(),put:async(key,value)=>stored.set(key,value)})},
    fetch:async(request,opts)=>{options=opts;if(offline)throw new Error('offline');return new Response('new app');}};
  vm.createContext(context);vm.runInContext(source('src/client/sw.js'),context);
  assert.equal(await (await context.fresh('/app.js','/app.js')).text(),'new app');
  assert.equal(options.cache,'no-store');offline=true;
  assert.equal(await (await context.fresh('/app.js','/app.js')).text(),'new app');
  assert.equal((await context.fresh('/missing','/missing')).status,503);
  let intercepted=false;
  events.fetch({request:{url:'https://example.com/api/state',method:'GET'},respondWith(){intercepted=true;}});
  assert.equal(intercepted,false,'database API responses are never served from the app cache');
});

test('database refresh discards stale responses when editing or switching companies',async()=>{
  const app=source('src/client/js/app.js');
  const code=app.slice(app.indexOf('let refreshInFlight=false;'),app.lastIndexOf('\ninit();'));
  const events={},intervals=[];let resolveState,requests=0,renders=0;
  const context={modeBusy:false,ready:true,companyBusy:false,dirty:false,saving:null,conflict:false,portDraftDirty:false,activeCompanyId:'one',storageMode:'shared',revision:1,state:{old:true},
    $:()=>({open:false}),document:{visibilityState:'visible',querySelector:()=>null,addEventListener(){}},window:{addEventListener:(k,f)=>events[k]=f},
    api:async url=>{requests++;return url==='/api/revision'?{revision:2}:new Promise(resolve=>resolveState=resolve);},
    D:{validate(){}},status(){},tr:x=>x,render(){renders++;},refreshCompanies:async()=>{},setInterval:f=>intervals.push(f)};
  vm.createContext(context);vm.runInContext(code,context);
  const first=events.online();await tick();
  await events.focus();assert.equal(requests,2,'overlapping requests are skipped');
  context.dirty=true;resolveState({state:{new:true},revision:2});await first;
  assert.equal(renders,0);assert.equal(context.revision,1);
  context.dirty=false;const second=events.pageshow();await tick();
  context.activeCompanyId='two';resolveState({state:{wrongCompany:true},revision:2});await second;
  assert.equal(renders,0);
  const third=events.online();await tick();resolveState({state:{current:true},revision:2});await third;
  assert.equal(renders,1);assert.equal(context.revision,2);assert.equal(context.state.current,true);
});
