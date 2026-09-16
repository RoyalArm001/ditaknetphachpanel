'use strict';
globalThis.AppReset=(()=>{
  const pendingKey='mypatch-reset-pending',startedKey='mypatch-reset-started',finishedKey='mypatch-reset-finished';
  const ownKey=key=>/^(rackmap-|mypatch-)/.test(key);
  let signingOut;
  const tr=text=>globalThis.RackI18n?.t(text)||text;
  async function ensureSessionCleared(){
    let pending;
    try{pending=localStorage.getItem(pendingKey);}catch{return;}
    if(!pending)return;
    if(!signingOut)signingOut=(async()=>{
      try{
        const response=await fetch('/api/auth/reset-device',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(8000)});
        if(!response.ok)throw new Error('Session reset failed');
        localStorage.removeItem(pendingKey);
      }catch{throw new Error(tr('Մուտքը մաքրելու համար միացեք ինտերնետին և կրկին փորձեք։'));}
    })().finally(()=>{signingOut=null;});
    return signingOut;
  }
  function clearStorage(storage){
    const keys=Array.from({length:storage.length},(_,i)=>storage.key(i));
    for(const key of keys)if(ownKey(key)&&![pendingKey,startedKey,finishedKey].includes(key))storage.removeItem(key);
  }
  async function reset(){
    const token=crypto.randomUUID();
    localStorage.setItem(pendingKey,'1');
    localStorage.setItem(startedKey,token);
    await PersonalStore.reset();
    clearStorage(localStorage);clearStorage(sessionStorage);
    // Offline reset still clears local data. Cookies are cleared before the next cloud request.
    await ensureSessionCleared().catch(()=>{});
    localStorage.setItem(finishedKey,token);
  }
  return {reset,ensureSessionCleared,startedKey,finishedKey};
})();
