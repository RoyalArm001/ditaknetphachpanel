const {test}=require('node:test'),assert=require('node:assert/strict');
const {hashPin,createPinAuth}=require('../pin-auth');
test('staff PIN authenticates, throttles, expires and invalidates after rotation',async()=>{
  let count=0,clock=1000000,cookie;
  const store={pinAttempt:async()=>++count,pinReset:async()=>{count=0;}},env={RACKMAP_PIN_HASH:await hashPin('12345678'),RACKMAP_SESSION_SECRET:'x'.repeat(64)};
  const auth=createPinAuth(store,{env,now:()=>clock}),req={headers:{},socket:{remoteAddress:'127.0.0.1'}},res={setHeader:(k,v)=>cookie=v};
  assert.equal(await auth.login(req,res,'00000000'),null);assert.equal(auth.authenticate(req),null);
  assert.ok(await auth.login(req,res,'12345678'));req.headers.cookie=cookie[0].split(';')[0];assert.equal(auth.authenticate(req).id,'staff-pin');
  assert.match(cookie[0],/HttpOnly; Secure; SameSite=Strict/);
  const tampered={headers:{cookie:req.headers.cookie+'x'}};assert.equal(auth.authenticate(tampered),null);
  clock+=28800001;assert.equal(auth.authenticate(req),null);clock=1000000;
  const other=createPinAuth(store,{env:{...env,RACKMAP_PIN_HASH:await hashPin('87654321')},now:()=>clock});assert.equal(other.authenticate(req),null);
  for(let i=0;i<5;i++)await auth.login({headers:{}},res,'wrong');assert.deepEqual(await auth.login({headers:{}},res,'12345678'),{limited:true});
});
test('integration environment aliases expose names, never secret values',()=>{
  const {normalizeEnv,publicConfig}=require('../env-config');
  const env={supabase_POSTGRES_URL:'postgres://private',NEXT_PUBLIC_supabase_SUPABASE_URL:'https://test.supabase.co',supabase_SUPABASE_PUBLISHABLE_KEY:'public'};
  assert.equal(normalizeEnv(env).POSTGRES_URL,'postgres://private');assert.equal(publicConfig(env).setupRequired,false);
  assert.ok(!JSON.stringify(publicConfig(env)).includes('postgres://private'));assert.equal(publicConfig({}).missing.length,3);
});
test('Vercel Supabase integration variables configure database and account auth',async()=>{
  const {normalizeEnv,publicConfig}=require('../env-config');
  const env={supabase_POSTGRES_URL:'postgres://user:password@db.test/app',supabase_SUPABASE_URL:'https://project.supabase.co',NEXT_PUBLIC_supabase_SUPABASE_URL:'https://project.supabase.co',supabase_SUPABASE_PUBLISHABLE_KEY:'publishable-test',supabase_SUPABASE_ANON_KEY:'anon-test',supabase_SUPABASE_SECRET_KEY:'secret-test',supabase_SUPABASE_SERVICE_ROLE_KEY:'service-test',RACKMAP_STORAGE:'supabase'};
  const config=publicConfig(env);assert.equal(config.setupRequired,false);assert.deepEqual(config.missing,[]);
  assert.equal(normalizeEnv(env).POSTGRES_URL,env.supabase_POSTGRES_URL);
  const pool=require('../cloud-store').createPool(env);assert.equal(pool.options.connectionString,env.supabase_POSTGRES_URL);await pool.end();
  let key;const auth=require('../cloud-auth').createAuth(env,async(url,options)=>{assert.equal(url,'https://project.supabase.co/auth/v1/user');key=options.headers.apikey;return {ok:true,json:async()=>({id:'staff',app_metadata:{rackmap_access:true}})};});
  assert.equal((await auth.authenticate({headers:{authorization:'Bearer token'}},{})).id,'staff');assert.equal(key,'publishable-test');
  for(const value of ['password','publishable-test','anon-test','secret-test','service-test'])assert.ok(!JSON.stringify(config).includes(value));
  assert.equal(publicConfig({supabase_POSTGRES_URL_NON_POOLING:'postgres://fallback',NEXT_PUBLIC_supabase_SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'anon'}).setupRequired,false);
});
test('local PIN gate protects state, returns cookie and allows editing',async t=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{once}=require('node:events');
  const hash=await hashPin('12345678'),oldHash=process.env.RACKMAP_PIN_HASH,oldSecret=process.env.RACKMAP_SESSION_SECRET;
  process.env.RACKMAP_PIN_HASH=hash;process.env.RACKMAP_SESSION_SECRET='z'.repeat(64);
  const server=require('../server').createApp({dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'pin-http-'))});
  if(oldHash===undefined)delete process.env.RACKMAP_PIN_HASH;else process.env.RACKMAP_PIN_HASH=oldHash;
  if(oldSecret===undefined)delete process.env.RACKMAP_SESSION_SECRET;else process.env.RACKMAP_SESSION_SECRET=oldSecret;
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/api/state')).status,401);
  const config=await(await fetch(base+'/api/config')).json();assert.equal(config.pinEnabled,true);assert.equal(config.authRequired,true);
  const res=await fetch(base+'/api/auth/pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'12345678'})});
  assert.equal(res.status,200);const headers={Cookie:res.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'};
  const data=await(await fetch(base+'/api/state',{headers})).json();data.state.company='Staff company';
  assert.equal((await fetch(base+'/api/state',{method:'PUT',headers,body:JSON.stringify(data)})).status,200);
  assert.equal((await(await fetch(base+'/api/state',{headers})).json()).state.company,'Staff company');
});
