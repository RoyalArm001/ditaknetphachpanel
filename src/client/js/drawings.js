'use strict';
globalThis.RackDrawings=(()=>{
  const D=globalThis.RackDomain,M=globalThis.RackDrawingModel,views=new Map();
  const uid=()=>crypto.randomUUID();
  const rackIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 9h14M5 16h14M8 6h2M8 13h2M8 19h2"/></svg>';
  function mapRoutes(plan,data,visible,layout,state,esc){
    const nodes=[...visible,...(data.rackMarkers||[])].map(n=>{
      const p=layout(n);return {...n,x:p.iconX,y:p.iconY};
    });
    return (plan.plannedRoutes||[]).map(r=>{
      const points=M.routePoints(r,nodes);if(!points.length)return '';
      const endpoint=nodes.find(n=>(n.id===r.from||n.id===r.to)&&n.portId),rack=nodes.find(n=>(n.id===r.from||n.id===r.to)&&n.rackId);
      const attrs=`points="${points.map(p=>(p.x*100).toFixed(4)+','+(p.y*100).toFixed(4)).join(' ')}" data-cable-marker="${esc(endpoint?.id||'')}" data-cable-rack="${esc(rack?.id||'')}" style="--cable-color:${D.serviceColor(state,endpoint?.row?.service)}" vector-effect="non-scaling-stroke"`;
      return `<polyline class="map-cable-halo" ${attrs}/><polyline class="map-cable-path" ${attrs}><title>${esc(r.name)}</title></polyline>`;
    }).join('');
  }
  function mount(root,h){
    const {tr,esc,getState}=h,abort=new AbortController(),signal=abort.signal;
    const key=h.projectKey||'default',v=views.get(key)||{id:'',zoom:1,tool:'select',selected:''};views.set(key,v);
    let undo=[],redo=[],pending=null,drag=null,disposed=false,importing=false,resize;
    const isMap=()=>!!h.mapPlanId;
    if(h.drawingId)v.id=h.drawingId;
    function sheet(){
      const s=getState();
      if(isMap()){const p=s.floorPlans?.find(p=>p.id===h.mapPlanId);return p?M.mapSheet(s,p,D):null;}
      return s.drawings?.find(d=>d.id===v.id)||s.drawings?.[0]||null;
    }
    function fail(error){h.toast(tr(error.message||String(error)));}
    function checkSize(s){
      if(h.maxBytes&&new Blob([JSON.stringify({state:s,revision:0})]).size>h.maxBytes)throw new Error(tr('Նախագիծը գերազանցում է պահպանման չափի սահմանը։'));
    }
    function write(next){
      h.commit(s=>{
        if(isMap())M.updateMap(s,h.mapPlanId,next,D);
        else {const i=s.drawings.findIndex(d=>d.id===next.id);if(i<0)throw new Error(tr('Գծագրությունը չի գտնվել'));s.drawings[i]=next;}
        checkSize(s);
      },false);
    }
    function change(fn){
      if(h.readOnly)return;
      const before=structuredClone(sheet()),next=structuredClone(before);
      fn(next);write(next);undo.push(before);if(undo.length>30)undo.shift();redo=[];paint();
    }
    function travel(from,to){
      if(!from.length||h.readOnly)return;
      const next=from[from.length-1],current=structuredClone(sheet());write(next);from.pop();to.push(current);v.selected='';pending=null;paint();
    }
    const options=(items,selected)=>items.map(([id,name])=>`<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(name)}</option>`).join('');
    const button=(action,text,extra='')=>`<button type="button" class="button small" data-draw-action="${action}" ${extra}>${esc(tr(text))}</button>`;
    const types=()=>D.serviceEntries(getState()).filter(([id])=>id).map(([id])=>[id,D.serviceLabel(getState(),id,tr)]);
    function icon(n){return n.kind==='rack'?rackIcon:D.serviceIconSvg(n.service,getState(),20);}
    function render(){
      const s=sheet();if(s&&!isMap())v.id=s.id;
      root.innerHTML=`<section class="drawing-page">
        <header class="drawing-heading"><div><div class="eyebrow">${esc(tr(isMap()?'ՔԱՐՏԵԶԻ ԽՄԲԱԳՐՈՒՄ':'ՆԱԽԱԳԾՄԱՆ ԱՇԽԱՏԱՆՔԱՅԻՆ ՏԱՐԱԾՔ'))}</div><h1>${esc(tr('Գծագրություն'))}</h1><p>${esc(tr('Նախ տեղադրեք սարքերը, հետո նշեք մալուխների անցման ուղիները։'))}</p></div>
        <div class="drawing-actions">${isMap()?`<a class="button" href="#map/${esc(h.mapPlanId)}">${esc(tr('Վերադառնալ քարտեզ'))}</a>`:!h.readOnly?button('import','＋ PDF / նկար')+button('export','Արտահանել դեպի քարտեզ',s?'':'disabled'):''}</div></header>
        ${s?`<div class="drawing-toolbar">
          <label class="drawing-sheet-picker"><span>${esc(tr('Գծագրություն'))}</span>${isMap()?`<strong>${esc(s.name)}</strong>`:`<select data-draw-sheet>${options((getState().drawings||[]).map(d=>[d.id,d.name]),s.id)}</select>`}</label>
          <div class="drawing-toolset" role="toolbar" aria-label="${esc(tr('Գծագրության գործիքներ'))}">
            ${button('select','Ընտրել',`aria-pressed="${v.tool==='select'}"`)}
            ${button('hand','Տեղաշարժել',`aria-pressed="${v.tool==='hand'}"`)}
            ${!h.readOnly?button('route','Մալուխի ուղի',`aria-pressed="${v.tool==='route'}"`):''}
            ${button('undo','↶',`aria-label="${esc(tr('Հետ վերցնել'))}" ${!undo.length||h.readOnly?'disabled':''}`)}
            ${button('redo','↷',`aria-label="${esc(tr('Կրկնել'))}" ${!redo.length||h.readOnly?'disabled':''}`)}
          </div>
          <div class="drawing-zoom">${button('minus','−',`aria-label="${esc(tr('Փոքրացնել'))}"`)}<output data-draw-zoom>100%</output>${button('plus','＋',`aria-label="${esc(tr('Մեծացնել'))}"`)}${button('fit','Կենտրոնացնել')}</div>
        </div>
        <div class="drawing-workspace">
          <aside class="drawing-library">
            ${!h.readOnly&&!isMap()?`<h2>${esc(tr('Տեղադրել սարք'))}</h2><div class="drawing-palette">${[['rack',tr('Ռաք')],...types()].map(([id,label])=>`<button type="button" data-draw-type="${esc(id)}" aria-pressed="${v.tool==='place'&&v.type===id}">${icon({kind:id==='rack'?'rack':'device',service:id})}<span>${esc(label)}</span><b>＋</b></button>`).join('')}</div>`:''}
            <div class="drawing-list-heading"><h2>${esc(tr('Տեղադրված սարքեր'))}</h2><span data-draw-count></span></div><div class="drawing-device-list" data-draw-list></div><div class="drawing-device-list drawing-route-list" data-draw-route-list></div>
            ${!isMap()&&!h.readOnly?`<div class="drawing-sheet-actions">${button('rename','Խմբագրել գծագրությունը')}${button('delete-sheet','Ջնջել գծագրությունը')}</div>`:''}
          </aside>
          <div class="drawing-board"><div class="drawing-viewport" tabindex="0" aria-label="${esc(tr('Գծագրության աշխատանքային դաշտ'))}">
            <div class="drawing-canvas" style="width:${s.width}px;height:${s.height}px">
              <img src="${esc(s.image)}" width="${s.width}" height="${s.height}" alt="${esc(s.name)}" draggable="false">
              <svg class="drawing-routes" viewBox="0 0 ${s.width} ${s.height}"></svg><div class="drawing-nodes"></div>
            </div></div><div class="drawing-status" role="status" data-draw-status></div>
            <div class="drawing-pending" hidden>${button('back-point','Հեռացնել վերջին կետը')}${button('cancel-route','Չեղարկել')}</div>
          </div>
          <aside class="drawing-inspector" data-draw-inspector></aside>
        </div>`:`<div class="drawing-empty">${rackIcon}<h2>${esc(tr('Սկսեք նոր գծագրությունից'))}</h2><p>${esc(tr('Ներմուծեք PDF կամ հատակագծի նկար։ Սարքերն ու մալուխները կավելացնեք այստեղ։'))}</p>${!h.readOnly?button('import','＋ PDF / նկար'):''}</div>`}
        <input type="file" data-draw-file accept=".pdf,image/png,image/jpeg,image/webp" hidden>
      </section>`;
      if(s){paint();requestAnimationFrame(()=>{if(!disposed)fit();});}
    }
    function status(){
      const box=root.querySelector('[data-draw-status]');if(!box)return;
      box.textContent=tr(pending?'Նշեք շրջադարձերը, ապա սեղմեք վերջնական սարքը։ Esc՝ չեղարկել։':v.tool==='route'?'Սեղմեք սկզբնական սարքը, ապա շրջադարձերն ու վերջնական սարքը։':v.tool==='place'?'Սեղմեք հատակագծի վրա՝ սարքը տեղադրելու համար։':isMap()?'Փոփոխությունները պահպանվում են քարտեզի այս պատճենում։':'Քաշեք սարքը կամ ընտրեք այն՝ խմբագրելու համար։');
      root.querySelector('.drawing-pending').hidden=!pending;
      root.querySelectorAll('[data-draw-type]').forEach(b=>b.setAttribute('aria-pressed',String(v.tool==='place'&&v.type===b.dataset.drawType)));
      for(const tool of ['select','hand','route'])root.querySelector(`[data-draw-action="${tool}"]`)?.setAttribute('aria-pressed',String(v.tool===tool));
      root.querySelector('.drawing-viewport').dataset.tool=v.tool;
    }
    function paint(){
      const s=sheet();if(!s)return;
      const nodes=root.querySelector('.drawing-nodes');if(!nodes)return;
      nodes.innerHTML=s.nodes.map(n=>`<button type="button" class="drawing-node ${n.id===v.selected?'selected':''}" data-draw-node="${esc(n.id)}" style="left:${n.x*100}%;top:${n.y*100}%;--node-color:${n.kind==='rack'?'#087d91':D.serviceColor(getState(),n.service)}" aria-label="${esc(n.name)}" aria-pressed="${n.id===v.selected}">${icon(n)}<span>${esc(n.name)}</span></button>`).join('');
      paintRoutes(s);
      root.querySelector('[data-draw-count]').textContent=s.nodes.length;
      root.querySelector('[data-draw-list]').innerHTML=s.nodes.map(n=>`<button type="button" data-draw-focus="${esc(n.id)}" class="${n.id===v.selected?'active':''}">${icon(n)}<span>${esc(n.name)}</span></button>`).join('')||`<p class="hint">${esc(tr('Սարքեր դեռ չկան'))}</p>`;
      root.querySelector('[data-draw-route-list]').innerHTML=s.routes.length?`<h2>${esc(tr('Մալուխի ուղիներ'))}</h2>`+s.routes.map(r=>`<button type="button" data-draw-focus-route="${esc(r.id)}" class="${r.id===v.selected?'active':''}"><span>↳ ${esc(r.name)}</span></button>`).join(''):'';
      root.querySelector('[data-draw-action="undo"]').disabled=h.readOnly||!undo.length;
      root.querySelector('[data-draw-action="redo"]').disabled=h.readOnly||!redo.length;
      inspector(s);status();transform();
    }
    function paintRoutes(s=sheet()){
      const poly=points=>points.map(p=>`${p.x*s.width},${p.y*s.height}`).join(' ');
      root.querySelector('.drawing-routes').innerHTML=s.routes.map(r=>{
        const selected=r.id===v.selected,points=M.routePoints(r,s.nodes),from=s.nodes.find(n=>n.id===r.from);
        return `<g data-draw-route="${esc(r.id)}" class="${selected?'selected':''}" style="--route-color:${D.serviceColor(getState(),from?.service)}"><polyline class="drawing-route-hit" points="${poly(points)}" vector-effect="non-scaling-stroke"/><polyline class="drawing-route-line" points="${poly(points)}" vector-effect="non-scaling-stroke"/><title>${esc(r.name)}</title></g>${selected&&!h.readOnly?r.points.map((p,i)=>`<circle class="drawing-bend" data-draw-bend="${i}" cx="${p.x*s.width}" cy="${p.y*s.height}" r="${5/v.zoom}" tabindex="0" role="button" aria-label="${esc(tr('Շրջադարձ'))} ${i+1}"/>`).join(''):''}`;
      }).join('')+(pending?`<polyline class="drawing-route-preview" points="${poly([s.nodes.find(n=>n.id===pending.from),...pending.points].filter(Boolean))}" vector-effect="non-scaling-stroke"/>`:'');
    }
    function inspector(s){
      const host=root.querySelector('[data-draw-inspector]'),n=s.nodes.find(n=>n.id===v.selected),r=s.routes.find(r=>r.id===v.selected);
      const field=(name,label,value,tag='input')=>`<label>${esc(tr(label))}${tag==='textarea'?`<textarea name="${name}" maxlength="2000" rows="3">${esc(value)}</textarea>`:`<input name="${name}" value="${esc(value)}" required maxlength="200">`}</label>`;
      if(!n&&!r){
        host.innerHTML=`<h2>${esc(tr('Նախագծի ամփոփում'))}</h2><strong>${esc(s.name)}</strong><p>${esc(getState().floors.find(f=>f.id===s.floorId)?.name||tr('Հարկը դեռ ընտրված չէ'))}</p><dl><dt>${esc(tr('Սարքեր'))}</dt><dd>${s.nodes.length}</dd><dt>${esc(tr('Մալուխի ուղիներ'))}</dt><dd>${s.routes.length}</dd></dl><p class="hint">${esc(tr('Ընտրեք սարք կամ գիծ՝ տվյալները խմբագրելու համար։'))}</p>${!isMap()&&s.lastExportId&&getState().floorPlans?.some(p=>p.id===s.lastExportId)?`<a class="button small" href="#map/${esc(s.lastExportId)}">${esc(tr('Բացել քարտեզի պատճենը'))}</a>`:''}`;
        return;
      }
      const item=n||r;
      host.innerHTML=`<h2>${esc(tr(n?'Ընտրված սարք':'Մալուխի ուղի'))}</h2><form data-draw-edit><fieldset ${h.readOnly?'disabled':''}>
        ${field('name','Անվանում',item.name)}
        ${n?.kind==='device'?`<label>${esc(tr('Նշանակություն'))}<select name="service">${options([['',tr('Չնշված')],...types()],n.service)}</select></label>`:''}
        ${r?`<p>${esc(s.nodes.find(n=>n.id===r.from)?.name)} → ${esc(s.nodes.find(n=>n.id===r.to)?.name)}</p><p class="hint">${esc(tr('Քաշեք շրջադարձի կետը։ Գծի վրա կրկնակի սեղմումը նոր կետ է ավելացնում։'))}</p>`:''}
        ${field('notes','Նշումներ',item.notes,'textarea')}
        ${!h.readOnly?`<button class="button primary" type="submit">${esc(tr('Պահպանել'))}</button>`:''}
        </fieldset></form>
        ${!h.readOnly&&(!isMap()||r)?button('delete-item',n?'Հեռացնել սարքը':'Հեռացնել ուղին'):''}
        ${r&&!h.readOnly?button('straight','Ուղղել գիծը'):''}
        ${isMap()&&n?.kind==='rack'?`<p class="hint">${esc(tr('Ռաքի անվանումը փոխեք «Հարկեր և ռաքեր» բաժնում։'))}</p>`:''}`;
      if(isMap()&&n?.kind==='rack')host.querySelector('[name="name"]').disabled=true;
    }
    function transform(){
      const canvas=root.querySelector('.drawing-canvas');if(!canvas)return;
      canvas.style.transform=`translate(${v.x||0}px,${v.y||0}px) scale(${v.zoom})`;
      canvas.style.setProperty('--inverse-zoom',1/v.zoom);
      root.querySelector('[data-draw-zoom]').textContent=Math.round(v.zoom*100)+'%';
    }
    function fit(){
      const s=sheet(),vp=root.querySelector('.drawing-viewport');if(!s||!vp)return;
      v.zoom=Math.max(.05,Math.min((vp.clientWidth-48)/s.width,(vp.clientHeight-70)/s.height,2));
      v.x=(vp.clientWidth-s.width*v.zoom)/2;v.y=(vp.clientHeight-s.height*v.zoom)/2;
      transform();paintRoutes();
    }
    function zoom(factor,client){
      const vp=root.querySelector('.drawing-viewport'),b=vp.getBoundingClientRect();
      const x=client?client.x-b.left:b.width/2,y=client?client.y-b.top:b.height/2,old=v.zoom;
      v.zoom=Math.min(5,Math.max(.05,old*factor));v.x=x-(x-v.x)*v.zoom/old;v.y=y-(y-v.y)*v.zoom/old;
      transform();paintRoutes();
    }
    function coordinate(e){
      const s=sheet(),b=root.querySelector('.drawing-canvas').getBoundingClientRect();
      return M.point({x:(e.clientX-b.left)/(s.width*v.zoom),y:(e.clientY-b.top)/(s.height*v.zoom)});
    }
    function chooseNode(id){
      if(v.tool==='route'&&!h.readOnly){
        if(!pending)pending={from:id,points:[]};
        else if(pending.from!==id){
          const path=pending;
          change(s=>{
            if(s.routes.some(r=>(r.from===id&&r.to===path.from)||(r.to===id&&r.from===path.from)))throw new Error(tr('Այս սարքերն արդեն ունեն ուղի։ Ընտրեք գիծը՝ խմբագրելու համար։'));
            const route={id:uid(),name:M.uniqueName('C'+(s.routes.length+1),s.routes.map(r=>r.name)),notes:'',from:path.from,to:id,points:path.points};
            s.routes.push(route);v.selected=route.id;
          });
          pending=null;
        }
        paintRoutes();status();return;
      }
      v.selected=id;paint();
    }
    function deleteItem(){
      const s=sheet(),n=s.nodes.find(n=>n.id===v.selected);if(isMap()&&n)return;
      h.confirm(tr(n?'Հեռացնել սարքը':'Հեռացնել ուղին'),tr(n?'Սարքի հետ կհեռացվեն նաև դրան միացված գծագրության ուղիները։':'Կհեռացվի միայն ընտրված ուղին։'),()=>{
        change(d=>{if(n)M.removeNode(d,n.id);else d.routes=d.routes.filter(r=>r.id!==v.selected);});v.selected='';paint();
      });
    }
    function exportMap(){
      const s=sheet();if(!s||isMap())return;
      const floors=getState().floors;
      const body=`<p>${esc(tr('Կստեղծվի քարտեզի նոր պատճեն։ Սարքերը կավելացվեն որպես նախատեսված փաչ պանելի պորտեր։'))}</p>${s.lastExportId?`<p class="hint">${esc(tr('Նախորդ պատճենը պահպանվում է։ Այս արտահանումը կստեղծի նոր պատճեն։'))}</p>`:''}
        <div class="form-grid">${h.select('floorId',tr('Հարկ'),floors.map(f=>[f.id,f.name]),s.floorId||floors[0]?.id)}<label>${esc(tr('Ընդունող ռաք'))}<select name="rackId" data-draw-target-rack></select></label></div>
        <p class="hint">${esc(tr('Գծագրության ռաքերը կստեղծվեն որպես նոր ռաքեր։ Առանց ռաքի սարքերը կօգտագործեն ընտրված ընդունող ռաքը։'))}</p><p class="hint">${esc(tr('Ավտոմատ ընտրությունը օգտագործում է գծագրության առաջին ռաքը կամ ստեղծում նորը։'))}</p>`;
      h.modal(tr('Արտահանել դեպի քարտեզ'),body,async fd=>{
        let plan;
        h.commit(state=>{plan=M.exportToMap(state,s.id,{floorId:fd.get('floorId'),rackId:fd.get('rackId'),rackName:tr('Գծագրություն')+' · '+s.name},D);checkSize(state);},false);
        location.hash='#map/'+plan.id;
      });
      const dlg=document.querySelector('#dialog'),floorSelect=dlg.querySelector('[name="floorId"]'),rackSelect=dlg.querySelector('[name="rackId"]');
      const fill=()=>{rackSelect.innerHTML=options([['',tr('Ավտոմատ ռաք')],...(getState().floors.find(f=>f.id===floorSelect.value)?.racks||[]).map(r=>[r.id,r.name])],'');};
      floorSelect.addEventListener('change',fill);fill();
    }
    async function importFile(file){
      if(!file||h.readOnly||importing)return;
      if(file.size>30*1024*1024)throw new Error(tr('Հատակագծի ֆայլը պետք է լինի մինչև 30 ՄԲ'));
      importing=true;let task,doc,bitmap,cancelled=false;
      try{
        h.toast(tr('Հատակագիծը բեռնվում է…'));
        if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
          const lib=await import('/pdfjs/pdf.mjs');lib.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.mjs';
          task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWasm:false,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/'});
          let locked=false;task.onPassword=()=>{locked=true;void task.destroy();};
          try{doc=await task.promise;}catch(e){throw locked?new Error(tr('Բեռնեք առանց գաղտնաբառի PDF')):e;}
        }else{
          if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error(tr('Ընտրեք PNG, JPEG, WebP կամ PDF'));
          bitmap=await createImageBitmap(file);
        }
        if(disposed){await task?.destroy();bitmap?.close();return;}
        const count=doc?.numPages||1;
        if(count>30)throw new Error(tr('Մեկ ներմուծմամբ ընտրեք մինչև 30 էջ ունեցող PDF։'));
        const renderPage=async (number,size)=>{
          const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
          if(doc){
            const page=await doc.getPage(number),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:size/Math.max(base.width,base.height)});
            canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
            await page.render({canvasContext:ctx,viewport,background:'#ffffff'}).promise;page.cleanup();
          }else{
            const scale=Math.min(1,size/Math.max(bitmap.width,bitmap.height));
            canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
            ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
          }
          let image=canvas.toDataURL('image/jpeg',.85);
          if(image.length>2500000)image=canvas.toDataURL('image/jpeg',.65);
          if(image.length>2500000)throw new Error(tr('Հատակագիծը չափազանց մեծ է'));
          return {image,width:canvas.width,height:canvas.height};
        };
        const floorOptions=[['',tr('Հարկը ընտրել հետո')],...getState().floors.map(f=>[f.id,f.name]),['__new__',tr('＋ Ավելացնել հարկ')]];
        h.modal(tr('PDF-ի էջերն ու հարկերը'),`<p>${esc(tr('Յուրաքանչյուր ընտրված էջ կդառնա առանձին խմբագրվող գծագրություն։'))}</p><div class="drawing-import-pages">${Array.from({length:count},(_,i)=>`<article class="drawing-import-page" data-import-page="${i+1}"><div class="drawing-import-preview"></div><label class="drawing-check"><input type="checkbox" name="page-${i+1}" ${i===0?'checked':''}> ${esc(tr('Էջ'))} ${i+1}</label><label>${esc(tr('Հարկ'))}<select name="floor-${i+1}">${options(floorOptions,'')}</select></label><input name="new-floor-${i+1}" aria-label="${esc(tr('Նոր հարկի անվանում'))}" placeholder="${esc(tr('Նոր հարկի անվանում'))}" maxlength="200" hidden></article>`).join('')}</div>`,async fd=>{
          const selected=Array.from({length:count},(_,i)=>i+1).filter(i=>fd.has('page-'+i));
          if(!selected.length)throw new Error(tr('Ընտրեք առնվազն մեկ էջ'));
          if((getState().drawings?.length||0)+selected.length>30)throw new Error(tr('Առավելագույնը՝ 30 գծագրություն'));
          const drafts=[];
          for(const number of selected){
            const floorId=String(fd.get('floor-'+number)||''),floorName=String(fd.get('new-floor-'+number)||'').trim();
            if(floorId==='__new__'&&!floorName)throw new Error(tr('Գրեք նոր հարկի անվանումը'));
            drafts.push({id:uid(),name:file.name.replace(/\.[^.]+$/,'').slice(0,170)+(count>1?' · '+tr('Էջ')+' '+number:''),floorId,floorName,sourceName:file.name.slice(0,200),...(await renderPage(number,2000)),nodes:[],routes:[]});
          }
          if(cancelled||disposed)return;
          h.commit(state=>{
            state.drawings||=[];
            for(const draft of drafts){
              if(draft.floorId==='__new__'){
                let floor=state.floors.find(f=>f.name.trim().toLocaleLowerCase()===draft.floorName.toLocaleLowerCase());
                if(!floor){floor={id:uid(),name:draft.floorName,racks:[]};state.floors.push(floor);}
                draft.floorId=floor.id;
              }
              delete draft.floorName;
              draft.name=M.uniqueName(draft.name,state.drawings.map(d=>d.name));state.drawings.push(draft);
            }
            checkSize(state);
          },false);
          v.id=drafts[0].id;v.selected='';undo=[];redo=[];render();
        });
        const dlg=document.querySelector('#dialog');
        const submit=dlg.querySelector('[type="submit"]');submit.disabled=true;
        const close=()=>{if(cancelled)return;cancelled=true;importing=false;void task?.destroy();bitmap?.close();};
        dlg.addEventListener('close',close,{once:true});
        signal.addEventListener('abort',close,{once:true});
        dlg.querySelectorAll('[name^="floor-"]').forEach(select=>select.addEventListener('change',()=>{
          const input=select.closest('article').querySelector('[name^="new-floor-"]');input.hidden=select.value!=='__new__';
        }));
        // One PDF page at a time avoids concurrent renders and excessive memory use.
        for(let i=1;i<=count&&!cancelled&&!disposed;i++){
          const preview=await renderPage(i,360);
          if(!cancelled)dlg.querySelector(`[data-import-page="${i}"] .drawing-import-preview`).innerHTML=`<img src="${preview.image}" alt="${esc(tr('Էջ'))} ${i}">`;
        }
        if(!cancelled&&!disposed)submit.disabled=false;
        // The PDF stays alive while the import dialog is open.
      }catch(e){await task?.destroy();bitmap?.close();if(!cancelled&&!disposed)throw e;}
      finally{if(!document.querySelector('#dialog')?.open)importing=false;}
    }
    function handleAction(action){
      if(['select','hand','route'].includes(action)){v.tool=action;pending=null;paint();return;}
      if(action==='plus'||action==='minus'){zoom(action==='plus'?1.25:.8);return;}
      if(action==='fit'){fit();return;}
      if(h.readOnly)return;
      if(action==='import'){root.querySelector('[data-draw-file]').click();return;}
      if(action==='export'){exportMap();return;}
      if(action==='undo'){travel(undo,redo);return;}
      if(action==='redo'){travel(redo,undo);return;}
      if(action==='cancel-route'){pending=null;paintRoutes();status();return;}
      if(action==='back-point'){if(pending?.points.length)pending.points.pop();else pending=null;paintRoutes();status();return;}
      if(action==='delete-item'){deleteItem();return;}
      if(action==='straight'){change(s=>{const r=s.routes.find(r=>r.id===v.selected);if(r)r.points=[];});return;}
      if(action==='rename'){
        const s=sheet();h.modal(tr('Խմբագրել գծագրությունը'),h.input('name',tr('Անվանում'),s.name,'text','required maxlength="200"')+h.select('floorId',tr('Հարկ'),[['',tr('Հարկը ընտրել հետո')],...getState().floors.map(f=>[f.id,f.name])],s.floorId),fd=>{
          change(d=>{d.name=String(fd.get('name')).trim();d.floorId=String(fd.get('floorId'));});render();
        });return;
      }
      if(action==='delete-sheet'){
        const id=sheet().id;
        h.confirm(tr('Ջնջել գծագրությունը'),tr('Կջնջվի գծագրությունը։ Նախկինում արտահանված քարտեզի պատճենները կպահպանվեն։'),()=>{
          h.commit(s=>{s.drawings=s.drawings.filter(d=>d.id!==id);},false);v.id='';v.selected='';undo=[];redo=[];pending=null;render();
        });
      }
    }
    root.addEventListener('click',e=>{
      try{
        const action=e.target.closest('[data-draw-action]'),type=e.target.closest('[data-draw-type]'),focus=e.target.closest('[data-draw-focus]'),node=e.target.closest('[data-draw-node]'),route=e.target.closest('[data-draw-focus-route]');
        if(action)handleAction(action.dataset.drawAction);
        else if(type&&!h.readOnly){v.type=type.dataset.drawType;v.tool='place';pending=null;v.selected='';paint();}
        else if(focus){v.tool='select';chooseNode(focus.dataset.drawFocus);const n=sheet().nodes.find(n=>n.id===v.selected),vp=root.querySelector('.drawing-viewport');v.x=vp.clientWidth/2-n.x*sheet().width*v.zoom;v.y=vp.clientHeight/2-n.y*sheet().height*v.zoom;transform();}
        else if(node&&e.detail===0){chooseNode(node.dataset.drawNode);root.querySelector('.drawing-viewport').focus({preventScroll:true});}
        else if(route){v.selected=route.dataset.drawFocusRoute;v.tool='select';paint();}
      }catch(err){fail(err);}
    },{signal});
    root.addEventListener('change',e=>{
      if(e.target.matches('[data-draw-sheet]')){v.id=e.target.value;v.selected='';pending=null;undo=[];redo=[];render();}
      if(e.target.matches('[data-draw-file]')){const file=e.target.files[0];e.target.value='';void importFile(file).catch(fail);}
    },{signal});
    root.addEventListener('submit',e=>{
      if(!e.target.matches('[data-draw-edit]'))return;e.preventDefault();if(h.readOnly)return;
      try{const fd=new FormData(e.target);change(s=>{
        const item=s.nodes.find(n=>n.id===v.selected)||s.routes.find(r=>r.id===v.selected);if(!item)return;
        if(fd.has('name'))item.name=String(fd.get('name')).trim();item.notes=String(fd.get('notes')).trim();
        if(fd.has('service'))item.service=String(fd.get('service'));
      });}catch(err){fail(err);}
    },{signal});
    root.addEventListener('pointerdown',e=>{
      const vp=e.target.closest('.drawing-viewport');if(!vp||e.button!==0)return;
      vp.focus({preventScroll:true});
      const node=e.target.closest('[data-draw-node]'),bend=e.target.closest('[data-draw-bend]'),route=e.target.closest('[data-draw-route]');
      const mode=v.tool==='hand'?'pan':bend&&!h.readOnly?'bend':node?'node':route&&v.tool!=='route'?'route':'blank';
      drag={mode,id:node?.dataset.drawNode||route?.dataset.drawRoute,index:Number(bend?.dataset.drawBend),start:{x:e.clientX,y:e.clientY},position:coordinate(e),x:v.x,y:v.y,moved:false};
      vp.setPointerCapture(e.pointerId);e.preventDefault();
    },{signal});
    root.addEventListener('pointermove',e=>{
      if(!drag)return;
      const dx=e.clientX-drag.start.x,dy=e.clientY-drag.start.y;
      drag.moved||=Math.hypot(dx,dy)>4;
      if(!drag.moved)return;
      if(drag.mode==='pan'){v.x=drag.x+dx;v.y=drag.y+dy;transform();}
      else if(drag.mode==='node'&&v.tool==='select'&&!h.readOnly){
        const n=sheet().nodes.find(n=>n.id===drag.id),p=M.point({x:n.x+dx/(sheet().width*v.zoom),y:n.y+dy/(sheet().height*v.zoom)});
        const el=root.querySelector(`[data-draw-node="${drag.id}"]`);el.style.left=p.x*100+'%';el.style.top=p.y*100+'%';
        const preview=structuredClone(sheet());Object.assign(preview.nodes.find(n=>n.id===drag.id),p);paintRoutes(preview);
      }else if(drag.mode==='bend'){
        const preview=structuredClone(sheet()),r=preview.routes.find(r=>r.id===v.selected);if(r){r.points[drag.index]=coordinate(e);paintRoutes(preview);}
      }
    },{signal});
    root.addEventListener('pointerup',e=>{
      if(!drag)return;
      const d=drag;drag=null;
      try{
        if(d.mode==='pan')return;
        if(d.moved&&d.mode==='node'&&v.tool==='select'&&!h.readOnly){
          change(s=>{const n=s.nodes.find(n=>n.id===d.id);Object.assign(n,M.point({x:n.x+(e.clientX-d.start.x)/(s.width*v.zoom),y:n.y+(e.clientY-d.start.y)/(s.height*v.zoom)}));v.selected=n.id;});return;
        }
        if(d.mode==='bend'){if(d.moved)change(s=>{s.routes.find(r=>r.id===v.selected).points[d.index]=coordinate(e);});return;}
        if(d.moved)return;
        if(d.mode==='node'){chooseNode(d.id);return;}
        if(d.mode==='route'){v.selected=d.id;paint();return;}
        if(v.tool==='place'&&!h.readOnly&&!isMap()){
          const p=coordinate(e);change(s=>{
            const prefix={rack:'RK',internet:'R',wifi:'W',camera:'C',access:'D',phone:'T'}[v.type]||'D';
            const n={id:uid(),kind:v.type==='rack'?'rack':'device',service:v.type==='rack'?'':v.type,name:M.uniqueName(prefix+(s.nodes.filter(n=>n.kind===(v.type==='rack'?'rack':'device')&&n.service===(v.type==='rack'?'':v.type)).length+1),s.nodes.map(n=>n.name)),notes:'',...p};
            s.nodes.push(n);v.selected=n.id;
          });
        }else if(v.tool==='route'&&pending&&!h.readOnly){
          if(pending.points.length>=128)throw new Error(tr('Առավելագույնը՝ 128 շրջադարձ'));
          pending.points.push(coordinate(e));paintRoutes();status();
        }else{v.selected='';paint();}
      }catch(err){fail(err);paint();}
    },{signal});
    root.addEventListener('pointercancel',()=>{drag=null;paint();},{signal});
    root.addEventListener('dblclick',e=>{
      if(h.readOnly)return;
      const bend=e.target.closest('[data-draw-bend]'),route=e.target.closest('[data-draw-route]');
      try{
        if(bend){change(s=>{s.routes.find(r=>r.id===v.selected).points.splice(Number(bend.dataset.drawBend),1);});return;}
        if(!route||v.tool==='route')return;
        const p=coordinate(e);change(s=>{
          const r=s.routes.find(r=>r.id===route.dataset.drawRoute),points=M.routePoints(r,s.nodes);let best=Infinity,index=0;
          for(let i=0;i<points.length-1;i++){
            const a={x:points[i].x*s.width,y:points[i].y*s.height},b={x:points[i+1].x*s.width,y:points[i+1].y*s.height},q={x:p.x*s.width,y:p.y*s.height};
            const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.y-a.y)*dy)/(dx*dx+dy*dy||1))),distance=Math.hypot(q.x-a.x-t*dx,q.y-a.y-t*dy);
            if(distance<best){best=distance;index=i;}
          }
          r.points.splice(index,0,p);v.selected=r.id;
        });
      }catch(err){fail(err);}
    },{signal});
    root.addEventListener('wheel',e=>{if(!e.target.closest('.drawing-viewport'))return;e.preventDefault();zoom(e.deltaY<0?1.1:1/1.1,{x:e.clientX,y:e.clientY});},{passive:false,signal});
    root.addEventListener('keydown',e=>{
      if(e.target.closest('input,select,textarea'))return;
      try{
        if(e.key==='Escape'){pending=null;v.tool='select';v.selected='';paint();e.preventDefault();}
        if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();const back=e.key.toLowerCase()==='z'&&!e.shiftKey;travel(back?undo:redo,back?redo:undo);}
        if(h.readOnly)return;
        if(e.key==='Delete'&&v.selected){e.preventDefault();deleteItem();}
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&sheet()?.nodes.some(n=>n.id===v.selected)){
          e.preventDefault();change(s=>{const n=s.nodes.find(n=>n.id===v.selected),step=e.shiftKey?10:2;Object.assign(n,M.point({x:n.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0)/(s.width*v.zoom),y:n.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)/(s.height*v.zoom)}));});
        }
      }catch(err){fail(err);}
    },{signal});
    render();
    resize=new ResizeObserver(()=>{if(!drag&&sheet())fit();});resize.observe(root);
    return {destroy(){disposed=true;abort.abort();resize.disconnect();},busy(){return importing||!!drag||!!pending;}};
  }
  return {mount,mapRoutes};
})();
