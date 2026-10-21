'use strict';
globalThis.RackEditorDraftStore=(()=>{
  const key='mypatch-editor-tab-draft';let opening;
  function db(){return opening||=new Promise((resolve,reject)=>{
    const request=indexedDB.open('mypatch-editor-drafts',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>{opening=null;reject(request.error);};
  });}
  async function read(id){const database=await db();return new Promise((resolve,reject)=>{const r=database.transaction('drafts').objectStore('drafts').get(id);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}
  async function write(draft){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('drafts','readwrite');tx.objectStore('drafts').put(structuredClone(draft));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Draft save aborted'));});}
  async function restore(){const id=sessionStorage.getItem(key);return RackEditorHandoff.validId(id)?read(id):null;}
  async function accept(snapshot,id){
    if(!RackEditorHandoff.validId(id)||!snapshot||typeof snapshot.readOnly!=='boolean'||!snapshot.state)throw new Error('Invalid editor copy');
    if(new Blob([JSON.stringify(snapshot.state)]).size>24*1024*1024)throw new Error('Ֆայլը չափազանց մեծ է');
    RackDomain.validate(snapshot.state);
    const draft={id,state:structuredClone(snapshot.state),readOnly:snapshot.readOnly,createdAt:new Date().toISOString(),revision:0};
    await write(draft);sessionStorage.setItem(key,id);return draft;
  }
  return {restore,accept,write};
})();
