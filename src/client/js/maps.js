'use strict';
globalThis.RackMaps=(()=>{
  const D=globalThis.RackDomain,ui=new Map();let pdfLoading;
  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>{s.remove();reject(new Error('PDF tools could not load'));};document.head.append(s);});
  async function exportPdf(state,kind,planId,tr,options={}){
    if(!globalThis.PDFDocument){pdfLoading||=loadScript('/pdfkit.js').catch(e=>{pdfLoading=null;throw e;});await pdfLoading;}
    const response=await fetch('/assets/DejaVuSans.ttf');if(!response.ok)throw new Error(tr('Չհաջողվեց կատարել գործողությունը'));
    const font=new Uint8Array(await response.arrayBuffer());
    const chunks=await RackHandover.create(PDFDocument,state,{...options,font,tr,kind,planId});
    return new Blob(chunks,{type:'application/pdf'});
  }
  async function readPlan(file,pageNumber,tr){
    if(file.size>30*1024*1024)throw new Error(tr('Հատակագծի ֆայլը պետք է լինի մինչև 30 ՄԲ'));
    let canvas=document.createElement('canvas');
    if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
      const lib=await import('/pdfjs/pdf.mjs');lib.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.mjs';
      const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useWasm:false,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/'});
      let passwordRequired=false;task.onPassword=()=>{passwordRequired=true;void task.destroy();};
      try{
        const doc=await task.promise;if(pageNumber>doc.numPages)throw new Error(tr('PDF-ում այդ էջը չկա'));
        const page=await doc.getPage(pageNumber),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2400/base.width,2400/base.height)});
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'#ffffff'}).promise;
      }catch(error){if(passwordRequired)throw new Error(tr('Բեռնեք առանց գաղտնաբառի PDF'));throw error;}finally{await task.destroy();}
    }else{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error(tr('Ընտրեք PNG, JPEG, WebP կամ PDF'));
      const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);}finally{bitmap.close();}
    }
    let image=canvas.toDataURL('image/jpeg',.88);
    while(image.length>1800000&&Math.max(canvas.width,canvas.height)>1000){const smaller=document.createElement('canvas');smaller.width=Math.round(canvas.width*.85);smaller.height=Math.round(canvas.height*.85);smaller.getContext('2d').drawImage(canvas,0,0,smaller.width,smaller.height);canvas=smaller;image=canvas.toDataURL('image/jpeg',.82);}
    if(image.length>2500000)throw new Error(tr('Հատակագիծը չափազանց մեծ է'));
    return {image,width:canvas.width,height:canvas.height};
  }
  function mount(root,h){
    const {tr,esc,commit,getState,modal,input,select,toast,download,save}=h,abort=new AbortController();
    const key=h.projectKey;let view=ui.get(key);if(!view){view={planId:'',portId:'',query:'',zoom:1,imageOpacity:0};ui.set(key,view);}const collapsedDeviceGroups=new Set(),expandedDeviceCards=new Set();
    const state=getState(),plans=state.floorPlans||[];let plan=plans.find(p=>p.id===view.planId)||plans[0];view.planId=plan?.id||'';
    const rows=D.rows(state),byId=new Map(rows.map(r=>[r.p.id,r]));const mapData=D.mapDevices(state,plan);view.portId=mapData.canonical(view.portId);if(!mapData.devices.some(r=>r.p.id===view.portId)&&!mapData.markers.some(m=>m.portId===view.portId)){view.portId='';view.placing=false;}let dragging=null;
    const findPlan=s=>(s.floorPlans||[]).find(p=>p.id===view.planId);
    const connectionLabel=r=>`${r.rack} / ${r.device} / ${r.port}`;
    const name=r=>D.endpointLabel(state,r,tr);
    const label=r=>r?name(r)+' · '+connectionLabel(r):tr('Չի գտնվել');
    const icon=service=>`<svg class="map-service-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${D.serviceIcon(service,state)}"/></svg>`;
    // Undo / redo stacks (map-page local, max 50 steps)
    const undoStack=[],redoStack=[];
    function change(fn){
      if(h.readOnly)throw new Error(tr('Միայն դիտում'));
      const snap=JSON.stringify(getState().floorPlans||[]);
      commit(fn);
      undoStack.push(snap);if(undoStack.length>50)undoStack.shift();
      redoStack.length=0;
    }
    function applyUndoRedo(snapJson){
      const plans=JSON.parse(snapJson);
      commit(s=>{s.floorPlans=plans;},false);
      h.redraw();
    }
    function undo(){if(!undoStack.length)return;redoStack.push(JSON.stringify(getState().floorPlans||[]));applyUndoRedo(undoStack.pop());toast(tr('Հետ վերցվեց'));}
    function redo(){if(!redoStack.length)return;undoStack.push(JSON.stringify(getState().floorPlans||[]));applyUndoRedo(redoStack.pop());toast(tr('Կրկին կատարվեց'));}
    function button(text,action,extra=''){return `<button type="button" class="button" data-map-action="${action}" ${extra}>${esc(tr(text))}</button>`;}
    const paths={select:'m5 3 14 10-7 1-3 7Z',hand:'M8 13V6a2 2 0 0 1 4 0v6M12 5a2 2 0 0 1 4 0v7M16 8a2 2 0 0 1 4 0v7c0 4-3 7-7 7h-1c-2 0-3-1-4-3l-4-6c-1-2 1-4 3-2l1 2',fit:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',plus:'M12 5v14M5 12h14',minus:'M5 12h14',close:'m6 6 12 12M18 6 6 18',layers:'m3 7 9-5 9 5-9 5Zm0 5 9 5 9-5M3 17l9 5 9-5',plan:'M3 3h18v18H3ZM3 9h18M9 9v12',devices:'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',labels:'M4 5h16M12 5v15M8 20h8',pdf:'M14 2H5v20h14V7Zm0 0v6h5M8 13h8M8 17h6',share:'M8 12 17 6M8 12l9 6M3 9h5v6H3ZM17 3h5v5h-5Zm0 13h5v5h-5Z',more:'M5 11v2M12 11v2M19 11v2',edit:'m4 16 12-12 4 4L8 20l-5 1Z',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',fullscreen:'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',eye:'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',eyeOff:'m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.1 3.9M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8'};
    const svg=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
    const tool=(text,action,image,extra='')=>`<button type="button" class="map-tool" data-map-action="${action}" title="${esc(tr(text))}" aria-label="${esc(tr(text))}" ${extra}>${svg(image)}</button>`;
    view.tool||='select';view.filter||='all';view.labels??=true;view.markerSize=Math.min(50,Math.max(0,Number(view.markerSize)||0));view.imageOpacity=Math.min(90,Math.max(0,Number(view.imageOpacity)||0));
    const floorName=id=>state.floors.find(f=>f.id===id)?.name||tr('Առանց հարկի');
    const mapFloors=[...new Set(plans.map(p=>p.floorId))];
    document.body.classList.add('map-view');
    root.innerHTML=plans.length?`
      <section class="map-editor" aria-label="${esc(tr('Քարտեզի խմբագրիչ'))}">
        <div class="map-viewport" tabindex="0" aria-label="${esc(tr('Հատակագծի աշխատանքային դաշտ'))}"><div class="map-canvas"><img width="${plan.width}" height="${plan.height}" src="${plan.image}" alt="${esc(plan.name)}" draggable="false"><div class="map-markers"></div></div></div>
        <div class="map-topbar">
          <div class="map-project"><span class="map-project-name">${esc(state.company)}</span><div class="map-plan-controls">
            <label class="map-pill-select">${svg('layers')}<select data-map-floor aria-label="${esc(tr('Հարկ'))}">${mapFloors.map(id=>`<option value="${esc(id)}" ${id===plan.floorId?'selected':''}>${esc(floorName(id))}</option>`).join('')}</select></label>
            <label class="map-pill-select map-plan-select">${svg('plan')}<select data-map-plan aria-label="${esc(tr('Հատակագիծ'))}">${plans.filter(p=>p.floorId===plan.floorId).map(p=>`<option value="${esc(p.id)}" ${p.id===plan.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>
            ${!h.readOnly?tool('Բեռնել հատակագիծ','upload','plus'):''}
          </div></div>
          <div class="map-top-actions"><button type="button" class="map-command" data-map-action="map-pdf" aria-label="${esc(tr('Քարտեզ PDF'))}">${svg('pdf')}<span>PDF</span></button><button type="button" class="map-command" data-map-action="share" aria-label="${esc(tr('Կիսվել հղումով'))}">${svg('share')}<span>${esc(tr('Կիսվել'))}</span></button>
            <details class="map-more"><summary class="map-tool" title="${esc(tr('Լրացուցիչ գործիքներ'))}" aria-label="${esc(tr('Լրացուցիչ գործիքներ'))}">${svg('more')}</summary><div class="map-more-menu"><label class="map-marker-size"><span>${esc(tr('Նշիչի մեծացում'))}</span><output data-marker-size-value>+${view.markerSize}%</output><input type="range" min="0" max="50" step="5" value="${view.markerSize}" data-map-marker-size aria-label="${esc(tr('Նշիչի մեծացում'))}"></label><label class="map-marker-size"><span>${esc(tr('Հատ. ֆոնի մաղձոտ.'))}</span><output data-image-opacity-value>${view.imageOpacity}%</output><input type="range" min="0" max="90" step="10" value="${view.imageOpacity}" data-map-image-opacity aria-label="${esc(tr('Հատ. ֆոնի մաղձոտ.'))}"></label>${!h.readOnly?button('Խմբագրել հատակագիծը','edit'):''}${button('Սարքերի սխեմաներ PDF','panel-pdf',D.devices(state).length?'':'disabled')}${button('Իմ հղումները','shares')}${!h.readOnly?button('Ջնջել հատակագիծը','delete'):''}</div></details>
          </div>
        </div>
        <div class="map-filters" role="group" aria-label="${esc(tr('Սարքի տեսակ'))}">${[['all','Բոլորը','devices'],['wifi','Wi-Fi'],['camera','Տեսախցիկ']].map(([id,name,shape])=>`<button type="button" data-map-filter="${id}" aria-label="${esc(tr(name))}" aria-pressed="${view.filter===id}">${shape?svg(shape):icon(id)}<span>${esc(tr(name))}</span><small>${id==='all'?mapData.markers.length:mapData.markers.filter(m=>m.row.service===id).length}</small></button>`).join('')}</div>
        <div class="map-side-panels ${view.devicesOpen?'devices-open':''}"><aside class="map-inspector" data-map-inspector hidden></aside>
        <aside class="map-sidebar ${view.devicesOpen?'is-open':''}" aria-label="${esc(tr('Միացված սարքեր'))}"><div class="map-sidebar-heading"><span>${svg('devices')}${esc(tr('Միացված սարքեր'))}</span>${tool('Փակել','devices-toggle','close')}</div><div id="map-device-picker" class="map-picker-body" ${view.devicesOpen?'':'hidden'}><label class="field"><span>${esc(tr('Որոնում'))}</span><input data-map-search value="${esc(view.query)}" placeholder="${esc(tr('Սարքի տեսակ, մալուխ կամ սենյակ'))}"></label><p class="hint">${esc(tr('Ընտրեք սարքը և սեղմեք հատակագծի վրա։'))}</p><div class="map-port-list"></div></div></aside></div>
        <div class="map-view-tools" role="group" aria-label="${esc(tr('Քարտեզի դիտում'))}">${tool('Տեղավորել էկրանին','fit','fit')}${tool('Մեծացնել','zoom-in','plus')}<button type="button" class="map-zoom-value" data-map-action="zoom-reset" data-map-zoom aria-label="100%">100%</button>${tool('Փոքրացնել','zoom-out','minus')}${tool('Ամբողջ էկրանով','fullscreen','fullscreen')}</div>
        <div class="map-bottom-toolbar" role="toolbar" aria-label="${esc(tr('Քարտեզի գործիքներ'))}">${tool('Ընտրել (V)','select','select',`aria-pressed="${view.tool==='select'}"`)}${tool('Տեղաշարժել դաշտը (H / Space)','hand','hand',`aria-pressed="${view.tool==='hand'}"`)}<i></i>${tool('Ցույց տալ անվանումները','labels','labels',`aria-pressed="${view.labels}"`)}<i></i><button type="button" class="map-command map-add-devices" data-map-action="devices-toggle" aria-expanded="${!!view.devicesOpen}" aria-controls="map-device-picker">${svg('devices')}<span>${esc(tr('Ավելացնել սարք'))}</span><small>${mapData.devices.filter(r=>!mapData.markers.some(m=>m.portId===r.p.id)).length}</small></button></div>
        <p class="map-status" data-map-hint role="status"></p>
      </section>`:`<section class="map-empty-editor"><div>${svg('plan')}<span class="eyebrow">${esc(state.company)}</span><h1>${esc(tr('Քարտեզի խմբագրիչ'))}</h1><p>${esc(tr('Բեռնեք հատակագիծը և տեղադրեք միացված սարքերը համապատասխան տեղերում։'))}</p><p class="hint">${esc(tr('PNG, JPEG, WebP կամ PDF։ Յուրաքանչյուր PDF էջը բեռնեք որպես առանձին հատակագիծ։'))}</p>${!h.readOnly?button('Բեռնել հատակագիծ','upload'):''}${button('Սարքերի սխեմաներ PDF','panel-pdf',D.devices(state).length?'':'disabled')}</div></section>`;
    const headerControls=root.querySelector('.map-plan-controls'),projectHeader=root.querySelector('.map-project');
    const placeHeaderControls=()=>{const breadcrumb=document.querySelector('.topbar #breadcrumb');if(!headerControls||!breadcrumb)return;if(document.fullscreenElement===root)projectHeader.append(headerControls);else breadcrumb.after(headerControls);};
    headerControls?.classList.add('map-header-controls');placeHeaderControls();
    document.addEventListener('fullscreenchange',placeHeaderControls,{signal:abort.signal});
    headerControls?.addEventListener('click',e=>{if(!root.contains(headerControls))click(e).catch(err=>toast(err.message));},{signal:abort.signal});
    function showDevices(open){view.devicesOpen=open;const side=root.querySelector('.map-sidebar');if(!side)return;root.querySelector('.map-side-panels')?.classList.toggle('devices-open',open);side.classList.toggle('is-open',open);const picker=root.querySelector('#map-device-picker');if(picker)picker.hidden=!open;const toggle=side.querySelector('[data-map-action="devices-toggle"]');if(toggle){toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-controls','map-device-picker');toggle.innerHTML=svg(open?'close':'plus');toggle.title=esc(tr(open?'Փակել':'Միացված սարքեր'));toggle.setAttribute('aria-label',toggle.title);}root.querySelector('.map-add-devices')?.setAttribute('aria-expanded',String(open));drawInspector();}
    function drawInspector(){
      scheduleLabels();
      const host=root.querySelector('[data-map-inspector]');if(!host)return;
      const row=byId.get(view.portId),marker=mapData.markers.find(m=>m.portId===view.portId);host.hidden=!row;
      if(!row)return;
      const preview=byId.get(view.panelPortId);host.classList.toggle('map-panel-preview',!!preview);
      if(preview){
        const layout=D.portLayout(preview.d),count=layout[0]?.columns||24;
        host.innerHTML=`<div class="map-inspector-heading"><span>${esc(tr(preview.d.type==='panel'?'Փաչ պանել':preview.d.type==='router'?'Ռաուտեր':'Սվիչ'))}</span>${tool('Փակել','panel-close','close')}</div><div class="map-panel-title"><strong>${esc(preview.device)}</strong><span>${esc(preview.floor+' · '+preview.rack+' · U'+preview.d.pos)}</span></div><div class="map-panel-scroll"><div class="map-panel-ports" style="grid-template-columns:repeat(${count},24px)">${layout.map(({p,row,column,optical})=>{const port=byId.get(p.id);return `<button type="button" class="map-panel-port ${p.id===preview.p.id?'active':''}" data-map-panel-port="${esc(p.id)}" style="grid-row:${row+1};grid-column:${column+1};--port-service:${port.status==='fault'?'#d35352':D.serviceColor(state,port.service)};--port-status:${D.statusColor(state,port.status)}" title="${esc(label(port))}" aria-label="${esc(port.port+' · '+label(port))}" aria-pressed="${p.id===preview.p.id}">${p.number}<i></i>${optical?'<small>SFP</small>':''}</button>`;}).join('')}</div></div><div class="map-panel-port-info"><strong>${esc(tr('Պորտ'))} ${preview.port} · ${esc(name(preview))}</strong><span>${esc(D.serviceLabel(state,preview.service,tr)+' · '+D.statusLabel(state,preview.status,tr))}</span></div>${details([['Միացված սարքի անվանում',preview.endpointName],['Սենյակ',preview.room],['Մալուխ',preview.cable],['Կապ',preview.connection],['VLAN',preview.vlan]])}${!h.readOnly?`<div class="map-inspector-actions"><button type="button" class="map-command" data-map-action="panel-edit">${svg('edit')}${esc(tr('Խմբագրել պորտը'))}</button></div>`:''}`;
        return;
      }
      host.innerHTML=`<div class="map-inspector-heading"><span>${esc(tr('Ընտրված սարք'))}</span>${tool('Չեղարկել ընտրությունը','deselect','close')}</div><div class="map-selected-device"><span class="map-selected-icon" style="color:${row.status==='fault'?'#d35352':D.serviceColor(state,row.service)}">${icon(row.service)}</span><div><strong>${esc(name(row))}</strong><span>${esc((row.status==='fault'?D.statusLabel(state,'fault',tr):D.serviceLabel(state,row.service,tr)))}${marker?' · #'+marker.number:''}</span></div></div>${details([['Հարկ',row.destination||row.floor],['Ռաք',row.rack],['Սարք / պորտ',row.device+' / '+row.port],['Մալուխ',row.cable]])}<div class="map-inspector-actions"><button type="button" class="map-command" data-map-action="panel-open">${svg('edit')}${esc(tr('Բացել պորտը'))}</button>${marker&&!h.readOnly?`<button type="button" class="map-tool" data-map-action="anchor-toggle" aria-pressed="${!!marker.anchorVisible}" title="${esc(tr(marker.anchorVisible?'Թաքցնել կետը':'Ցույց տալ կետը'))}" aria-label="${esc(tr(marker.anchorVisible?'Թաքցնել կետը':'Ցույց տալ կետը'))}">${svg(marker.anchorVisible?'eyeOff':'eye')}</button><button type="button" class="map-tool danger" data-map-remove="${esc(marker.id)}" title="${esc(tr('Հեռացնել նշանը'))}" aria-label="${esc(tr('Հեռացնել նշանը'))}">${svg('trash')}</button>`:''}</div>`;
    }
    function details(values){return `<dl>${values.filter(([,value])=>value).map(([key,value])=>`<div><dt>${esc(tr(key))}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;}
    function editPanelPort(){
      if(h.readOnly)return;const row=byId.get(mapData.canonical(view.panelPortId));if(!row)return;
      modal(tr('Խմբագրել պորտը')+' · '+row.device+' / '+row.port,`<div class="form-grid">${input('endpointName',tr('Միացված սարքի անվանում'),row.endpointName,'text','maxlength="200" placeholder="WiFi B zone"')}${select('service',tr('Նշանակություն'),D.serviceEntries(state).map(([key])=>[key,D.serviceLabel(state,key,tr)]),row.service)}${input('room',tr('Սենյակ'),row.room,'text','maxlength="200"')}${input('cable',tr('Մալուխի համար'),row.cable,'text','maxlength="200"')}${select('status',tr('Վիճակ'),Object.keys(D.statuses).map(key=>[key,D.statusLabel(state,key,tr)]),row.p.status)}${input('vlan','VLAN',row.vlan,'number','min="1" max="4094" step="1"')}</div>`,fd=>change(s=>{const current=D.ports(s).find(x=>x.p.id===row.p.id);if(!current)throw new Error(tr('Պորտը չի գտնվել'));for(const key of ['endpointName','room','cable','service','vlan'])current.p[key]=String(fd.get(key)||'').trim();if(current.p.vlan)current.p.vlan=String(Number(current.p.vlan));current.p.status=String(fd.get('status'));if(current.p.status==='fault')current.p.service='';else if(current.p.status==='free'&&(current.p.cable||current.p.switchPortId||current.p.service))current.p.status='used';}));
    }
    const visibleService=service=>view.filter==='all'||view.filter===service;
    let labelFrame=0;
    function scheduleLabels(){cancelAnimationFrame(labelFrame);labelFrame=requestAnimationFrame(arrangeLabels);}
    function arrangeLabels(){
      const viewport=root.querySelector('.map-viewport');if(!viewport)return;
      let leaders=viewport.querySelector('.map-label-leaders');
      if(!leaders){leaders=document.createElementNS('http://www.w3.org/2000/svg','svg');leaders.classList.add('map-label-leaders');leaders.setAttribute('aria-hidden','true');viewport.append(leaders);}
      leaders.replaceChildren();if(!view.labels)return;
      const origin=viewport.getBoundingClientRect(),items=[],obstacles=[];
      for(const marker of root.querySelectorAll('.map-marker')){
        const label=marker.querySelector('.map-marker-label'),rect=marker.getBoundingClientRect();
        label.style.visibility='';label.removeAttribute('data-dir');label.style.transform='none';
        const x=rect.left-origin.left+rect.width/2,y=rect.top-origin.top+rect.height/2;
        if(x<0||y<0||x>origin.width||y>origin.height){label.style.visibility='hidden';continue;}
        const size=label.getBoundingClientRect();obstacles.push({x:x-rect.width/2-2,y:y-rect.height/2-2,width:rect.width+4,height:rect.height+4});
        items.push({id:marker.dataset.mapMarker,x,y,width:size.width,height:size.height,radius:rect.width/2+3,priority:marker.classList.contains('selected')?1:0,label,rect,marker});
      }
      for(const el of root.querySelectorAll('.map-anchor,.map-topbar,.map-filters,.map-side-panels>aside,.map-bottom-toolbar,.map-view-tools,.map-more-menu')){
        if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;const r=el.getBoundingClientRect();obstacles.push({x:r.left-origin.left,y:r.top-origin.top,width:r.width,height:r.height});
      }
      const boxes=RackMapLabels.layout(items,{x:5,y:5,width:Math.max(0,origin.width-10),height:Math.max(0,origin.height-10)},obstacles,3);
      const maskId='label-lines-'+crypto.randomUUID();
      leaders.innerHTML=`<defs><mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${origin.width}" height="${origin.height}"><rect width="${origin.width}" height="${origin.height}" fill="white" stroke="none"/>${[...obstacles,...[...boxes.values()].filter(Boolean)].map(box=>`<rect x="${box.x-1}" y="${box.y-1}" width="${box.width+2}" height="${box.height+2}" fill="black" stroke="none"/>`).join('')}</mask></defs>`;
      for(const item of items){
        const box=boxes.get(item.id);if(!box){item.label.style.visibility='hidden';continue;}
        const scale=item.rect.width/item.marker.offsetWidth;
        item.label.style.left=((box.x-(item.rect.left-origin.left))/scale-item.marker.clientLeft)+'px';
        item.label.style.top=((box.y-(item.rect.top-origin.top))/scale-item.marker.clientTop)+'px';
        const end=RackMapLabels.connector(item,box),length=Math.hypot(end.x-item.x,end.y-item.y);
        if(length>item.radius+2){const line=document.createElementNS(leaders.namespaceURI,'line'),ratio=item.radius/length;for(const [key,value] of Object.entries({x1:item.x+(end.x-item.x)*ratio,y1:item.y+(end.y-item.y)*ratio,x2:end.x,y2:end.y}))line.setAttribute(key,value);line.setAttribute('mask',`url(#${maskId})`);leaders.append(line);}
      }
    }
    function draw(){
      if(!plan)return;const placed=new Map(mapData.markers.map(m=>[m.portId,m]));
      const visible=mapData.markers.filter(m=>visibleService(m.row.service));
      root.querySelector('.map-markers').innerHTML=`<svg class="map-leaders" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${visible.filter(m=>m.anchorVisible).map(m=>{const p=D.mapMarkerLayout(m);return `<line data-map-line="${esc(m.id)}" x1="${p.x*100}" y1="${p.y*100}" x2="${p.iconX*100}" y2="${p.iconY*100}" stroke="${D.serviceColor(state,m.row.service)}" vector-effect="non-scaling-stroke"/>`;}).join('')}</svg>`+visible.map(m=>{const p=D.mapMarkerLayout(m),selected=m.portId===view.portId,color=D.serviceColor(state,m.row.service);return `${m.anchorVisible?`<button type="button" class="map-anchor ${selected?'selected':''}" data-map-anchor="${esc(m.id)}" style="left:${p.x*100}%;top:${p.y*100}%;--marker-color:${color}" title="${esc(tr('Ճշգրիտ դիրք')+' · '+name(m.row))}" aria-label="${esc(tr('Ճշգրիտ դիրք')+' · '+name(m.row))}" tabindex="${selected?'0':'-1'}"></button>`:''}<button type="button" class="map-marker ${selected?'selected':''} ${m.row.status==='free'?'inactive':''}" data-map-marker="${esc(m.id)}" style="left:${p.iconX*100}%;top:${p.iconY*100}%;--marker-color:${color}" title="${esc(label(m.row))}" aria-label="${esc(m.number+' · '+label(m.row))}">${icon(m.row.service)}<span class="map-marker-number">${m.number}</span><span class="map-marker-label" ${view.labels?'':'hidden'}>${esc(name(m.row))}</span></button>`;}).join('');
      const selected=byId.get(view.portId);root.querySelector('[data-map-hint]').textContent=view.placing&&selected?tr('Սեղմեք հատակագծի վրա՝ սարքը տեղադրելու համար։'):tr('Անիվ՝ խոշորացում · Space + քաշել՝ տեղաշարժում');
      const search=view.query.trim().toLocaleLowerCase(),matches=r=>visibleService(r.service)&&(!search||[name(r),D.serviceLabel(state,r.service,tr),r.floor,r.rack,r.device,r.port,r.cable,r.room].join(' ').toLocaleLowerCase().includes(search));
      const groups=new Map();for(const row of mapData.devices.filter(r=>matches(r)&&!placed.has(r.p.id))){if(!groups.has(row.service))groups.set(row.service,[]);groups.get(row.service).push(row);}
      const portList=root.querySelector('.map-port-list');
      for(const group of portList.querySelectorAll('.map-device-group')){if(group.open)collapsedDeviceGroups.delete(group.dataset.service);else collapsedDeviceGroups.add(group.dataset.service);}
      for(const card of portList.querySelectorAll('.map-port-card')){if(card.open)expandedDeviceCards.add(card.dataset.deviceCard);else expandedDeviceCards.delete(card.dataset.deviceCard);}
      portList.innerHTML=[...groups].map(([service,items])=>`<details class="map-device-group" data-service="${esc(service)}" ${collapsedDeviceGroups.has(service)?'':'open'}><summary>${icon(service)}${esc(D.serviceLabel(state,service,tr))}<span>${items.length}</span></summary><div class="map-device-items">${items.map(r=>`<details class="map-port-card ${r.p.id===view.portId?'selected':''}" data-device-card="${esc(r.p.id)}" ${expandedDeviceCards.has(r.p.id)?'open':''}><summary><span class="map-card-icon" style="color:${D.serviceColor(state,r.service)}">${icon(r.service)}</span><span><b>${esc(name(r))}</b><small>${esc(D.serviceLabel(state,r.service,tr)+' · '+r.port)}</small></span><span class="map-card-chevron" aria-hidden="true"></span></summary><div class="map-port-card-details"><span><small>${esc([r.cable,r.destination||r.floor].filter(Boolean).join(' · ')||connectionLabel(r))}</small><small>${esc(connectionLabel(r))}</small></span><button type="button" class="map-card-add" data-map-port="${esc(r.p.id)}" title="${esc(tr('Ավելացնել սարք'))}" aria-label="${esc(tr('Ավելացնել սարք')+' · '+name(r))}">${svg('plus')}</button></div></details>`).join('')}</div></details>`).join('')||`<p class="hint map-list-empty">${esc(tr(mapData.devices.length?'Բոլոր համապատասխան սարքերն արդեն տեղադրված են կամ չեն համապատասխանում որոնմանը։':'Զբաղված միացումներ չկան։ Սարքի տեսակը նշեք պորտի նշանակության դաշտում։'))}</p>`;
      root.querySelector('.map-viewport').dataset.tool=view.placing?'place':view.tool;drawInspector();
    }

    async function upload(){
      modal(tr('Բեռնել հատակագիծ'),`<div class="form-grid">${input('planName',tr('Անվանում'),'','text','required maxlength="200"')}${select('planFloor',tr('Հարկ'),[['',tr('Չնշել')],...getState().floors.map(f=>[f.id,f.name])],'')}${input('pdfPage',tr('PDF էջ'),1,'number','required min="1" max="10000"')}<label class="field">${esc(tr('Հատակագծի ֆայլ'))}<input name="planFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required></label></div><p class="hint">${esc(tr('PNG, JPEG, WebP կամ PDF։ Յուրաքանչյուր PDF էջը բեռնեք որպես առանձին հատակագիծ։'))}</p>`,async fd=>{
        const file=fd.get('planFile'),image=await readPlan(file,+fd.get('pdfPage'),tr),id=crypto.randomUUID();
        change(s=>{s.floorPlans||=[];s.floorPlans.push({id,name:String(fd.get('planName')).trim(),floorId:String(fd.get('planFloor')),...image,markers:[]});if(new Blob([JSON.stringify(s)]).size>h.maxBytes-16384)throw new Error(tr('Հատակագիծը չի տեղավորվում բազայում։ Փոքրացրեք ֆայլը։'));view.planId=id;view.zoom=1;});
      });
    }
    async function manageShares(){
      if(!h.canShare)throw new Error(tr('Հղումով կիսվելու համար բացեք նախագիծը կայքի cloud-ից'));
      const links=await h.api('/api/shares');
      modal(tr('Իմ հղումները'),`<p class="hint">${esc(tr('Հղումն ունեցողը կարող է դիտել և ներբեռնել միայն ընտրված PDF պատճենը։ Բազան խմբագրել հնարավոր չէ։ Հետագա փոփոխությունները չեն փոխում այս պատճենը։'))}</p><div class="map-share-list">${links.length?links.map(link=>`<section class="map-share-item"><strong>${esc(link.title)}</strong><small>${esc(tr('Գործում է մինչև'))}: ${esc(new Date(link.expiresAt).toLocaleDateString())}</small><input readonly aria-label="${esc(tr('Դիտման հղում'))}" value="${esc(new URL('/share.html#'+link.token,location.origin).href)}"><div class="actions"><button type="button" class="button" data-share-copy>${esc(tr('Պատճենել հղումը'))}</button><a class="button" href="/share.html#${esc(link.token)}" target="_blank" rel="noopener noreferrer">${esc(tr('Բացել'))}</a><button type="button" class="button danger" data-share-revoke="${esc(link.token)}">${esc(tr('Անջատել հղումը'))}</button></div></section>`).join(''):`<p>${esc(tr('Ակտիվ հղումներ չկան'))}</p>`}</div>`,null);
      document.querySelector('.map-share-list').addEventListener('click',async e=>{
        const copy=e.target.closest('[data-share-copy]'),revoke=e.target.closest('[data-share-revoke]');
        if(copy){const field=copy.closest('.map-share-item').querySelector('input');try{await navigator.clipboard.writeText(field.value);toast(tr('Հղումը պատճենված է'));}catch{field.focus();field.select();}return;}
        if(revoke){revoke.disabled=true;try{await h.api('/api/shares/revoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:revoke.dataset.shareRevoke})});await manageShares();}catch(err){toast(err.message);revoke.disabled=false;}}
      });
    }
    function exportCurrent(kind,sharing=false){
      if(sharing&&!h.canShare)throw new Error(tr('Հղումով կիսվելու համար բացեք նախագիծը կայքի cloud-ից'));
      const current=getState(),defaultFloor=plan?.floorId||'',language=globalThis.RackI18n?.language||'hy';
      // Build preview summary HTML of what will be included
      function buildPreview(floorId,deviceType,deviceId,planId,outputKind){
        const snap=getState();
        const sel=RackHandover.select(snap,{floorId,deviceType,deviceId,planId});
        const planCount=sel.plans.length,devCount=sel.devices.length;
        if((outputKind==='maps'&&!planCount)||(outputKind==='devices'&&!devCount)||(outputKind==='all'&&!planCount&&!devCount))return `<p class="hint map-pdf-empty">${esc(tr('Ընտրված պայմաններով տվյալներ չկան'))}</p>`;
        let html='<div class="map-pdf-preview">';
        if(outputKind!=='devices'&&planCount){
          const totalMarkers=sel.plans.reduce((s,p)=>s+p.selectedMarkers.length,0);
          html+=`<div class="map-pdf-section"><strong>${esc(tr('Քարտեզ'))}</strong><span>${planCount} ${esc(tr('հատակ.'))} · ${totalMarkers} ${esc(tr('սարք'))}</span></div>`;
          for(const p of sel.plans){
            const groups=new Map();for(const m of p.selectedMarkers){const k=D.serviceLabel(snap,m.row.service,tr)||tr('Չնշված');groups.set(k,(groups.get(k)||0)+1);}
            html+=`<div class="map-pdf-plan"><em>${esc(p.name)}</em><span>${[...groups.entries()].map(([k,n])=>esc(k)+': '+n).join(' · ')||esc(tr('Դատարկ'))}</span></div>`;
          }
        }
        if(outputKind!=='maps'&&devCount){
          html+=`<div class="map-pdf-section"><strong>${esc(tr('Սարքերի սխեմաներ'))}</strong><span>${devCount} ${esc(tr('սարք'))}</span></div>`;
        }
        html+='</div>';
        return html;
      }
      modal(tr(sharing?'Կիսվել հղումով':'PDF արտահանում'),`<div class="form-grid">${select('pdfLanguage',tr('PDF լեզու'),[['hy','Հայերեն'],['en','English'],['ru','Русский']],language)}${select('pdfKind',tr('Բովանդակություն'),[['maps',tr('Քարտեզ')],['devices',tr('Սարքերի սխեմաներ')],['all',tr('Քարտեզ և սարքերի սխեմաներ')]],kind)}${select('pdfFloor',tr('Հարկ'),[['',tr('Բոլոր հարկերը')],...current.floors.map(f=>[f.id,f.name])],defaultFloor)}${select('pdfType',tr('Սարքի տեսակ'),[['all',tr('Բոլոր սարքերը')],['switch',tr('Միայն սվիչներ')],['panel',tr('Միայն փաչ պանելներ')],['router',tr('Միայն ռաուտերներ')]],'all')}${select('pdfDevice',tr('Սարք'),[],'')}${select('pdfPlan',tr('Հատակագիծ'),[],'')}${!sharing?`<div class="field full"><label for="pdfImageOpacity">${esc(tr('Հատ. ֆոնի մաղձոտ.'))}</label><input id="pdfImageOpacity" name="pdfImageOpacity" type="range" min="0" max="90" step="10" value="${view.imageOpacity}" style="width:100%;accent-color:#137f79"></div>`:''}${sharing?select('shareDays',tr('Հղման ժամկետ'),[[7,tr('7 օր')],[30,tr('30 օր')],[90,tr('90 օր')]],30):''}</div>${sharing?`<p class="hint">${esc(tr('Հղումն ունեցողը կարող է դիտել և ներբեռնել միայն ընտրված PDF պատճենը։ Բազան խմբագրել հնարավոր չէ։ Հետագա փոփոխությունները չեն փոխում այս պատճենը։'))}</p>`:''}<p class="hint">${esc(tr('Արտահանումը ներառում է միայն ընտրված հարկը և սարքերը։'))}</p><div data-pdf-preview>${buildPreview(defaultFloor,'all','','',kind)}</div>`,async fd=>{
        const outputKind=String(fd.get('pdfKind')),floorId=String(fd.get('pdfFloor')),deviceType=String(fd.get('pdfType')),deviceId=String(fd.get('pdfDevice')),planId=outputKind==='devices'?'':String(fd.get('pdfPlan')),snapshot=structuredClone(getState());
        const selection=RackHandover.select(snapshot,{floorId,deviceType,deviceId,planId});
        if(outputKind==='maps'?!selection.plans.length:outputKind==='devices'?!selection.devices.length:!selection.plans.length&&!selection.devices.length)throw new Error(tr('Ընտրված պայմաններով տվյալներ չկան'));
        if(sharing){
          if(!await save())throw new Error(tr('Նախ պահպանեք փոփոխությունները'));
          await h.api('/api/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:outputKind,floorId,deviceType,deviceId,planId,language:String(fd.get('pdfLanguage')),days:Number(fd.get('shareDays')),revision:h.getRevision()})});
          setTimeout(()=>manageShares().catch(err=>toast(err.message)),0);return;
        }
        const imgOpacity=Math.min(90,Math.max(0,Number(fd.get('pdfImageOpacity'))||0));
        const outputTr=RackI18n.forLanguage(String(fd.get('pdfLanguage')));
        const blob=await exportPdf(snapshot,outputKind,planId,outputTr,{floorId,deviceType,deviceId,imageOpacity:imgOpacity});
        download(blob,outputKind==='maps'?'MyPatch-map.pdf':'MyPatch-devices.pdf');toast(tr('Հաշվետվությունը պատրաստ է'));
      });
      const form=document.querySelector('#modalForm');
      const update=(initial=false)=>{
        const floorId=form.elements.pdfFloor.value,type=form.elements.pdfType.value;
        const option=(value,name)=>`<option value="${esc(value)}">${esc(name)}</option>`;
        const selectedDevice=form.elements.pdfDevice.value;
        const devices=D.devices(current).filter(x=>(!floorId||x.f.id===floorId)&&(type==='all'||x.d.type===type));
        form.elements.pdfDevice.innerHTML=option('',tr('Բոլոր սարքերը'))+devices.map(x=>option(x.d.id,x.f.name+' / '+x.r.name+' / '+x.d.name)).join('');
        if(devices.some(x=>x.d.id===selectedDevice))form.elements.pdfDevice.value=selectedDevice;
        const selectedPlan=initial&&kind==='maps'?view.planId:form.elements.pdfPlan.value;
        const availablePlans=(current.floorPlans||[]).filter(p=>!floorId||p.floorId===floorId);
        form.elements.pdfPlan.innerHTML=option('',tr('Բոլոր հատակագծերը'))+availablePlans.map(p=>option(p.id,p.name)).join('');
        if(availablePlans.some(p=>p.id===selectedPlan))form.elements.pdfPlan.value=selectedPlan;
        form.elements.pdfPlan.closest('.field').hidden=form.elements.pdfKind.value==='devices';
      };
      function refreshPreview(){
        const previewEl=document.querySelector('[data-pdf-preview]');if(!previewEl)return;
        previewEl.innerHTML=buildPreview(form.elements.pdfFloor.value,form.elements.pdfType.value,form.elements.pdfDevice.value,form.elements.pdfKind.value==='devices'?'':form.elements.pdfPlan.value,form.elements.pdfKind.value);
      }
      update(true);form.elements.pdfFloor.onchange=()=>{form.elements.pdfDevice.value='';form.elements.pdfPlan.value='';update();refreshPreview();};form.elements.pdfType.onchange=()=>{form.elements.pdfDevice.value='';update();refreshPreview();};form.elements.pdfKind.onchange=()=>{update();refreshPreview();};form.elements.pdfDevice?.addEventListener('change',refreshPreview);form.elements.pdfPlan?.addEventListener('change',refreshPreview);
      form.querySelector('button[type="submit"]').textContent=tr(sharing?'Ստեղծել հղումը':'Ներբեռնել PDF');
    }
    function place(x,y){if(!view.portId||h.readOnly)return;view.placing=false;change(s=>{const target=findPlan(s);if(!target)return;const data=D.mapDevices(s,target),existing=data.markers.find(m=>m.portId===view.portId);if(!existing&&!data.devices.some(r=>r.p.id===view.portId))return;const position={x,y,iconX:x,iconY:y},marker=existing&&target.markers.find(m=>m.id===existing.id);if(marker)Object.assign(marker,position);else target.markers.push({id:crypto.randomUUID(),portId:view.portId,...position});});}
    function moveMarker(id,x,y,anchor=false){if(h.readOnly)return;change(s=>{const marker=findPlan(s)?.markers.find(m=>m.id===id);if(!marker)return;const layout=D.mapMarkerLayout(marker);Object.assign(marker,layout,anchor?{x,y}:{iconX:x,iconY:y});});}
    function removeMarker(id){change(s=>{const p=findPlan(s);if(!p)return;const data=D.mapDevices(s,p),marker=data.markers.find(m=>m.id===id);if(!marker)return;p.markers=p.markers.filter(m=>data.canonical(m.portId)!==marker.portId);view.portId='';view.placing=false;});toast(tr('Նշանը հեռացվեց'));}
    const viewport=root.querySelector('.map-viewport'),canvas=root.querySelector('.map-canvas');
    let camera=view.camera?.planId===plan?.id?view.camera:null,pan=null,pinch=null,space=false;
    const pointers=new Map();
    function paintCamera(){if(!camera||!canvas)return;canvas.style.width=plan.width*camera.scale+'px';canvas.style.height=plan.height*camera.scale+'px';canvas.style.transform=`translate(${camera.x}px,${camera.y}px)`;root.querySelector('.map-markers')?.style.setProperty('--map-marker-scale',String(1+view.markerSize/100));view.camera=camera;scheduleLabels();root.querySelector('[data-map-zoom]').textContent=Math.round(camera.scale*100)+'%';}
    function fit(){if(!viewport)return;const w=viewport.clientWidth,h=viewport.clientHeight,right=view.devicesOpen&&w>800?340:0,pad=w<600?28:130;const scale=Math.max(.27,Math.min((w-right-pad)/plan.width,(h-200)/plan.height,2));camera={planId:plan.id,scale,x:(w-right-plan.width*scale)/2,y:100+(h-200-plan.height*scale)/2,w,h};paintCamera();}
    function zoom(factor,point){if(!camera)return;point||={x:viewport.clientWidth/2,y:viewport.clientHeight/2};const next=Math.max(.27,Math.min(6,camera.scale*factor)),ratio=next/camera.scale;camera.x=point.x-(point.x-camera.x)*ratio;camera.y=point.y-(point.y-camera.y)*ratio;camera.scale=next;paintCamera();}
    function setTool(tool){view.tool=tool;view.placing=false;root.querySelectorAll('[data-map-action="select"],[data-map-action="hand"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mapAction===tool)));draw();}
    function deselect(){view.portId='';view.panelPortId='';view.placing=false;view.anchorActive=false;draw();}
    const coords=e=>{const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return {x:0,y:0};return {x:Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width)),y:Math.min(1,Math.max(0,(e.clientY-rect.top)/rect.height))};};
    async function click(e){
      if(performance.now()<(view.ignoreClickUntil||0)){return;}
      const port=e.target.closest('[data-map-port]'),panelPort=e.target.closest('[data-map-panel-port]'),remove=e.target.closest('[data-map-remove]'),marker=e.target.closest('[data-map-marker],[data-map-anchor]'),control=e.target.closest('[data-map-action]'),filter=e.target.closest('[data-map-filter]');
      if(panelPort){view.panelPortId=panelPort.dataset.mapPanelPort;drawInspector();return;}
      if(port){if(h.readOnly)return;setTool('select');view.portId=port.dataset.mapPort;view.panelPortId='';view.placing=true;draw();viewport?.focus({preventScroll:true});return;}
      if(remove){e.stopPropagation();removeMarker(remove.dataset.mapRemove);return;}
      if(filter){view.filter=filter.dataset.mapFilter;if(byId.has(view.portId)&&!visibleService(byId.get(view.portId).service)){view.portId='';view.placing=false;}root.querySelectorAll('[data-map-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===filter)));draw();return;}
      if(marker){view.portId=mapData.markers.find(m=>m.id===(marker.dataset.mapMarker||marker.dataset.mapAnchor))?.portId||'';view.panelPortId='';view.anchorActive=!!marker.dataset.mapAnchor;view.placing=false;draw();return;}
      if(control&&!control.disabled){const action=control.dataset.mapAction;root.querySelector('.map-more')?.removeAttribute('open');
        if(action==='devices-toggle'){showDevices(!view.devicesOpen);return;}
        if(action==='select'||action==='hand'){setTool(action);return;}
        if(action==='deselect'){deselect();return;}
        if(action==='panel-open'){view.panelPortId=view.portId;drawInspector();return;}
        if(action==='panel-close'){view.panelPortId='';drawInspector();return;}
        if(action==='panel-edit'){editPanelPort();return;}
        if(action==='labels'){view.labels=!view.labels;control.setAttribute('aria-pressed',String(view.labels));draw();return;}
        if(action==='anchor-toggle'){const selected=mapData.markers.find(m=>m.portId===view.portId);if(selected)change(s=>{const target=findPlan(s)?.markers.find(m=>m.id===selected.id);if(target)target.anchorVisible=!target.anchorVisible;});return;}
        if(action==='fit'){fit();return;}
        if(action==='fullscreen'){if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen();return;}
        if(action==='upload')return upload();
        if(action==='share')return exportCurrent(plans.length?'maps':'devices',true);
        if(action==='shares')return manageShares();
        if(action==='map-pdf'||action==='panel-pdf')return exportCurrent(action==='map-pdf'?'maps':'devices');
        if(action.startsWith('zoom-')){if(!camera)fit();if(camera)zoom(action==='zoom-reset'?1/camera.scale:action==='zoom-in'?1.25:.8);return;}
        if(action==='edit')return modal(tr('Խմբագրել հատակագիծը'),`<div class="form-grid">${input('planName',tr('Անվանում'),plan.name,'text','required maxlength="200"')}${select('planFloor',tr('Հարկ'),[['',tr('Չնշել')],...getState().floors.map(f=>[f.id,f.name])],plan.floorId)}</div>`,fd=>change(s=>{const p=findPlan(s);if(p)Object.assign(p,{name:String(fd.get('planName')).trim(),floorId:String(fd.get('planFloor'))});}));
        if(action==='delete')return h.confirm(tr('Ջնջել հատակագիծը'),tr('Կհեռացվեն միայն հատակագիծը և նշանները։ Պորտերը կմնան բազայում։'),()=>change(s=>{s.floorPlans=s.floorPlans.filter(p=>p.id!==view.planId);}));
      }
      if(e.target.closest('.map-canvas')&&view.placing){const {x,y}=coords(e);place(x,y);}else if(e.target===viewport||e.target===canvas||e.target===canvas?.querySelector('img'))deselect();
    }
    root.addEventListener('click',e=>{click(e).catch(err=>toast(err.message));},{signal:abort.signal});
    root.addEventListener('pointerdown',e=>{const more=root.querySelector('.map-more');if(more?.open&&!more.contains(e.target))more.open=false;},{capture:true,signal:abort.signal});
    root.addEventListener('toggle',e=>{if(e.target.matches('.map-more'))scheduleLabels();},{capture:true,signal:abort.signal});
    root.addEventListener('input',e=>{if(e.target.matches('[data-map-marker-size]')){view.markerSize=Number(e.target.value);root.querySelector('[data-marker-size-value]').textContent='+'+view.markerSize+'%';root.querySelector('.map-markers')?.style.setProperty('--map-marker-scale',String(1+view.markerSize/100));scheduleLabels();return;}if(e.target.matches('[data-map-image-opacity]')){view.imageOpacity=Number(e.target.value);root.querySelector('[data-image-opacity-value]').textContent=view.imageOpacity+'%';root.querySelector('.map-canvas>img')?.style.setProperty('opacity',String(1-view.imageOpacity/100));return;}if(e.target.matches('[data-map-search]')){view.query=e.target.value;draw();}},{signal:abort.signal});
    const changePlan=e=>{if(e.target.matches('[data-map-plan],[data-map-floor]')){const selected=e.target.matches('[data-map-plan]')?e.target.value:plans.find(p=>p.floorId===e.target.value)?.id;if(!selected)return;view.planId=selected;view.portId='';view.panelPortId='';view.placing=false;view.camera=null;h.redraw();}};
    root.addEventListener('change',changePlan,{signal:abort.signal});
    headerControls?.addEventListener('change',e=>{if(!root.contains(headerControls))changePlan(e);},{signal:abort.signal});
    if(viewport){
      viewport.addEventListener('wheel',e=>{e.preventDefault();const rect=viewport.getBoundingClientRect();zoom(Math.exp(-Math.max(-200,Math.min(200,e.deltaY))*.002),{x:e.clientX-rect.left,y:e.clientY-rect.top});},{passive:false,signal:abort.signal});
      const pair=()=>{const [a,b]=[...pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};};
      viewport.addEventListener('pointerdown',e=>{
        if(e.button!==0&&e.button!==1)return;viewport.focus({preventScroll:true});
        pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});try{viewport.setPointerCapture(e.pointerId);}catch{}
        if(pointers.size===2){pinch=pair();pan=null;dragging=null;draw();return;}
        const el=e.target.closest('[data-map-marker],[data-map-anchor]');
        if(el&&view.tool==='select'&&!space&&e.button===0){const id=el.dataset.mapMarker||el.dataset.mapAnchor,marker=mapData.markers.find(m=>m.id===id);view.portId=marker.portId;view.panelPortId='';view.anchorActive=!!el.dataset.mapAnchor;view.placing=false;dragging={el,id,anchor:view.anchorActive,startX:e.clientX,startY:e.clientY,moved:false};drawInspector();}
        else if(!view.placing||space||view.tool==='hand'||e.button===1){if(!camera)fit();pan={x:e.clientX,y:e.clientY,cx:camera?camera.x:0,cy:camera?camera.y:0,moved:false};}
        e.preventDefault();
      },{signal:abort.signal});
      viewport.addEventListener('pointermove',e=>{
        if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(pointers.size>=2&&pinch){const next=pair(),rect=viewport.getBoundingClientRect();zoom(next.d/pinch.d,{x:pinch.x-rect.left,y:pinch.y-rect.top});if(camera){camera.x+=next.x-pinch.x;camera.y+=next.y-pinch.y;paintCamera();}pinch=next;return;}
        if(dragging&&!h.readOnly){dragging.moved||=Math.hypot(e.clientX-dragging.startX,e.clientY-dragging.startY)>4;if(dragging.moved){const {x,y}=coords(e);dragging.el.style.left=x*100+'%';dragging.el.style.top=y*100+'%';const line=root.querySelector(`[data-map-line="${CSS.escape(dragging.id)}"]`),end=dragging.anchor?'1':'2';line?.setAttribute('x'+end,x*100);line?.setAttribute('y'+end,y*100);}}
        else if(pan&&camera){pan.moved||=Math.hypot(e.clientX-pan.x,e.clientY-pan.y)>4;camera.x=pan.cx+e.clientX-pan.x;camera.y=pan.cy+e.clientY-pan.y;viewport.classList.toggle('panning',pan.moved);paintCamera();}
      },{signal:abort.signal});
      viewport.addEventListener('pointerup',e=>{
        pointers.delete(e.pointerId);try{if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);}catch{}
        if(pinch){if(pointers.size===0)pinch=null;view.ignoreClickUntil=performance.now()+120;pan=null;dragging=null;return;}
        if(view.placing&&!dragging&&!pan){const rect=canvas.getBoundingClientRect();if(e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom){view.ignoreClickUntil=performance.now()+120;const {x,y}=coords(e);try{place(x,y);}catch(err){toast(err.message);}}return;}
        if(dragging){const {moved,id,anchor}=dragging;dragging=null;view.ignoreClickUntil=performance.now()+120;if(moved){const {x,y}=coords(e);try{moveMarker(id,x,y,anchor);}catch(err){toast(err.message);draw();}}else draw();}
        if(pan){if(pan.moved)view.ignoreClickUntil=performance.now()+120;pan=null;viewport.classList.remove('panning');}
      },{signal:abort.signal});
      viewport.addEventListener('pointercancel',()=>{pointers.clear();dragging=null;pan=null;pinch=null;viewport.classList.remove('panning');draw();},{signal:abort.signal});
    }
    root.addEventListener('keydown',e=>{
      if(e.target.closest('input,textarea,select,[contenteditable=true]'))return;
      if(e.code==='Space'&&!e.target.closest('button,summary')){e.preventDefault();space=true;viewport?.classList.add('hand-key');return;}
      if(e.key==='Escape'){const more=root.querySelector('.map-more');if(more?.open){more.open=false;return;}if(view.panelPortId){view.panelPortId='';drawInspector();return;}deselect();showDevices(false);return;}
      if((e.ctrlKey||e.metaKey)&&!e.altKey){
        if(e.key.toLowerCase()==='z'&&!e.shiftKey){e.preventDefault();undo();return;}
        if(e.key.toLowerCase()==='z'&&e.shiftKey){e.preventDefault();redo();return;}
        if(e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
        return;
      }
      if(e.altKey)return;
      if(e.key.toLowerCase()==='h'){setTool('hand');return;}if(e.key.toLowerCase()==='v'){setTool('select');return;}
      if(e.key==='+'||e.key==='='){zoom(1.25);return;}if(e.key==='-'){zoom(.8);return;}if(e.key==='0'){fit();return;}
      if(h.readOnly)return;const selected=mapData.markers.find(m=>m.portId===view.portId);if(!selected)return;
      if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeMarker(selected.id);return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?.02:.005;
      const layout=D.mapMarkerLayout(selected),anchor=e.target.matches('[data-map-anchor]')||view.anchorActive,x=anchor?layout.x:layout.iconX,y=anchor?layout.y:layout.iconY;
      try{moveMarker(selected.id,Math.min(1,Math.max(0,x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0))),Math.min(1,Math.max(0,y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0))),anchor);root.querySelector('.map-viewport')?.focus({preventScroll:true});}catch(err){toast(err.message);}
    },{signal:abort.signal});
    window.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;viewport?.classList.remove('hand-key');}},{signal:abort.signal});
    window.addEventListener('blur',()=>{space=false;pointers.clear();pan=null;pinch=null;dragging=null;viewport?.classList.remove('hand-key','panning');draw();},{signal:abort.signal});
    root.addEventListener('contextmenu',e=>{const el=e.target.closest('[data-map-marker]');if(!el||h.readOnly)return;e.preventDefault();const marker=mapData.markers.find(m=>m.id===el.dataset.mapMarker);view.portId=marker.portId;view.placing=false;draw();h.confirm(tr('Հեռացնել նշանը'),tr('Հեռացնե՞լ այս նշանը հատակագծից։'),()=>removeMarker(marker.id));},{signal:abort.signal});
    if(plans.length)showDevices(!!view.devicesOpen);
    draw();
    const resize=viewport?new ResizeObserver(()=>{if(!camera)fit();else{camera.x+=(viewport.clientWidth-camera.w)/2;camera.y+=(viewport.clientHeight-camera.h)/2;camera.w=viewport.clientWidth;camera.h=viewport.clientHeight;paintCamera();}}):null;
    document.fonts?.ready.then(()=>{if(!abort.signal.aborted)scheduleLabels();});
    if(viewport){if(!camera)fit();else paintCamera();resize.observe(viewport);}
    return {busy:()=>pointers.size>0,destroy(){cancelAnimationFrame(labelFrame);resize?.disconnect();abort.abort();headerControls?.remove();document.body.classList.remove('map-view');}};
  }
  return {mount,exportPdf};
})();
