const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');const {openCloudStore}=require('../cloud-store');const D=require('../domain');const {importArchive}=require('../scripts/cloud');
test('Postgres migration, isolation, revision conflict, rollback, archive and repeat import',async t=>{
  const db=new PGlite();await db.waitReady;t.after(()=>db.close());
  const query=(sql,args)=>db.query(sql,args),pool={query,connect:async()=>({query,release(){}})};
  const sql=fs.readFileSync('migrations/001-cloud.sql','utf8');await db.exec(sql);await db.exec(sql);
  const store=openCloudStore({pool});const a={...D.empty(),company:'A',serviceColors:{wifi:'#abcdef'}},b={...D.empty(),company:'B'};
  await store.create('a',a);await store.create('b',b);assert.equal((await store.list()).length,2);
  assert.deepEqual(await store.save('a',{...a,company:'A2'},0),{revision:1});
  assert.deepEqual(await store.save('a',{...a,company:'lost'},0),{conflict:true,revision:1});
  assert.equal((await store.read('b')).state.company,'B');assert.equal((await store.version('a',0)).state.serviceColors.wifi,'#abcdef');
  await assert.rejects(store.save('a',b,1));assert.equal((await store.read('a')).revision,1);assert.equal((await store.history('a')).length,1);
  const archive=await store.backup();assert.equal(await importArchive(pool,archive),0);
  const bad=structuredClone(archive);bad.companies.unshift({id:'new',revision:0,body:{...D.empty(),company:'new'}});bad.companies[1].body.company='conflicting';
  await assert.rejects(importArchive(pool,bad));assert.equal(await store.read('new'),null);
  for(let i=1;i<=52;i++)await store.save('a',{...a,company:'A2'},i);
  assert.equal((await store.history('a')).length,50);
  await db.exec('INSERT INTO rackmap.schema_version VALUES(2)');await assert.rejects(db.exec(sql));await db.exec('ROLLBACK');
  assert.equal((await store.read('b')).state.company,'B');
});
test('cloud auth verifies existing Supabase users and server-owned permission only',async()=>{
  const {createAuth}=require('../cloud-auth');let user={id:'staff',email:'staff@example.test',user_metadata:{rackmap_access:true}},headers;
  const auth=createAuth({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public'},async url=>({ok:true,json:async()=>url.includes('/user')?user:{access_token:'valid',refresh_token:'refresh',expires_in:3600}}));
  const req={headers:{authorization:'Bearer valid'}},res={setHeader:(k,v)=>headers=v};
  assert.equal(await auth.authenticate(req,res),null);
  user.app_metadata={rackmap_access:true};assert.equal((await auth.authenticate(req,res)).id,'staff');
  assert.ok(await auth.login(res,'staff@example.test','password'));assert.ok(headers.every(x=>x.includes('HttpOnly; Secure; SameSite=Lax')));
  user.app_metadata={};assert.equal(await auth.authenticate(req,res),null);
  auth.clear(res);assert.ok(headers.every(x=>x.includes('Max-Age=0')));
});

test('cloud HTTP denies anonymous data and supports staff exports and conflicts',async t=>{
  const {createApp}=require('../server'),{once}=require('node:events');
  const db=new PGlite();await db.waitReady;await db.exec(fs.readFileSync('migrations/001-cloud.sql','utf8'));
  const query=(sql,args)=>db.query(sql,args),store=openCloudStore({pool:{query,connect:async()=>({query,release(){}}),end:()=>db.close()}});
  await store.create('default',{...D.empty(),company:'Cloud'});
  const server=createApp({cloud:true,store,auth:{authenticate:async req=>req.headers.authorization==='Bearer staff'?{id:'staff'}:null,login:async()=>false,clear(){}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer staff','Content-Type':'application/json'};
  assert.equal((await(await fetch(base+'/api/config')).json()).cloud,true);
  for(const url of ['/api/state','/api/companies','/api/history','/api/storage','/api/export.xlsx','/api/export.pdf','/api/auth/session'])assert.equal((await fetch(base+url)).status,401,url);
  assert.equal((await fetch(base+'/api/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  // Vercel can supply a parsed req.body rather than an unread stream.
  server.prependListener('request',req=>{if(req.headers['x-test-parsed'])req.body=JSON.parse(req.headers['x-test-parsed']);});
  const parsed=JSON.stringify({name:'Parsed body company',floorCount:1});
  assert.equal((await fetch(base+'/api/companies',{method:'POST',headers:{...headers,'x-test-parsed':parsed},body:''})).status,201);
  const initial=await(await fetch(base+'/api/state',{headers})).json();initial.state.company='Cloud changed';
  assert.equal((await fetch(base+'/api/state',{method:'PUT',headers,body:JSON.stringify(initial)})).status,200);
  assert.equal((await fetch(base+'/api/state',{method:'PUT',headers,body:JSON.stringify(initial)})).status,409);
  assert.equal((await fetch(base+'/api/companies',{method:'POST',headers:{...headers,Origin:'https://foreign.example'},body:'{}'})).status,403);
  const backup=await(await fetch(base+'/api/backup',{method:'POST',headers,body:'{}'})).json();assert.equal(backup.companies.find(x=>x.id==='default').body.company,'Cloud changed');
  for(const ext of ['xlsx','pdf']){const res=await fetch(base+'/api/export.'+ext,{headers});assert.equal(res.status,200);assert.ok((await res.arrayBuffer()).byteLength>100);}
  const stateAfter=await(await fetch(base+'/api/state',{headers})).json();assert.equal(stateAfter.revision,1);
});
