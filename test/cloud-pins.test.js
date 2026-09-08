const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{once}=require('node:events'),{PGlite}=require('@electric-sql/pglite');
const {createPinAuth,hashPin}=require('../pin-auth');
test('multiple PINs have distinct sessions and individual revocation',async()=>{
  const hashes={one:await hashPin('1234567890'),two:await hashPin('2345678901'),three:await hashPin('3456789012')};
  let attempts=0,clock=1000000;const store={pinAttempt:async()=>++attempts,pinReset:async()=>{attempts=0;}};
  const env={RACKMAP_PIN_HASHES:JSON.stringify(hashes),RACKMAP_SESSION_SECRET:'s'.repeat(64)};
  const auth=createPinAuth(store,{env,now:()=>clock}),cookies={};
  for(const [id,pin]of [['one','1234567890'],['two','2345678901'],['three','3456789012']]){
    const res={setHeader:(k,v)=>cookies[id]=v[0].split(';')[0]};assert.equal((await auth.login({headers:{}},res,pin)).id,id);
    assert.equal(auth.authenticate({headers:{cookie:cookies[id]}}).id,id);
  }
  delete hashes.two;const revoked=createPinAuth(store,{env:{...env,RACKMAP_PIN_HASHES:JSON.stringify(hashes)},now:()=>clock});
  assert.equal(revoked.authenticate({headers:{cookie:cookies.two}}),null);assert.equal(revoked.authenticate({headers:{cookie:cookies.one}}).id,'one');
  assert.equal(await revoked.login({headers:{}},{setHeader(){}},'2345678901'),null);
  clock+=28800001;assert.equal(revoked.authenticate({headers:{cookie:cookies.one}}),null);
  assert.throws(()=>createPinAuth(store,{env:{...env,RACKMAP_PIN_HASHES:'{"bad":"not-a-hash"}'}}));
});
test('database PINs protect cloud data, support restoration and revoke without a deployment',async t=>{
  const db=new PGlite();await db.waitReady;
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  for(const name of ['001-cloud.sql','002-pin.sql','003-multiple-pins.sql'])await db.exec(fs.readFileSync('migrations/'+name,'utf8'));
  await db.exec(fs.readFileSync('migrations/003-multiple-pins.sql','utf8'));
  let closing;const query=(sql,args)=>db.query(sql,args),store=require('../cloud-store').openCloudStore({pool:{query,connect:async()=>({query,release(){}}),end:()=>closing=db.close()}});
  assert.equal(await store.pinEnabled(),false);
  await db.query('INSERT INTO rackmap.pin_session_config(secret) VALUES($1)',['database-secret-'.repeat(4)]);
  await db.query('INSERT INTO rackmap.pin_keys(id,label,pin_hash) VALUES($1,$2,$3)',['owner','Owner',await hashPin('1234567890')]);
  await store.create('default',{schema:2,company:'Private',floors:[]});
  const server=require('../server').createApp({cloud:true,store,auth:{authenticate:async()=>null,login:async()=>false,clear(){}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{await new Promise(r=>server.close(r));await closing;});
  const base='http://127.0.0.1:'+server.address().port;
  const config=await(await fetch(base+'/api/config')).json();assert.equal(config.pinEnabled,true);assert.ok(!JSON.stringify(config).includes('secret'));
  assert.equal((await fetch(base+'/api/companies')).status,401);
  const login=await fetch(base+'/api/auth/pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'1234567890'})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0],headers={Cookie:cookie,'Content-Type':'application/json'};
  assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  const current=await(await fetch(base+'/api/state',{headers})).json();assert.equal(current.state.company,'Private');
  const changed={...current,state:{...current.state,company:'Restored private database'}};
  assert.equal((await fetch(base+'/api/state',{method:'PUT',headers,body:JSON.stringify(changed)})).status,200);
  const backup=await(await fetch(base+'/api/backup',{method:'POST',headers,body:'{}'})).json();assert.equal(backup.companies[0].body.company,'Restored private database');
  assert.ok(!JSON.stringify(backup).includes('database-secret'));assert.ok(!JSON.stringify(backup).includes('pin_hash'));
  await db.query("UPDATE rackmap.pin_keys SET enabled=false WHERE id='owner'");
  assert.equal((await fetch(base+'/api/state',{headers})).status,401);assert.equal(await store.pinEnabled(),false);
  const permissions=await db.query("SELECT has_table_privilege('anon','rackmap.pin_keys','SELECT') AS anon,has_table_privilege('authenticated','rackmap.pin_session_config','SELECT') AS authenticated");
  assert.deepEqual(permissions.rows[0],{anon:false,authenticated:false});
});
