'use strict';
(()=>{
const tr=globalThis.RackI18n?.t||((text,...values)=>Array.isArray(text)?text.reduce((out,part,i)=>out+part+(i<values.length?values[i]:''),''):text);

  let installPrompt=null;
  let registration=null,updateReady=false,updateBusy=false;
  async function protectLocalData(){
    if(!navigator.storage?.persist)return false;
    try{
      if(await navigator.storage.persisted?.())return true;
      return await navigator.storage.persist();
    }catch{return false;}
  }
  // One versioned file is the source of release notes for every language.
  // Show only on the welcome screen, never over a form or ongoing work.
  async function announceRelease(){
    try{
      const response=await fetch('/release.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok)return;
      const release=await response.json(),key='mypatch-seen-release';
      if(typeof release.version!=='string'||!release.version)return;
      const version=document.querySelector('#appVersion');
      if(version){version.textContent='v'+release.version;version.hidden=false;}
      try{if(localStorage.getItem(key)===release.version)return;}catch{}
      const notes=release[document.documentElement.lang]||release.hy;
      if(!notes||typeof notes.title!=='string'||!Array.isArray(notes.changes)||!notes.changes.every(x=>typeof x==='string'))return;
      if(!document.querySelector('.welcome')||document.querySelector('#dialog')?.open)return;
      modal(notes.title,`<p class="hint">v${esc(release.version)}</p><ul>${notes.changes.map(item=>`<li style="margin-bottom:12px;line-height:1.7">${esc(item)}</li>`).join('')}</ul>`);
      document.querySelector('#dialog').addEventListener('close',()=>{
        try{localStorage.setItem(key,release.version);}catch{}
      },{once:true});
    }catch{/* Offline or unavailable release notes must not interrupt startup. */}
  }
  if(location.protocol!=='file:')setTimeout(announceRelease,600);
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  let notificationOfferPending=false;
  const notificationSupported=()=>window.isSecureContext&&'Notification' in window;
  function notificationDialog(){
    const permission=notificationSupported()?Notification.permission:'unsupported';
    const message=permission==='granted'?tr('Ծանուցումների թույլտվությունը միացված է։'):permission==='denied'?tr('Ծանուցումներն արգելված են։ Միացրեք դրանք կայքի կամ հավելվածի համակարգային կարգավորումներում։'):permission==='unsupported'?tr('Այս միջավայրում ծանուցումների թույլտվությունը հասանելի չէ։ iPhone-ում բացեք հավելվածը գլխավոր էկրանից։'):tr('Միացրեք ծանուցումների թույլտվությունը և բրաուզերի հարցման մեջ ընտրեք «Թույլատրել»։');
    modal(tr('Ծանուցումներ'),`<p>${esc(message)}</p><p class="hint">${esc(tr('Փակ հավելվածին թարմացումների ուղարկումը դեռ միացված չէ։'))}</p>`+(permission==='default'?`<button type="button" class="button primary" id="enableNotifications">${esc(tr('Միացնել ծանուցումները'))}</button>`:''));
    document.querySelector('#dialog').addEventListener('close',()=>{try{localStorage.setItem('mypatch-notification-offer','seen');}catch{}},{once:true});
    const control=document.querySelector('#enableNotifications');
    if(control)control.onclick=()=>{
      // Request directly from the click, before any await, for mobile browsers.
      const request=Notification.requestPermission();control.disabled=true;
      request.then(()=>{if(control.isConnected&&document.querySelector('#dialog').open){document.querySelector('#dialog').close();setTimeout(notificationDialog,0);}}).catch(()=>{control.disabled=false;toast(tr('Չհաջողվեց միացնել ծանուցումները։ Կրկին փորձեք։'));});
    };
  }
  function offerNotifications(){
    if(notificationSupported()&&Notification.permission==='granted')return;
    try{if(localStorage.getItem('mypatch-notification-offer')==='seen')return;}catch{}
    const dialog=document.querySelector('#dialog');
    if(dialog?.open){
      if(!notificationOfferPending){notificationOfferPending=true;dialog.addEventListener('close',()=>{notificationOfferPending=false;setTimeout(offerNotifications,0);},{once:true});}
      return;
    }
    notificationDialog();
  }
  if(standalone())setTimeout(offerNotifications,300);
  function update(){
    const control=document.querySelector('[data-action="install-app"]');
    if(control)control.textContent=updateReady?tr('↻ Թարմացնել հավելվածը'):standalone()?tr('✓ Հավելվածը տեղադրված է'):tr('↓ Տեղադրել հեռախոսում');
  }
  function hasUnsavedWork(){return typeof dirty!=='undefined'&&(dirty||saving||portDraftDirty);}
  function activateUpdate(){
    if(!registration?.waiting){updateReady=false;update();return;}
    if(hasUnsavedWork()){toast(tr('Նախ պահպանեք փոփոխությունները, հետո թարմացրեք հավելվածը։'));return;}
    updateBusy=true;protectLocalData();registration.waiting.postMessage({type:'SKIP_WAITING'});toast(tr('Թարմացվում է…'));
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;update();});
  window.addEventListener('rackmap-languagechange',update);
  window.addEventListener('appinstalled',()=>{installPrompt=null;protectLocalData();update();toast(tr('Իմ փաչ-ը տեղադրված է'));offerNotifications();});
  actions['install-app']=async()=>{
    if(updateReady){activateUpdate();return;}
    if(standalone()){notificationDialog();return;}
    if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();await prompt.userChoice;update();return;}
    const secure=window.isSecureContext;
    modal(tr('Տեղադրել Իմ փաչ-ը'),
      (secure?'':tr('<p><strong>Հեռախոսում տեղադրելու համար բացեք ծրագրի HTTPS հասցեն։</strong> Սովորական տեղական HTTP հասցեն նախատեսված է բրաուզերով աշխատանքի համար։ HTTPS հասցեն պետք է կարգավորի ցանցի ադմինիստրատորը։</p>'))+
      tr('<p><strong>iPhone / iPad․</strong> Safari-ում բացեք ծրագրի հասցեն → Share → Add to Home Screen → Add։</p><p><strong>Android․</strong> Chrome-ի մենյու → Install app կամ Add to Home screen։ Եթե տեղադրումը դեռ հասանելի չէ, թարմացրեք էջը և կրկին փորձեք։</p><p class="hint">Անձնական ռեժիմը առաջին բացումից հետո աշխատում է նաև անցանց։ Թիմային cloud-ի համար ինտերնետ է պետք։</p>'));
  };
  if(location.protocol!=='file:'&&window.isSecureContext&&'serviceWorker' in navigator){
    const hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener?.('controllerchange',()=>{if(!hadController||updateBusy){location.reload();return;}if(hasUnsavedWork()){toast(tr('Թարմացումը պատրաստ է։ Պահպանեք աշխատանքը և վերաբացեք էջը։'));return;}location.reload();});
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{
      registration=reg;
      if(reg.waiting){updateReady=true;update();}
      reg.addEventListener('updatefound',()=>{
        const worker=reg.installing;
        if(!worker)return;
        worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){updateReady=true;update();}});
      });
      return reg.update?.();
    }).catch(()=>{});
  }
  if(window.isSecureContext)protectLocalData();
  update();
})();
