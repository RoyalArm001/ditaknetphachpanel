const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),fs=require('node:fs');
function setup(){const dom=new JSDOM('<html><head></head><body></body></html>',{url:'https://patch.test',runScripts:'outside-only'}),w=dom.window;w.AbortSignal=AbortSignal;for(const f of ['locales.js','i18n.js','domain.js','drive-store.js'])w.eval(fs.readFileSync(f,'utf8'));return {dom,w};}
test('Drive requires configured OAuth, explicit consent, and keeps tokens out of local storage and server requests',async t=>{
  const {dom,w}=setup();t.after(()=>dom.window.close());let configured=false,consent=true,revoked=false,requests=[],responseData={files:[{id:'backup_1',name:'Backup'}]};
  w.fetch=async(url,options={})=>{requests.push({url,options});return new Response(JSON.stringify(url==='/api/config'?{googleClientId:configured?'test.apps.googleusercontent.com':''}:responseData));};
  w.google={accounts:{oauth2:{initTokenClient:options=>({requestAccessToken(){options.callback({access_token:'test-only-google-token',expires_in:3600,error:consent?undefined:'denied'});}}),hasGrantedAllScopes:()=>consent,revoke:()=>{revoked=true;}}}};
  await assert.rejects(w.DriveStore.prepare());configured=true;
  const id=await w.DriveStore.prepare();assert.equal(w.DriveStore.connected(),false);await w.DriveStore.connect(id);assert.equal(w.DriveStore.connected(),true);
  await w.DriveStore.list();assert.match(requests.at(-1).url,/spaces=appDataFolder/);assert.equal(requests.at(-1).options.headers.Authorization,'Bearer test-only-google-token');
  await w.DriveStore.save({...w.RackDomain.empty(),company:'Private sample'});assert.equal(requests.at(-1).options.method,'POST');assert.match(requests.at(-1).url,/upload\/drive\/v3\/files/);
  assert.equal(w.localStorage.length,0);for(const call of requests.filter(x=>x.url.startsWith('/')))assert.equal(call.options.headers?.Authorization,undefined);
  responseData={appProperties:{application:'Other'},size:40};await assert.rejects(w.DriveStore.read('backup_1'));
  await assert.rejects(w.DriveStore.read('../other'));
  w.DriveStore.disconnect();assert.equal(revoked,true);assert.equal(w.DriveStore.connected(),false);await assert.rejects(w.DriveStore.list());
  consent=false;await assert.rejects(w.DriveStore.connect(id));assert.equal(w.DriveStore.connected(),false);
});
