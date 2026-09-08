const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {IDBFactory}=require('fake-indexeddb'),D=require('../domain');
function client(indexedDB){const context={indexedDB,RackDomain:D,crypto:require('node:crypto').webcrypto,URL,location:{href:'https://app.test/'}};vm.runInNewContext(fs.readFileSync('personal-store.js','utf8'),context);return context.PersonalStore;}
test('personal database survives reload and isolates devices, companies and history',async()=>{
  const db=new IDBFactory(),a=client(db);const first=await a.request('/api/state');assert.equal(first.revision,0);
  first.state.company='Personal';await a.request('/api/state',{method:'PUT',body:JSON.stringify(first)});
  const reloaded=client(db);assert.equal((await reloaded.request('/api/state')).state.company,'Personal');
  assert.equal((await client(new IDBFactory()).request('/api/state')).state.company,'');
  const next=await a.request('/api/companies',{method:'POST',body:JSON.stringify({name:'Second',floorCount:2})});
  assert.equal((await a.request('/api/state?company='+next.id)).state.floors.length,2);
  await assert.rejects(a.request('/api/state',{method:'PUT',body:JSON.stringify(first)}),e=>e.code===409);
  assert.equal((await a.request('/api/history/0')).state.company,'');
  const archive=await a.request('/api/backup');assert.equal(archive.companies.length,2);assert.equal(archive.history.length,1);
});
test('simultaneous personal writers cannot silently overwrite each other',async()=>{
  const db=new IDBFactory(),a=client(db),b=client(db);await a.request('/api/state');
  const results=await Promise.allSettled([a,b].map((x,i)=>x.request('/api/state',{method:'PUT',body:JSON.stringify({revision:0,state:{...D.empty(),company:'Name'+i}})})));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,409);
});
