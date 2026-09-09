'use strict';
(()=>{
const tr=globalThis.RackI18n?.t||((text,...values)=>Array.isArray(text)?text.reduce((out,part,i)=>out+part+(i<values.length?values[i]:''),''):text);

  let installPrompt=null;
  // One versioned file is the source of release notes for every language.
  // Show only on the welcome screen, never over a form or ongoing work.
  async function announceRelease(){
    try{
      const response=await fetch('/release.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok)return;
      const release=await response.json(),key='mypatch-seen-release';
      if(typeof release.version!=='string'||!release.version)return;
      try{if(localStorage.getItem(key)===release.version)return;}catch{}
      const notes=release[document.documentElement.lang]||release.hy;
      if(!notes||typeof notes.title!=='string'||!Array.isArray(notes.changes)||!notes.changes.every(x=>typeof x==='string'))return;
      if(!document.querySelector('.welcome')||document.querySelector('#dialog')?.open)return;
      modal(notes.title,`<p class="hint">${esc(release.version)}</p><ul>${notes.changes.map(item=>`<li style="margin-bottom:12px;line-height:1.7">${esc(item)}</li>`).join('')}</ul>`);
      document.querySelector('#dialog').addEventListener('close',()=>{
        try{localStorage.setItem(key,release.version);}catch{}
      },{once:true});
    }catch{/* Offline or unavailable release notes must not interrupt startup. */}
  }
  if(location.protocol!=='file:')setTimeout(announceRelease,600);
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  function update(){
    const control=document.querySelector('[data-action="install-app"]');
    if(control)control.textContent=standalone()?tr('✓ Հավելվածը տեղադրված է'):tr('↓ Տեղադրել հեռախոսում');
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;update();});
  window.addEventListener('rackmap-languagechange',update);
  window.addEventListener('appinstalled',()=>{installPrompt=null;update();toast(tr('Իմ փաչ-ը տեղադրված է'));});
  actions['install-app']=async()=>{
    if(standalone()){toast(tr('Ծրագիրն արդեն բացված է որպես հավելված'));return;}
    if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();await prompt.userChoice;update();return;}
    const secure=window.isSecureContext;
    modal(tr('Տեղադրել Իմ փաչ-ը'),
      (secure?'':tr('<p><strong>Հեռախոսում տեղադրելու համար բացեք ծրագրի HTTPS հասցեն։</strong> Սովորական տեղական HTTP հասցեն նախատեսված է բրաուզերով աշխատանքի համար։ HTTPS հասցեն պետք է կարգավորի ցանցի ադմինիստրատորը։</p>'))+
      tr('<p><strong>iPhone / iPad․</strong> Safari-ում բացեք ծրագրի հասցեն → Share → Add to Home Screen → Add։</p><p><strong>Android․</strong> Chrome-ի մենյու → Install app կամ Add to Home screen։ Եթե տեղադրումը դեռ հասանելի չէ, թարմացրեք էջը և կրկին փորձեք։</p><p class="hint">Անձնական ռեժիմը առաջին բացումից հետո աշխատում է նաև անցանց։ Թիմային cloud-ի համար ինտերնետ է պետք։</p>'));
  };
  if(location.protocol!=='file:'&&window.isSecureContext&&'serviceWorker' in navigator){
    const hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener?.('controllerchange',()=>{if(!hadController)return;if(typeof dirty!=='undefined'&&(dirty||saving||portDraftDirty)){toast(tr('Թարմացումը պատրաստ է։ Պահպանեք աշխատանքը և վերաբացեք էջը։'));return;}location.reload();});
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(registration=>registration.update?.()).catch(()=>{});
  }
  update();
})();
