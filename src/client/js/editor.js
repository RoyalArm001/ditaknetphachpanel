'use strict';
(()=>{
  const D=RackDomain,$=s=>document.querySelector(s),tr=RackI18n.t,maxBytes=24*1024*1024;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let draft=null,state=null,controller=null,timer,persisting=Promise.resolve(),pending=0,failed=false;
  const status=(text,error=false)=>{$('#saveStatus').textContent=tr(text);$('#saveStatus').dataset.error=String(error);};
  const toast=text=>{$('#toast').textContent=tr(text);$('#toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('#toast').hidden=true,4500);};
  const download=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  const input=(name,label,value='',type='text',extra='')=>`<div class="field"><label for="${esc(name)}">${esc(label)}</label><input id="${esc(name)}" name="${esc(name)}" value="${esc(value)}" type="${esc(type)}" ${extra}></div>`;
  const select=(name,label,items,value='')=>`<div class="field"><label>${esc(label)}<select name="${esc(name)}">${items.map(([id,text])=>`<option value="${esc(id)}" ${String(id)===String(value)?'selected':''}>${esc(text)}</option>`).join('')}</select></label></div>`;
  function modal(title,body,submit,extras=''){
    const dialog=$('#dialog');if(dialog.open)dialog.close();
    dialog.innerHTML=`<div class="dialog-heading"><h2 id="dialogTitle">${esc(title)}</h2><button type="button" class="close" data-editor-close aria-label="${esc(tr('Փակել'))}">×</button></div>${submit?'<form id="modalForm">':''}${body}<p id="formError" class="form-error" hidden></p><div class="form-actions">${extras}<button type="button" class="button" data-editor-close>${esc(tr('Փակել'))}</button>${submit?`<button class="button primary" type="submit">${esc(tr('Պահպանել'))}</button>`:''}</div>${submit?'</form>':''}`;
    dialog.querySelectorAll('[data-editor-close]').forEach(b=>b.onclick=()=>dialog.close());
    if(submit)$('#modalForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter||e.target.querySelector('[type="submit"]');button.disabled=true;try{await submit(new FormData(e.target));dialog.close();}catch(error){$('#formError').hidden=false;$('#formError').textContent=tr(error.message);}finally{button.disabled=false;}};
    dialog.showModal();
  }
  function persist(){
    const copy={...draft,state:structuredClone(state),revision:++draft.revision};pending++;status('Պահպանվում է…');
    const work=persisting.catch(()=>{}).then(()=>RackEditorDraftStore.write(copy));
    persisting=work;
    work.then(()=>{pending--;failed=false;if(!pending)status('Պահված է պատճենում');},error=>{pending--;failed=true;status('Չի պահպանվել',true);toast(error.message);});
    return work;
  }
  async function save(){if(failed)await persist();else await persisting;return true;}
  function commit(fn,redraw=true){
    if(!state||draft.readOnly)throw new Error(tr('Միայն դիտում'));
    const next=structuredClone(state);fn(next);RackDrawingModel.pruneMapRoutes(next);D.validate(next);
    if(new Blob([JSON.stringify(next)]).size>maxBytes)throw new Error(tr('Ֆայլը չափազանց մեծ է'));
    state=next;persist();if(redraw)render();else refreshSheets();
  }
  function refreshSheets(){
    const options=[['#drawing',tr('Նոր գծագրություն')],...(state.drawings||[]).map(s=>['#drawing/'+s.id,s.name]),...(state.floorPlans||[]).map(p=>['#drawing/map-'+p.id,p.name])];
    $('#editorSheet').innerHTML=options.map(([id,text])=>`<option value="${esc(id)}" ${id===location.hash?'selected':''}>${esc(text)}</option>`).join('');
  }
  function render(){
    if(!state)return;controller?.destroy();$('#dialog').close();
    const [view,id]=(location.hash.slice(1)||'drawing').split('/');
    const h={tr,esc,getState:()=>state,commit,modal,input,select,toast,download,save,confirm:(title,text,fn)=>modal(title,`<p>${esc(text)}</p>`,fn),readOnly:draft.readOnly,maxBytes,projectKey:draft.id,canShare:false,redraw:render,getRevision:()=>draft.revision,api:async()=>{throw new Error(tr('Հիմնական բազան չի փոխվում'));}};
    $('#breadcrumb').textContent=tr(view==='map'?'Քարտեզ':'Խմբագրման պատճեն');refreshSheets();
    if(view==='map')controller=RackMaps.mount($('#content'),{...h,requestedPlanId:id});
    else controller=RackDrawings.mount($('#content'),{...h,mapPlanId:id?.startsWith('map-')?id.slice(4):'',drawingId:id?.startsWith('map-')?'':id});
  }
  $('#editorSheet').onchange=e=>{location.hash=e.target.value;};
  $('#editorDownload').onclick=()=>{
    if(!state)return;
    const data={application:'RackMap',schema:2,exportedAt:new Date().toISOString(),state};
    download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'MyPatch-editor-copy.json');
  };
  window.addEventListener('hashchange',render);
  window.addEventListener('beforeunload',e=>{if(pending||failed){e.preventDefault();e.returnValue='';}});
  async function start(){
    try{
      const incoming=new URLSearchParams(location.hash.slice(1)).has('handoff');
      if(incoming)status('Պատճենը բեռնվում է…');
      draft=incoming?await RackEditorHandoff.receive(window,RackEditorDraftStore.accept):await RackEditorDraftStore.restore();
      if(!draft){status('');return;}
      D.validate(draft.state);state=structuredClone(draft.state);
      if(incoming){const first=state.drawings?.[0],plan=state.floorPlans?.[0];history.replaceState(null,'','/'+(first?'#drawing/'+first.id:plan?'#drawing/map-'+plan.id:'#drawing'));}
      $('#editorCompany').textContent=state.company;$('.editor-copy-bar').hidden=false;$('#editorDownload').hidden=false;
      status('Պահված է պատճենում');render();
    }catch(error){status('Չի պահպանվել',true);toast(error.message);}
  }
  if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});
  async function announceRelease(){
    if(!['standalone','minimal-ui','window-controls-overlay'].some(mode=>matchMedia('(display-mode: '+mode+')').matches)&&navigator.standalone!==true)return;
    try{
      const response=await fetch('/release.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)return;
      const release=await response.json(),key='mypatch-seen-release';if(typeof release.version!=='string'||localStorage.getItem(key)===release.version)return;
      toast(tr('Հավելվածը թարմացվել է')+' · v'+release.version);localStorage.setItem(key,release.version);
    }catch{}
  }
  setTimeout(announceRelease,600);
  start();
})();
