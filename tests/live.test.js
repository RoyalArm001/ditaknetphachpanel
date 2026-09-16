'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {merge}=require('../src/shared/merge-state');
const {createPresence,streamLive}=require('../src/server/live');
const D=require('../src/shared/domain');
test('team PIN recovery opens shared cloud and never writes a local snapshot',async()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../src/client/js/app'),'utf8');
  const start=source.indexOf('function recoverAccountDialog(){'),end=source.indexOf('\nfunction ',start+1);
  let submit,opened;
  const context={tr:(x,...values)=>Array.isArray(x)?x.reduce((out,part,i)=>out+part+(values[i]||''),''):x,modal:(title,body,callback)=>submit=callback,input:()=>'',AppReset:{ensureSessionCleared:async()=>{}},
    fetch:async path=>({ok:path==='/api/auth/pin',json:async()=>({user:{id:'team'}})}),PersonalStore:{request(){throw new Error('Team login must not copy the cloud locally');}},
    $:()=>({}),rememberWorkspace(){},D,URL,location:{href:'https://example.test/?company=old'},history:{replaceState(){}},init:async()=>{opened=context.storageMode;}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);context.recoverAccountDialog();
  await submit({get:()=> '1234567890'});assert.equal(opened,'shared');assert.equal(context.onboardingChoice,'shared');
});
test('concurrent changes merge independent fields and additions without overwriting peers',()=>{
  const base={company:'Example',floors:[{id:'f1',name:'First',racks:[]}]};
  const a=structuredClone(base),b=structuredClone(base);a.company='Renamed';b.floors[0].name='Ground';
  assert.deepEqual(merge(base,a,b),{company:'Renamed',floors:[{id:'f1',name:'Ground',racks:[]}]});
  a.floors.push({id:'f2',name:'Second',racks:[]});b.floors.push({id:'f3',name:'Third',racks:[]});
  assert.equal(merge(base,a,b).floors.length,3);
  a.floors[0].name='Conflicting';assert.throws(()=>merge(base,a,b),{code:409});
  a.floors=[];assert.throws(()=>merge(base,a,b),{code:409});
});
test('presence counts identities once across tabs, isolates databases, and expires disconnected users',async()=>{
  let now=0;const p=createPresence(null,{now:()=>now});
  await p.touch('team','pin-a','tab-1');await p.touch('team','pin-a','tab-2');await p.touch('team','pin-b','tab-3');
  await p.touch('personal:user','user','tab-4');assert.equal(await p.count('team'),2);assert.equal(await p.count('personal:user'),1);
  await p.leave('team','pin-b','tab-1');assert.equal(await p.count('team'),2,'cannot remove someone else by client ID');
  await p.leave('team','pin-a','tab-1');assert.equal(await p.count('team'),2);
  now=30001;assert.equal(await p.count('team'),0);
});
test('live stream sends changed revisions and cleans up timers on close',async()=>{
  const res=new EventEmitter(),messages=[];let revision=1;
  res.writeHead=()=>{};res.flushHeaders=()=>{};res.write=x=>messages.push(x);res.end=()=>res.emit('close');
  await streamLive({},res,{presence:createPresence(),scope:'team',actor:'pin-a',client:'tab-1',store:{list:async()=>[{id:'default',revision}]},duration:1000,interval:10});
  assert.ok(messages.some(x=>x.includes('"revision":1')&&x.includes('"online":1')));
  revision=2;await new Promise(r=>setTimeout(r,30));
  assert.ok(messages.some(x=>x.includes('"revision":2')));
  res.emit('close');const count=messages.length;await new Promise(r=>setTimeout(r,30));assert.equal(messages.length,count);
});
test('cloud save merges from stored history under the lock and preserves the current revision',async()=>{
  const base={...D.empty(),company:'Example'},remote=structuredClone(base);remote.floors=[{id:'f1',name:'Ground',racks:[]}];
  const local=structuredClone(base);local.company='Renamed';const writes=[];
  const client={release(){},async query(sql,args){
    if(sql.startsWith('SELECT revision,body'))return {rows:[{revision:2,body:remote}]};
    if(sql.startsWith('SELECT body FROM rackmap.company_history'))return {rows:[{body:base}]};
    writes.push({sql,args});return {rows:[]};
  }};
  const store=require('../src/server/cloud-store').openCloudStore({pool:{connect:async()=>client}});
  const result=await store.save('default',local,1);assert.equal(result.revision,3);assert.equal(result.state.company,'Renamed');assert.equal(result.state.floors.length,1);
  const history=writes.find(x=>x.sql.startsWith('INSERT INTO rackmap.company_history'));assert.equal(history.args[1],2);assert.deepEqual(JSON.parse(history.args[2]),remote);
  const clash=structuredClone(base);clash.floors=[{id:'f1',name:'Conflicting',racks:[]}];
  assert.equal((await store.save('default',clash,1)).conflict,true);
});
