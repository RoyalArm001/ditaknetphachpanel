'use strict';
// Runs before the stylesheets so night mode never flashes a light page.
(()=>{
  const key='mypatch-theme',root=document.documentElement;
  const system=window.matchMedia('(prefers-color-scheme: dark)');
  let preference=null;
  try{const saved=localStorage.getItem(key);if(['light','dark'].includes(saved))preference=saved;}catch{}
  const current=()=>preference||(system.matches?'dark':'light');
  const tr=text=>globalThis.RackI18n?.t(text)||text;
  function update(){
    const dark=current()==='dark';root.dataset.theme=dark?'dark':'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#0f1b20':'#174e50');
    const toggle=document.getElementById('themeToggle');
    if(toggle){toggle.setAttribute('aria-pressed',String(dark));toggle.setAttribute('aria-label',tr('Գիշերային ռեժիմ'));toggle.title=tr(dark?'Միացնել ցերեկային ռեժիմը':'Միացնել գիշերային ռեժիմը');}
  }
  update();
  document.addEventListener('DOMContentLoaded',()=>{
    update();document.getElementById('themeToggle')?.addEventListener('click',()=>{
      preference=current()==='dark'?'light':'dark';
      try{localStorage.setItem(key,preference);}catch{}
      update();
    });
  });
  system.addEventListener('change',()=>{if(!preference)update();});
  window.addEventListener('storage',event=>{if(event.key===key||event.key===null){preference=['light','dark'].includes(event.newValue)?event.newValue:null;update();}});
  window.addEventListener('rackmap-languagechange',update);
})();
