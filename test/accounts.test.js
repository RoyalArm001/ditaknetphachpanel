const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite'),{once}=require('node:events');
const D=require('../domain');
test('personal signup, private data, recovery PIN, exports, rotation and team isolation',async t=>{
  const db=new PGlite();await db.waitReady;
  for(const file of ['001-cloud.sql','002-pin.sql','003-multiple-pins.sql','004-personal-accounts.sql'])await db.exec(fs.readFileSync('migrations/'+file,'utf8'));
  const query=(sql,args)=>db.query(sql,args),pool={query,connect:async()=>({query,release(){}}),end:()=>db.close()};
  const store=require('../cloud-store').openCloudStore({pool});await store.create('default',{...D.empty(),company:'Team only'});
  const users={a:{id:'a',email:'a@example.test'},b:{id:'b',email:'b@example.test'}};
  const personalAuth={authenticate:async req=>users[req.headers['x-user']]||null,clear(){},login:async(res,email)=>Object.values(users).find(u=>u.email===email),signup:async(res,email)=>({user:Object.values(users).find(u=>u.email===email)})};
  const server=require('../server').createApp({cloud:true,store,personalAuth,auth:{authenticate:async req=>req.headers['x-team']?{id:'team'}:null,clear(){},login:async()=>false}});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
  const call=(path,method='GET',body,extra={})=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
  const pins={};
  for(const key of ['a','b']){
    const res=await call('/api/account/signup','POST',{email:users[key].email,password:'test-only-password'});assert.equal(res.status,200);pins[key]=(await res.json()).pin;assert.match(pins[key],/^\d{12}$/);
    assert.equal((await(await call('/api/account/login','POST',{email:users[key].email,password:'test-only-password'})).json()).pin,null);
    const headers={'x-user':key};
    assert.equal((await call('/api/state?space=account','PUT',{revision:0,state:{...D.empty(),company:'Personal '+key}},headers)).status,200);
    assert.equal((await call('/api/companies?space=account','POST',{name:'Same allowed name',floorCount:1},headers)).status,201);
  }
  assert.notEqual(pins.a,pins.b);
  const listA=await(await call('/api/companies?space=account','GET',null,{'x-user':'a'})).json();
  const privateId=listA.find(c=>c.id!=='default').id;
  for(const path of ['/api/state','/api/revision','/api/history','/api/history/0','/api/export.xlsx','/api/export.pdf']){
    assert.equal((await call(path+'?space=account&company='+privateId,'GET',null,{'x-user':'b'})).status,404,path);
    assert.equal((await call(path+'?company='+privateId,'GET',null,{'x-team':'1'})).status,404,path);
  }
  assert.equal((await call('/api/state?space=account&company='+privateId,'PUT',{revision:0,state:D.empty()},{'x-user':'b'})).status,404);
  const archiveA=await(await call('/api/backup?space=account','POST',{}, {'x-user':'a'})).json();
  assert.deepEqual(archiveA.companies.map(c=>c.body.company).sort(),['Personal a','Same allowed name']);
  assert.ok(!JSON.stringify(archiveA).includes('pin_hash'));assert.ok(!JSON.stringify(await store.backup()).includes('Personal a'));
  assert.equal((await call('/api/state','GET',null,{'x-user':'a'})).status,401);
  assert.equal((await call('/api/state?space=account','GET',null,{'x-team':'1'})).status,401);
  assert.equal((await call('/api/account/recover','POST',{email:users.b.email,pin:pins.a})).status,401);
  const recovered=await call('/api/account/recover','POST',{email:users.a.email,pin:pins.a});assert.equal(recovered.status,200);
  const cookie=recovered.headers.getSetCookie().map(s=>s.split(';')[0]).join('; '),rh={Cookie:cookie};
  assert.equal((await(await call('/api/state?space=account','GET',null,rh)).json()).state.company,'Personal a');
  assert.equal((await call('/api/state?space=account','PUT',{state:D.empty(),revision:1},rh)).status,403);
  assert.equal((await call('/api/account/pin/new','POST',{},rh)).status,403);
  assert.equal((await call('/api/backup?space=account','POST',{},rh)).status,200);
  assert.equal((await call('/api/state','GET',null,rh)).status,401);
  for(const type of ['xlsx','pdf'])assert.equal((await call('/api/export.'+type+'?space=account&lang=en','GET',null,rh)).status,200);
  const rotated=await(await call('/api/account/pin/new','POST',{}, {'x-user':'a'})).json();assert.match(rotated.pin,/^\d{12}$/);assert.notEqual(rotated.pin,pins.a);
  assert.equal((await call('/api/state?space=account','GET',null,rh)).status,401);
  assert.equal((await call('/api/account/recover','POST',{email:users.a.email,pin:pins.a})).status,401);
  for(let i=0;i<6;i++)await call('/api/account/recover','POST',{email:'unknown@example.test',pin:'000000000000'});
  assert.equal((await call('/api/account/recover','POST',{email:'unknown@example.test',pin:'000000000000'})).status,429);
});
test('signup validates password and supports email confirmation with isolated cookies',async()=>{
  const {createAuth}=require('../cloud-auth');let calls=0,session={id:'a'},cookies;
  const auth=createAuth({SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',RACKMAP_AUTH_ACCESS:'all-authenticated'},async url=>{calls++;return {ok:true,json:async()=>url.endsWith('/user')?{id:'a',email:'a@example.test'}:session};},{cookiePrefix:'mypatch'});
  const res={setHeader:(k,v)=>cookies=v};
  assert.equal(await auth.signup(res,'bad','short'),false);assert.equal(calls,0);
  assert.deepEqual(await auth.signup(res,'a@example.test','a-long-password'),{confirmationRequired:true});
  session={access_token:'test-access',refresh_token:'test-refresh'};
  assert.equal((await auth.signup(res,'a@example.test','a-long-password')).user.id,'a');assert.ok(cookies.every(s=>s.startsWith('mypatch_')&&s.includes('HttpOnly; Secure')));
});
