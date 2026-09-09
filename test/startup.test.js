const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
async function startup({shared=false,legacy=false}={}){
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://mypro.smarttechllc.am/',runScripts:'outside-only'}),w=dom.window;
  w.indexedDB=new(require('fake-indexeddb').IDBFactory)();w.structuredClone=structuredClone;w.AbortSignal=AbortSignal;
  w.matchMedia=()=>({matches:false,addEventListener(){}});w.scrollTo=()=>{};w.HTMLDialogElement.prototype.close=function(){};
  if(shared){w.localStorage.setItem('rackmap-storage-mode','shared');w.localStorage.setItem('rackmap-workspace-choice','shared');}
  const requests=[];w.fetch=async url=>{requests.push(url);return new Response(JSON.stringify({error:'Cloud unavailable'}),{status:503});};
  for(const file of ['domain.js','personal-store.js','app.js']){
    if(file==='app.js'&&legacy)await w.PersonalStore.request('/api/state',{method:'PUT',body:JSON.stringify({state:{schema:2,company:'Existing company',floors:[]},revision:0})});
    w.eval(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
  }
  return {dom,w,requests};
}
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Startup did not finish');}
test('first public launch offers a choice and personal setup without contacting cloud',async()=>{
  const {dom,w,requests}=await startup();try{
    await until(()=>w.document.querySelector('[data-action=welcome-personal]'));assert.equal(requests.length,0);
    assert.ok(w.document.querySelector('[data-action=welcome-import]'));assert.ok(w.document.querySelector('[data-action=welcome-shared]'));
    w.document.querySelector('[data-action=welcome-personal]').click();
    await until(()=>w.document.querySelector('#setupForm'));assert.equal(requests.length,0);
    assert.equal(w.localStorage.getItem('rackmap-workspace-choice'),'personal');
    assert.ok(!w.document.querySelector('#content').textContent.includes('Start-RackMap.cmd'));
  }finally{dom.window.close();}
});
test('failed remembered cloud mode offers a working personal fallback without localhost instructions',async()=>{
  const {dom,w,requests}=await startup({shared:true});try{
    await until(()=>w.document.querySelector('[data-action=welcome-shared]'));
    await new Promise(r=>setTimeout(r,50));assert.ok(w.document.querySelector('.welcome'));assert.equal(requests.length,0);
    w.document.querySelector('[data-action=welcome-shared]').click();
    await until(()=>w.document.querySelector('[data-action=personal-mode]'));
    assert.ok(!w.document.querySelector('#content').textContent.includes('localhost'));
    w.document.querySelector('[data-action=personal-mode]').click();await until(()=>w.document.querySelector('.storage-mode'));
    await until(()=>w.document.querySelector('#storageInfo .storage-path')&&w.document.querySelector('#networkInfo .hint'));

    assert.equal(w.localStorage.getItem('rackmap-storage-mode'),'personal');assert.equal(requests.length,1);
  }finally{dom.window.close();}
});
test('existing personal data still requires an explicit choice and is preserved',async()=>{
  const {dom,w,requests}=await startup({legacy:true});try{
    await until(()=>w.document.querySelector('.welcome'));assert.equal(requests.length,0);
    w.document.querySelector('[data-action=welcome-personal]').click();
    await until(()=>w.document.querySelector('#companyLabel').textContent==='Existing company');
    assert.equal(w.document.querySelector('.welcome'),null);assert.equal(requests.length,0);
    w.location.hash='#settings';await until(()=>w.document.querySelector('[data-action=workspace-choice]'));
    w.document.querySelector('[data-action=workspace-choice]').click();await until(()=>w.document.querySelector('.welcome'));
    w.document.querySelector('[data-action=welcome-personal]').click();await until(()=>w.document.querySelector('.stats'));
    assert.equal(w.location.hash,'#overview');
    assert.equal((await w.PersonalStore.request('/api/state')).state.company,'Existing company');assert.equal(requests.length,0);
  }finally{w.close();}
});
test('opening index from disk redirects to server without a file API request',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const vc=new VirtualConsole(),errors=[];
  vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:'file:///E:/MyPachpanel/index.html',runScripts:'outside-only',virtualConsole:vc});
  try{
    const w=dom.window;let fetches=0;
    w.matchMedia=()=>({matches:false,addEventListener(){}});
    w.fetch=()=>{fetches++;throw new Error('Must not request file API');};
    w.eval(fs.readFileSync(path.join(__dirname,'../domain.js'),'utf8'));
    w.eval(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'));
    assert.equal(fetches,0);
    assert.equal(w.document.querySelector('#content a').href,'http://localhost:3000/');
    assert.match(w.document.querySelector('#content').textContent,/Start-RackMap.cmd/);
    // JSDOM cannot perform a navigation; this event proves replace() was reached.
    assert.equal(errors.length,1);assert.match(errors[0],/Not implemented: navigation/);
  }finally{dom.window.close();}
});
