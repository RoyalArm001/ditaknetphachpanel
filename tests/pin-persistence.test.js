'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),vm=require('node:vm');
const {createPinAuth,hashPin}=require('../src/server/pin-auth');
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];}});
const cookie=res=>res.headers['Set-Cookie'].at(-1).split(';')[0];
async function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());let unavailable=false;
 const store={db:{exec:sql=>db.exec(sql),prepare:sql=>{if(unavailable&&sql.startsWith('SELECT 1 FROM active_pin_sessions'))throw new Error('temporary database failure');return db.prepare(sql);}},pinAttempt:async()=>1,pinReset:async()=>{},close(){}};
 const env={RACKMAP_SESSION_SECRET:'s'.repeat(40),RACKMAP_PIN_HASH:await hashPin('12345678')};
 return {store,env,fail:value=>{unavailable=value;}};
}
test('PIN survives auth recreation, daily renewal and temporary database failure without a new login',async t=>{
 const {store,env,fail}=await fixture(t);let now=Date.now();const options={env,now:()=>now},first=response();
 await createPinAuth(store,options).login({headers:{}},first,'12345678');
 assert.match(first.headers['Set-Cookie'][0],/HttpOnly; Secure; SameSite=Lax; Max-Age=15552000; Expires=/);
 const req={headers:{cookie:cookie(first)}};
 now+=2*86400000;const next=createPinAuth(store,options),renewed=response();
 fail(true);await assert.rejects(next.authenticate(req,response()),e=>e.code==='PIN_SESSION_UNAVAILABLE');
 fail(false);assert.equal((await next.authenticate(req,renewed)).id,'staff-pin');
 const decode=c=>JSON.parse(Buffer.from(c.split('=')[1].split('.')[0],'base64url'));
 assert.equal(decode(cookie(first)).nonce,decode(cookie(renewed)).nonce);
 assert.equal((await createPinAuth(store,options).authenticate({headers:{cookie:cookie(renewed)}})).id,'staff-pin');
 assert.equal(await next.authenticate({headers:{cookie:cookie(first)+'tampered'}}),null);
 now+=181*86400000;assert.equal(await next.authenticate({headers:{cookie:cookie(renewed)}}),null);
});
test('HTTP session verification returns retryable 503 on storage failure, then accepts the unchanged cookie',async t=>{
 const {store,env,fail}=await fixture(t),saved={};for(const [key,value] of Object.entries(env)){saved[key]=process.env[key];process.env[key]=value;}
 t.after(()=>{for(const key of Object.keys(env))if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];});
 const server=require('../src/server/server').createApp({cloud:false,store});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const base='http://127.0.0.1:'+server.address().port;
 const login=await fetch(base+'/api/auth/pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'12345678'}),signal:AbortSignal.timeout(5000)});assert.equal(login.status,200);
 const headers={cookie:login.headers.getSetCookie().at(-1).split(';')[0]};
 fail(true);const down=await fetch(base+'/api/auth/session',{headers,signal:AbortSignal.timeout(5000)});assert.equal(down.status,503);assert.equal((await down.json()).code,'PIN_SESSION_UNAVAILABLE');assert.equal(down.headers.get('set-cookie'),null);
 fail(false);assert.equal((await fetch(base+'/api/auth/session',{headers,signal:AbortSignal.timeout(5000)})).status,200);
});
function client(fetch){
 const source=fs.readFileSync(require.resolve('../src/client/js/app'),'utf8');
 const code=source.slice(source.indexOf('async function restoreRememberedWorkspace()'),source.indexOf("let welcomeStep="));
 const ctx=vm.createContext({onboardingChoice:null,storageMode:'shared',AppReset:{isLoggedOut:()=>false,ensureSessionCleared:async()=>{}},fetch,AbortSignal,tr:x=>x,rememberWorkspace(){ctx.remembered=ctx.storageMode;}});
 vm.runInContext(code,ctx);return ctx;
}
const json=(status,data)=>({status,ok:status===200,json:async()=>data});
test('workspace recovery retries unavailable sessions rather than forgetting the saved PIN login',async()=>{
 let failed=true;const ctx=client(async url=>url.includes('space=account')?json(401,{}):failed?json(503,{code:'PIN_SESSION_UNAVAILABLE'}):json(200,{user:{id:'staff-pin'}}));
 await assert.rejects(ctx.restoreRememberedWorkspace());assert.equal(ctx.onboardingChoice,null);assert.equal(ctx.remembered,undefined);
 failed=false;await ctx.restoreRememberedWorkspace();assert.equal(ctx.onboardingChoice,'shared');assert.equal(ctx.remembered,'shared');
});
test('a new visitor can still open welcome when personal accounts are not configured; logout stays signed out',async()=>{
 const ctx=client(async url=>url.includes('space=account')?json(503,{code:'ACCOUNT_UNAVAILABLE'}):json(401,{}));
 await ctx.restoreRememberedWorkspace();assert.equal(ctx.onboardingChoice,null);
 const local=client(async url=>url.includes('space=account')?json(503,{code:'ACCOUNT_UNAVAILABLE'}):json(404,{}));
 await local.restoreRememberedWorkspace();assert.equal(local.onboardingChoice,null);
 ctx.AppReset.isLoggedOut=()=>true;ctx.fetch=()=>{throw Error('Must not recover a logged-out session');};await ctx.restoreRememberedWorkspace();
});
