(function(root,factory){
  if(typeof module==='object')module.exports=factory();
  else root.RackEditorHandoff=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const mainOrigin='https://patch.ditaknet.com',editorOrigin='https://editor.ditaknet.com',protocol='mypatch-editor-clone-v1';
  const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
  const accepts=(event,source,origin,id,type)=>event.source===source&&event.origin===origin&&event.data?.protocol===protocol&&event.data?.id===id&&event.data?.type===type;
  function open(win,snapshot){
    const id=win.crypto.randomUUID(),copy=structuredClone(snapshot);
    return new Promise((resolve,reject)=>{
      let popup,timer,finished=false;
      const clear=()=>{win.removeEventListener('message',receive);win.clearTimeout(timer);};
      const receive=event=>{
        if(accepts(event,popup,editorOrigin,id,'ready'))popup.postMessage({protocol,id,type:'clone',snapshot:copy},editorOrigin);
        if(accepts(event,popup,editorOrigin,id,'accepted')){finished=true;clear();resolve();}
        if(accepts(event,popup,editorOrigin,id,'rejected')){finished=true;clear();reject(new Error('Չհաջողվեց ստեղծել խմբագրման պատճենը։'));}
      };
      win.addEventListener('message',receive);
      popup=win.open(editorOrigin+'/#handoff='+id,'_blank');
      if(!popup){clear();reject(new Error('Թույլատրեք նոր պատուհանի բացումը և կրկին փորձեք։'));return;}
      timer=win.setTimeout(()=>{if(!finished){clear();reject(new Error('Խմբագրիչը չստացավ պատճենը։ Կրկին բացեք «Իմ Փաչ»-ից։'));}},30000);
    });
  }
  function receive(win,accept){
    const id=new URLSearchParams(win.location.hash.slice(1)).get('handoff'),source=win.opener;
    if(!validId(id)||!source)return Promise.resolve(null);
    return new Promise((resolve,reject)=>{
      let busy=false,finished=false,interval,timer;
      const clean=()=>{win.removeEventListener('message',listen);win.clearInterval(interval);win.clearTimeout(timer);};
      const listen=async event=>{
        if(busy||!accepts(event,source,mainOrigin,id,'clone'))return;
        busy=true;
        try{
          const result=await accept(structuredClone(event.data.snapshot),id);
          if(finished)return;
          finished=true;
          source.postMessage({protocol,id,type:'accepted'},mainOrigin);clean();
          try{win.opener=null;}catch{}
          resolve(result);
        }catch(error){if(finished)return;finished=true;source.postMessage({protocol,id,type:'rejected'},mainOrigin);clean();reject(error);}
      };
      const ready=()=>source.postMessage({protocol,id,type:'ready'},mainOrigin);
      win.addEventListener('message',listen);ready();interval=win.setInterval(ready,500);
      timer=win.setTimeout(()=>{if(!finished){finished=true;clean();reject(new Error('Խմբագրիչը չստացավ պատճենը։ Կրկին բացեք «Իմ Փաչ»-ից։'));}},30000);
    });
  }
  return {mainOrigin,editorOrigin,protocol,validId,accepts,open,receive};
});
