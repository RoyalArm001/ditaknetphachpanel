'use strict';
(()=>{
  let installPrompt=null;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  function update(){
    const control=document.querySelector('[data-action="install-app"]');
    if(control)control.textContent=standalone()?'✓ Հավելվածը տեղադրված է':'↓ Տեղադրել հեռախոսում';
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;update();});
  window.addEventListener('appinstalled',()=>{installPrompt=null;update();toast('Ditaknet RackMap-ը տեղադրված է');});
  actions['install-app']=async()=>{
    if(standalone()){toast('Ծրագիրն արդեն բացված է որպես հավելված');return;}
    if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();await prompt.userChoice;update();return;}
    const secure=window.isSecureContext;
    modal('Տեղադրել Ditaknet RackMap-ը',
      (secure?'':'<p><strong>Հեռախոսում տեղադրելու համար բացեք ծրագրի HTTPS հասցեն։</strong> Սովորական տեղական HTTP հասցեն նախատեսված է բրաուզերով աշխատանքի համար։ HTTPS հասցեն պետք է կարգավորի ցանցի ադմինիստրատորը։</p>')+
      '<p><strong>iPhone / iPad․</strong> Safari-ում բացեք ծրագրի հասցեն → Share → Add to Home Screen → Add։</p><p><strong>Android․</strong> Chrome-ի մենյու → Install app կամ Add to Home screen։ Եթե տեղադրումը դեռ հասանելի չէ, թարմացրեք էջը և կրկին փորձեք։</p><p class="hint">Տեղադրված հավելվածին նույնպես պետք է կապ ծրագրի սերվերի հետ։ Պատկերակը տվյալների առանձին պատճեն չի ստեղծում։</p>');
  };
  if(location.protocol!=='file:'&&window.isSecureContext&&'serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});
  }
  update();
})();
