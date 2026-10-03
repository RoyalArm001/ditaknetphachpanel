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
    const key=h.projectKey;let view=ui.get(key);if(!view){view={planId:'',portId:'',query:'',zoom:1};ui.set(key,view);}
    const state=getState(),plans=state.floorPlans||[];let plan=plans.find(p=>p.id===view.planId)||plans[0];view.planId=plan?.id||'';
    const rows=D.rows(state),byId=new Map(rows.map(r=>[r.p.id,r]));const mapData=D.mapDevices(state,plan);view.portId=mapData.canonical(view.portId);if(!mapData.devices.some(r=>r.p.id===view.portId)&&!mapData.markers.some(m=>m.portId===view.portId))view.portId='';let dragging=null,suppressClick=false;
    const findPlan=s=>(s.floorPlans||[]).find(p=>p.id===view.planId);
    const connectionLabel=r=>`${r.rack} / ${r.device} / ${r.port}`;
    const label=r=>r?D.serviceLabel(state,r.service,tr)+' · '+connectionLabel(r):tr('Չի գտնվել');
    const icon=service=>`<svg class="map-service-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${D.serviceIcon(service)}"/></svg>`;
    function change(fn){if(h.readOnly)throw new Error(tr('Միայն դիտում'));commit(fn);}
    function button(text,action,extra=''){return `<button type="button" class="button" data-map-action="${action}" ${extra}>${esc(tr(text))}</button>`;}
    root.innerHTML=`<div class="page-head"><div><div class="eyebrow">MY PATCH / ${esc(tr('Քարտեզ'))}</div><h1>${esc(tr('Քարտեզ'))}</h1><p>${esc(tr('Ընտրեք միացված սարքը և նշեք նրա տեղը հատակագծում։'))}</p></div><div class="actions">${!h.readOnly?button('Բեռնել հատակագիծ','upload'):''}${button('Քարտեզ PDF','map-pdf',plans.length?'':'disabled')}${button('Սարքերի սխեմաներ PDF','panel-pdf',D.devices(state).length?'':'disabled')}${button('Կիսվել հղումով','share',plans.length||D.devices(state).length?'':'disabled')}${button('Իմ հղումները','shares')}</div></div>
      ${plans.length?`<div class="map-toolbar panel"><label>${esc(tr('Հատակագիծ'))}<select data-map-plan>${plans.map(p=>`<option value="${esc(p.id)}" ${p.id===plan.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label>${esc(tr('Հարկ'))}<select data-map-floor ${h.readOnly?'disabled':''}><option value="">${esc(tr('Բոլոր հարկերը'))}</option>${state.floors.map(f=>`<option value="${esc(f.id)}" ${f.id===plan.floorId?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label><div class="actions">${button('−','zoom-out','aria-label="'+esc(tr('Փոքրացնել'))+'"')}<output data-map-zoom>${Math.round(view.zoom*100)}%</output>${button('+','zoom-in','aria-label="'+esc(tr('Մեծացնել'))+'"')}${button('100%','zoom-reset')}${!h.readOnly?button('Խմբագրել','edit')+button('Ջնջել հատակագիծը','delete'):''}</div></div>
      <div class="map-layout"><section class="map-workspace panel"><p class="hint" data-map-hint></p><div class="map-scroll"><div class="map-canvas" style="width:${view.zoom*100}%"><img width="${plan.width}" height="${plan.height}" src="${plan.image}" alt="${esc(plan.name)}" draggable="false"><div class="map-markers"></div></div></div></section><aside class="panel map-sidebar"><button type="button" class="map-sidebar-toggle" data-map-action="devices-toggle" aria-expanded="${!!view.devicesOpen}" aria-controls="map-device-picker"><svg class="map-service-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg><span>${esc(tr('Միացված սարքեր'))}</span><svg class="map-picker-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div id="map-device-picker" class="map-picker-body" ${view.devicesOpen?'':'hidden'}><label class="field">${esc(tr('Որոնում'))}<input data-map-search value="${esc(view.query)}" placeholder="${esc(tr('Սարքի տեսակ, մալուխ կամ սենյակ'))}"></label><p class="hint">${esc(tr('Սարքերը խմբավորված են ըստ նշանակության։ Ընտրեք սարքը և սեղմեք հատակագծի վրա։'))}</p><div class="map-port-list"></div></div></aside></div>`:
      `<section class="panel empty"><h2>${esc(tr('Հատակագիծ դեռ չկա'))}</h2><p>${esc(tr('PNG, JPEG, WebP կամ PDF։ Յուրաքանչյուր PDF էջը բեռնեք որպես առանձին հատակագիծ։'))}</p>${!h.readOnly?button('Բեռնել հատակագիծ','upload'):''}</section>`}`;
    function showDevices(open){
      view.devicesOpen=open;
      const toggle=root.querySelector('[data-map-action="devices-toggle"]');
      toggle.setAttribute('aria-expanded',String(open));
      root.querySelector('#map-device-picker').hidden=!open;
      if(!open)toggle.focus({preventScroll:true});
    }
    function draw(){
      if(!plan)return;const placed=new Map(mapData.markers.map(m=>[m.portId,m]));
      root.querySelector('.map-markers').innerHTML=mapData.markers.map(m=>`<button type="button" class="map-marker map-device-marker ${m.portId===view.portId?'selected':''} ${m.row.status==='free'?'inactive':''}" data-map-marker="${esc(m.id)}" style="left:${m.x*100}%;top:${m.y*100}%;--marker-color:${D.serviceColor(state,m.row.service)}" title="${esc(label(m.row))}" aria-label="${esc(m.number+' · '+label(m.row))}">${icon(m.row.service)}<span class="map-marker-number">${m.number}</span></button>`).join('');
      const selected=byId.get(view.portId);root.querySelector('[data-map-hint]').textContent=selected?tr('Ընտրված սարք')+': '+label(selected):tr('Ընտրեք սարքը ցանկից');
      const search=view.query.trim().toLocaleLowerCase(),matches=r=>!search||[D.serviceLabel(state,r.service,tr),r.floor,r.rack,r.device,r.port,r.cable,r.room].join(' ').toLocaleLowerCase().includes(search);
      const groups=new Map();for(const row of mapData.devices.filter(matches)){if(!groups.has(row.service))groups.set(row.service,[]);groups.get(row.service).push(row);}
      function card(r,inactive=false){
        const marker=placed.get(r.p.id),name=D.serviceLabel(state,r.service,tr)||tr('Չնշված');
        return `<div class="map-port-row ${r.p.id===view.portId?'selected':''}"><button type="button" data-map-port="${esc(r.p.id)}"><b class="map-device-name">${icon(r.service)}${esc(name)}${marker?' · #'+marker.number:''}</b><small>${esc([r.room,r.cable,r.floor].filter(Boolean).join(' · '))}</small><small>${esc(connectionLabel(r))}</small><span>${esc(inactive?tr('Այլևս զբաղված չէ'):marker?tr('Տեղադրված է'):tr('Չտեղադրված'))}${r.status==='fault'?' · '+esc(D.statusLabel(state,r.status,tr)):''}</span></button>${marker&&!h.readOnly?`<button type="button" class="map-unplace" data-map-remove="${esc(marker.id)}" title="${esc(tr('Հեռացնել նշանը'))}" aria-label="${esc(tr('Հեռացնել նշանը')+' · '+label(r))}">×</button>`:''}</div>`;
      }
      const active=[...groups].map(([service,items])=>`<section class="map-device-group"><h3 style="--service-color:${D.serviceColor(state,service)}">${icon(service)}${esc(D.serviceLabel(state,service,tr))}<span>${items.length}</span></h3>${items.map(r=>card(r)).join('')}</section>`).join('');
      const inactive=mapData.markers.filter(m=>m.row.status==='free'&&matches(m.row));
      root.querySelector('.map-port-list').innerHTML=(active||`<p class="hint">${esc(tr('Զբաղված միացումներ չկան։ Սարքի տեսակը նշեք պորտի նշանակության դաշտում։'))}</p>`)+(inactive.length?`<section class="map-device-group"><h3>${esc(tr('Նախկին նշումներ'))}</h3>${inactive.map(m=>card(m.row,true)).join('')}</section>`:'');
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
      modal(tr(sharing?'Կիսվել հղումով':'PDF արտահանում'),`<div class="form-grid">${select('pdfLanguage',tr('PDF լեզու'),[['hy','Հայերեն'],['en','English'],['ru','Русский']],language)}${select('pdfKind',tr('Բովանդակություն'),[['maps',tr('Քարտեզ')],['devices',tr('Սարքերի սխեմաներ')],['all',tr('Քարտեզ և սարքերի սխեմաներ')]],kind)}${select('pdfFloor',tr('Հարկ'),[['',tr('Բոլոր հարկերը')],...current.floors.map(f=>[f.id,f.name])],defaultFloor)}${select('pdfType',tr('Սարքի տեսակ'),[['all',tr('Բոլոր սարքերը')],['switch',tr('Միայն սվիչներ')],['panel',tr('Միայն փաչ պանելներ')],['router',tr('Միայն ռաուտերներ')]],'all')}${select('pdfDevice',tr('Սարք'),[],'')}${select('pdfPlan',tr('Հատակագիծ'),[],'')}${sharing?select('shareDays',tr('Հղման ժամկետ'),[[7,tr('7 օր')],[30,tr('30 օր')],[90,tr('90 օր')]],30):''}</div>${sharing?`<p class="hint">${esc(tr('Հղումն ունեցողը կարող է դիտել և ներբեռնել միայն ընտրված PDF պատճենը։ Բազան խմբագրել հնարավոր չէ։ Հետագա փոփոխությունները չեն փոխում այս պատճենը։'))}</p>`:''}<p class="hint">${esc(tr('Արտահանումը ներառում է միայն ընտրված հարկը և սարքերը։'))}</p>`,async fd=>{
        const outputKind=String(fd.get('pdfKind')),floorId=String(fd.get('pdfFloor')),deviceType=String(fd.get('pdfType')),deviceId=String(fd.get('pdfDevice')),planId=outputKind==='devices'?'':String(fd.get('pdfPlan')),snapshot=structuredClone(getState());
        const selection=RackHandover.select(snapshot,{floorId,deviceType,deviceId,planId});
        if(outputKind==='maps'?!selection.plans.length:outputKind==='devices'?!selection.devices.length:!selection.plans.length&&!selection.devices.length)throw new Error(tr('Ընտրված պայմաններով տվյալներ չկան'));
        if(sharing){
          if(!await save())throw new Error(tr('Նախ պահպանեք փոփոխությունները'));
          await h.api('/api/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:outputKind,floorId,deviceType,deviceId,planId,language:String(fd.get('pdfLanguage')),days:Number(fd.get('shareDays')),revision:h.getRevision()})});
          setTimeout(()=>manageShares().catch(err=>toast(err.message)),0);return;
        }
        const outputTr=RackI18n.forLanguage(String(fd.get('pdfLanguage')));
        const blob=await exportPdf(snapshot,outputKind,planId,outputTr,{floorId,deviceType,deviceId});
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
      update(true);form.elements.pdfFloor.onchange=()=>{form.elements.pdfDevice.value='';form.elements.pdfPlan.value='';update();};form.elements.pdfType.onchange=()=>{form.elements.pdfDevice.value='';update();};form.elements.pdfKind.onchange=()=>update();
      form.querySelector('button[type="submit"]').textContent=tr(sharing?'Ստեղծել հղումը':'Ներբեռնել PDF');
    }
    function place(x,y){if(!view.portId||h.readOnly)return;change(s=>{const target=findPlan(s);if(!target)return;const data=D.mapDevices(s,target),existing=data.markers.find(m=>m.portId===view.portId);if(!existing&&!data.devices.some(r=>r.p.id===view.portId))return;const marker=existing&&target.markers.find(m=>m.id===existing.id);if(marker)Object.assign(marker,{x,y});else target.markers.push({id:crypto.randomUUID(),portId:view.portId,x,y});});}
    const coords=e=>{const rect=root.querySelector('.map-canvas').getBoundingClientRect();return {x:Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width)),y:Math.min(1,Math.max(0,(e.clientY-rect.top)/rect.height))};};
    async function click(e){
      const port=e.target.closest('[data-map-port]'),remove=e.target.closest('[data-map-remove]'),marker=e.target.closest('[data-map-marker]'),control=e.target.closest('[data-map-action]');
      if(port){view.portId=port.dataset.mapPort;draw();showDevices(false);return;}
      if(remove){change(s=>{const p=findPlan(s);if(!p)return;const data=D.mapDevices(s,p),marker=data.markers.find(m=>m.id===remove.dataset.mapRemove);if(marker)p.markers=p.markers.filter(m=>data.canonical(m.portId)!==marker.portId);});return;}
      if(marker){if(suppressClick){suppressClick=false;return;}view.portId=mapData.markers.find(m=>m.id===marker.dataset.mapMarker)?.portId||'';draw();return;}
      if(control&&!control.disabled){const action=control.dataset.mapAction;
        if(action==='devices-toggle'){showDevices(!view.devicesOpen);return;}
        if(action==='upload')return upload();
        if(action==='share')return exportCurrent(plans.length?'maps':'devices',true);
        if(action==='shares')return manageShares();
        if(action==='map-pdf'||action==='panel-pdf')return exportCurrent(action==='map-pdf'?'maps':'devices');
        if(action.startsWith('zoom-')){view.zoom=action==='zoom-reset'?1:Math.max(.5,Math.min(4,view.zoom+(action==='zoom-in'?.25:-.25)));root.querySelector('.map-canvas').style.width=view.zoom*100+'%';root.querySelector('[data-map-zoom]').textContent=Math.round(view.zoom*100)+'%';return;}
        if(action==='edit')return modal(tr('Խմբագրել հատակագիծը'),`<div class="form-grid">${input('planName',tr('Անվանում'),plan.name,'text','required maxlength="200"')}${select('planFloor',tr('Հարկ'),[['',tr('Չնշել')],...getState().floors.map(f=>[f.id,f.name])],plan.floorId)}</div>`,fd=>change(s=>{const p=findPlan(s);if(p)Object.assign(p,{name:String(fd.get('planName')).trim(),floorId:String(fd.get('planFloor'))});}));
        if(action==='delete')return h.confirm(tr('Ջնջել հատակագիծը'),tr('Կհեռացվեն միայն հատակագիծը և նշանները։ Պորտերը կմնան բազայում։'),()=>change(s=>{s.floorPlans=s.floorPlans.filter(p=>p.id!==view.planId);}));
      }
      if(e.target.closest('.map-canvas')&&!suppressClick){const {x,y}=coords(e);place(x,y);}
      suppressClick=false;
    }
    root.addEventListener('click',e=>{click(e).catch(err=>toast(err.message));},{signal:abort.signal});
    root.addEventListener('input',e=>{if(e.target.matches('[data-map-search]')){view.query=e.target.value;draw();}},{signal:abort.signal});
    root.addEventListener('change',e=>{if(e.target.matches('[data-map-plan]')){view.planId=e.target.value;view.zoom=1;view.portId='';h.redraw();}if(e.target.matches('[data-map-floor]')){try{view.portId='';change(s=>{const p=findPlan(s);if(p)p.floorId=e.target.value;});}catch(err){toast(err.message);}}},{signal:abort.signal});
    root.addEventListener('pointerdown',e=>{const el=e.target.closest('[data-map-marker]');if(!el||h.readOnly||e.button!==0)return;const marker=mapData.markers.find(m=>m.id===el.dataset.mapMarker);view.portId=marker.portId;dragging={el,id:marker.id,startX:e.clientX,startY:e.clientY,moved:false};el.setPointerCapture(e.pointerId);e.preventDefault();},{signal:abort.signal});
    root.addEventListener('pointermove',e=>{if(!dragging)return;const {x,y}=coords(e);dragging.moved||=Math.hypot(e.clientX-dragging.startX,e.clientY-dragging.startY)>4;if(dragging.moved){dragging.el.style.left=x*100+'%';dragging.el.style.top=y*100+'%';}},{signal:abort.signal});
    root.addEventListener('pointerup',e=>{if(!dragging)return;const moved=dragging.moved;dragging=null;if(moved){suppressClick=true;const {x,y}=coords(e);try{place(x,y);}catch(err){toast(err.message);draw();}}else draw();},{signal:abort.signal});
    root.addEventListener('pointercancel',()=>{dragging=null;draw();},{signal:abort.signal});
    root.addEventListener('keydown',e=>{const el=e.target.closest('[data-map-marker]');if(!el||h.readOnly||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const marker=mapData.markers.find(m=>m.id===el.dataset.mapMarker),step=e.shiftKey?.02:.005;view.portId=marker.portId;try{place(Math.min(1,Math.max(0,marker.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0))),Math.min(1,Math.max(0,marker.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0))));root.querySelector(`[data-map-marker="${CSS.escape(marker.id)}"]`)?.focus();}catch(err){toast(err.message);}},{signal:abort.signal});
    draw();
    const scroll=root.querySelector('.map-scroll');
    if(scroll&&view.scroll?.planId===plan.id){scroll.scrollLeft=view.scroll.left;scroll.scrollTop=view.scroll.top;}
    return {destroy(){
      if(scroll)view.scroll={planId:plan.id,left:scroll.scrollLeft,top:scroll.scrollTop};
      abort.abort();
    }};
  }
  return {mount,exportPdf};
})();
