const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const until=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Account UI did not settle');};
test('signup UI opens scoped account, displays a PIN, saves and exports through personal endpoints',async t=>{
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://patch.test/',runScripts:'outside-only'}),w=dom.window,$=s=>w.document.querySelector(s);t.after(()=>w.close());
  w.structuredClone=structuredClone;w.AbortSignal=AbortSignal;w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  let state={schema:2,company:'',floors:[]},revision=0;const calls=[];
  w.fetch=async(url,options={})=>{calls.push({url,options});const u=new URL(url,w.location.href);let data;
    if(u.pathname==='/api/account/signup')data={user:{id:'test-account'},pin:'123456789012'};
    else if(u.pathname==='/api/config')data={cloud:true,authRequired:true,accountEnabled:true};
    else{
      assert.equal(u.searchParams.get('space'),'account',url);
      if(u.pathname==='/api/auth/session')data={user:{id:'test-account'}};
      else if(u.pathname==='/api/companies')data=[{id:'default',name:state.company}];
      else if(u.pathname==='/api/state'){
        if(options.method==='PUT'){state=JSON.parse(options.body).state;data={revision:++revision};}else data={state,revision};
      }else if(u.pathname==='/api/backup')data={format:'ditaknet-rackmap-cloud',version:1,companies:[{body:state}],history:[]};
      else data={urls:[],database:'test',backups:'test'};
    }return new Response(JSON.stringify(data));
  };
  for(const f of ['locales.js','i18n.js','domain.js','app.js'])w.eval(fs.readFileSync(f,'utf8'));
  $('[data-action=account-signup]').click();await until(()=>$('#loginForm'));
  $('#email').value='sample@example.test';$('#password').value='a-long-test-password';$('#loginForm').requestSubmit();
  await until(()=>$('.personal-pin'));assert.equal($('.personal-pin').textContent,'123456789012');assert.ok(!JSON.stringify(w.localStorage).includes('123456789012'));
  $('#dialog').close();await until(()=>$('#setupForm'));$('#company').value='My personal company';$('#count').value='1';$('#setupForm').requestSubmit();
  await until(()=>calls.some(c=>c.options.method==='PUT'));assert.equal(state.company,'My personal company');
  w.location.hash='settings';await until(()=>$('[data-action=backup-all]'));$('[data-action=backup-all]').click();
  await until(()=>calls.some(c=>c.url.includes('/api/backup?')&&c.url.includes('space=account')));
});
