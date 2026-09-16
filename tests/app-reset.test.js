'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {clearClientSession}=require('../src/server/client-session');
function storage(entries={}){
  const values=new Map(Object.entries(entries));
  return {get length(){return values.size;},key:i=>[...values.keys()][i],getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
function resetApp({offline=false,failedDatabase=false}={}){
  const requests=[];let resets=0;
  const localStorage=storage({'rackmap-workspace-choice':'account','rackmap-personal-recovery-default':'draft','rackmap-account-user-company':'cloud draft','mypatch-theme':'dark','another-app':'keep'});
  const sessionStorage=storage({'rackmap-temporary':'secret','another-app':'keep'});
  const context={localStorage,sessionStorage,crypto:{randomUUID:()=> 'reset-id'},AbortSignal,
    PersonalStore:{async reset(){if(failedDatabase)throw new Error('database unavailable');resets++;}},
    fetch:async(url,options)=>{requests.push({url,...options});if(offline)throw new Error('offline');return {ok:true};}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../src/client/js/app-reset'),'utf8'),context);
  return {context,requests,resets:()=>resets,online:()=>{offline=false;}};
}
test('reset deletes browser data and only calls the cookie-only endpoint',async()=>{
  const app=resetApp();await app.context.AppReset.reset();
  assert.equal(app.resets(),1);
  for(const key of ['rackmap-workspace-choice','rackmap-personal-recovery-default','rackmap-account-user-company','mypatch-theme','mypatch-reset-pending'])assert.equal(app.context.localStorage.getItem(key),null);
  assert.equal(app.context.sessionStorage.getItem('rackmap-temporary'),null);
  assert.equal(app.context.localStorage.getItem('another-app'),'keep');
  assert.equal(app.context.sessionStorage.getItem('another-app'),'keep');
  assert.equal(app.context.localStorage.getItem('mypatch-reset-finished'),'reset-id');
  assert.equal(app.requests.length,1);
  assert.equal(app.requests[0].url,'/api/auth/reset-device');
  assert.equal(app.requests[0].method,'POST');
  assert.equal(app.requests[0].body,'{}');
});
test('offline reset works and clears the pending session before subsequent cloud access',async()=>{
  const app=resetApp({offline:true});await app.context.AppReset.reset();
  assert.equal(app.resets(),1);
  assert.equal(app.context.localStorage.getItem('rackmap-workspace-choice'),null);
  assert.equal(app.context.localStorage.getItem('mypatch-reset-pending'),'1');
  await assert.rejects(app.context.AppReset.ensureSessionCleared());
  app.online();await app.context.AppReset.ensureSessionCleared();
  assert.equal(app.context.localStorage.getItem('mypatch-reset-pending'),null);
});
test('failed local clearing is reported without claiming completion',async()=>{
  const app=resetApp({failedDatabase:true});await assert.rejects(app.context.AppReset.reset());
  assert.equal(app.context.localStorage.getItem('mypatch-reset-finished'),null);
  assert.equal(app.context.localStorage.getItem('rackmap-personal-recovery-default'),'draft');
  assert.equal(app.requests.length,0);
});
test('blocked browser storage does not break ordinary cloud requests',async()=>{
  const app=resetApp();app.context.localStorage.getItem=()=>{throw new Error('storage blocked');};
  await app.context.AppReset.ensureSessionCleared();assert.equal(app.requests.length,0);
});
test('session reset expires only browser cookies, without requiring authentication or a database',()=>{
  const request={url:'/api/auth/reset-device',method:'POST',headers:{host:'patch.example',origin:'https://patch.example','content-type':'application/json'}};
  const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};
  assert.equal(clearClientSession(request,res),true);assert.equal(res.status,200);
  const cookies=res.headers['Set-Cookie'];assert.equal(cookies.length,6);
  for(const name of ['rackmap_access','rackmap_refresh','rackmap_pin','mypatch_access','mypatch_refresh','mypatch_recovery'])assert.ok(cookies.some(cookie=>cookie.startsWith(name+'=;')&&cookie.includes('Max-Age=0')&&cookie.includes('Path=/api')&&cookie.includes('Secure')));
  assert.equal(res.headers['Cache-Control'],'no-store');
  assert.equal(clearClientSession({...request,url:'/api/state'},res),false);
  for(const [method,headers,expected] of [['GET',request.headers,405],['POST',{...request.headers,origin:'https://attacker.example'},403],['POST',{...request.headers,'content-type':'text/plain'},415]]){
    const response={...res};clearClientSession({...request,method,headers},response);assert.equal(response.status,expected);assert.equal(response.headers['Set-Cookie'],undefined);
  }
});

test('local database reset clears companies and history within one transaction',async()=>{
  const cleared=[],data={companies:['company'],history:['snapshot']};
  const db={transaction(names,mode){
    assert.deepEqual(Array.from(names),['companies','history']);assert.equal(mode,'readwrite');
    const tx={objectStore:name=>({clear(){
      const request={};setImmediate(()=>{cleared.push(name);data[name]=[];request.onsuccess();if(cleared.length===2)setImmediate(()=>tx.oncomplete());});return request;
    }}),abort(){throw new Error('unexpected abort');}};return tx;
  }};
  const context={indexedDB:{open(){const request={result:db};setImmediate(()=>request.onsuccess());return request;}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../src/client/js/personal-store'),'utf8'),context);
  await context.PersonalStore.reset();assert.deepEqual(data,{companies:[],history:[]});
});

test('the serverless reset endpoint works before cloud configuration or database initialization',async()=>{
  const handler=require('../api');
  const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(){}};
  await handler({url:'/api/auth/reset-device',method:'POST',headers:{host:'example.test','content-type':'application/json'}},res);
  assert.equal(res.status,200);assert.equal(res.headers['Set-Cookie'].length,6);
});

test('opening the confirmation does not reset data; confirming resets without saving',async()=>{
  const source=fs.readFileSync(require.resolve('../src/client/js/app'),'utf8');
  const code=source.slice(source.indexOf('function pauseForReset()'),source.indexOf("window.addEventListener('storage'"));
  let submit,resets=0,redirects=0,body='';
  const context={resetInProgress:false,ready:true,modeBusy:false,dirty:true,portDraftDirty:true,portDraft:{},saving:null,saveTimer:1,portTimer:2,clearTimeout(){},
    modal:(title,html,callback)=>{body=html;submit=callback;},tr:x=>x,$:()=>({}),
    AppReset:{reset:async()=>resets++},D:{empty:()=>({})},location:{pathname:'/',replace:()=>redirects++},save(){throw new Error('Reset must never save to cloud');}};
  vm.createContext(context);vm.runInContext(code,context);context.resetAppDialog();
  assert.equal(resets,0);assert.equal(context.dirty,true);assert.match(body,/type="checkbox".*required/);
  await submit();assert.equal(resets,1);assert.equal(redirects,1);assert.equal(context.ready,false);assert.equal(context.dirty,false);assert.equal(context.portDraftDirty,false);
});
