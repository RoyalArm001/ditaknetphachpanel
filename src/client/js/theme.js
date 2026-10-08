'use strict';
// Runs before the stylesheets so night mode never flashes a light page.
(()=>{
  const key='mypatch-theme',modeKey='mypatch-theme-mode',untilKey='mypatch-theme-until',root=document.documentElement;
  let preference='auto',override=null,overrideUntil=0,timer;
  function read(){
    preference='auto';override=null;overrideUntil=0;
    try{
      const mode=localStorage.getItem(modeKey),saved=localStorage.getItem(key);
      if(['light','dark'].includes(mode))preference=mode;
      if(['light','dark'].includes(saved))override=saved;
      overrideUntil=Number(localStorage.getItem(untilKey))||0;
    }catch{}
  }
  // Use calendar hours so daylight-saving and device time-zone changes are respected.
  function nextBoundary(now){
    const next=new Date(now),hour=now.getHours();
    if(hour<7)next.setHours(7,0,0,0);
    else if(hour<20)next.setHours(20,0,0,0);
    else{next.setDate(next.getDate()+1);next.setHours(7,0,0,0);}
    return next.getTime();
  }
  function current(now=new Date()){
    if(preference!=='auto')return preference;
    if(override&&overrideUntil>now.getTime()&&overrideUntil<=nextBoundary(now))return override;
    return now.getHours()>=20||now.getHours()<7?'dark':'light';
  }
  const tr=text=>globalThis.RackI18n?.t(text)||text;
  function update(){
    const dark=current()==='dark';root.dataset.theme=dark?'dark':'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#0f1b20':'#174e50');
    const toggle=document.getElementById('themeToggle');
    if(toggle){const label=tr(dark?'Միացնել ցերեկային ռեժիմը':'Միացնել գիշերային ռեժիմը');toggle.setAttribute('aria-pressed',String(dark));toggle.setAttribute('aria-label',label);toggle.title=label+(preference==='auto'?' · '+tr('Մինչև հաջորդ ավտոմատ անցումը'):'');}
    const select=document.getElementById('themePreference');if(select)select.value=preference;
    clearTimeout(timer);
    const now=new Date();timer=setTimeout(update,Math.max(1,Math.min(60000,nextBoundary(now)-now.getTime())));
  }
  globalThis.RackTheme={get preference(){return preference;},setPreference(mode){
    if(!['auto','light','dark'].includes(mode))return;
    preference=mode;override=null;overrideUntil=0;
    try{localStorage.setItem(modeKey,mode);localStorage.removeItem(untilKey);localStorage.removeItem(key);}catch{}
    update();
  }};
  read();
  update();
  document.addEventListener('DOMContentLoaded',()=>{
    update();document.getElementById('themeToggle')?.addEventListener('click',()=>{
      const next=current()==='dark'?'light':'dark';
      if(preference==='auto'){
        override=next;overrideUntil=nextBoundary(new Date());
        try{localStorage.setItem(key,override);localStorage.setItem(untilKey,String(overrideUntil));}catch{}
      }else{
        preference=next;try{localStorage.setItem(modeKey,preference);}catch{}
      }
      update();
    });
  });
  window.addEventListener('storage',event=>{if([key,modeKey,untilKey,null].includes(event.key)){read();update();}});
  window.addEventListener('focus',update);
  window.addEventListener('pageshow',update);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')update();});
  window.addEventListener('rackmap-languagechange',update);
})();
