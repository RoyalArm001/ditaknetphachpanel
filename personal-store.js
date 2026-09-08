'use strict';
// Device-only database. No network calls; all mutations use IndexedDB transactions.
globalThis.PersonalStore=(()=>{
const tr=globalThis.RackI18n?.t||((text,...values)=>Array.isArray(text)?text.reduce((out,part,i)=>out+part+(i<values.length?values[i]:''),''):text);

  let opening;
  function open(){
    if(!opening)opening=new Promise((resolve,reject)=>{
      const request=indexedDB.open('ditaknet-personal',1);
      request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('companies',{keyPath:'id'});db.createObjectStore('history',{keyPath:['company_id','revision']});};
      request.onerror=()=>{opening=null;reject(request.error);};request.onblocked=()=>{opening=null;reject(new Error(tr('Փակեք ծրագրի մյուս ներդիրները և կրկին փորձեք')));};
      request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();opening=null;};resolve(request.result);};
    });return opening;
  }
  const get=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  async function transaction(work){
    const db=await open(),tx=db.transaction(['companies','history'],'readwrite');
    const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error(tr('Պահպանումը չհաջողվեց')));});
    try{const result=await work(tx.objectStore('companies'),tx.objectStore('history'));await done;return result;}catch(e){try{tx.abort();}catch{}await done.catch(()=>{});throw e;}
  }
  function error(message,code=400){const e=new Error(message);e.code=code;return e;}
  async function request(path,options={}){
    const url=new URL(path,location.href),method=options.method||'GET',id=url.searchParams.get('company')||'default',body=options.body?JSON.parse(options.body):null;
    return transaction(async(companies,history)=>{
      if(await get(companies.count())===0)await get(companies.add({id:'default',revision:0,state:RackDomain.empty()}));
      const all=await get(companies.getAll()),current=all.find(x=>x.id===id);
      if(url.pathname==='/api/companies'){
        if(method==='GET')return all.map(x=>({id:x.id,revision:x.revision,name:x.state.company,floorCount:x.state.floors.length}));
        const name=body.name?.trim();if(!name||name.length>200||!Number.isInteger(body.floorCount)||body.floorCount<1||body.floorCount>200)throw error(tr('Նշեք անունը և հարկերի քանակը'));
        if(all.some(x=>x.state.company.toLowerCase()===name.toLowerCase()))throw error(tr('Այս անունով ընկերություն արդեն կա'));
        const state={...RackDomain.empty(),company:name,floors:Array.from({length:body.floorCount},(_,i)=>({id:crypto.randomUUID(),name:tr`${i+1}-րդ հարկ`,racks:[]}))};
        const row={id:crypto.randomUUID(),revision:0,state};await get(companies.add(row));return row;
      }
      if(url.pathname==='/api/storage')return {directory:tr('Այս սարքը'),database:tr('Հեռախոսի / բրաուզերի հիշողություն'),backups:tr('JSON պատճեն և վերջին 50 փոփոխությունները'),personal:true};
      if(url.pathname==='/api/network')return {urls:[]};
      if(url.pathname==='/api/backup')return {format:'ditaknet-rackmap-cloud',version:1,exportedAt:new Date().toISOString(),companies:all.map(x=>({id:x.id,revision:x.revision,body:x.state})),history:await get(history.getAll())};
      if(!current)throw error(tr('Ընկերությունը չի գտնվել'),404);
      if(url.pathname==='/api/revision')return {revision:current.revision};
      if(url.pathname==='/api/state'){
        if(method==='GET')return {state:current.state,revision:current.revision,companyId:id};
        RackDomain.validate(body.state);
        if(current.revision!==body.revision)throw error(tr('Տվյալները փոխվել են այլ ներդիրում։ Թարմացրեք էջը։'),409);
        if(all.some(x=>x.id!==id&&x.state.company.trim().toLowerCase()===body.state.company.trim().toLowerCase()))throw error(tr('Այս անունով ընկերություն արդեն կա'));
        await get(history.put({company_id:id,revision:current.revision,saved_at:new Date().toISOString(),body:current.state}));
        for(const x of await get(history.getAll()))if(x.company_id===id&&x.revision<current.revision-49)await get(history.delete([id,x.revision]));
        await get(companies.put({id,revision:current.revision+1,state:body.state}));return {revision:current.revision+1};
      }
      if(url.pathname==='/api/history')return (await get(history.getAll())).filter(x=>x.company_id===id).sort((a,b)=>b.revision-a.revision).map(x=>({revision:x.revision,saved_at:x.saved_at}));
      if(url.pathname.startsWith('/api/history/')){const x=await get(history.get([id,Number(url.pathname.split('/').pop())]));if(!x)throw error(tr('Տարբերակը չի գտնվել'),404);return {state:x.body};}
      throw error(tr('Գործողությունը չի գտնվել'),404);
    });
  }
  return {request};
})();
