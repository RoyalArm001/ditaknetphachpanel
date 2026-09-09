'use strict';
const tr=globalThis.RackI18n?.t||((text,...values)=>Array.isArray(text)?text.reduce((out,part,i)=>out+part+(i<values.length?values[i]:''),''):text);

const D=RackDomain, $=s=>document.querySelector(s), uid=()=>crypto.randomUUID?crypto.randomUUID():`id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=D.empty(),revision=0,ready=false,dirty=false,saving=null,conflict=false,saveTimer,toastTimer,dialogSubmit=null;
let filters={query:'',floor:'',rack:'',status:''},page=0;
const localHost=/^(localhost$|127\.0\.0\.1$|\[::1\]$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
let storageMode=localHost?'shared':'personal',remoteConfig=null,modeBusy=false;
try{const preferred=localStorage.getItem('rackmap-storage-mode');if(['personal','shared'].includes(preferred))storageMode=preferred;}catch{}
const personal=()=>storageMode==='personal';
let onboardingChoice=null,onboardingVisible=false;
let welcomeStep='home',accountMethod='login',accountUserId='',accountReadOnly=false;
const accountMode=()=>storageMode==='account';
// Opening the app always asks for an explicit workspace choice.
let authRequired=false,pinEnabled=false,accountEnabled=false;
let cloudMode=!localHost,maxStateBytes=24*1024*1024;
let sceneController=null;
function renderLogin(method=pinEnabled?'pin':'account'){
  if(accountMode())return renderAccountLogin(accountMethod);
  ready=false;document.body.classList.add('login-view');document.body.classList.remove('rack-view');$('#dialog').close();
  const usePin=method==='pin'&&pinEnabled;
  $('#content').innerHTML=tr('<section class="panel setup login-card"><div class="login-mark">▤</div><div class="eyebrow">ԻՄ ՓԱՉ · ԱՇԽԱՏԱԿՑԻ ՄՈՒՏՔ</div><h1>Իմ փաչ</h1><p>Բացեք ընկերությունների բազան և խմբագրեք ռաքերն ու միացումները։</p>')+(pinEnabled&&accountEnabled?'<div class="login-tabs">'+button(tr('PIN կոդ'),'login-pin')+button(tr('Թիմային հաշիվ'),'login-account')+'</div>':'')+'<form id="loginForm">'+(usePin?input('pin',tr('Աշխատակցի PIN'),'','password',tr('required inputmode="numeric" pattern="[0-9]{8,12}" minlength="8" maxlength="12" autocomplete="off" placeholder="Մուտքագրեք PIN կոդը"')):input('email',tr('Էլ․ փոստ'),'','email','required autocomplete="username"')+input('password',tr('Գաղտնաբառ'),'','password','required autocomplete="current-password"'))+tr('<p id="loginError" role="alert"></p><button class="button primary" type="submit">Բացել աշխատանքային տարածքը →</button></form><p><button class="button" data-action="personal-mode">Շարունակել անձնական ռեժիմով</button></p><p class="hint">Ստեղծված է Սիփան Դանիելյանի կողմից · <a href="https://royalarm.uk" target="_blank" rel="noopener">royalarm.uk</a><br>Սպասարկող՝ <a href="https://www.ditaknet.com/en" target="_blank" rel="noopener">ditaknet.com</a></p></section>');
  $('#leftPanel').inert=true;$('#rightToggle').hidden=true;
  $('#loginForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const fd=new FormData(e.target);await api(usePin?'/api/auth/pin':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(usePin?{pin:fd.get('pin')}:{email:fd.get('email'),password:fd.get('password')})});if(dirty||portDraftDirty){ready=true;render();}else await init();}catch(err){if($('#loginError'))$('#loginError').textContent=tr(err.message);}finally{b.disabled=false;}};
}
let panelPrefs={left:!window.matchMedia('(max-width:760px)').matches,right:!window.matchMedia('(max-width:760px)').matches};
try{const p=JSON.parse(localStorage.getItem('rackmap-panels'));if(p)for(const k of ['left','right'])if(typeof p[k]==='boolean')panelPrefs[k]=p[k];}catch{}
function applyPanels(){
  for(const k of ['left','right']){
    document.body.classList.toggle(k+'-collapsed',!panelPrefs[k]);
    const panel=$('#'+k+'Panel');if(panel)panel.inert=!panelPrefs[k];
    document.querySelectorAll('[data-action="toggle-'+k+'"]').forEach(toggle=>toggle.setAttribute('aria-expanded',String(panelPrefs[k])));
  }
  $('#rightToggle').hidden=route().view!=='rack'||!$('#rightPanel');
  const mobile=window.matchMedia('(max-width:760px)').matches;
  const overlay=mobile&&(panelPrefs.left||(route().view==='rack'&&panelPrefs.right&&$('#rightPanel')));
  if($('#panelBackdrop'))$('#panelBackdrop').hidden=!overlay||!ready;
  document.body.classList.toggle('mobile-panel-open',!!overlay&&ready);
}
function togglePanel(k){panelPrefs[k]=!panelPrefs[k];if(window.matchMedia('(max-width:760px)').matches&&panelPrefs[k])panelPrefs[k==='left'?'right':'left']=false;applyPanels();try{localStorage.setItem('rackmap-panels',JSON.stringify(panelPrefs));}catch{}}
let selectedPortId='',portDraft=null,portDraftDirty=false,portTimer;
let activeCompanyId=new URLSearchParams(location.search).get('company')||'default',companies=[],companyBusy=false;
if(!new URLSearchParams(location.search).has('company'))try{activeCompanyId=localStorage.getItem('rackmap-active-company')||'default';}catch{}
const recoveryKey=()=>accountMode()?'rackmap-account-'+accountUserId+'-'+activeCompanyId:personal()?'rackmap-personal-recovery-'+activeCompanyId:activeCompanyId==='default'?'rackmap-recovery-v2':'rackmap-recovery-v2-'+activeCompanyId;
function companyUrl(url,id=activeCompanyId){const u=new URL(url,location.href);u.searchParams.set('company',id);if(accountMode())u.searchParams.set('space','account');u.searchParams.set('lang',globalThis.RackI18n?.language||'hy');return u.pathname+u.search;}


const viewNames={get overview(){return tr('Ընդհանուր տեսք');},get floors(){return tr('Հարկեր և ռաքեր');},get search(){return tr('Մալուխներ և որոնում');},get reports(){return tr('Հաշվետվություններ');},get settings(){return tr('Կարգավորումներ');},get rack(){return tr('Ռաքի տեսք');},get connections(){return tr('3D կապեր');}};
const button=(label,action,id='',cls='')=>`<button type="button" class="button ${cls}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
const input=(name,label,value='',type='text',extra='')=>`<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;
const opts=(xs,value)=>xs.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`).join('');
const select=(name,label,xs,value='')=>`<div class="field"><label for="${name}">${label}</label><select name="${name}" id="${name}">${opts(xs,value)}</select></div>`;
const legend=()=>tr`<div class="legend"><span>Ազատ</span><span class="used">Զբաղված</span><span class="fault">Անսարք</span></div>`;
const racks=()=>state.floors.flatMap(f=>f.racks.map(r=>({f,r})));
const findRack=id=>racks().find(x=>x.r.id===id);
const findDevice=id=>D.devices(state).find(x=>x.d.id===id);
const findPort=id=>D.ports(state).find(x=>x.p.id===id);
const header=(title,sub,actions='')=>tr`<div class="page-head"><div><div class="eyebrow">ԻՄ ՓԱՉ / ԱՇԽԱՏԱՆՔԱՅԻՆ ՏԱՐԱԾՔ</div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><div class="actions">${actions}</div></div>`;
function toast(message){message=tr(message);$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function status(message,error=false){$('#saveStatus').textContent=message;$('#saveStatus').dataset.error=error;}
async function api(url,options){if(personal()&&!url.startsWith('/api/auth/'))return PersonalStore.request(companyUrl(url),options);const res=await fetch(companyUrl(url),options);const data=await res.json();if(!res.ok){if(res.status===401&&authRequired&&!['/api/auth/login','/api/auth/pin'].includes(url))renderLogin();const e=new Error(tr(data.error)||tr('Կապի սխալ'));e.code=res.status;throw e;}return data;}
function recovery(){try{localStorage.setItem(recoveryKey(),JSON.stringify({schema:2,state,revision,portDraft:portDraftDirty?portDraft:null,savedAt:new Date().toISOString()}));}catch{}}
function banner(message){message=tr(message);$('#connectionBanner').hidden=false;$('#connectionBanner').innerHTML=`${esc(message)} <div>${button(tr('Ներբեռնել իմ տվյալները'),'backup','','small')}${button(tr('Կրկին պահել'),'save','','small')}${button(tr('Բեռնել ընդհանուր տարբերակը'),'reload','','small')}</div>`;}
function scheduleSave(){dirty=true;status(tr('Չպահված փոփոխություններ'));recovery();clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(),500);}
async function save(){
  if(portDraftDirty&&!flushPortEditor())return false;
  if(!ready||conflict)return false;if(saving)return saving;
  clearTimeout(saveTimer);
  saving=(async()=>{
    while(dirty){
      dirty=false;status(tr('Պահպանվում է…'));const body=JSON.stringify({state,revision});
      if(new Blob([body]).size>maxStateBytes){dirty=true;status(tr('Տվյալների չափը գերազանցում է պահպանման սահմանը'),true);recovery();banner(tr('Նվազեցրեք լուսանկարների չափը կամ ներբեռնեք JSON պատճենը։'));return false;}
      try{const result=await api('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body});revision=result.revision;}
      catch(e){dirty=true;conflict=e.code===409;status(tr('Չի պահպանվել'),true);recovery();banner(e.message);return false;}
    }
    status(personal()?tr('Պահված է սարքում'):tr('Պահված է'));$('#connectionBanner').hidden=true;
    if($('#portSaveStatus')&&!portDraftDirty)$('#portSaveStatus').textContent=tr('Պահված է։ Փոփոխությունները պահպանվում են ավտոմատ։');
    try{localStorage.removeItem(recoveryKey());}catch{}return true;
  })();
  try{return await saving;}finally{saving=null;}
}
function commit(fn,redraw=true){if(accountReadOnly)throw new Error(tr('Վերականգնման PIN-ով կարող եք միայն դիտել և ներբեռնել ձեր տվյալները։ Խմբագրելու համար մուտք գործեք գաղտնաբառով։'));if(conflict)throw new Error(tr('Նախ ներբեռնեք ձեր փոփոխությունները և բեռնեք ընդհանուր տարբերակը'));const next=structuredClone(state);fn(next);D.validate(next);state=next;scheduleSave();if(redraw)render();}
function route(){const [v,id]=(location.hash.slice(1)||'overview').split('/');return {view:viewNames[v]?v:'overview',id};}
function render(){
  document.body.classList.remove('login-view');
  sceneController?.destroy();sceneController=null;
  $('#companyLabel').textContent=state.company||tr('Նոր ընկերություն');renderCompanySelect();const {view,id}=route();document.body.classList.toggle('rack-view',view==='rack');$('#breadcrumb').textContent=viewNames[view];
  document.querySelectorAll('nav a').forEach(a=>{const active=a.dataset.view===(view==='rack'?'floors':view);a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  if(!state.company&&view!=='settings'&&!accountReadOnly){renderSetup();applyPanels();return;}
  if(view==='overview')renderOverview();else if(view==='floors')renderFloors();else if(view==='rack')renderRack(id);else if(view==='connections')renderConnections(id);else if(view==='search'||view==='reports')renderSearch(view);else renderSettings();
  if(accountReadOnly)$('#content').insertAdjacentHTML('afterbegin',tr`<section class="panel recovery-notice"><h2>Ձեր ֆայլը վերականգնված է</h2><p>Վերականգնման PIN-ով կարող եք միայն դիտել և ներբեռնել ձեր տվյալները։ Խմբագրելու համար մուտք գործեք գաղտնաբառով։</p>${button(tr('Ներբեռնել իմ տվյալները'),'backup','','primary')}${button(tr('Մուտք գործել'),'account-login')}</section>`);
  applyPanels();
}
function renderSetup(){
  $('#content').innerHTML=tr`<section class="panel setup"><div class="eyebrow">ՆՈՐ ԱՇԽԱՏԱՆՔԱՅԻՆ ՏԱՐԱԾՔ</div><h1>Սկսենք ձեր շենքից</h1><p class="muted">Նշեք ընկերությունն ու հարկերի քանակը։ Հետո ընտրեք այն հարկերը, որտեղ կան ռաքեր։</p><form id="setupForm"><div class="form-grid">${input('company',tr('Ընկերության անվանում'),'','text',tr('required maxlength="200" placeholder="Ընկերություն"'))}${input('count',tr('Հարկերի քանակ'),3,'number','required min="1" max="200"')}</div><div class="form-actions"><button class="button primary">Ստեղծել շենքը →</button></div><div id="setupError" class="form-error" hidden></div></form></section>`;
  $('#setupForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);try{commit(s=>{s.company=f.get('company').trim();if(!s.company)throw new Error(tr('Գրեք ընկերության անվանումը'));s.floors=Array.from({length:+f.get('count')},(_,i)=>({id:uid(),name:tr`${i+1}-րդ հարկ`,racks:[]}));});toast(tr('Շենքը ստեղծված է'));}catch(err){$('#setupError').hidden=false;$('#setupError').textContent=tr(err.message);}};
}
function renderWelcome(){
  ready=false;onboardingVisible=true;sceneController?.destroy();sceneController=null;
  document.body.classList.add('login-view');document.body.classList.remove('rack-view');$('#dialog').close();
  const choices=welcomeStep==='restore'?tr`<section><span class="option-number">JSON</span><h2>Վերականգնել ֆայլից</h2><p>Ընտրեք ձեր պահուստային JSON ֆայլը։ Մինչև հաստատելը տվյալները չեն փոխվի։</p>${button(tr('Ընտրել JSON ֆայլ'),'welcome-file','','primary')}</section><section><span class="option-number">CLOUD</span><h2>Վերականգնել cloud-ից</h2><p>Անձնական հաշվի ֆայլը բացեք էլ․ փոստով և ձեր վերականգնման PIN-ով։</p>${button(tr('Անձնական PIN-ով'),'account-recover')}${button(tr('Թիմային բազա · թիմի PIN'),'welcome-shared','','small')}</section><section><span class="option-number">DRIVE</span><h2>Վերականգնել Google Drive-ից</h2><p>Միացրեք ձեր Google հաշիվը և ընտրեք Իմ փաչ-ի պահուստային պատճենը։</p>${button(tr('Բացել Google Drive-ը'),'drive-restore')}</section>`:tr`<section><span class="option-number">01 · LOCAL</span><h2>Այս սարքում</h2><p>Ստեղծեք կամ շարունակեք ձեր նախագիծը։ Տվյալները պահվում են այս բրաուզերում։ Գրանցում պետք չէ։</p>${button(tr('Շարունակել այս սարքում'),'welcome-personal','','primary')}</section><section><span class="option-number">02 · RESTORE</span><h2>Վերականգնել նախագիծը</h2><p>Բացեք պահուստային ֆայլը, անձնական կամ թիմային cloud-ը, կամ ձեր Google Drive-ը։</p>${button(tr('Ընտրել վերականգնման աղբյուրը'),'welcome-import')}${button(tr('Թիմային բազա · թիմի PIN'),'welcome-shared','','small')}</section><section><span class="option-number">03 · ACCOUNT</span><h2>Հաշիվ և անձնական cloud</h2><p>Ստեղծեք ձեր հաշիվը կամ միացրեք սեփական Google Drive-ը։ Ձեր տվյալները չեն ցուցադրվի թիմի ընդհանուր բազայում։</p>${button(tr('Ստեղծել հաշիվ'),'account-signup')}${button(tr('Մուտք գործել'),'account-login')}${button(tr('Միացնել Google Drive-ը'),'drive-connect','','small')}</section>`;
  $('#content').innerHTML=tr`<section class="welcome panel"><div class="welcome-heading"><div class="login-mark">▤</div><div><div class="eyebrow">ԻՄ ՓԱՉ</div><h1>${welcomeStep==='restore'?tr('Որտե՞ղ է ձեր պահուստային պատճենը'):tr('Ինչպե՞ս եք ցանկանում աշխատել')}</h1></div></div><p class="muted">Ընտրեք ձեր աշխատանքային տարածքը։ Հետագայում կարող եք փոխել ընտրությունը կարգավորումներից։</p><div class="welcome-options">${choices}</div>${welcomeStep==='restore'?button(tr('← Հետ'),'welcome-home'):''}<input id="welcomeImport" type="file" accept=".json,application/json" hidden><p class="hint">Անձնական աշխատանքի համար գրանցում պետք չէ։ Պահպանեք նաև պահուստային պատճեն։</p></section>`;
  $('#welcomeImport').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{await readBackupFile(file);await beginWorkspace('personal');await restoreFile(file);}catch(error){toast(error.message);}finally{e.target.value='';}};
}
function renderAccountLogin(method='login'){
  accountMethod=method;onboardingVisible=false;ready=false;document.body.classList.add('login-view');document.body.classList.remove('rack-view');$('#dialog').close();
  const recovery=method==='recover',signup=method==='signup';
  $('#content').innerHTML=tr`<section class="panel setup login-card"><div class="login-mark">▤</div><div class="eyebrow">ԻՄ ՓԱՉ · ԱՆՁՆԱԿԱՆ ՀԱՇԻՎ</div><h1>${recovery?tr('Վերականգնել իմ ֆայլը'):signup?tr('Ստեղծել հաշիվ'):tr('Մուտք գործել')}</h1><p class="hint">${recovery?tr('Գրեք ձեր հաշվի էլ․ փոստը և անձնական PIN-ը։ Կբացվեն միայն ձեր տվյալները՝ դիտելու և ներբեռնելու համար։'):tr('Ձեր ընկերությունները և պահուստային պատճենները հասանելի կլինեն միայն ձեր հաշվին։')}</p><form id="loginForm">${input('email',tr('Էլ․ փոստ'),'','email','required autocomplete="username" maxlength="320"')}${recovery?input('pin',tr('Անձնական PIN'),'','password','required inputmode="numeric" pattern="[0-9]{12}" minlength="12" maxlength="12" autocomplete="off"'):input('password',tr('Գաղտնաբառ'),'','password',`required ${signup?'minlength="12" autocomplete="new-password"':'autocomplete="current-password"'} maxlength="1024"`)}${signup?tr('<p class="hint">Գաղտնաբառը՝ առնվազն 12 նիշ։ Էլ․ փոստը հաստատելուց հետո առաջին մուտքի ժամանակ կստանաք անձնական վերականգնման PIN։</p>'):''}<p id="loginError" role="alert"></p><button class="button primary" type="submit">${recovery?tr('Բացել իմ պահուստային պատճենը'):signup?tr('Ստեղծել հաշիվ'):tr('Մուտք գործել')}</button></form><div class="login-tabs">${button(tr('Մուտք գործել'),'account-login')}${button(tr('Ստեղծել հաշիվ'),'account-signup')}${button(tr('← Հետ'),'welcome-home')}</div></section>`;
  $('#loginForm').dataset.account='true';
  $('#loginForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{
    const fd=new FormData(e.target),res=await fetch('/api/account/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(fd))}),result=await res.json();
    if(!res.ok)throw new Error(result.error);
    if(result.confirmationRequired){$('#loginError').textContent=tr('Ստուգեք ձեր էլ․ փոստը և հաստատեք հաշիվը, ապա այստեղ մուտք գործեք։');return;}
    storageMode='account';onboardingChoice='account';accountUserId=result.user.id;accountReadOnly=recovery;
    activeCompanyId='default';state=D.empty();dirty=false;conflict=false;portDraftDirty=false;portDraft=null;selectedPortId='';
    const url=new URL(location.href);url.hash='overview';url.searchParams.delete('company');history.replaceState(null,'',url);
    await init();if(result.pin)showPersonalPin(result.pin);
  }catch(error){if($('#loginError'))$('#loginError').textContent=tr(error.message);}finally{b.disabled=false;}};
}
function showPersonalPin(pin){
  modal(tr('Պահպանեք ձեր անձնական PIN-ը'),tr`<p>Այս կոդը ցուցադրվում է միայն հիմա։ Պահպանեք այն ապահով տեղում՝ ձեր ֆայլերը վերականգնելու համար։</p><output class="personal-pin">${esc(pin)}</output><p class="hint">Թիմային PIN-երը ձեր անձնական հաշիվը չեն բացում։</p>`,null,button(tr('Ներբեռնել PIN-ը'),'download-personal-pin','','primary'));
  $('#dialog [data-action=download-personal-pin]').onclick=()=>download(new Blob(['My Patch\n'+location.origin+'\nPIN: '+pin+'\n'],{type:'text/plain'}),'MyPatch-personal-PIN.txt');
}
async function driveDialog(restore=false){
  if(ready&&!await save())return;
  if(!globalThis.DriveStore)throw new Error(tr('Google-ի կապը չբեռնվեց։ Կրկին փորձեք։'));
  if(!DriveStore.connected()){
    let clientId;try{clientId=await DriveStore.prepare();}catch(error){modal('Google Drive',`<p role="status">${esc(error.message)}</p>`);return;}
    modal(tr('Միացնել Google Drive-ը'),tr('<p>Թույլատրեք պահել Իմ փաչ-ի պահուստային պատճենները ձեր Google Drive-ում։ Ֆայլերը փոխանցվում են անմիջապես ձեր բրաուզերի և Google-ի միջև։</p>'),null,button(tr('Շարունակել Google-ով'),'drive-authorize','','primary'));
    $('#dialog [data-action=drive-authorize]').onclick=async e=>{e.target.disabled=true;try{await DriveStore.connect(clientId);await driveDialog(restore);}catch(error){$('#formError').hidden=false;$('#formError').textContent=error.message;}finally{e.target.disabled=false;}};return;
  }
  if(!restore){
    if(!ready){await beginWorkspace('personal');location.hash='settings';}
    modal('Google Drive',tr('<p>Google Drive-ը միացված է։ «Պահել Drive-ում» կոճակով ստեղծվում է ընթացիկ ընկերության նոր պատճեն։ Նախորդ պատճենները մնում են Drive-ում։</p>'),null,button(tr('Պահել Drive-ում'),'drive-save','','primary')+button(tr('Վերականգնել Google Drive-ից'),'drive-restore')+button(tr('Անջատել կապը'),'drive-disconnect'));
    return;
  }
  const files=await DriveStore.list();
  modal(tr('Վերականգնել Google Drive-ից'),files.length?select('driveFile',tr('Պահուստային պատճեն'),files.map(f=>[f.id,f.name]))+tr('<p class="hint">Ցուցադրվում են վերջին 100 պատճենները։ Ընտրելուց հետո կհաստատեք վերականգնումը։</p>'):tr('<p>Google Drive-ում Իմ փաչ-ի պատճեններ դեռ չկան։</p>'),files.length?async fd=>{
    const data=await DriveStore.read(fd.get('driveFile'));
    if(!ready||!personal())await beginWorkspace('personal');
    setTimeout(()=>restoreFile(new File([JSON.stringify(data)],'MyPatch-drive.json')).catch(e=>toast(e.message)),0);
  }:null);
}
async function beginWorkspace(mode){
  if(modeBusy||companyBusy)return;
  const fromWelcome=onboardingVisible;
  onboardingChoice=mode;onboardingVisible=false;
  try{localStorage.setItem('rackmap-workspace-choice',mode);localStorage.setItem('rackmap-storage-mode',mode);}catch{}
  await switchStorage(mode);
  if(fromWelcome&&ready){location.hash='overview';render();}
}
function floorCards(){return `<div class="floor-grid">${state.floors.map(f=>tr`<section class="floor-card"><div class="floor-title"><div><h3>${esc(f.name)}</h3><small>${f.racks.length} ռաք · ${f.racks.reduce((n,r)=>n+r.devices.length,0)} սարք</small></div>${button(tr('Խմբագրել'),'floor',f.id,'small')}</div>${f.racks.map(r=>tr`<a class="rack-link" href="#rack/${r.id}"><span class="rack-icon">▤</span><span><strong>${esc(r.name)}</strong><small>${r.u}U · ${r.devices.length} սարք ${r.location?'· '+esc(r.location):''}</small></span><span class="arrow">→</span></a>`).join('')||tr('<div class="empty" style="padding:18px">Այս հարկում ռաք դեռ չկա</div>')}<button class="floor-add" data-action="rack-new" data-id="${f.id}">＋ Ավելացնել ռաք</button></section>`).join('')}</div>`;}
function renderOverview(){const rs=racks(),ds=D.devices(state),all=D.rows(state),used=all.filter(x=>x.status==='used').length,fault=all.filter(x=>x.status==='fault').length;
  $('#content').innerHTML=header(state.company,tr('Շենքի ցանցային ենթակառուցվածքը՝ մեկ տեղում'),button(tr('＋ Ավելացնել հարկ'),'floor','','primary'))+tr`<div class="stats">${[[tr('Հարկեր'),state.floors.length,tr('Շենքի հարկերի քանակը')],[tr('Ռաքեր'),rs.length,tr`${ds.length} տեղադրված սարք`],[tr('Միացված պորտեր'),used,tr`${all.length} պորտից`],[tr('Խնդիր ունեցող պորտեր'),fault,tr('Պահանջում են ստուգում')]].map(([l,n,h])=>`<div class="stat"><label>${l}</label><strong>${n}</strong><small>${h}</small></div>`).join('')}</div><div class="section-head"><h2>Հարկեր և ռաքեր</h2>${legend()}</div>${floorCards()||tr('<div class="empty">Ավելացրեք առաջին հարկը</div>')}${fault?tr`<section class="panel" style="margin-top:22px"><div class="section-head"><h2>Ստուգման ենթակա պորտեր</h2></div>${resultsTable(all.filter(x=>x.status==='fault').slice(0,6))}</section>`:''}`;
}
function renderFloors(){$('#content').innerHTML=header(tr('Հարկեր և ռաքեր'),tr`${state.floors.length} հարկ · ${racks().length} ռաք`,button(tr('＋ Ավելացնել հարկ'),'floor','','primary'))+floorCards();}
function renderRack(id){const found=findRack(id);if(!found){$('#content').innerHTML=header(tr('Ռաքը չի գտնվել'),tr('Ընտրեք ռաքը հարկերի ցանկից'))+tr('<a class="button" href="#floors">← Հարկեր և ռաքեր</a>');return;}const {f,r}=found;
  const rows=D.rows(state),byPort=new Map(rows.map(x=>[x.p.id,x]));const mobile=window.matchMedia('(max-width:760px)').matches;const narrow=window.matchMedia('(max-width:1150px)').matches;const unit=Math.max(mobile?248:88,...r.devices.map(d=>Math.ceil((Math.ceil(d.portList.length/(mobile?6:narrow?12:24))*(mobile?46:23)+40)/d.height)));let grid='';
  for(let u=r.u;u>=1;u--){const row=r.u-u+1,occupied=r.devices.some(d=>u>=d.pos&&u<d.pos+d.height);grid+=`<div class="rack-tick" style="grid-row:${row};grid-column:1">${u}</div><div class="rack-hole" style="grid-row:${row};grid-column:3">▪</div>`;if(!occupied)grid+=tr`<button class="rack-blank" data-action="device-new" data-id="${r.id}" data-pos="${u}" style="grid-row:${row};grid-column:2" title="Ավելացնել սարք U${u}">＋ Ազատ դիրք · ${u}U</button>`;}
  for(const d of r.devices){grid+=tr`<section class="rack-device" style="grid-column:2;grid-row:${r.u-(d.pos+d.height-1)+1} / span ${d.height};--device:${d.color}"><div class="device-head"><button data-action="device-detail" data-id="${d.id}">${esc(d.name)} · ${d.type==='panel'?tr('Փաչ պանել'):tr('Սվիչ')}</button><small>${d.portList.length} պորտ · ${d.height}U</small></div><div class="mini-ports">${d.portList.map(p=>{const x=byPort.get(p.id);return tr`<button class="mini-port ${x.status}" data-action="port" data-id="${p.id}" aria-label="${esc(d.name)} պորտ ${p.number} ${D.statuses[x.status]}" title="${esc(`${d.name} / ${p.number} · ${D.statuses[x.status]} · ${x.cable} ${x.room}`)}">${p.number}</button>`;}).join('')}</div></section>`;}
  $('#breadcrumb').textContent=`${f.name} / ${r.name}`;
  $('#content').innerHTML=header(r.name,`${f.name} · ${r.location||tr('Ռաքի առջևի տեսք')}`,tr`<a class="button" href="#floors">← Հարկեր</a><a class="button" href="#connections/${r.id}">3D կապեր</a>${button(tr('Խմբագրել ռաքը'),'rack',r.id)}${button(tr('＋ Սարք'),'device-new',r.id,'primary')}`)+tr`<div class="section-head">${legend()}<span class="hint">U1՝ ներքևում · ${r.u}U</span></div><div class="rack-layout"><div class="rack-case"><div class="rack-rails" style="grid-template-rows:repeat(${r.u},${unit}px)">${grid}</div></div><aside class="rack-side" id="rightPanel"><div class="mobile-sheet-head"><strong>Պորտի գործիքներ</strong><button class="button small" data-action="toggle-right" aria-label="Փակել գործիքները">Փակել ×</button></div><section id="portTools" class="panel port-tools" aria-label="Պորտի գործիքներ"></section><details class="panel rack-info"><summary>Ռաքի տվյալներ և լուսանկար</summary><h2>Ռաքի տվյալներ</h2><div class="rack-detail"><div><small>Չափ</small>${r.u}U</div><div><small>Զբաղեցված է</small>${r.devices.reduce((n,d)=>n+d.height,0)}U</div><div><small>Սարքեր</small>${r.devices.length}</div><div><small>Պորտեր</small>${r.devices.reduce((n,d)=>n+d.portList.length,0)}</div></div>${r.photo?tr`<button class="text-button" data-action="photo" data-id="${r.id}" aria-label="Բացել ռաքի լուսանկարը"><img class="photo" src="${esc(r.photo)}" alt="${esc(r.name)} լուսանկար"></button>`:tr('<div class="empty" style="padding:18px 0">Լուսանկար չկա</div>')}${button(r.photo?tr('Փոխել լուսանկարը'):tr('＋ Ավելացնել լուսանկար'),'photo-upload',r.id,'small')}${r.photo?button(tr('Հեռացնել'),'photo-remove',r.id,'small'):''}<input type="file" id="photoInput" accept="image/png,image/jpeg,image/webp" hidden></details><section class="panel"><h2>Սարքերի ցանկ</h2>${[...r.devices].sort((a,b)=>b.pos-a.pos).map(d=>`<div class="device-item"><div><strong>${esc(d.name)}</strong><small>U${d.pos} · ${d.height}U · ${esc(d.model||'')}</small></div>${button(tr('Բացել'),'device-detail',d.id,'small')}</div>`).join('')||tr('<p class="hint">Սեղմեք ռաքի ազատ U դիրքի վրա՝ սարք ավելացնելու համար։</p>')}</section></aside></div>`;
  renderPortTools();paintPorts();
}
function renderConnections(id){
  const found=findRack(id);if(!found){$('#content').innerHTML=header(tr('Ռաքը չի գտնվել'),tr('Ընտրեք ռաքը հարկերի ցանկից'));return;}
  const scene=Rack3D.buildScene(state,id);
  $('#content').innerHTML=header(found.r.name+tr(' · 3D կապեր'),tr('Քաշեք պատկերը՝ պտտելու համար, մկնիկի անիվով՝ մոտեցրեք։ Միացում ընտրելիս ընդգծվում են երկու ծայրերը։'),tr`<a class="button" href="#rack/${id}">← Խմբագրել ռաքը</a>`)+tr`
    <div class="scene-layout"><section class="scene-stage"><div class="scene-toolbar">${button('↶','scene-left')}${button('↷','scene-right')}${button('＋','scene-in')}${button('−','scene-out')}${button(tr('Սկզբնական տեսք'),'scene-reset')}</div><canvas id="rackCanvas" aria-label="Ռաքի պտտվող 3D մոդել և գրանցված մալուխների կապեր">Միացումների ցանկը հասանելի է կողքի հատվածում։</canvas></section>
    <aside class="panel scene-links"><h2>Միացումներ · ${scene.links.length}</h2>${serviceLegend()}<p class="hint">Պատկերը ցույց է տալիս գրանցված կապերը, ոչ թե մալուխի իրական ֆիզիկական երթուղին։</p>${scene.links.map(l=>`<div class="scene-link" data-link="${l.id}"><button type="button" data-action="scene-select" data-id="${l.id}"><i style="background:${l.color}"></i><strong>${esc(l.cable||tr('Մալուխ'))}</strong><span>${esc(l.label)}</span><small>${esc(D.services[l.service].label)} · VLAN ${esc(l.vlan||'—')}${l.external?tr(' · Այլ ռաք'):''}</small></button>${button(tr('Խմբագրել պորտը'),'port',l.id,'small')}</div>`).join('')||tr('<p class="empty">Նախ պորտի աջ վահանակում ընտրեք միացված սվիչի պորտը։</p>')}</aside></div>`;
  const highlight=id=>document.querySelectorAll('.scene-link').forEach(el=>el.classList.toggle('selected',el.dataset.link===id));
  sceneController=Rack3D.mount($('#rackCanvas'),scene,highlight);
}
function filterControls(){return tr`<div class="filters"><input aria-label="Որոնում" data-filter="query" value="${esc(filters.query)}" placeholder="Սենյակ, մալուխ, սարք, պորտ կամ նշում…"><select aria-label="Հարկ" data-filter="floor">${opts([['',tr('Բոլոր հարկերը')],...state.floors.map(f=>[f.id,f.name])],filters.floor)}</select><select aria-label="Ռաք" data-filter="rack">${opts([['',tr('Բոլոր ռաքերը')],...racks().filter(x=>!filters.floor||x.f.id===filters.floor).map(x=>[x.r.id,`${x.f.name} / ${x.r.name}`])],filters.rack)}</select><select aria-label="Վիճակ" data-filter="status">${opts([['',tr('Բոլոր վիճակները')],...Object.entries(D.statuses)],filters.status)}</select></div>`;}
function resultsTable(rows){return tr`<div class="table-wrap"><table><thead><tr><th>Սարք / պորտ</th><th>Վիճակ</th><th>Մալուխ</th><th>Նպատակակետ</th><th>Կապ</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x.device)} / ${x.port}</strong><small>${esc(x.floor)} · ${esc(x.rack)}</small></td><td><span class="status ${x.status}">${D.statuses[x.status]}</span></td><td>${esc(x.cable||'—')}</td><td>${esc([x.destination,x.room].filter(Boolean).join(' / ')||'—')}<small>${esc([x.door,x.side].filter(Boolean).join(' / '))}</small></td><td>${esc(x.connection||'—')}</td><td>${button(tr('Բացել'),'port',x.p.id,'small')}</td></tr>`).join('')}</tbody></table></div>`;}
function renderSearch(view){const report=view==='reports';$('#content').innerHTML=header(report?tr('Հաշվետվություններ'):tr('Մալուխներ և որոնում'),report?tr('Արտահանումը ներառում է ընտրված ֆիլտրերին համապատասխան բոլոր պորտերը։'):tr('Գտեք պորտը և բացեք մալուխի ամբողջական քարտը։'),report?button('↓ Excel','xlsx')+button('↓ PDF','pdf','','primary'):'')+filterControls()+'<div id="results"></div>';renderResults();}
function renderResults(){const all=D.rows(state,filters);page=Math.min(page,Math.max(0,Math.ceil(all.length/50)-1));const slice=all.slice(page*50,page*50+50);$('#results').innerHTML=tr`<div class="result-count">${all.length} պորտ ${all.length>50?`· ${page*50+1}–${Math.min((page+1)*50,all.length)}`:''}</div>${slice.length?resultsTable(slice):tr('<section class="panel empty"><h2>Արդյունքներ չկան</h2><p>Փոխեք որոնման բառը կամ ֆիլտրերը։</p></section>')}${all.length>50?`<div class="actions" style="margin-top:16px">${page?button(tr('← Նախորդը'),'prev'):''}${(page+1)*50<all.length?button(tr('Հաջորդը →'),'next'):''}</div>`:''}`;}
function renderSettings(){
  let hasRecovery=false;try{hasRecovery=!!localStorage.getItem(recoveryKey());}catch{}
  $('#content').innerHTML=header(tr('Կարգավորումներ'),tr('Ընկերություն, թիմի հասանելիություն և պահուստային պատճեններ'))+tr`<div class="settings-grid"><section class="panel"><h2>Ընկերություն և շենք</h2><p>${esc(state.company||tr('Չի լրացվել'))}<br><span class="muted">${state.floors.length} հարկ</span></p>${button(tr('Խմբագրել'),'company','','primary')} ${button(tr('Ավելացնել հարկեր'),'bulk-floors')}</section><section class="panel"><h2>Թիմի հասանելիություն</h2><p class="muted">${personal()?tr('Անձնական բազան հասանելի է միայն այս սարքում։'):cloudMode?tr('Այս HTTPS հասցեով բացեք հավելվածը համակարգչից կամ հեռախոսից։'):tr('Նույն ցանցում հեռախոսից կամ այլ համակարգչից բացեք այս հասցեն։ Հիմնական համակարգիչը պետք է միացված լինի։')}</p><div id="networkInfo">Բեռնվում է…</div><p class="hint">${personal()?tr('Կոդ չի պահանջվում։'):cloudMode?tr('Մուտք՝ Իմ փաչ-ի հաշվով և RackMap-ի աշխատակցի թույլտվությամբ։'):tr('Տեղական հասանելիություն։ Եթե PIN-ը միացված է, մուտքագրեք աշխատակցի կոդը։')}</p></section><section class="panel"><h2>Պահուստային պատճեններ</h2><p class="muted">JSON պատճենը պահպանում է ամբողջ շենքը, կապերը և ռաքերի լուսանկարները։</p><div class="actions">${button(tr('↓ Այս ընկերության JSON'),'backup','','primary')}${button(tr('↓ Բոլոր ընկերությունների բազան'),'backup-all')}${button(tr('Վերականգնել ֆայլից'),'restore')}${hasRecovery?button(tr('Չպահված տարբերակ'),'recovery'):''}</div><input type="file" id="restoreInput" accept=".json,application/json" hidden></section><section class="panel"><h2>Պահպանման պատմություն</h2><p class="muted">Վերջին 50 փոփոխություններից առաջ եղած տարբերակները պահվում են ավտոմատ։</p>${button(tr('Դիտել տարբերակները'),'history')}</section><section class="panel"><h2>Բազայի պահպանում</h2><p class="muted">${personal()?tr('Անձնական տվյալները պահվում են այս բրաուզերի հիշողությունում։ Պահպանեք նաև JSON պատճենը։'):cloudMode?tr('Տվյալները պահվում են Supabase-ում՝ ծրագրի հրապարակումներից անկախ։ JSON պատճենը ներբեռնեք պահուստավորման համար։'):tr('Բազան պահվում է ծրագրի կոդից առանձին։ Գործարկման և կառուցվածքի փոփոխության ժամանակ ստեղծվում է ստուգված պատճեն։')}</p><div id="storageInfo" class="hint">Բեռնվում է…</div></section></div>`;
  $('.settings-grid').insertAdjacentHTML('afterbegin',tr`<section class="panel storage-mode"><div class="eyebrow">ՊԱՀՊԱՆՄԱՆ ՌԵԺԻՄ</div><h2>${personal()?tr('Անձնական · այս սարքում'):tr('Թիմային · ընդհանուր բազա')}</h2><p>${personal()?tr('Տվյալները պահվում են միայն այս հեռախոսի կամ բրաուզերի հիշողությունում։ Կոդ և ինտերնետ պետք չեն՝ առաջին բացումից հետո։'):tr('Աշխատակիցները կոդով բացում են նույն բազան։ Փոփոխությունները պահպանվում են ավտոմատ, և մյուսները տեսնում են դրանք։')}</p><div class="actions">${personal()?button(tr('☁ Միացնել cloud-ը'),'connect-cloud','','primary'):button(tr('Անցնել անձնական ռեժիմի'),'personal-mode')}${button(tr('Ընտրել աշխատանքային տարածքը'),'workspace-choice')}</div><p class="hint">${personal()?tr('Բրաուզերի տվյալները մաքրելիս անձնական բազան կարող է ջնջվել։ Պարբերաբար ներբեռնեք JSON պատճենը։'):tr('Անձնական ռեժիմի բազան առանձին է և մնում է տվյալ սարքում։')}</p></section>`);
  $('.settings-grid').insertAdjacentHTML('afterbegin',tr('<section class="panel"><h2>Իմ փաչ · բջջային հավելված</h2><p>Ստեղծված է Սիփան Դանիելյանի կողմից · <a href="https://royalarm.uk" target="_blank" rel="noopener">royalarm.uk</a><br>Սպասարկող՝ <a href="https://www.ditaknet.com/en" target="_blank" rel="noopener">ditaknet.com</a></p><p class="hint">Տեղադրեք հեռախոսի գլխավոր էկրանին՝ ծրագրի պատկերակով։ Աշխատելու համար սերվերի հետ կապ է պետք։</p>')+button(tr('↓ Տեղադրել հեռախոսում'),'install-app','','primary')+'</section>');
  $('.settings-grid').insertAdjacentHTML('afterbegin',tr`<section class="panel"><h2>Պորտերի նշանակության գույներ</h2><p class="hint">Այս ընկերության գույները կիրառվում են պորտերին և 3D կապերին։ Փոփոխությունները պահպանվում են ավտոմատ։</p><div class="color-settings">${Object.entries(D.services).map(([key,x])=>tr`<label><span>${esc(x.label)}</span><input type="color" data-service-color="${key}" value="${D.serviceColor(state,key)}" aria-label="${esc(x.label)} գույն"></label>`).join('')}</div>${button(tr('Սկզբնական գույները'),'colors-reset')}</section>`);
  document.querySelectorAll('[data-service-color]').forEach(el=>el.onchange=()=>{try{commit(s=>{s.serviceColors={...s.serviceColors,[el.dataset.serviceColor]:el.value};},false);}catch(err){el.value=D.serviceColor(state,el.dataset.serviceColor);toast(err.message);}});
  const storageInfo=$('#storageInfo'),networkInfo=$('#networkInfo');
  if(accountMode()){
    $('.storage-mode h2').textContent=tr('Անձնական · cloud');
    $('.storage-mode p').textContent=tr('Միայն ձեր հաշվի ընկերություններն ու պատճենները։ Թիմի ընդհանուր բազան առանձին է։');
    networkInfo.previousElementSibling.textContent=tr('Այս հասցեով մուտք գործեք ձեր անձնական հաշվով ցանկացած սարքից։');
    networkInfo.nextElementSibling.textContent=tr('Վերականգնման համար օգտագործեք ձեր էլ․ փոստը և անձնական PIN-ը։');
    if(!accountReadOnly)$('.storage-mode .actions').insertAdjacentHTML('beforeend',button(tr('Փոխարինել անձնական PIN-ը'),'account-pin-new'));
  }
  $('.settings-grid').insertAdjacentHTML('beforeend',tr`<section class="panel"><h2>Google Drive</h2><p>Պահեք և վերականգնեք ընթացիկ ընկերության պատճենը ձեր սեփական Google Drive-ում։</p><div class="actions">${button(tr('Միացնել Google Drive-ը'),'drive-connect')}${button(tr('Վերականգնել Google Drive-ից'),'drive-restore')}</div></section>`);
  api('/api/storage').then(x=>{if(storageInfo.isConnected)storageInfo.innerHTML=tr`<strong>Բազա</strong><div class="storage-path">${esc(x.database)}</div><strong>Ավտոմատ պատճեններ</strong><div class="storage-path">${esc(tr(x.backups))}</div>`;}).catch(()=>{if(storageInfo.isConnected)storageInfo.textContent=tr('Չհաջողվեց ստանալ բազայի տվյալները');});
  api('/api/network').then(x=>{if(networkInfo.isConnected)networkInfo.innerHTML=x.urls.map(url=>`<a class="network-address" href="${esc(url)}">${esc(url)}</a>`).join('')||(personal()?tr('<span class="hint">Թիմին միանալու համար օգտագործեք «Միացնել cloud-ը» կոճակը։</span>'):tr('<span class="hint">Ցանցային հասցե չկա։ Օգտագործեք localhost:3000։</span>'));}).catch(()=>{if(networkInfo.isConnected)networkInfo.textContent=tr('Հասցեները չհաջողվեց ստանալ');});
}
function modal(title,body,onSubmit,extras=''){
  const dlg=$('#dialog');if(dlg.open)dlg.close();dialogSubmit=onSubmit;
  dlg.innerHTML=tr`<div class="dialog-heading"><h2 id="dialogTitle">${esc(title)}</h2><button class="close" data-action="close" aria-label="Փակել">×</button></div>${onSubmit?'<form id="modalForm">':''}${body}<div class="form-error" id="formError" hidden></div><div class="form-actions">${extras}${button(tr('Փակել'),'close')}${onSubmit?tr('<button class="button primary" type="submit">Պահպանել</button>'):''}</div>${onSubmit?'</form>':''}`;
  if(onSubmit)$('#modalForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter||e.target.querySelector('button[type=submit]');b.disabled=true;try{await dialogSubmit(new FormData(e.target));dlg.close();toast(tr('Փոփոխությունն ընդունված է'));}catch(err){$('#formError').hidden=false;$('#formError').textContent=tr(err.message);}finally{b.disabled=false;}};
  dlg.showModal();
}
function confirmAction(title,description,action){modal(title,`<p>${esc(description)}</p>`,async()=>action());}
function floorModal(id){const f=state.floors.find(x=>x.id===id);modal(f?tr('Խմբագրել հարկը'):tr('Նոր հարկ'),input('name',tr('Հարկի անվանում'),f?.name||'','text','required maxlength="200"'),fd=>commit(s=>{if(f)s.floors.find(x=>x.id===id).name=fd.get('name').trim();else s.floors.push({id:uid(),name:fd.get('name').trim(),racks:[]});}),f?button(tr('Ջնջել հարկը'),'floor-delete',id,'danger'):'');}
function rackModal(id,floorId){const found=findRack(id),r=found?.r;modal(r?tr('Խմբագրել ռաքը'):tr('Նոր ռաք'),`<div class="form-grid">${input('name',tr('Ռաքի անվանում'),r?.name||'','text','required maxlength="200"')}${select('floorId',tr('Տեղադրման հարկ'),state.floors.map(f=>[f.id,f.name]),found?.f.id||floorId)}${select('preset',tr('Պատրաստի չափ'),[['',tr('Հատուկ չափ')],...[6,9,12,24,42].map(n=>[n,n+'U'])],r?.u||24)}${input('u',tr('Ռաքի բարձրություն U'),r?.u||24,'number','required min="1" max="60"')}${input('location',tr('Տեղադրության նկարագրություն'),r?.location||'','text',tr('maxlength="200" placeholder="Օրինակ՝ միջանցքի աջ կողմ"'))}</div>`,fd=>commit(s=>{const target=s.floors.find(f=>f.id===fd.get('floorId'));if(r){let source=s.floors.find(f=>f.racks.some(x=>x.id===id));const edit=source.racks.find(x=>x.id===id);Object.assign(edit,{name:fd.get('name').trim(),u:+fd.get('u'),location:fd.get('location').trim()});if(source.id!==target.id){source.racks=source.racks.filter(x=>x.id!==id);target.racks.push(edit);}}else target.racks.push({id:uid(),name:fd.get('name').trim(),u:+fd.get('u'),location:fd.get('location').trim(),photo:'',devices:[]});}),r?button(tr('Ջնջել ռաքը'),'rack-delete',id,'danger'):'');$('#preset').onchange=e=>{if(e.target.value)$('#u').value=e.target.value;};}
function deviceModal(id,rackId,position){const found=findDevice(id),d=found?.d,r=found?.r||findRack(rackId)?.r;if(!r)return;
  const nextPosition=position||Array.from({length:r.u},(_,i)=>r.u-i).find(u=>!r.devices.some(d=>u>=d.pos&&u<d.pos+d.height))||1;
  modal(d?tr('Խմբագրել սարքը'):tr('Նոր սարք'),tr`<div class="form-grid">${input('name',tr('Սարքի անվանում'),d?.name||'','text',tr('required maxlength="200" placeholder="PP-01 կամ SW-01"'))}${select('type',tr('Սարքի տեսակ'),[['panel',tr('Փաչ պանել')],['switch',tr('Սվիչ')]],d?.type||'panel')}${select('template',tr('Պատրաստի ձևանմուշ'),[['',tr('Ընտրել')],['panel-12-1',tr('Փաչ պանել 12 պորտ · 1U')],['panel-24-1',tr('Փաչ պանել 24 պորտ · 1U')],['panel-48-2',tr('Փաչ պանել 48 պորտ · 2U')],['switch-28-1',tr('Սվիչ 28 պորտ · 1U')],['switch-48-1',tr('Սվիչ 48 պորտ · 1U')]])}${input('model',tr('Մոդել'),d?.model||'','text','maxlength="200"')}${input('pos',tr('Սկզբնական U դիրք ներքևից'),d?.pos||nextPosition,'number',`required min="1" max="${r.u}"`)}${input('height',tr('Բարձրություն U'),d?.height||1,'number',`required min="1" max="${r.u}" list="heights"`)}${select('count',tr('Պորտերի քանակ'),[],d?.portList.length||24)}${input('color',tr('Սարքի գույն'),d?.color||'#397c78','color')}<datalist id="heights"><option value="1"><option value="2"><option value="4"></datalist><datalist id="portCounts"><option value="12"><option value="24"><option value="48"></datalist></div><p class="form-note">Փաչ պանել՝ 12, 24 կամ 48 պորտ։ Չափը ճշտեք սարքի մոդելով. 48 պորտանոց պանելը կարող է լինել 1U կամ 2U։ Տեղափոխելիս փոխեք U դիրքը։</p>`,fd=>commit(s=>{
    const rr=s.floors.flatMap(f=>f.racks).find(x=>x.id===r.id);const edit=d?rr.devices.find(x=>x.id===id):{id:uid(),portList:[]};const count=+fd.get('count');
    const removed=edit.portList.slice(count);if(removed.some(p=>p.status!=='free'||p.cable||p.room||p.notes||p.service||p.vlan||p.switchPortId||D.ports(s).some(x=>x.p.switchPortId===p.id)))throw new Error(tr('Հեռացվող պորտերում կան տվյալներ կամ կապեր։ Նախ մաքրեք դրանք։'));
    if(d&&d.type!==fd.get('type')&&edit.portList.some(p=>p.switchPortId||D.ports(s).some(x=>x.p.switchPortId===p.id)))throw new Error(tr('Կապված սարքի տեսակը փոխելուց առաջ անջատեք կապերը։'));
    Object.assign(edit,{name:fd.get('name').trim(),type:fd.get('type'),model:fd.get('model').trim(),pos:+fd.get('pos'),height:+fd.get('height'),color:fd.get('color')});
    edit.portList=Array.from({length:count},(_,i)=>edit.portList[i]||D.port(i+1,uid()));if(!d)rr.devices.push(edit);
  }),d?button(tr('Ջնջել սարքը'),'device-delete',id,'danger'):'');
  const setPortChoices=(preferred)=>{
    const isSwitch=$('#type').value==='switch',counts=isSwitch?[28,48]:[12,24,48];
    if(d&&d.type===$('#type').value&&!counts.includes(d.portList.length))counts.unshift(d.portList.length);
    const chosen=counts.includes(Number(preferred))?Number(preferred):(isSwitch?28:24);
    $('#count').innerHTML=opts(counts.map(n=>[n,n+tr(' պորտ')]),chosen);
  };
  setPortChoices(d?.portList.length||24);
  $('#type').onchange=()=>setPortChoices();
  $('#template').onchange=e=>{if(!e.target.value)return;const [type,count,height]=e.target.value.split('-');$('#type').value=type;setPortChoices(count);$('#height').value=height;};
}
function deviceDetail(id){const {d,r}=findDevice(id)||{};if(!d)return;const byId=new Map(D.rows(state).map(x=>[x.p.id,x]));modal(d.name,`<p class="port-title">${esc(r.name)} · U${d.pos} · ${d.height}U · ${esc(d.model)} </p>${legend()}<div class="port-overview">${d.portList.map(p=>`<button class="${byId.get(p.id).status}" data-action="port" data-id="${p.id}" title="${D.statuses[byId.get(p.id).status]}">${p.number}</button>`).join('')}</div>`,null,button(tr('Խմբագրել սարքը'),'device',id,'primary'));paintPorts();}

function serviceLegend(){return '<div class="service-legend">'+Object.entries(D.services).map(([key,x])=>`<span><i style="background:${D.serviceColor(state,key)}"></i>${esc(x.label)}</span>`).join('')+'</div>';}
function paintPorts(){
  const byId=new Map(D.rows(state).map(x=>[x.p.id,x]));
  document.querySelectorAll('.mini-port,.port-overview [data-action="port"]').forEach(el=>{
    const row=byId.get(el.dataset.id);if(!row)return;
    const service=D.services[row.service];
    el.classList.remove('free','used','fault');el.classList.add(row.status,'service-port');
    el.classList.toggle('port-selected',row.p.id===selectedPortId);
    const color=D.serviceColor(state,row.service);
    el.style.setProperty('--port-color',color);
    const rgb=color.slice(1).match(/../g).map(x=>{const v=parseInt(x,16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
    el.style.setProperty('--port-ink',rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#10242a':'#ffffff');
    el.setAttribute('aria-pressed',String(row.p.id===selectedPortId));
    const description=`${row.device} / ${row.port} · ${service.label} · VLAN ${row.vlan||'—'} · ${D.statuses[row.status]} · ${row.cable} ${row.room}`;
    el.title=description;el.setAttribute('aria-label',description);
  });
}
function renderPortTools(){
  const host=$('#portTools');if(!host)return;
  const item=findPort(selectedPortId);
  if(!item||item.r.id!==route().id){
    host.innerHTML=tr`<div class="eyebrow">ԳՈՐԾԻՔՆԵՐ</div><h2>Պորտի խմբագրում</h2><p class="hint">Սեղմեք ռաքի պորտին։ Տվյալները կխմբագրվեն այստեղ՝ ռաքի կողքին։</p><h3 class="link-heading">Link config · գույներ</h3>${serviceLegend()}<p class="hint">Պորտի հիմնական գույնը ցույց է տալիս նշանակությունը։ Փոքր կետը՝ ազատ, զբաղված կամ անսարք վիճակը։</p>`;
    return;
  }
  const {p,d,r}=item;
  const incoming=D.ports(state).find(x=>x.p.switchPortId===p.id);
  const info=incoming?.p||p;
  const v=portDraft?.id===p.id?portDraft.values:{...info,status:incoming?(p.status==='fault'?'fault':'used'):p.status};
  const all=D.ports(state),usedTargets=new Set(all.filter(x=>x.p.id!==p.id&&x.p.switchPortId).map(x=>x.p.switchPortId));
  const choices=all.filter(x=>x.d.type==='switch'&&!usedTargets.has(x.p.id)).map(x=>[x.p.id,`${x.f.name} / ${x.r.name} / ${x.d.name} / ${x.p.number}${x.p.status==='fault'?tr(' · ԱՆՍԱՐՔ'):''}`]);
  host.innerHTML=tr`<div class="port-editor-heading"><div><div class="eyebrow">ԸՆՏՐՎԱԾ ՊՈՐՏ</div><h2>${esc(d.name)} / ${p.number}</h2></div>${button('×','port-deselect','','small')}</div><p class="port-title">${esc(r.name)} · ${d.type==='panel'?tr('Փաչ պանել'):tr('Սվիչ')}</p>
  <form id="portForm">
    <fieldset class="link-config"><legend>Link config</legend>
      <div class="service-choices">${Object.entries(D.services).map(([key,x])=>`<label class="service-choice" style="--service-color:${D.serviceColor(state,key)}"><input type="radio" name="service" value="${key}" ${(v.service||'')===key?'checked':''}><span><i></i>${esc(x.label)}</span></label>`).join('')}</div>
      ${input('vlan','VLAN',v.vlan||'','number',tr('min="1" max="4094" step="1" placeholder="Օրինակ՝ 20"'))}
      <p class="hint">VLAN 1–4094 · տեղեկատվական դաշտ</p>
    </fieldset>
    ${incoming?tr`<div class="connection-path">Կապ՝ ${esc(incoming.d.name)} / ${incoming.p.number}<br><small>Նշանակությունը, VLAN-ն ու մալուխի տվյալները ընդհանուր են կապի երկու ծայրերի համար։</small></div>`:''}
    <div class="form-grid">
      ${select('status',tr('Վիճակ'),incoming?[['used',tr('Զբաղված')],['fault',tr('Անսարք')]]:Object.entries(D.statuses),v.status)}
      ${input('cable',tr('Մալուխի համար'),v.cable,'text','maxlength="200" placeholder="C-024"')}
      ${select('floorId',tr('Նպատակակետի հարկ'),[['',tr('Ընտրել')],...state.floors.map(f=>[f.id,f.name])],v.floorId)}
      ${input('room',tr('Սենյակ'),v.room,'text','maxlength="200" placeholder="205"')}
      ${input('door',tr('Դուռ / տեղադրություն'),v.door,'text',tr('maxlength="200" placeholder="Աջ կողմի դուռ"'))}
      ${input('side',tr('Կողմ'),v.side,'text','maxlength="200" list="sides"')}
      <datalist id="sides"><option value="Աջ"><option value="Ձախ"><option value="Կենտրոն"></datalist>
      ${d.type==='panel'?`<div class="field full">${select('switchPortId',tr('Միացված սվիչի պորտ'),[['',tr('Կապ չկա')],...choices],v.switchPortId)}</div>`:''}
      <div class="field full"><label for="notes">Լրացուցիչ նշումներ</label><textarea id="notes" name="notes" maxlength="2000">${esc(v.notes)}</textarea></div>
    </div>
    <div id="portError" class="form-error" role="alert" hidden></div>
    <div class="port-save-status hint" id="portSaveStatus" role="status">Փոփոխությունները պահպանվում են ավտոմատ։</div>
    <div class="form-actions">${button(tr('Չեղարկել'),'port-discard','','small')}${button(tr('Մաքրել'),'port-clear',p.id,'danger')}<button type="submit" class="button primary">Պահպանել</button></div>
  </form>`;
  const form=$('#portForm');
  form.addEventListener('input',stagePortDraft);
  form.addEventListener('change',stagePortDraft);
  form.onsubmit=async e=>{e.preventDefault();stagePortDraft();if(flushPortEditor()&&await save())toast(tr('Պորտը պահպանված է'));};
}
function stagePortDraft(){
  const form=$('#portForm');if(!form)return;
  portDraft={id:selectedPortId,values:Object.fromEntries(new FormData(form))};
  portDraftDirty=true;clearTimeout(portTimer);
  if($('#portSaveStatus'))$('#portSaveStatus').textContent=tr('Փոփոխվում է…');
  recovery();
  portTimer=setTimeout(()=>flushPortEditor(),600);
}
function flushPortEditor(){
  clearTimeout(portTimer);
  if(!portDraftDirty||!portDraft)return true;
  const {id,values:v}=portDraft;
  try{
    const form=$('#portForm');if(form&&!form.checkValidity())throw new Error(tr('Ստուգեք դաշտերը։ VLAN-ը պետք է լինի 1–4094 ամբողջ թիվ կամ դատարկ։'));
    commit(s=>{
      const entry=D.ports(s).find(x=>x.p.id===id);if(!entry)throw new Error(tr('Պորտը չի գտնվել'));
      const current=entry.p,source=D.ports(s).find(x=>x.p.switchPortId===id)?.p||current;
      for(const key of ['cable','floorId','room','door','side','notes','service','vlan'])source[key]=String(v[key]||'').trim();
      if(source.vlan)source.vlan=String(Number(source.vlan));
      if(source===current){
        current.status=v.status;current.switchPortId=v.switchPortId||'';
        if(current.status==='free'&&(current.cable||current.switchPortId||current.service))current.status='used';
      }else{
        current.status=v.status==='fault'?'fault':'free';
        if(source.status==='free'&&(source.cable||source.service))source.status='used';
      }
    },false);
    portDraftDirty=false;portDraft=null;
    if($('#portError'))$('#portError').hidden=true;
    if($('#portSaveStatus'))$('#portSaveStatus').textContent=tr('Փոփոխությունը պատրաստ է պահպանման։');
    const current=findPort(id);if(current&&$('#portForm [name=status]'))$('#portForm [name=status]').value=D.rows(state).find(x=>x.p.id===id).status;
    paintPorts();return true;
  }catch(e){
    if($('#portError')){$('#portError').hidden=false;$('#portError').textContent=tr(e.message);}
    if($('#portSaveStatus'))$('#portSaveStatus').textContent=tr('Չի պահպանվել։ Ուղղեք սխալը կամ չեղարկեք փոփոխությունը։');
    status(tr('Պորտի փոփոխությունը չի պահպանվել'),true);return false;
  }
}
function portModal(id){
  if(!flushPortEditor())return;
  const item=findPort(id);if(!item)return;
  selectedPortId=id;portDraft=null;portDraftDirty=false;panelPrefs.right=true;if(window.matchMedia('(max-width:760px)').matches)panelPrefs.left=false;applyPanels();
  $('#dialog').close();
  if(route().view!=='rack'||route().id!==item.r.id){location.hash='#rack/'+item.r.id;return;}
  renderPortTools();paintPorts();
  if(window.matchMedia('(max-width:760px)').matches)$('#portTools').scrollIntoView?.({behavior:'smooth',block:'start'});
}
async function uploadPhoto(id,file){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error(tr('Ընտրեք PNG, JPEG կամ WebP լուսանկար'));if(file.size>12*1024*1024)throw new Error(tr('Լուսանկարը պետք է լինի մինչև 12 ՄԲ'));
  const uploadCompany=activeCompanyId;
  const bitmap=await createImageBitmap(file);const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const photo=canvas.toDataURL('image/jpeg',.82);if(uploadCompany!==activeCompanyId)throw new Error(tr('Ընկերությունը փոխվել է։ Լուսանկարը նորից ընտրեք համապատասխան ընկերությունում։'));commit(s=>{s.floors.flatMap(f=>f.racks).find(r=>r.id===id).photo=photo;});toast(tr('Լուսանկարը ավելացվել է'));
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function backup(){download(new Blob([JSON.stringify({application:'RackMap',schema:2,exportedAt:new Date().toISOString(),state,portDraft:portDraftDirty?portDraft:null},null,2)],{type:'application/json'}),`RackMap-${new Date().toISOString().slice(0,10)}.json`);}
async function exportReport(type){if(personal())return exportPersonal(type);const exportCompany=activeCompanyId,exportFilters={...filters};if(!await save())throw new Error(tr('Նախ պահպանեք փոփոխությունները'));const res=await fetch(companyUrl(`/api/export.${type}?${new URLSearchParams(exportFilters)}`,exportCompany));if(!res.ok)throw new Error((await res.json()).error);download(await res.blob(),`RackMap.${type}`);toast(tr('Հաշվետվությունը պատրաստ է'));}
async function readBackupFile(file){if(file.size>24*1024*1024)throw new Error(tr('Ֆայլը չափազանց մեծ է'));let data;try{data=JSON.parse(await file.text());}catch{throw new Error(tr('JSON ֆայլը վնասված է'));}
  if(data.format==='ditaknet-rackmap-cloud'&&data.version===1&&Array.isArray(data.companies)){
    if(!data.companies.length)throw new Error(tr('Պահուստային պատճենում ընկերություններ չկան'));
    for(const row of data.companies)D.validate(row.body);
  }else D.validate(data.state||data);return data;
}
async function restoreFile(file){if(!file)return;const data=await readBackupFile(file);
  if(data.companies){modal(tr('Ընտրեք վերականգնվող ընկերությունը'),select('restoreCompany',tr('Ընկերություն'),data.companies.map((row,i)=>[i,row.body.company])),async fd=>{const row=data.companies[Number(fd.get('restoreCompany'))];setTimeout(()=>restoreFile(new File([JSON.stringify({state:row.body})],'company.json')).catch(e=>toast(e.message)),0);});return;}
  const next=data.state||data;
  const draft=data.portDraft;
  if(draft&&(!draft.values||typeof draft.values!=='object'||!Object.values(draft.values).every(v=>typeof v==='string')||!D.ports(next).some(x=>x.p.id===draft.id)))throw new Error(tr('Պորտի չպահված պատճենի ձևաչափը սխալ է'));
  confirmAction(tr('Վերականգնել պատճենը'),tr`Ընկերություն՝ ${next.company}։ Հարկեր՝ ${next.floors.length}։ Ներկայիս տվյալները կփոխարինվեն և կպահվեն պատմության մեջ։`,()=>{
    clearTimeout(portTimer);portDraft=null;portDraftDirty=false;
    commit(s=>{Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,next);});
    if(draft){portDraft=draft;portDraftDirty=true;selectedPortId=draft.id;location.hash='#rack/'+findPort(draft.id).r.id;render();}
  });
}
function deleteItem(kind,id){const item=kind==='floor'?state.floors.find(f=>f.id===id):kind==='rack'?findRack(id)?.r:findDevice(id)?.d;if(!item)return;confirmAction(tr`Ջնջել ${item.name}`,kind==='floor'?tr('Կջնջվեն այս հարկի ռաքերը, սարքերը և պորտերը։ Նպատակակետերի հարկի հղումները կմաքրվեն։'):tr('Կջնջվեն նաև ներառված պորտերի տվյալները և դրանց կապերը։ Նախորդ տարբերակը կմնա պահպանման պատմության մեջ։'),()=>{
    commit(s=>{const removed=new Set();
      if(kind==='floor'){const f=s.floors.find(x=>x.id===id);for(const r of f.racks)for(const d of r.devices)for(const p of d.portList)removed.add(p.id);s.floors=s.floors.filter(x=>x.id!==id);for(const {p} of D.ports(s))if(p.floorId===id)p.floorId='';}
      else if(kind==='rack'){for(const f of s.floors){const r=f.racks.find(x=>x.id===id);if(r){for(const d of r.devices)for(const p of d.portList)removed.add(p.id);f.racks=f.racks.filter(x=>x.id!==id);}}}
      else {for(const {r,d} of D.devices(s))if(d.id===id){for(const p of d.portList)removed.add(p.id);r.devices=r.devices.filter(x=>x.id!==id);}}
      D.disconnect(s,removed);
    });if(kind==='rack'||kind==='floor')location.hash='#floors';
  });}
async function reloadShared(){if((dirty||portDraftDirty)&&!confirm(tr('Բեռնե՞լ ընդհանուր տարբերակը։ Ձեր չպահված փոփոխությունները պահեք «Ներբեռնել իմ տվյալները» կոճակով։')))return;const data=await api('/api/state');state=data.state;revision=data.revision;dirty=false;conflict=false;clearTimeout(portTimer);portDraftDirty=false;portDraft=null;$('#connectionBanner').hidden=true;$('#dialog').close();status(tr('Պահված է'));render();}
function renderCompanySelect(){
  const select=$('#companySelect');if(!select)return;
  select.innerHTML=opts(companies.map(c=>[c.id,c.id===activeCompanyId?(state.company||tr('Նոր ընկերություն')):(c.name||tr('Նոր ընկերություն'))]),activeCompanyId);
  select.disabled=companyBusy||!ready;
  const add=$('[data-action="company-new"]');if(add)add.disabled=companyBusy||!ready;
}
async function refreshCompanies(){companies=await api('/api/companies');renderCompanySelect();}
async function switchCompany(id){
  if(companyBusy||id===activeCompanyId){renderCompanySelect();return;}
  companyBusy=true;$('#content').inert=true;renderCompanySelect();
  try{
    if(!await save())throw new Error(tr('Նախ պահպանեք կամ լուծեք ընթացիկ ընկերության չպահված փոփոխությունները։'));
    const data=personal()?await PersonalStore.request(companyUrl('/api/state',id)):await (async()=>{const res=await fetch(companyUrl('/api/state',id));const data=await res.json();if(!res.ok)throw new Error(tr(data.error));return data;})();
    D.validate(data.state);
    activeCompanyId=id;state=data.state;revision=data.revision;dirty=false;conflict=false;selectedPortId='';portDraft=null;portDraftDirty=false;clearTimeout(portTimer);
    filters={query:'',floor:'',rack:'',status:''};page=0;
    try{localStorage.setItem('rackmap-active-company',id);}catch{}
    const url=new URL(location.href);url.searchParams.set('company',id);url.hash='overview';history.replaceState(null,'',url);
    $('#dialog').close();$('#connectionBanner').hidden=true;status(tr('Պահված է'));render();
    try{if(localStorage.getItem(recoveryKey()))banner(tr('Այս ընկերության համար այս սարքում կա չպահված պատճեն։ Բացեք Կարգավորումները՝ այն վերականգնելու համար։'));}catch{}
  }finally{companyBusy=false;$('#content').inert=false;renderCompanySelect();}
}
function newCompany(){
  modal(tr('Նոր ընկերություն'),tr`<div class="form-grid">${input('name',tr('Ընկերության անվանում'),'','text','required maxlength="200"')}${input('floorCount',tr('Հարկերի քանակ'),1,'number','required min="1" max="200"')}</div><p class="hint">Կստեղծվի առանձին ընկերություն։ Գործող ընկերության ռաքերն ու կապերը կմնան իրենց տեղում։</p>`,async fd=>{
    if(!await save())throw new Error(tr('Նախ պահպանեք գործող ընկերության փոփոխությունները։'));
    const data=await api('/api/companies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:fd.get('name'),floorCount:Number(fd.get('floorCount'))})});
    await refreshCompanies();await switchCompany(data.id);
  });
}
async function backupAll(){
  if(personal()){if(!await save())return;download(new Blob([JSON.stringify(await api('/api/backup'))],{type:'application/json'}),'MyPatch-personal-all.json');return;}
  if(!await save())throw new Error(tr('Նախ պահպանեք փոփոխությունները'));
  const res=await fetch(companyUrl('/api/backup'),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  if(!res.ok)throw new Error((await res.json()).error);
  download(await res.blob(),`RackMap-all-companies-${new Date().toISOString().slice(0,10)}.${cloudMode?'json':'sqlite'}`);toast(tr('Բոլոր ընկերությունների պատճենը պատրաստ է'));
}
async function switchStorage(mode){
  onboardingChoice=mode;onboardingVisible=false;
  try{localStorage.setItem('rackmap-workspace-choice',mode);}catch{}
  if(modeBusy)return;if(storageMode===mode){if(!ready)await init();return;}
  if(ready&&!await save())throw new Error(tr('Նախ պահպանեք ընթացիկ փոփոխությունները'));
  modeBusy=true;ready=false;
  try{storageMode=mode;try{localStorage.setItem('rackmap-storage-mode',mode);}catch{}activeCompanyId='default';selectedPortId='';portDraft=null;portDraftDirty=false;dirty=false;conflict=false;filters={query:'',floor:'',rack:'',status:''};page=0;clearTimeout(portTimer);clearTimeout(saveTimer);
    const url=new URL(location.href);url.searchParams.delete('company');url.hash='settings';history.replaceState(null,'',url);
    accountReadOnly=false;accountUserId='';await init();
  }finally{modeBusy=false;}
}
async function connectCloud(){
  if(!await save())return;
  const res=await fetch('/api/config');if(!res.ok)throw new Error(tr('Cloud կապ չկա'));
  const config=await res.json();
  if(!config.pinEnabled&&config.accountEnabled){await switchStorage('shared');return;}
  if(!config.pinEnabled)throw new Error(tr('Թիմային կոդը դեռ միացված չէ։ Ադմինիստրատորը պետք է կարգավորի cloud PIN-ը։'));
  modal(tr('Միանալ թիմային cloud-ին'),tr('<p>Կոդով մուտքից հետո կբացվի թիմի ընդհանուր բազան։ Անձնական ընկերությունները կմնան այս սարքում։</p>')+input('cloudPin',tr('Թիմային PIN'),'','password','required inputmode="numeric" pattern="[0-9]{8,12}" autocomplete="off"'),async fd=>{
    const response=await fetch('/api/auth/pin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:fd.get('cloudPin')})});const result=await response.json();if(!response.ok)throw new Error(result.error);
    await switchStorage('shared');
  });
}
async function exportPersonal(type){
  if(!await save())return;
  if(type==='pdf'){location.hash='reports';await new Promise(resolve=>setTimeout(resolve,50));if($('#results'))$('#results').innerHTML=resultsTable(D.rows(state,filters));window.print();renderResults();return;}
  if(!window.ExcelJS)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/exceljs.min.js';script.onload=resolve;script.onerror=()=>reject(new Error(tr('Excel գործիքը չբեռնվեց։ Միացեք ցանցին և կրկին փորձեք։')));document.head.append(script);});
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet(tr('Միացումներ'));const fields=['floor','rack','device','port','status','cable','destination','room','door','side','connection','service','vlan','notes'];
  sheet.addRow([tr('Հարկ'),tr('Ռաք'),tr('Սարք'),tr('Պորտ'),tr('Վիճակ'),tr('Մալուխ'),tr('Հարկ՝ նպատակակետ'),tr('Սենյակ'),tr('Դուռ'),tr('Կողմ'),tr('Կապ'),tr('Նշանակություն'),'VLAN',tr('Նշումներ')]);
  for(const row of D.rows(state,filters))sheet.addRow(fields.map(k=>k==='status'?D.statuses[row[k]]:k==='service'?D.services[row[k]].label:row[k]));
  sheet.columns.forEach(c=>c.width=22);download(new Blob([await book.xlsx.writeBuffer()]),'MyPatch-personal.xlsx');
}
const actions={
  'welcome-personal':()=>beginWorkspace('personal'),
  'welcome-shared':()=>beginWorkspace('shared'),
  'welcome-import':()=>{welcomeStep='restore';renderWelcome();},
  'welcome-home':()=>{welcomeStep='home';renderWelcome();},
  'welcome-file':()=>$('#welcomeImport').click(),
  'account-signup':()=>renderAccountLogin('signup'),
  'account-login':()=>renderAccountLogin('login'),
  'account-recover':()=>renderAccountLogin('recover'),
  'account-pin-new':()=>confirmAction(tr('Փոխարինել անձնական PIN-ը'),tr('Հին անձնական PIN-ը կդադարի աշխատել։ Նոր կոդը պետք է նորից պահպանել։'),async()=>{const result=await api('/api/account/pin/new',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});setTimeout(()=>showPersonalPin(result.pin),0);}),
  'drive-connect':()=>driveDialog(false),
  'drive-restore':()=>driveDialog(true),
  'drive-save':async()=>{if(!await save())return;await DriveStore.save(structuredClone(state));toast(tr('Պատճենը պահված է ձեր Google Drive-ում'));$('#dialog').close();},
  'drive-disconnect':()=>{DriveStore.disconnect();$('#dialog').close();toast(tr('Google Drive-ի կապն անջատված է'));},
  'workspace-choice':async()=>{if(ready&&!await save())return;welcomeStep='home';renderWelcome();},
  'connect-cloud':connectCloud,
  'personal-mode':async()=>{await switchStorage('personal');navigator.storage?.persist?.().catch(()=>{});},
  'login-pin':()=>renderLogin('pin'),'login-account':()=>renderLogin('account'),
  'panels-close':()=>{panelPrefs.left=false;panelPrefs.right=false;applyPanels();},
  logout:async()=>{if(cloudMode){if(!await save())return;await api('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});await switchStorage('personal');return;}if(!await save())return;await api('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});state=D.empty();selectedPortId='';portDraft=null;companies=[];$('#companyLabel').textContent=tr('Իմ փաչ');$('#companySelect').innerHTML='';renderLogin();},
  'toggle-left':()=>togglePanel('left'),
  'toggle-right':()=>togglePanel('right'),
  'colors-reset':()=>{commit(s=>{delete s.serviceColors;});toast(tr('Գույները վերականգնված են'));},
  'scene-left':()=>sceneController?.rotate(-.2),'scene-right':()=>sceneController?.rotate(.2),
  'scene-in':()=>sceneController?.zoom(1.2),'scene-out':()=>sceneController?.zoom(1/1.2),
  'scene-reset':()=>{sceneController?.reset();document.querySelectorAll('.scene-link').forEach(el=>el.classList.remove('selected'));},
  'scene-select':id=>{sceneController?.select(id);document.querySelectorAll('.scene-link').forEach(el=>el.classList.toggle('selected',el.dataset.link===id));},
  'company-new':newCompany,'backup-all':backupAll,
  save:async()=>{if(await save())toast(tr('Տվյալները պահպանված են'));},close:()=>$('#dialog').close(),
  floor:id=>floorModal(id),'rack-new':id=>rackModal('',id),rack:id=>rackModal(id),
  'device-new':(id,el)=>deviceModal('',id,+el.dataset.pos||undefined),device:id=>deviceModal(id),'device-detail':deviceDetail,port:portModal,
  'floor-delete':id=>deleteItem('floor',id),'rack-delete':id=>deleteItem('rack',id),'device-delete':id=>deleteItem('device',id),
  'port-deselect':()=>{if(!flushPortEditor())return;selectedPortId='';portDraft=null;renderPortTools();paintPorts();},
  'port-discard':()=>{clearTimeout(portTimer);portDraftDirty=false;portDraft=null;renderPortTools();status(dirty?tr('Չպահված փոփոխություններ'):tr('Պահված է'));},
  'port-clear':id=>{
    const host=$('#portError');if(!host)return;
    host.hidden=false;host.innerHTML=tr('Մաքրե՞լ պորտի տվյալները և կապը։ ')+button(tr('Այո, մաքրել'),'port-clear-confirm',id,'danger small')+button(tr('Չեղարկել'),'port-clear-cancel','','small');
  },
  'port-clear-cancel':()=>{$('#portError').hidden=true;},
  'port-clear-confirm':id=>{
    clearTimeout(portTimer);portDraft=null;portDraftDirty=false;
    commit(s=>{const current=D.ports(s).find(x=>x.p.id===id).p;const incoming=D.ports(s).find(x=>x.p.switchPortId===id)?.p;
      if(incoming)incoming.switchPortId='';
      Object.assign(current,D.port(current.number,current.id));
    });
  },
  company:()=>modal(tr('Ընկերություն'),input('name',tr('Ընկերության անվանում'),state.company,'text','required maxlength="200"'),fd=>commit(s=>{s.company=fd.get('name').trim();if(!s.company)throw new Error(tr('Անվանումը պարտադիր է'));})),
  'bulk-floors':()=>modal(tr('Ավելացնել հարկեր'),input('count',tr('Քանի նոր հարկ ավելացնել'),1,'number',`required min="1" max="${200-state.floors.length}"`),fd=>commit(s=>{let n=s.floors.length+1;for(let i=0;i<+fd.get('count');i++){while(s.floors.some(f=>f.name===tr`${n}-րդ հարկ`))n++;s.floors.push({id:uid(),name:tr`${n++}-րդ հարկ`,racks:[]});}})),
  'photo-upload':id=>{const input=$('#photoInput');input.onchange=()=>uploadPhoto(id,input.files[0]).catch(e=>toast(e.message));input.click();},
  photo:id=>modal(tr('Ռաքի լուսանկար'),tr`<img class="photo-full" src="${esc(findRack(id).r.photo)}" alt="Ռաքի լուսանկար">`),
  'photo-remove':id=>confirmAction(tr('Հեռացնել լուսանկարը'),tr('Լուսանկարը կհեռացվի այս ռաքից։'),()=>commit(s=>s.floors.flatMap(f=>f.racks).find(r=>r.id===id).photo='')),
  backup,restore:()=>{const input=$('#restoreInput');input.value='';input.onchange=()=>restoreFile(input.files[0]).catch(e=>toast(e.message));input.click();},
  recovery:()=>{const raw=localStorage.getItem(recoveryKey());if(raw)return restoreFile(new File([raw],'recovery.json',{type:'application/json'}));},
  xlsx:()=>exportReport('xlsx'),pdf:()=>exportReport('pdf'),reload:reloadShared,
  next:()=>{page++;renderResults();},prev:()=>{page--;renderResults();},
  history:async()=>{const rows=await api('/api/history');modal(tr('Պահպանման պատմություն'),rows.length?rows.map(x=>tr`<div class="history-row"><span>Տարբերակ ${x.revision}<br><small>${esc(new Date(x.saved_at).toLocaleString(globalThis.RackI18n?.locale||'hy-AM'))}</small></span>${button(tr('Վերականգնել'),'history-restore',x.revision,'small')}</div>`).join(''):tr('<p class="hint">Պահպանված տարբերակներ դեռ չկան։</p>'));},
  'history-restore':async id=>{const {state:old}=await api('/api/history/'+id);D.validate(old);confirmAction(tr('Վերականգնել նախորդ տարբերակը'),tr`Տարբերակ ${id}։ Ներկայիս տվյալներն ավտոմատ կպահվեն պատմության մեջ։`,()=>commit(s=>{Object.keys(s).forEach(k=>delete s[k]);Object.assign(s,old);}));}
};
document.addEventListener('click',e=>{
  const navigation=e.target.closest('a[href^="#"]');
  if(navigation&&window.matchMedia('(max-width:760px)').matches){panelPrefs.left=false;panelPrefs.right=false;applyPanels();}
  const control=e.target.closest('[data-action]');
  if(portDraftDirty&&((navigation)||control&&!['panels-close','login-pin','login-account','toggle-left','toggle-right','backup','reload','port-discard','port-clear-confirm','port-clear-cancel'].includes(control.dataset.action))){
    if(!flushPortEditor()){e.preventDefault();return;}
  }
  const el=e.target.closest('[data-action]');if(!el||el.disabled)return;const fn=actions[el.dataset.action];if(fn)Promise.resolve().then(()=>fn(el.dataset.id,el)).catch(err=>toast(err.message));});
document.addEventListener('input',e=>{if(e.target.dataset.filter==='query'){filters.query=e.target.value;page=0;renderResults();}});
document.addEventListener('change',e=>{if(e.target.id==='companySelect'){switchCompany(e.target.value).catch(err=>{toast(err.message);renderCompanySelect();});return;}const k=e.target.dataset.filter;if(k&&k!=='query'){filters[k]=e.target.value;if(k==='floor'){filters.rack='';const rs=$('[data-filter=rack]');rs.innerHTML=opts([['',tr('Բոլոր ռաքերը')],...racks().filter(x=>!filters.floor||x.f.id===filters.floor).map(x=>[x.r.id,`${x.f.name} / ${x.r.name}`])],'');}page=0;renderResults();}});
window.addEventListener('hashchange',()=>{if(ready){$('#dialog').close();render();$('#content').scrollTop=0;window.scrollTo(0,0);}});
window.addEventListener('beforeunload',e=>{if(dirty||saving||portDraftDirty){recovery();e.preventDefault();e.returnValue='';}});
window.matchMedia('(max-width:760px)').addEventListener('change',()=>{if(ready&&route().view==='rack')render();});
window.matchMedia('(max-width:1150px)').addEventListener('change',()=>{if(ready&&route().view==='rack')render();});
async function init(){
  if(location.protocol==='file:'){
    status(tr('Բացվում է ծրագիրը…'));
    $('#content').innerHTML=tr('<section class="panel empty"><h1>Բացել RackMap-ը</h1><p>Ծրագիրը բացվում է տեղական սերվերից։ Եթե ինքնաբերաբար չբացվեց, սեղմեք ներքևի կոճակը։</p><a class="button primary" href="http://localhost:3000/">Բացել ծրագիրը →</a><p class="hint" style="margin-top:20px">Եթե հասցեն հասանելի չէ, նախ գործարկեք այս պանակի Start-RackMap.cmd ֆայլը։</p></section>');
    location.replace('http://localhost:3000/');
    return;
  }
  try{
    if(!onboardingChoice){renderWelcome();return;}
    onboardingVisible=false;
    let config;
    if(personal()){config={cloud:!localHost,authRequired:false};}
    else{
      const response=await fetch('/api/config',{signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error(tr('Թիմային սերվերն այս պահին չի պատասխանում։'));
      config=await response.json();remoteConfig=config;
    }
    cloudMode=config.cloud;authRequired=!personal()&&(config.authRequired??cloudMode);pinEnabled=config.pinEnabled;accountEnabled=config.accountEnabled??cloudMode;
    if(!personal()&&config.setupRequired)throw new Error(tr('Vercel-ում բացակայում են՝ ')+config.missing.join(', '));
    maxStateBytes=personal()?24*1024*1024:config.maxStateBytes||maxStateBytes;
    $('[data-action=logout]')?.remove();
    if(authRequired)$('.save-tools').insertAdjacentHTML('beforeend',button(tr('Դուրս գալ'),'logout','','small'));
    if(accountMode()){const {user}=await api('/api/auth/session');accountUserId=user.id;accountReadOnly=user.method==='recovery';}
    companies=await api('/api/companies');
    if(!companies.some(c=>c.id===activeCompanyId))activeCompanyId=companies[0]?.id||'default';
    const data=await api('/api/state');D.validate(data.state);state=data.state;revision=data.revision;ready=true;status(tr('Պահված է'));render();try{if(localStorage.getItem(recoveryKey()))banner(tr('Այս սարքում կա չպահված պատճեն։ Այն կարող եք վերականգնել Կարգավորումներ բաժնից։'));}catch{}}catch(e){if(e.code===401&&authRequired){renderLogin();return;}ready=false;document.body.classList.remove('rack-view','login-view');status(personal()?tr('Սարքի պահպանումն անհասանելի է'):tr('Թիմային կապն ընդհատված է'),true);
      $('#content').innerHTML=tr`<section class="panel setup"><div class="eyebrow">ԻՄ ՓԱՉ · ՊԱՀՊԱՆՈՒՄ</div><h1>${personal()?tr('Այս բրաուզերում պահպանումը չբացվեց'):tr('Թիմային բազան այս պահին անհասանելի է')}</h1><p>${personal()?tr('Ստուգեք բրաուզերի պահպանման թույլտվությունը և ազատ տեղը։ Գործող տվյալները չեն ջնջվել։'):tr('Կարող եք կրկին փորձել կամ աշխատել այս սարքի անձնական բազայով։ Թիմի տվյալները մնում են cloud-ում։')}</p><div class="actions"><button class="button primary" data-action="retry">Կրկին փորձել</button>${personal()?'':tr('<button class="button" data-action="personal-mode">Բացել անձնական բազան</button>')}</div><details style="margin-top:20px"><summary>Ստուգման մանրամասներ</summary><p>${esc(tr(e.message))}</p></details></section>`;
    }

}
const languageSelect=$('#languageSelect');
if(languageSelect&&globalThis.RackI18n)languageSelect.addEventListener('change',async()=>{
  const previous=RackI18n.language,next=languageSelect.value;
  languageSelect.disabled=true;
  try{
    if(modeBusy||companyBusy){languageSelect.value=previous;return;}
    if(ready&&(dirty||portDraftDirty||saving)&&!await save()){languageSelect.value=previous;return;}
    // Preserve in-progress setup/sign-in fields without storing credentials.
    const form=$('#setupForm')||$('#loginForm');
    const values=form?[...form.elements].filter(x=>x.name).map(x=>({name:x.name,value:x.value})):[];
    const login=!!$('#loginForm'),personalLogin=$('#loginForm')?.dataset.account==='true',method=$('#pin')?'pin':'account';
    RackI18n.setLanguage(next);
    if(onboardingVisible)renderWelcome();else if(personalLogin)renderAccountLogin(accountMethod);else if(login)renderLogin(method);else if(ready)render();else await init();
    const current=$('#setupForm')||$('#loginForm');
    for(const field of values){const control=current?.elements.namedItem(field.name);if(control)control.value=field.value;}
    if(ready)status(tr(personal()?'Պահված է սարքում':'Պահված է'));
    const logout=$('[data-action=logout]');if(logout)logout.textContent=tr('Դուրս գալ');
    window.dispatchEvent(new Event('rackmap-languagechange'));
  }catch(error){languageSelect.value=RackI18n.language;toast(error.message);}
  finally{languageSelect.disabled=false;}
});
document.addEventListener('keydown',e=>{
  if(!window.matchMedia('(max-width:760px)').matches||!ready)return;
  const panel=panelPrefs.left?$('#leftPanel'):(panelPrefs.right&&route().view==='rack'?$('#rightPanel'):null);
  if(!panel)return;
  if(e.key==='Escape'){e.preventDefault();panelPrefs.left=false;panelPrefs.right=false;applyPanels();$('[data-action="toggle-left"]').focus();return;}
  if(e.key==='Tab'){
    const controls=[...panel.querySelectorAll('a[href],button,input,select,textarea')].filter(x=>!x.disabled&&x.type!=='hidden'&&x.getClientRects().length);
    if(!controls.length)return;const first=controls[0],last=controls.at(-1),active=document.activeElement;
    if(e.shiftKey&&(!panel.contains(active)||active===first)){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&(!panel.contains(active)||active===last)){e.preventDefault();first.focus();}
  }
});
actions.retry=init;
setInterval(async()=>{if(modeBusy||!ready||companyBusy||dirty||saving||conflict||portDraftDirty||$('#dialog').open||document.querySelector('input:focus,textarea:focus'))return;try{const pollingCompany=activeCompanyId,pollingMode=storageMode;const head=await api('/api/revision');if(modeBusy||pollingMode!==storageMode||companyBusy||pollingCompany!==activeCompanyId)return;if(head.revision===revision){status(tr('Պահված է'));await refreshCompanies();return;}const data=await api('/api/state');if(modeBusy||pollingMode!==storageMode||companyBusy||pollingCompany!==activeCompanyId||dirty||saving||portDraftDirty||$('#dialog').open)return;D.validate(data.state);state=data.state;revision=data.revision;render();status(tr('Թարմացված է'));}catch{status(tr('Կապը ընդհատված է'),true);}},5000);
init();
