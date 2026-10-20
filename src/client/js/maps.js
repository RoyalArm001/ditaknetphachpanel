'use strict';
globalThis.RackMaps = (() => {
  const D = globalThis.RackDomain, Routing = globalThis.RackMapRouting, ui = new Map(); let pdfLoading;
  // Measure in screen pixels: normalized distances ignore text length, zoom and icon size.
  function resolveLabelDirections(items,bounds,anchors=[]){
    const gap=6,pad=2,placed=new Map(),directions=['down','up','right','left'];
    const area=(a,b)=>a.left>=b.right||a.right<=b.left||a.top>=b.bottom||a.bottom<=b.top?0:(Math.min(a.right,b.right)-Math.max(a.left,b.left))*(Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    const box=(x,y,w,h)=>({left:x-w/2,right:x+w/2,top:y-h/2,bottom:y+h/2});
    const icons=items.map(p=>box(p.x,p.y,p.iconWidth+pad*2,p.iconHeight+pad*2)).concat(anchors);
    const edge={left:0,top:0,right:bounds.width,bottom:bounds.height};
    const ordered=[...items].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    for(let pass=0;pass<2;pass++)for(const p of ordered){
      let best;
      const coincident=ordered.filter(q=>Math.abs(q.x-p.x)<.01&&Math.abs(q.y-p.y)<.01).length;
      // Always start from the natural 9px label; repeated zooms cannot compound its size.
      for(const scale of [1,.9,.8,7/9]){
        const width=p.width*scale,height=p.height*scale;
        const choices=directions.map(dir=>({dir,shift:0}));
        for(let row=1;row<=(coincident>4?Math.ceil(coincident/2):1);row++)for(const dir of ['right','left'])for(const sign of [1,-1])choices.push({dir,shift:sign*row*(height+pad*2)});
        for(const [rank,{dir,shift}] of choices.entries()){
          const x=p.x+(dir==='left'?-(p.iconWidth+width)/2-gap:dir==='right'?(p.iconWidth+width)/2+gap:0);
          const y=p.y+(dir==='up'?-(p.iconHeight+height)/2-gap:dir==='down'?(p.iconHeight+height)/2+gap:0)+shift;
          const rect=box(x,y,width,height),padded=box(x,y,width+pad*2,height+pad*2);
          const overlap=icons.reduce((sum,b)=>sum+area(rect,b),0)+[...placed].reduce((sum,[id,b])=>sum+(id===p.id?0:area(padded,b)),0);
          const outside=Math.max(0,width*height-area(rect,edge));
          const score=Math.round((overlap+outside*2)*1000)/1000+(1-scale)*.05+rank*.001;
          if(!best||score<best.score)best={...rect,dir,score,scale};
        }
        if(best.score<.1)break;
      }
      placed.set(p.id,best);
    }
    if([...placed.values()].some(p=>p.score>=.1)&&globalThis.RackMapLabels){
      const obstacles=items.map(p=>({x:p.x-p.iconWidth/2,y:p.y-p.iconHeight/2,width:p.iconWidth,height:p.iconHeight,cx:p.x,cy:p.y,radius:Math.max(p.iconWidth,p.iconHeight)/2})).concat(anchors.map(a=>({x:a.left,y:a.top,width:a.right-a.left,height:a.bottom-a.top})));
      const fitted=globalThis.RackMapLabels.layout(items.map(p=>({...p,radius:Math.max(p.iconWidth,p.iconHeight)/2+3})),{x:0,y:0,width:bounds.width,height:bounds.height},obstacles,1,80,{minScale:7/9});
      for(const p of items){
        const b=fitted.get(p.id);if(!b)continue;
        const dx=b.x+b.width/2-p.x,dy=b.y+b.height/2-p.y;
        placed.set(p.id,{left:b.x,top:b.y,right:b.x+b.width,bottom:b.y+b.height,scale:b.scale,dir:Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up'});
      }
    }
    return placed;
  }
  async function exportPdf(state, kind, planId, tr, options = {}) {
    if (!globalThis.PDFDocument) { pdfLoading ||= loadScript('/pdfkit.js').catch(e => { pdfLoading = null; throw e; }); await pdfLoading; }
    const response = await fetch('/assets/DejaVuSans.ttf'); if (!response.ok) throw new Error(tr('Չհաջողվեց կատարել գործողությունը'));
    const font = new Uint8Array(await response.arrayBuffer());
    const chunks = await RackHandover.create(PDFDocument, state, { ...options, font, tr, kind, planId });
    return new Blob(chunks, { type: 'application/pdf' });
  }
  async function readPlan(file, pageNumber, tr) {
    if (file.size > 30 * 1024 * 1024) throw new Error(tr('Հատակագծի ֆայլը պետք է լինի մինչև 30 ՄԲ'));
    let canvas = document.createElement('canvas');
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const lib = await import('/pdfjs/pdf.mjs'); lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.mjs';
      const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useWasm: false, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/' });
      let passwordRequired = false; task.onPassword = () => { passwordRequired = true; void task.destroy(); };
      try {
        const doc = await task.promise; if (pageNumber > doc.numPages) throw new Error(tr('PDF-ում այդ էջը չկա'));
        const page = await doc.getPage(pageNumber), base = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: Math.min(2400 / base.width, 2400 / base.height) });
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise;
      } catch (error) { if (passwordRequired) throw new Error(tr('Բեռնեք առանց գաղտնաբառի PDF')); throw error; } finally { await task.destroy(); }
    } else {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error(tr('Ընտրեք PNG, JPEG, WebP կամ PDF'));
      const bitmap = await createImageBitmap(file); try { const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height)); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); } finally { bitmap.close(); }
    }
    let image = canvas.toDataURL('image/jpeg', .88);
    while (image.length > 1800000 && Math.max(canvas.width, canvas.height) > 1000) { const smaller = document.createElement('canvas'); smaller.width = Math.round(canvas.width * .85); smaller.height = Math.round(canvas.height * .85); smaller.getContext('2d').drawImage(canvas, 0, 0, smaller.width, smaller.height); canvas = smaller; image = canvas.toDataURL('image/jpeg', .82); }
    if (image.length > 2500000) throw new Error(tr('Հատակագիծը չափազանց մեծ է'));
    return { image, width: canvas.width, height: canvas.height };
  }
  async function planPageCount(file, tr) {
    if (file.size > 30 * 1024 * 1024) throw new Error(tr('Հատակագծի ֆայլը պետք է լինի մինչև 30 ՄԲ'));
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return 1;
    const lib = await import('/pdfjs/pdf.mjs'); lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.mjs';
    const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useWasm: false });
    let locked = false; task.onPassword = () => { locked = true; void task.destroy(); };
    try { return (await task.promise).numPages; } catch (error) { if (locked) throw new Error(tr('Բեռնեք առանց գաղտնաբառի PDF')); throw error; } finally { await task.destroy(); }
  }
  function mount(root, h) {
    const { tr, esc, commit, getState, modal, input, select, toast, download, save } = h, abort = new AbortController();
    const key = h.projectKey; let view = ui.get(key); if (!view) { view = { planId: '', portId: '', query: '', zoom: 1, imageOpacity: 0 }; ui.set(key, view); }
    const drawingCablesVisible=view.showCables;
    view.showCables = false; try { localStorage.removeItem('rackmap-map-show-cables'); } catch { }
    view.activeTab ||= 'devices'; view.rackId ||= ''; view.placingRackId ||= '';
    const savedCollapsed = (() => { try { const s = JSON.parse(localStorage.getItem('rackmap-map-collapsed-groups') || 'null'); return Array.isArray(s) ? s : null; } catch { return null; } })();
    view.collapsedDeviceGroups ||= new Set(savedCollapsed || []);
    if (savedCollapsed && view.collapsedDeviceGroups.size === 0) { for (const s of savedCollapsed) view.collapsedDeviceGroups.add(String(s)); }
    view.expandedDeviceCards ||= new Set();
    const collapsedDeviceGroups = view.collapsedDeviceGroups, expandedDeviceCards = view.expandedDeviceCards;
    const saveCollapsedGroups = () => { try { localStorage.setItem('rackmap-map-collapsed-groups', JSON.stringify([...collapsedDeviceGroups])); } catch { } };
    view.selectedMarkerIds ||= new Set();
    if(h.requestedPlanId!==view.requestedPlanId){view.requestedPlanId=h.requestedPlanId;if(h.requestedPlanId)view.planId=h.requestedPlanId;}
    const state = getState(), plans = state.floorPlans || []; let plan = plans.find(p => p.id === view.planId) || plans[0]; view.planId = plan?.id || '';
    if(plan?.plannedRoutes!==undefined&&typeof drawingCablesVisible==='boolean')view.showCables=drawingCablesVisible;
    if (view.historyPlanId !== view.planId) { view.historyPlanId = view.planId; view.undoStack = []; view.redoStack = []; view.selectedMarkerIds.clear(); view.rackId = ''; view.placingRackId='';view.showCables=!!plan?.plannedRoutes?.length;}
    view.undoStack ||= []; view.redoStack ||= [];
    const rows = D.rows(state), byId = new Map(rows.map(r => [r.p.id, r])); const mapData = D.mapDevices(state, plan); view.portId = mapData.canonical(view.portId); if (!mapData.devices.some(r => r.p.id === view.portId) && !mapData.markers.some(m => m.portId === view.portId)) { view.portId = ''; view.placing = false; }
    view.autoIconPositions = new Map();
    const markerLayout = marker => { const layout = D.mapMarkerLayout(marker), auto = view.autoIconPositions.get(marker.id); return auto ? { ...layout, ...auto } : layout; };
    if (view.rackId && !(mapData.rackMarkers || []).some(rm => rm.id === view.rackId)) view.rackId = '';
    let dragging = null;
    let collisionGrid = null, collisionPlanId = null;
    function getCollisionGrid() {
      if (collisionGrid && collisionPlanId === plan?.id) return collisionGrid;
      if (!Routing || !plan?.image) return null;
      const imgEl = root.querySelector('.map-canvas > img');
      if (!imgEl || !imgEl.complete || !imgEl.naturalWidth) return null;
      try {
        const off = document.createElement('canvas');
        const longest = Math.max(imgEl.naturalWidth, imgEl.naturalHeight), scale = Math.min(1, 320 / longest);
        const w = Math.max(80, Math.round(imgEl.naturalWidth * scale)), h = Math.max(80, Math.round(imgEl.naturalHeight * scale));
        off.width = w; off.height = h;
        const ctx = off.getContext('2d');
        ctx.drawImage(imgEl, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        collisionGrid = Routing.createCollisionGrid(data.data, w, h, w, h);
        collisionPlanId = plan.id;
        return collisionGrid;
      } catch (err) { return null; }
    }
    const pathTreeCache = new Map();
    function getTreeForRack(grid, rm) {
      if (!grid || !Routing) return null;
      const position = D.mapMarkerLayout(rm);
      const key = `${plan.id}:${rm.id}:${position.iconX.toFixed(4)}:${position.iconY.toFixed(4)}`;
      if (pathTreeCache.has(key)) return pathTreeCache.get(key);
      const tree = Routing.computeShortestPathTree(grid, position.iconX, position.iconY);
      pathTreeCache.set(key, tree);
      return tree;
    }
    const findPlan = s => (s.floorPlans || []).find(p => p.id === view.planId);
    const connectionLabel = r => `${r.rack} / ${r.device} / ${r.port}`;
    const name = r => D.endpointLabel(state, r, tr);
    const label = r => r ? name(r) + ' · ' + connectionLabel(r) : tr('Չի գտնվել');
    const icon = service => `<svg class="map-service-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${D.serviceIcon(service, state)}"/></svg>`;
    // Undo / redo stacks (map-page local, max 50 steps)
    const undoStack = view.undoStack, redoStack = view.redoStack;
    function change(fn) {
      if (h.readOnly) throw new Error(tr('Միայն դիտում'));
      const snap = JSON.stringify({ floorPlans: getState().floorPlans || [], floors: getState().floors || [] });
      undoStack.push(snap); if (undoStack.length > 50) undoStack.shift();
      redoStack.length = 0;
      commit(fn);
    }
    function applyUndoRedo(snapJson) {
      const parsed = JSON.parse(snapJson);
      commit(s => {
        if (Array.isArray(parsed)) s.floorPlans = parsed;
        else {
          if (parsed.floorPlans) s.floorPlans = parsed.floorPlans;
          if (parsed.floors) s.floors = parsed.floors;
        }
      }, false);
      h.redraw();
    }
    function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify({ floorPlans: getState().floorPlans || [], floors: getState().floors || [] })); applyUndoRedo(undoStack.pop()); toast(tr('Հետ վերցվեց')); }
    function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify({ floorPlans: getState().floorPlans || [], floors: getState().floors || [] })); applyUndoRedo(redoStack.pop()); toast(tr('Կրկին կատարվեց')); }
    function button(text, action, extra = '') { return `<button type="button" class="button" data-map-action="${action}" ${extra}>${esc(tr(text))}</button>`; }
    const paths = { select: 'm5 3 14 10-7 1-3 7Z', hand: 'M8 13V6a2 2 0 0 1 4 0v6M12 5a2 2 0 0 1 4 0v7M16 8a2 2 0 0 1 4 0v7c0 4-3 7-7 7h-1c-2 0-3-1-4-3l-4-6c-1-2 1-4 3-2l1 2', fit: 'M12 3v3m0 12v3M3 12h3m12 0h3M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', close: 'm6 6 12 12M18 6 6 18', layers: 'm3 7 9-5 9 5-9 5Zm0 5 9 5 9-5M3 17l9 5 9-5', plan: 'M3 3h18v18H3ZM3 9h18M9 9v12', devices: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z', labels: 'M4 5h16M12 5v15M8 20h8', pdf: 'M14 2H5v20h14V7Zm0 0v6h5M8 13h8M8 17h6', printer: 'M6 8V2h12v6 M6 18H2V8h20v10h-4 M6 14h12v8H6Z M17 11h2', share: 'M8 12 17 6M8 12l9 6M3 9h5v6H3ZM17 3h5v5h-5Zm0 13h5v5h-5Z', more: 'M5 11v2M12 11v2M19 11v2', edit: 'm4 16 12-12 4 4L8 20l-5 1Z', trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7', fullscreen: 'M8 3H3v5m0-5 6 6M16 3h5v5m0-5-6 6M3 16v5h5m-5 0 6-6m12 1v5h-5m5 0-6-6', eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z', eyeOff: 'm3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.1 3.9M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8', undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v.5a5.5 5.5 0 0 1-5.5 5.5H11', redo: 'm15 14 5-5-5-5M20 9H9.5A5.5 5.5 0 0 0 4 14.5v.5A5.5 5.5 0 0 0 9.5 21H13', lock: 'M7 11V7a5 5 0 0 1 10 0v4m-12 0h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z', unlock: 'M7 11V7a5 5 0 0 1 9.9-1m-14.9 5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z', speaker: 'M3 9h4l5-5v16l-5-5H3V9Z M16.5 8.5a5 5 0 0 1 0 7 M19.5 5.5a9 9 0 0 1 0 13', mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3 M8 22h8', microphone: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3 M8 22h8', dynamicMic: 'M12 2a4 4 0 0 0-4 4c0 1.5.8 2.8 2 3.5L8.5 21h7L14 9.5c1.2-.7 2-2 2-3.5a4 4 0 0 0-4-4Z M8 6h8 M9 9.5h6', server: 'M5 2h14v20H5Z M5 8h14 M5 15h14 M8 5h1 M8 11h1 M8 18h1', cableRoutes: 'M4 4h4v4H4Zm12 12h4v4h-4ZM8 6h5a3 3 0 0 1 3 3v5' };
    const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
    const tool = (text, action, image, extra = '') => `<button type="button" class="map-tool" data-map-action="${action}" title="${esc(tr(text))}" aria-label="${esc(tr(text))}" ${extra}>${svg(image)}</button>`;
    // Appearance is a local viewing preference; changing it never moves devices or edits project data.
    try { const saved = JSON.parse(localStorage.getItem('rackmap-map-appearance') || 'null'); if (saved) { view.markerSize = saved.markerSize; view.lineWidth = saved.lineWidth; if (Number.isFinite(Number(saved.imageOpacity))) view.imageOpacity = Number(saved.imageOpacity); } } catch { }
    view.lineWidth = Math.min(6, Math.max(1, Number(view.lineWidth) || 1.5));
    view.tool ||= 'select'; view.filter ??= 'all'; view.labels ??= true; view.markerSize = Math.min(200, Math.max(0, Number(view.markerSize) || 0)); view.imageOpacity = Math.min(90, Math.max(0, Number(view.imageOpacity) || 0));
    const placedServices = [...new Set(mapData.markers.map(m => m.row.service))];
    if (view.filter !== 'all' && !placedServices.includes(view.filter)) view.filter = 'all';
    const floorName = id => state.floors.find(f => f.id === id)?.name || tr('Առանց հարկի');
    const mapFloors = [...new Set(plans.map(p => p.floorId))];
    const allPlaced = () => new Set((state.floorPlans || []).flatMap(p => (p.markers || []).map(m => mapData.canonical(m.portId))));
    const allPlacedRacks = () => new Set((state.floorPlans || []).flatMap(p => (p.rackMarkers || []).map(rm => rm.rackId)));
    const curFloor = state.floors.find(f => f.id === plan?.floorId);
    const allRacksList = state.floors.flatMap(f => (f.racks || []));
    const curFloorRacks = curFloor ? (allRacksList.filter(r => (curFloor.racks || []).some(x => x.id === r.id) || (curFloor.linkedRackIds || []).includes(r.id))) : allRacksList;
    const placedRackIds = allPlacedRacks();
    const unplacedRacks = curFloorRacks.filter(r => !placedRackIds.has(r.id));
    if (unplacedRacks.length === 0 && view.activeTab === 'racks') view.activeTab = 'devices';
    document.body.classList.add('map-view');
    root.innerHTML = plans.length ? `
      <section class="map-editor" aria-label="${esc(tr('Քարտեզի խմբագրիչ'))}">
        <div class="map-viewport" tabindex="0" aria-label="${esc(tr('Հատակագծի աշխատանքային դաշտ'))}"><div class="map-canvas"><img width="${plan.width}" height="${plan.height}" src="${plan.image}" alt="${esc(plan.name)}" draggable="false" style="opacity:${1 - view.imageOpacity / 100}"><svg class="map-cables-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg><div class="map-markers"></div></div></div>
        <div class="map-topbar">
          <div class="map-project"><span class="map-project-name">${esc(state.company)}</span><div class="map-plan-controls">
            <label class="map-pill-select">${svg('layers')}<select data-map-floor aria-label="${esc(tr('Հարկ'))}">${mapFloors.map(id => `<option value="${esc(id)}" ${id === plan.floorId ? 'selected' : ''}>${esc(floorName(id))}</option>`).join('')}</select></label>
            <label class="map-pill-select map-plan-select">${svg('plan')}<select data-map-plan aria-label="${esc(tr('Հատակագիծ'))}">${plans.filter(p => p.floorId === plan.floorId).map(p => `<option value="${esc(p.id)}" ${p.id === plan.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
            ${!h.readOnly ? tool('Բեռնել հատակագիծ', 'upload', 'plus') : ''}
          </div></div>
          <div class="map-top-actions"><button type="button" class="map-command" data-map-action="print" title="${esc(tr('Տպել հատակագիծը'))}" aria-label="${esc(tr('Տպել հատակագիծը'))}">${svg('printer')}</button><button type="button" class="map-command" data-map-action="map-pdf" title="${esc(tr('Քարտեզ PDF'))}" aria-label="${esc(tr('Քարտեզ PDF'))}">${svg('pdf')}</button><button type="button" class="map-command" data-map-action="share" title="${esc(tr('Կիսվել հղումով'))}" aria-label="${esc(tr('Կիսվել հղումով'))}">${svg('share')}</button>
            <details class="map-more"><summary class="map-tool" title="${esc(tr('Լրացուցիչ գործիքներ'))}" aria-label="${esc(tr('Լրացուցիչ գործիքներ'))}">${svg('more')}</summary><div class="map-more-menu"><label class="map-marker-size"><span>${esc(tr('Հատ. ֆոնի մաղձոտ.'))}</span><output data-image-opacity-value>${view.imageOpacity}%</output><input type="range" min="0" max="90" step="10" value="${view.imageOpacity}" data-map-image-opacity aria-label="${esc(tr('Հատ. ֆոնի մաղձոտ.'))}"></label>${!h.readOnly ? button('Ավելացնել ռաք', 'create-map-rack') : ''}${!h.readOnly ? button('Խմբագրել հատակագիծը', 'edit') : ''}${button('Սարքերի սխեմաներ PDF', 'panel-pdf', D.devices(state).length ? '' : 'disabled')}${button('Իմ հղումները', 'shares')}${!h.readOnly ? button('Ջնջել հատակագիծը', 'delete') : ''}</div></details>
          </div>
        </div>
        <div class="map-filters" role="group" aria-label="${esc(tr('Սարքի տեսակ'))}">${['all', ...placedServices].map(id => { const name = id === 'all' ? tr('Բոլորը') : D.serviceLabel(state, id, tr), count = id === 'all' ? mapData.markers.length : mapData.markers.filter(m => m.row.service === id).length; return `<button type="button" data-map-filter="${esc(id)}" title="${esc(name)}" aria-label="${esc(name + ' · ' + count)}" aria-pressed="${view.filter === id}">${id === 'all' ? svg('devices') : icon(id)}<small aria-hidden="true">${count}</small></button>`; }).join('')}<button type="button" class="map-filter-clear" data-map-filter="clear" title="${esc(tr('Մաքրել ֆիլտրերը'))}" aria-label="${esc(tr('Մաքրել ֆիլտրերը'))}" ${view.filter === 'all' && !view.query.trim() ? 'hidden' : ''}>${svg('close')}</button></div>
        <aside class="map-inspector" data-map-inspector hidden></aside>
        <div class="map-side-panels ${view.devicesOpen ? 'devices-open' : ''}"><details class="map-appearance" ${view.appearanceOpen ? 'open' : ''}><summary title="${esc(tr('Նշաններ և գծեր'))}">${svg('layers')}<span>${esc(tr('Նշաններ և գծեր'))}</span></summary><div class="map-appearance-body">
          <label class="map-marker-size"><span>${esc(tr('SVG նշանների չափ'))}</span><output data-marker-size-value>${100 + view.markerSize}%</output><input type="range" min="0" max="200" step="10" value="${view.markerSize}" data-map-marker-size aria-label="${esc(tr('SVG նշանների չափ'))}"></label>
          <label class="map-marker-size"><span>${esc(tr('Գծերի հաստություն'))}</span><output data-line-width-value>${view.lineWidth} px</output><input type="range" min="1" max="6" step="0.5" value="${view.lineWidth}" data-map-line-width aria-label="${esc(tr('Գծերի հաստություն'))}"></label>
          ${button('Սկզբնական չափեր', 'appearance-reset')}
        </div></details>
        <aside class="map-sidebar ${view.devicesOpen ? 'is-open' : ''}" aria-label="${esc(tr('Միացված սարքեր'))}"><div class="map-sidebar-heading"><span>${svg('devices')}${esc(tr('Միացված սարքեր'))}</span>${tool('Փակել', 'devices-toggle', 'close')}</div><div class="map-sidebar-tabs" role="tablist" ${unplacedRacks.length === 0 ? 'hidden' : ''}><button type="button" class="map-sidebar-tab ${view.activeTab !== 'racks' ? 'active' : ''}" data-map-tab="devices" role="tab" aria-selected="${view.activeTab !== 'racks'}">${svg('devices')}<span>${esc(tr('Սարքեր'))}</span><small data-unplaced-count>${mapData.devices.filter(r => !allPlaced().has(r.p.id)).length}</small></button><button type="button" class="map-sidebar-tab ${view.activeTab === 'racks' ? 'active' : ''}" data-map-tab="racks" role="tab" aria-selected="${view.activeTab === 'racks'}" ${unplacedRacks.length === 0 ? 'hidden' : ''}>${svg('server')}<span>${esc(tr('Ռաքեր'))}</span><small data-floor-racks-count>${unplacedRacks.length}</small></button></div><div id="map-device-picker" class="map-picker-body" ${view.devicesOpen ? '' : 'hidden'}><label class="field" ${view.activeTab === 'racks' ? 'hidden' : ''}><span>${esc(tr('Որոնում'))}</span><input data-map-search value="${esc(view.query)}" placeholder="${esc(tr('Սարքի տեսակ, մալուխ կամ սենյակ'))}"></label><p class="hint" data-tab-hint>${esc(view.activeTab === 'racks' ? tr('Ընտրեք ռաքը և սեղմեք հատակագծի վրա՝ այն տեղադրելու համար։') : tr('Ընտրեք սարքը և սեղմեք հատակագծի վրա։'))}</p><div class="map-port-list"></div></div></aside></div>
        <div class="map-view-tools" role="group" aria-label="${esc(tr('Քարտեզի դիտում'))}">${tool('Տեղավորել էկրանին', 'fit', 'fit')}${tool('Մեծացնել', 'zoom-in', 'plus')}<button type="button" class="map-zoom-value" data-map-action="zoom-reset" data-map-zoom aria-label="100%">100%</button>${tool('Փոքրացնել', 'zoom-out', 'minus')}${tool('Ամբողջ էկրանով', 'fullscreen', 'fullscreen')}</div>
        <div class="map-bottom-toolbar" role="toolbar" aria-label="${esc(tr('Քարտեզի գործիքներ'))}">${tool('Ընտրել (V)', 'select', 'select', `aria-pressed="${view.tool === 'select'}"`)}${tool('Տեղաշարժել դաշտը (H / Space)', 'hand', 'hand', `aria-pressed="${view.tool === 'hand'}"`)}<i></i>${tool('Հետ վերցնել (Ctrl+Z)', 'undo', 'undo', undoStack.length ? '' : 'disabled')}${tool('Կրկին կատարել (Ctrl+Y)', 'redo', 'redo', redoStack.length ? '' : 'disabled')}<i></i>${tool(view.locked ? 'Ապակողպել դաշտը' : 'Կողպել դաշտը (Lock)', 'lock-toggle', view.locked ? 'lock' : 'unlock', `aria-pressed="${!!view.locked}"`)}${tool('Ցույց տալ անվանումները', 'labels', 'labels', `aria-pressed="${view.labels}"`)}${tool(view.showCables ? 'Թաքցնել միացումները' : 'Ցուցադրել միացումները', 'cables-toggle', 'cableRoutes', `aria-pressed="${!!view.showCables}"`)}${plan.plannedRoutes!==undefined?'<a class="map-tool" href="#drawing/map-'+esc(plan.id)+'" title="'+esc(tr('Խմբագրել գծագրության ուղիները'))+'" aria-label="'+esc(tr('Խմբագրել գծագրության ուղիները'))+'">'+svg('edit')+'</a>':''}<i></i><button type="button" class="map-command map-add-devices" data-map-action="devices-toggle" aria-expanded="${!!view.devicesOpen}" aria-controls="map-device-picker">${svg('devices')}<span>${esc(tr('Ավելացնել սարք'))}</span><small>${mapData.devices.filter(r => !allPlaced().has(r.p.id)).length}</small></button></div>
        <p class="map-status" data-map-hint role="status"></p>
      </section>`: `<section class="map-empty-editor"><div>${svg('plan')}<span class="eyebrow">${esc(state.company)}</span><h1>${esc(tr('Քարտեզի խմբագրիչ'))}</h1><p>${esc(tr('Բեռնեք հատակագիծը և տեղադրեք միացված սարքերը համապատասխան տեղերում։'))}</p><p class="hint">${esc(tr('PNG, JPEG, WebP կամ բազմաէջ PDF։ Յուրաքանչյուր էջի համար կարող եք ընտրել հարկ։'))}</p>${!h.readOnly ? button('Բեռնել հատակագիծ', 'upload') : ''}${button('Սարքերի սխեմաներ PDF', 'panel-pdf', D.devices(state).length ? '' : 'disabled')}</div></section>`;
    const headerControls = root.querySelector('.map-plan-controls'), projectHeader = root.querySelector('.map-project');
    const topActions = root.querySelector('.map-top-actions');
    const appearance = root.querySelector('.map-appearance');
    if (appearance && topActions) topActions.prepend(appearance);
    function positionAppearance() { if (!appearance?.open) return; const panel = appearance.querySelector('.map-appearance-body'); panel.style.transform = ''; const box = panel.getBoundingClientRect(), shift = Math.max(12 - box.left, Math.min(0, document.documentElement.clientWidth - 12 - box.right)); panel.style.transform = `translateX(${shift}px)`; }
    window.addEventListener('resize', positionAppearance, { signal: abort.signal });
    appearance?.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); appearance.open = false; appearance.querySelector('summary').focus(); } }, { signal: abort.signal });
    document.addEventListener('pointerdown', e => { if (appearance?.open && !appearance.contains(e.target)) appearance.open = false; }, { capture: true, signal: abort.signal });
    const mapFilters = root.querySelector('.map-filters'), mapEditor = root.querySelector('.map-editor');
    const topbarTools = document.querySelector('.topbar .save-tools');
    if (topActions && topbarTools) {
      topActions.classList.add('map-top-actions-global');
      topbarTools.prepend(topActions);
      document.addEventListener('click', e => { if (!root.contains(topActions) && topActions.contains(e.target)) click(e).catch(err => toast(err.message)); }, { signal: abort.signal });
      document.addEventListener('pointerdown', e => { const more = topActions.querySelector('.map-more'); if (more?.open && !more.contains(e.target)) more.open = false; }, { capture: true, signal: abort.signal });
    }
    const placeHeaderControls = () => { const breadcrumb = document.querySelector('.topbar #breadcrumb'), mapBar = root.querySelector('.map-topbar'); if (!breadcrumb) return; const isFullscreen = document.fullscreenElement === root; if (mapBar) mapBar.hidden = !isFullscreen; if (isFullscreen) { if (mapFilters) mapEditor?.append(mapFilters); if (headerControls) projectHeader?.append(headerControls); if (topActions && !mapBar?.contains(topActions)) mapBar?.append(topActions); } else { if (mapFilters) document.querySelector('.topbar')?.insertBefore(mapFilters, topbarTools); if (headerControls) breadcrumb.after(headerControls); if (topActions && topbarTools && !topbarTools.contains(topActions)) topbarTools.prepend(topActions); } };
    headerControls?.classList.add('map-header-controls'); placeHeaderControls();
    document.addEventListener('fullscreenchange', () => { placeHeaderControls(); }, { signal: abort.signal });
    mapFilters?.addEventListener('click', e => { if (!root.contains(mapFilters)) click(e).catch(err => toast(err.message)); }, { signal: abort.signal });
    headerControls?.addEventListener('click', e => { if (!root.contains(headerControls)) click(e).catch(err => toast(err.message)); }, { signal: abort.signal });
    function showDevices(open) { view.devicesOpen = open; const side = root.querySelector('.map-sidebar'); if (!side) return; root.querySelector('.map-side-panels')?.classList.toggle('devices-open', open); side.classList.toggle('is-open', open); const picker = root.querySelector('#map-device-picker'); if (picker) picker.hidden = !open; const toggle = side.querySelector('[data-map-action="devices-toggle"]'); if (toggle) { toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-controls', 'map-device-picker'); toggle.innerHTML = svg(open ? 'close' : 'plus'); toggle.title = esc(tr(open ? 'Փակել' : 'Միացված սարքեր')); toggle.setAttribute('aria-label', toggle.title); } root.querySelector('.map-add-devices')?.setAttribute('aria-expanded', String(open)); drawInspector(); }
    function drawInspector() {

      const host = root.querySelector('[data-map-inspector]'); if (!host) return;
      host.scrollLeft = 0;
      host.scrollTop = 0;
      if (!host.dataset.scrollLocked) {
        host.dataset.scrollLocked = 'true';
        host.addEventListener('scroll', () => { if (host.scrollLeft) host.scrollLeft = 0; if (host.scrollTop) host.scrollTop = 0; }, { passive: true });
      }
      if (view.selectedMarkerIds.size > 1) {
        host.hidden = false;
        host.classList.remove('map-panel-preview');
        const count = view.selectedMarkerIds.size;
        const selectedMarkers = mapData.markers.filter(m => view.selectedMarkerIds.has(m.id));
        const serviceCounts = new Map();
        for (const m of selectedMarkers) { const s = m.row.service || 'other'; serviceCounts.set(s, (serviceCounts.get(s) || 0) + 1); }
        const summaryChips = [...serviceCounts.entries()].map(([s, n]) => `<span class="map-group-chip">${icon(s)}<b>${n}</b> ${esc(D.serviceLabel(state, s, tr))}</span>`).join('');
        const allAnchorsVisible = selectedMarkers.length > 0 && selectedMarkers.every(m => m.anchorVisible);
        host.innerHTML = `<div class="map-inspector-heading"><span>${esc(tr('Խմբային ընտրություն'))}</span>${tool('Չեղարկել ընտրությունը', 'deselect', 'close')}</div><div class="map-group-summary"><strong>${count} ${esc(tr('ընտրված սարք'))}</strong><div class="map-group-chips">${summaryChips}</div></div><p class="hint" style="margin:4px 14px 10px">${esc(tr('Քաշեք նշաններից որևէ մեկը կամ օգտագործեք սլաքները՝ բոլոր ընտրված սարքերը միասին տեղափոխելու համար։'))}</p>${!h.readOnly ? `<div class="map-inspector-actions"><button type="button" class="map-command map-action-full" data-map-action="batch-anchors" title="${esc(tr('Ցույց տալ / թաքցնել կետերը'))}">${svg(allAnchorsVisible ? 'eyeOff' : 'eye')}<span>${esc(tr('Ցույց տալ / թաքցնել կետերը'))}</span></button><button type="button" class="map-tool danger map-action-full" data-map-action="batch-delete" title="${esc(tr('Հեռացնել բոլոր նշանները'))}" aria-label="${esc(tr('Հեռացնել բոլոր նշանները'))}">${svg('trash')}<span>${esc(tr('Հեռացնել բոլոր նշանները'))}</span></button></div>` : ''}`;
        host.scrollLeft = 0;
        host.scrollTop = 0;
        return;
      }
      if (view.rackId) {
        const rm = (mapData.rackMarkers || []).find(m => m.id === view.rackId);
        if (rm) {
          host.hidden = false;
          host.classList.remove('map-panel-preview');
          const rackDevices = D.devices(state).filter(d => d.rackId === rm.rack.id);
          const installedEndpoints = mapData.markers.filter(m => m.row.r?.id === rm.rack.id);
          host.innerHTML = `<div class="map-inspector-heading"><span>${esc(tr('Ընտրված ռաք'))}</span>${tool('Չեղարկել ընտրությունը', 'deselect', 'close')}</div><div class="map-selected-device"><span class="map-selected-icon" style="color:#38bdf8"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths.server}"/></svg></span><div><div class="map-selected-title-row"><strong>${esc(rm.rack.name)}</strong>${!h.readOnly ? `<button type="button" class="map-title-edit-btn" data-map-action="edit-rack-name" title="${esc(tr('Խմբագրել անվանումը'))}" aria-label="${esc(tr('Խմբագրել անվանումը'))}">${svg('edit')}</button>` : ''}</div><span>${esc(rm.floor.name)} · ${(rm.rack.u || rm.rack.height || 42)}U</span></div></div>${details([['Հարկ', rm.floor.name], ['U բարձրություն', (rm.rack.u || rm.rack.height || 42) + 'U'], ['Սարքեր ռաքում', rackDevices.length], ['Միացված սարքեր քարտեզում', installedEndpoints.length]])}<div class="map-inspector-actions"><button type="button" class="map-command map-action-full" data-map-action="rack-open">${svg('server')}<span>${esc(tr('Բացել ռաքը'))}</span></button>${!h.readOnly ? `<button type="button" class="map-tool danger map-action-full" data-map-action="rack-remove" title="${esc(tr('Հեռացնել քարտեզից'))}" aria-label="${esc(tr('Հեռացնել քարտեզից'))}">${svg('trash')}<span>${esc(tr('Հեռացնել քարտեզից'))}</span></button>` : ''}</div>`;
          host.scrollLeft = 0;
          host.scrollTop = 0;
          return;
        }
      }
      const row = byId.get(view.portId), marker = mapData.markers.find(m => m.portId === view.portId); host.hidden = !row;
      if (!row) return;
      const preview = byId.get(view.panelPortId); host.classList.toggle('map-panel-preview', !!preview);
      if (preview) {
        const layout = D.portLayout(preview.d), count = layout[0]?.columns || 24;
        const hosts = D.hostsForDevice(state, preview.d.id), hostIp = hosts.map(x => x.h.ip).filter(Boolean).join(', ');
        host.innerHTML = `<div class="map-inspector-heading"><span>${esc(tr(preview.d.type === 'panel' ? 'Փաչ պանել' : preview.d.type === 'router' ? 'Ռաուտեր' : 'Սվիչ'))}</span>${tool('Փակել', 'panel-close', 'close')}</div><div class="map-panel-title"><strong>${esc(preview.device)}</strong><span>${esc(preview.floor + ' · ' + preview.rack + ' · U' + preview.d.pos + (preview.d.model ? ' · ' + preview.d.model : ''))}</span></div><div class="map-panel-scroll"><div class="map-panel-ports" style="grid-template-columns:repeat(${count},24px)">${layout.map(({ p, row, column, optical }) => { const port = byId.get(p.id); return `<button type="button" class="map-panel-port ${p.id === preview.p.id ? 'active' : ''}" data-map-panel-port="${esc(p.id)}" style="grid-row:${row + 1};grid-column:${column + 1};--port-service:${port.status === 'fault' ? '#d35352' : D.serviceColor(state, port.service)};--port-status:${D.statusColor(state, port.status)}" title="${esc(label(port))}" aria-label="${esc(port.port + ' · ' + label(port))}" aria-pressed="${p.id === preview.p.id}">${p.number}<i></i>${optical ? '<small>SFP</small>' : ''}</button>`; }).join('')}</div></div><div class="map-panel-port-info"><div class="map-selected-title-row"><strong>${esc(tr('Պորտ'))} ${preview.port} · ${esc(name(preview))}</strong>${!h.readOnly ? `<button type="button" class="map-title-edit-btn" data-map-action="edit-endpoint-name" title="${esc(tr('Խմբագրել անվանումը'))}" aria-label="${esc(tr('Խմբագրել անվանումը'))}">${svg('edit')}</button>` : ''}</div><span>${esc(D.serviceLabel(state, preview.service, tr) + ' · ' + D.statusLabel(state, preview.status, tr))}</span></div>${details([['Միացված սարքի անվանում', preview.endpointName], ['Սարքի մոդել', preview.d.model], ['Սարքի տեսակ', D.deviceTypes(state).find(([k]) => k === preview.d.type)?.[1] || preview.d.type], ['U դիրք', 'U' + preview.d.pos + ' (' + preview.d.height + 'U)'], ['Պորտերի քանակ', preview.d.portList.length], ['Միացված սարքի IP', hostIp], ['Սենյակ', preview.room], ['Մալուխ', preview.cable], ['Կապ', preview.connection], ['VLAN', preview.vlan]])}${!h.readOnly ? `<div class="map-inspector-actions"><button type="button" class="map-command map-action-full" data-map-action="panel-edit">${svg('edit')}<span>${esc(tr('Խմբագրել պորտը'))}</span></button></div>` : ''}`;
        host.scrollLeft = 0;
        host.scrollTop = 0;
        return;
      }
      const typeLabel = D.deviceTypes(state).find(([k]) => k === row.d.type)?.[1] || row.d.type;
      const devHosts = D.hostsForDevice(state, row.d.id), devIp = devHosts.map(x => x.h.ip).filter(Boolean).join(', ');
      host.innerHTML = `<div class="map-inspector-heading"><span>${esc(tr('Ընտրված սարք'))}</span>${tool('Չեղարկել ընտրությունը', 'deselect', 'close')}</div><div class="map-selected-device"><span class="map-selected-icon" style="color:${row.status === 'fault' ? '#d35352' : D.serviceColor(state, row.service)}">${icon(row.service)}</span><div><div class="map-selected-title-row"><strong>${esc(name(row))}</strong>${!h.readOnly ? `<button type="button" class="map-title-edit-btn" data-map-action="edit-endpoint-name" title="${esc(tr('Խմբագրել անվանումը'))}" aria-label="${esc(tr('Խմբագրել անվանումը'))}">${svg('edit')}</button>` : ''}</div><span>${esc((row.status === 'fault' ? D.statusLabel(state, 'fault', tr) : D.serviceLabel(state, row.service, tr)))}${marker ? ' · #' + marker.number : ''}</span></div></div>${details([['Սարքի տեսակ', typeLabel], ['Սարքի մոդել', row.d.model], ['Հարկ և ռաք', row.floor + ' / ' + row.rack], ['U դիրք', 'U' + row.d.pos + ' (' + row.d.height + 'U)'], ['Պորտերի քանակ', row.d.portList.length], ['Սարք / պորտ', row.device + ' / ' + row.port], ['Միացված սարքի IP', devIp], ['VLAN', row.vlan], ['Մալուխ', row.cable], ['Կապ', row.connection || (row.switchName ? row.switchName + ' / ' + row.switchPort : '')]])}<div class="map-inspector-actions"><button type="button" class="map-command map-action-full" data-map-action="panel-open">${svg('edit')}<span>${esc(tr('Բացել պորտը'))}</span></button>${!h.readOnly ? `<button type="button" class="map-command ${!marker ? 'map-action-full' : ''}" data-map-action="device-clone" title="${esc(tr('Ավելացնել նույն մոդելը'))}">${svg('plus')}<span>${esc(tr('Ավելացնել նույն մոդելը'))}</span></button>` : ''}${marker && !h.readOnly ? `<button type="button" class="map-tool" data-map-action="anchor-toggle" aria-pressed="${!!marker.anchorVisible}" title="${esc(tr(marker.anchorVisible ? 'Թաքցնել կետը' : 'Ցույց տալ կետը'))}" aria-label="${esc(tr(marker.anchorVisible ? 'Թաքցնել կետը' : 'Ցույց տալ կետը'))}">${svg(marker.anchorVisible ? 'eyeOff' : 'eye')}</button><button type="button" class="map-tool danger" data-map-remove="${esc(marker.id)}" title="${esc(tr('Հեռացնել նշանը'))}" aria-label="${esc(tr('Հեռացնել նշանը'))}">${svg('trash')}</button>` : ''}</div>`;
      host.scrollLeft = 0;
      host.scrollTop = 0;
    }
    function details(values) { return `<dl>${values.filter(([, value]) => value).map(([key, value]) => `<div><dt>${esc(tr(key))}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`; }
    function editEndpointName() {
      if (h.readOnly) return; const target = byId.get(mapData.canonical(view.panelPortId)) || byId.get(mapData.canonical(view.portId)); if (!target) return;
      modal(tr('Խմբագրել անվանումը'), `<div class="form-grid">${input('endpointName', tr('Սարքի անվանում'), target.endpointName || name(target), 'text', 'maxlength="200" autofocus placeholder="WiFi B zone"')}</div>`, fd => { const newName = String(fd.get('endpointName') || '').trim(); change(s => { const current = D.ports(s).find(x => x.p.id === target.p.id); if (!current) throw new Error(tr('Պորտը չի գտնվել')); current.p.endpointName = newName; }); toast(tr('Անվանումը թարմացվեց')); });
    }
    function editPanelPort() {
      if (h.readOnly) return; const row = byId.get(mapData.canonical(view.panelPortId)); if (!row) return;
      modal(tr('Խմբագրել պորտը') + ' · ' + row.device + ' / ' + row.port, `<div class="form-grid">${input('endpointName', tr('Միացված սարքի անվանում'), row.endpointName, 'text', 'maxlength="200" placeholder="WiFi B zone"')}${select('service', tr('Նշանակություն'), D.serviceEntries(state).map(([key]) => [key, D.serviceLabel(state, key, tr)]), row.service)}${input('room', tr('Սենյակ'), row.room, 'text', 'maxlength="200"')}${input('cable', tr('Մալուխի համար'), row.cable, 'text', 'maxlength="200"')}${select('status', tr('Վիճակ'), Object.keys(D.statuses).map(key => [key, D.statusLabel(state, key, tr)]), row.p.status)}${input('vlan', 'VLAN', row.vlan, 'number', 'min="1" max="4094" step="1"')}</div>`, fd => change(s => { const current = D.ports(s).find(x => x.p.id === row.p.id); if (!current) throw new Error(tr('Պորտը չի գտնվել')); for (const key of ['endpointName', 'room', 'cable', 'service', 'vlan']) current.p[key] = String(fd.get(key) || '').trim(); if (current.p.vlan) current.p.vlan = String(Number(current.p.vlan)); current.p.status = String(fd.get('status')); if (current.p.status === 'fault') current.p.service = ''; else if (current.p.status === 'free' && (current.p.cable || current.p.switchPortId || current.p.service)) current.p.status = 'used'; }));
    }
    const visibleService = service => view.filter === 'all' || view.filter === service;
    function draw() {
      if (!plan) return; const placedSet = allPlaced(), placed = new Map(mapData.markers.map(m => [m.portId, m]));
      const search = view.query.trim().toLocaleLowerCase();
      const markerMatches = m => visibleService(m.row.service) && (!search || [name(m.row), m.row.d?.model, m.row.endpointName, D.serviceLabel(state, m.row.service, tr), m.row.floor, m.row.rack, m.row.device, m.row.port, m.row.cable, m.row.room, m.row.vlan, m.row.connection, m.row.switchName].filter(Boolean).join(' ').toLocaleLowerCase().includes(search));
      const visible = mapData.markers.filter(markerMatches);
      const legendCount = root.querySelector('[data-map-legend-count]');
      if (legendCount) {
        const legend = new Map(); for (const marker of visible) { const row = marker.row, key = JSON.stringify([row.service || '', row.d?.model || '', row.status]); const item = legend.get(key); if (item) item.count++; else legend.set(key, { row, count: 1 }); }
        legendCount.textContent = String(visible.length);
        const legendList = root.querySelector('[data-map-legend-list]');
        if (legendList) legendList.innerHTML = [...legend.values()].map(({ row, count }) => `<div class="map-legend-item"><i style="--legend-service:${esc(D.serviceColor(state, row.service))};--legend-status:${esc(D.statusColor(state, row.status))}"></i><span><strong>${esc(D.serviceLabel(state, row.service, tr))}</strong>${row.d?.model ? `<small>${esc(row.d.model)}</small>` : ''}<small>${esc(D.statusLabel(state, row.status, tr))}</small></span><b>${count}</b></div>`).join('') || `<p>${esc(tr('Քարտեզում նշաններ չկան'))}</p>`;
      }
      const rackMarkersHtml = (mapData.rackMarkers || []).map(rm => {
        const p = D.mapMarkerLayout(rm), selected = view.rackId === rm.id;
        return `<button type="button" class="map-rack-marker ${selected ? 'selected' : ''}" data-map-rack-marker="${esc(rm.id)}" style="left:${p.iconX * 100}%;top:${p.iconY * 100}%" title="${esc(rm.rack.name)} (${rm.rack.u || rm.rack.height || 42}U)" aria-label="${esc(rm.rack.name)}"><div class="map-rack-icon-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths.server}"/></svg><span class="map-rack-led"></span></div><span class="map-rack-label">${esc(rm.rack.name)}</span></button>`;
      }).join('');
      const markerGroups=groupMarkers(visible),autoLinks='';
      root.querySelector('.map-markers').innerHTML = `<svg class="map-leaders" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${autoLinks}${visible.filter(m => m.anchorVisible).map(m => { const p = markerLayout(m); return `<line data-map-line="${esc(m.id)}" x1="${p.x * 100}" y1="${p.y * 100}" x2="${p.iconX * 100}" y2="${p.iconY * 100}" stroke="${D.serviceColor(state, m.row.service)}" vector-effect="non-scaling-stroke"/>`; }).join('')}</svg>` + visible.map(m => { const p = markerLayout(m), selected = m.portId === view.portId || view.selectedMarkerIds.has(m.id), multi = view.selectedMarkerIds.has(m.id) && view.selectedMarkerIds.size > 1, color = D.serviceColor(state, m.row.service); return `${m.anchorVisible ? `<button type="button" class="map-anchor ${selected ? 'selected' : ''}" data-map-anchor="${esc(m.id)}" style="left:${p.x * 100}%;top:${p.y * 100}%;--marker-color:${color}" title="${esc(tr('Ճշգրիտ դիրք') + ' · ' + name(m.row))}" aria-label="${esc(tr('Ճշգրիտ դիրք') + ' · ' + name(m.row))}" tabindex="${selected ? '0' : '-1'}"></button>` : ''}<button type="button" class="map-marker ${selected ? 'selected' : ''} ${multi ? 'multi-selected' : ''} ${m.row.status === 'free' ? 'inactive' : ''}" data-map-marker="${esc(m.id)}" style="left:${p.iconX * 100}%;top:${p.iconY * 100}%;--marker-color:${color}" title="${esc(label(m.row))}" aria-label="${esc(m.number + ' · ' + label(m.row))}">${icon(m.row.service)}<span class="map-marker-number">${m.number}</span><span class="map-marker-label" data-dir="down" ${view.labels ? '' : 'hidden'}><span class="map-label-text">${esc(name(m.row))}</span></span></button>`; }).join('') + rackMarkersHtml;
      globalThis.RackMapMarkerGroups.decorate(root.querySelector('.map-markers'),markerGroups);
      const cablesLayer = root.querySelector('.map-cables-layer');
      if (cablesLayer) {
        if(view.showCables&&plan.plannedRoutes!==undefined){cablesLayer.innerHTML=globalThis.RackDrawings?.mapRoutes(plan,mapData,visible,markerLayout,state,esc)||'';}else if (!view.showCables || !(mapData.rackMarkers || []).length) {
          cablesLayer.innerHTML = '';
        } else {
          const grid = getCollisionGrid(), rmList = mapData.rackMarkers;
          const hasSelection = !!view.portId || !!view.rackId || view.selectedMarkerIds.size > 0;
          const cablePolys = [];
          for (const m of visible) {
            const targetRack = rmList.find(rm => rm.rackId === m.row.r?.id);
            if (!targetRack) continue;
            const mPos = markerLayout(m);
            const tree = getTreeForRack(grid, targetRack);
            if (!tree || !Routing) continue;
            const points = Routing.routeDeviceToRack(tree, mPos.iconX, mPos.iconY, grid?.isWall);
            if (!points?.length) continue;
            const isDevSelected = m.portId === view.portId || view.selectedMarkerIds.has(m.id);
            const isRackSelected = view.rackId === targetRack.id;
            const isHighlighted = isDevSelected || isRackSelected;
            const isDimmed = hasSelection && !isHighlighted;
            const color = m.row.status === 'fault' ? '#d35352' : D.serviceColor(state, m.row.service);
            const ptsAttr = Routing ? Routing.formatSvgPoints(points) : points.map(p => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`).join(' ');
            const attrs = `data-cable-marker="${esc(m.id)}" data-cable-rack="${esc(targetRack.id)}" points="${ptsAttr}" style="--cable-color:${color}" vector-effect="non-scaling-stroke"`;
            cablePolys.push(`<polyline class="map-cable-halo ${isDimmed ? 'dimmed' : ''}" ${attrs}/><polyline class="map-cable-path ${isHighlighted ? 'highlighted' : ''} ${isDimmed ? 'dimmed' : ''}" ${attrs}/>`);
          }
          cablesLayer.innerHTML = cablePolys.join('');
        }
      }
      const planImg = root.querySelector('.map-canvas > img');
      if (planImg && !planImg.dataset.boundLoad) {
        planImg.dataset.boundLoad = 'true';
        planImg.addEventListener('load', () => { collisionGrid = null; collisionPlanId = null; pathTreeCache.clear(); getCollisionGrid(); draw(); });
      }
      const undoBtn = root.querySelector('[data-map-action="undo"]'), redoBtn = root.querySelector('[data-map-action="redo"]');
      if (undoBtn) undoBtn.disabled = !undoStack.length;
      if (redoBtn) redoBtn.disabled = !redoStack.length;
      const lockBtn = root.querySelector('[data-map-action="lock-toggle"]');
      if (lockBtn) { lockBtn.setAttribute('aria-pressed', String(!!view.locked)); lockBtn.innerHTML = svg(view.locked ? 'lock' : 'unlock'); lockBtn.title = esc(tr(view.locked ? 'Ապակողպել դաշտը' : 'Կողպել դաշտը (Lock)')); lockBtn.setAttribute('aria-label', lockBtn.title); }
      const cablesBtn = root.querySelector('[data-map-action="cables-toggle"]');
      if (cablesBtn) { cablesBtn.setAttribute('aria-pressed', String(!!view.showCables)); cablesBtn.title = esc(tr(view.showCables ? 'Թաքցնել միացումները' : 'Ցուցադրել միացումները')); cablesBtn.setAttribute('aria-label', cablesBtn.title); }
      const selected = byId.get(view.portId);
      root.querySelector('[data-map-hint]').textContent = view.locked ? tr('Քարտեզը կողպված է') : view.placingRackId ? tr('Սեղմեք հատակագծի վրա՝ ռաքը տեղադրելու համար։') : view.placing && selected ? tr('Սեղմեք հատակագծի վրա՝ սարքը տեղադրելու համար։') : view.selectedMarkerIds.size > 1 ? tr('Քաշեք նշաններից որևէ մեկը կամ օգտագործեք սլաքները՝ բոլոր ընտրված սարքերը միասին տեղափոխելու համար։') : tr('Անիվ՝ խոշորացում · Space + քաշել՝ տեղաշարժում');
      mapFilters?.querySelectorAll('[data-map-filter]').forEach(b => { const f = b.dataset.mapFilter; if (f === 'clear') { b.hidden = (view.filter === 'all' && !search); return; } b.setAttribute('aria-pressed', String(view.filter === f)); const count = b.querySelector('small'); if (count) count.textContent = String(f === 'all' ? mapData.markers.length : mapData.markers.filter(m => m.row.service === f).length); });
      const unplacedCountEl = root.querySelector('[data-unplaced-count]');
      if (unplacedCountEl) unplacedCountEl.textContent = String(mapData.devices.filter(r => !placedSet.has(r.p.id)).length);
      const floorRacksCountEl = root.querySelector('[data-floor-racks-count]');
      const allRacksList = state.floors.flatMap(f => (f.racks || []));
      const curFloor = state.floors.find(f => f.id === plan?.floorId);
      const curFloorRacks = curFloor ? (allRacksList.filter(r => (curFloor.racks || []).some(x => x.id === r.id) || (curFloor.linkedRackIds || []).includes(r.id))) : allRacksList;
      const placedRackIds = allPlacedRacks();
      const unplacedRacks = curFloorRacks.filter(r => !placedRackIds.has(r.id));
      const sidebarTabs = root.querySelector('.map-sidebar-tabs');
      if (sidebarTabs) sidebarTabs.hidden = unplacedRacks.length === 0;
      if (unplacedRacks.length === 0 && view.activeTab === 'racks') {
        view.activeTab = 'devices';
      }
      const racksTabBtn = root.querySelector('[data-map-tab="racks"]');
      if (racksTabBtn) racksTabBtn.hidden = unplacedRacks.length === 0;
      if (floorRacksCountEl) floorRacksCountEl.textContent = String(unplacedRacks.length);
      root.querySelectorAll('[data-map-tab]').forEach(b => {
        const active = b.dataset.mapTab === view.activeTab;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      const searchField = root.querySelector('.map-picker-body .field');
      if (searchField) searchField.hidden = view.activeTab === 'racks';
      const hintEl = root.querySelector('[data-tab-hint]');
      if (hintEl) hintEl.textContent = view.activeTab === 'racks' ? tr('Ընտրեք ռաքը և սեղմեք հատակագծի վրա՝ այն տեղադրելու համար։') : tr('Ընտրեք սարքը և սեղմեք հատակագծի վրա։');
      const addCount = root.querySelector('.map-add-devices small'); if (addCount) addCount.textContent = String(mapData.devices.filter(r => !placedSet.has(r.p.id)).length);
      const portList = root.querySelector('.map-port-list');
      if (view.activeTab === 'racks') {
        portList.innerHTML = (!h.readOnly ? `<button type="button" class="button primary map-btn-add-new-device" data-map-action="create-map-rack">${svg('plus')}<span>${esc(tr('Ավելացնել ռաք'))}</span></button>` : '') + `<div class="map-rack-list">${unplacedRacks.map(r => {
          const devCount = mapData.devices.filter(d => d.r.id === r.id).length;
          const isPlacingThis = view.placingRackId === r.id;
          return `<div class="map-rack-card ${isPlacingThis ? 'selected' : ''}" ${!h.readOnly ? `data-map-place-rack="${esc(r.id)}" role="button" tabindex="0"` : ''}><div class="map-rack-card-info"><strong>${esc(r.name)}</strong><small>${r.u || r.height || 42}U · ${devCount} ${esc(tr('սարք'))}</small></div>${!h.readOnly ? `<button type="button" class="button primary small ${isPlacingThis ? 'active' : ''}" data-map-place-rack="${esc(r.id)}">${svg('plus')}<span>${esc(tr(isPlacingThis ? 'Տեղադրվում է…' : 'Տեղադրել'))}</span></button>` : ''}</div>`;
        }).join('') || `<p class="hint map-list-empty">${esc(tr('Այս հարկում ռաքեր չկան'))}</p>`}</div>`;
      } else {
        const matches = r => !!r.service && visibleService(r.service) && (!search || [name(r), r.d?.model, r.endpointName, D.serviceLabel(state, r.service, tr), r.floor, r.rack, r.device, r.port, r.cable, r.room, r.vlan, r.connection, r.switchName].filter(Boolean).join(' ').toLocaleLowerCase().includes(search));
        const groups = new Map(); for (const row of mapData.devices.filter(r => matches(r) && !placedSet.has(r.p.id))) { if (!groups.has(row.service)) groups.set(row.service, []); groups.get(row.service).push(row); }
        for (const group of portList.querySelectorAll('.map-device-group')) { if (group.open) collapsedDeviceGroups.delete(group.dataset.service); else collapsedDeviceGroups.add(group.dataset.service); }
        for (const card of portList.querySelectorAll('.map-port-card')) { if (card.open) expandedDeviceCards.add(card.dataset.deviceCard); else expandedDeviceCards.delete(card.dataset.deviceCard); }
        saveCollapsedGroups();
        portList.innerHTML = (!h.readOnly ? `<button type="button" class="button primary map-btn-add-new-device" data-map-action="create-map-device">${svg('plus')}<span>${esc(tr('Ստեղծել նոր սարք'))}</span></button>` : '') + ([...groups].map(([service, items]) => `<details class="map-device-group" data-service="${esc(service)}" ${collapsedDeviceGroups.has(service) ? '' : 'open'}><summary>${icon(service)}${esc(D.serviceLabel(state, service, tr))}<span>${items.length}</span></summary><div class="map-device-items">${items.map(r => `<details class="map-port-card ${r.p.id === view.portId ? 'selected' : ''}" data-device-card="${esc(r.p.id)}" ${expandedDeviceCards.has(r.p.id) ? 'open' : ''}><summary><span class="map-card-icon" style="color:${D.serviceColor(state, r.service)}">${icon(r.service)}</span><span><b>${esc(name(r))}</b><small>${esc(D.serviceLabel(state, r.service, tr) + ' · ' + r.port)}</small></span><span class="map-card-chevron" aria-hidden="true"></span></summary><div class="map-port-card-details"><span><small>${esc([r.cable, r.destination || r.floor].filter(Boolean).join(' · ') || connectionLabel(r))}</small><small>${esc(connectionLabel(r))}</small></span><button type="button" class="map-card-add" data-map-port="${esc(r.p.id)}" title="${esc(tr('Ավելացնել սարք'))}" aria-label="${esc(tr('Ավելացնել սարք') + ' · ' + name(r))}">${svg('plus')}</button></div></details>`).join('')}</div></details>`).join('') || `<p class="hint map-list-empty">${esc(tr(mapData.devices.length ? 'Բոլոր համապատասխան սարքերն արդեն տեղադրված են կամ չեն համապատասխանում որոնմանը։' : 'Զբաղված միացումներ չկան։ Սարքի տեսակը նշեք պորտի նշանակության դաշտում։'))}</p>`);
      }
      root.querySelector('.map-viewport').dataset.tool = (view.placing || view.placingRackId) ? 'place' : view.tool; drawInspector(); scheduleLabels();
    }

    function createDeviceModal(preset = {}) {
      if (h.readOnly) return;
      const curState = getState(), allRacks = curState.floors.flatMap(f => f.racks.map(r => ({ f, r })));
      const currentFloor = curState.floors.find(f => f.id === plan?.floorId);
      const floorRackIds = new Set([...(currentFloor?.racks || []).map(r => r.id), ...(currentFloor?.linkedRackIds || [])]);
      const currentFloorRacks = allRacks.filter(x => !plan?.floorId || floorRackIds.has(x.r.id));
      const targetRacks = currentFloorRacks.length ? currentFloorRacks : allRacks;
      const panelDevices = D.devices(curState).filter(x => (!plan?.floorId || floorRackIds.has(x.r.id)) && (x.d.type === 'panel' || x.d.type === 'switch'));
      const defaultType = preset.service || 'wifi';
      const defaultName = preset.endpointName || (D.serviceLabel(curState, defaultType, tr) + ' ' + (mapData.markers.filter(m => m.row.service === defaultType).length + 1));
      const knownModels = [...new Set(D.devices(curState).map(x => x.d.model).filter(Boolean))];
      const panelOptions = [];
      if (panelDevices.length) {
        for (const dev of panelDevices) {
          const freeCount = dev.d.portList.filter(p => p.status === 'free').length;
          panelOptions.push([dev.d.id, `${dev.f.name} / ${dev.r.name} / ${dev.d.name} (${freeCount} ${tr('ազատ')})`]);
        }
      }
      panelOptions.push(['new', tr('＋ Ստեղծել նոր սարք ռաքում')]);
      modal(tr('Ստեղծել նոր սարք'), `<div class="form-grid">
        ${select('deviceService', tr('Սարքի տեսակ'), D.serviceEntries(curState).filter(([k]) => k).map(([k]) => [k, D.serviceLabel(curState, k, tr)]), defaultType)}
        ${input('endpointName', tr('Սարքի անվանում'), defaultName, 'text', 'required maxlength="200" placeholder="WiFi AP-01"')}
        ${input('deviceModel', tr('Սարքի մոդել'), preset.model || '', 'text', 'maxlength="200" list="knownMapModels" placeholder="UniFi / MikroTik / Hikvision"')}
        ${select('targetPanelId', tr('Միացման սարք / պանել'), panelOptions, panelOptions[0]?.[0] || 'new')}
        ${select('hardwareType', tr('Ռաքի սարքի տեսակ'), D.deviceTypes(curState), 'panel')}
        ${input('hardwarePorts', tr('Հիմնական պորտերի քանակ'), 24, 'number', 'required min="0" max="96" step="1"')}
        ${input('hardwareHeight', tr('Բարձրություն U'), 1, 'number', 'required min="1" max="60" step="1"')}
        ${input('hardwareSfp', tr('Օպտիկական SFP պորտեր'), 0, 'number', 'required min="0" max="32" step="1"')}
        ${select('hardwarePoe', tr('Սվիչի մոդելի տեսակ'), [['none', tr('Առանց PoE')], ['poe', 'PoE'], ['poe-plus', 'PoE+']], 'none')}
        <div class="field full model-save-option"><label><input type="checkbox" name="saveHardwareModel"> ${tr('Պահպանել այս մոդելը իմ կատալոգում')}</label><p class="hint">${tr('Մոդելը չկա՞ ցանկում։ Գրեք ձեր մոդելը և ընտրեք պորտերը։ Ձեռքով փոխած արժեքները պահպանվում են։')}</p></div>
        ${select('targetRackId', tr('Ռաք (եթե ստեղծվում է նոր պանել)'), targetRacks.map(({ r, f }) => [r.id, `${f.name} / ${r.name}`]), targetRacks[0]?.r.id || '')}
        ${input('room', tr('Սենյակ'), preset.room || '', 'text', 'maxlength="200"')}
        ${input('cable', tr('Մալուխի համար'), preset.cable || '', 'text', 'maxlength="200"')}
        ${input('vlan', 'VLAN', preset.vlan || '', 'number', 'min="1" max="4094" step="1"')}
      </div><datalist id="knownMapModels">${knownModels.map(m => `<option value="${esc(m)}"></option>`).join('')}</datalist><p class="hint">${esc(tr('Պահպանելուց հետո սեղմեք հատակագծի վրա՝ սարքի նշանը տեղադրելու համար։'))}</p>`, fd => {
        const service = String(fd.get('deviceService') || 'wifi');
        const endpointName = String(fd.get('endpointName') || '').trim();
        const model = String(fd.get('deviceModel') || '').trim();
        const targetPanelId = String(fd.get('targetPanelId') || '');
        const targetRackId = String(fd.get('targetRackId') || '');
        const room = String(fd.get('room') || '').trim();
        const cable = String(fd.get('cable') || '').trim();
        const vlan = String(fd.get('vlan') || '').trim();
        if (!endpointName) throw new Error(tr('Անվանումը պարտադիր է'));
        let createdPortId = '';
        change(s => {
          let targetDev = null;
          if (targetPanelId !== 'new') targetDev = D.devices(s).find(x => x.d.id === targetPanelId)?.d;
          if (targetPanelId !== 'new' && !targetDev) throw new Error(tr('Սարքը չի գտնվել'));
          if (!targetDev) {
            const rack = s.floors.flatMap(f => f.racks).find(r => r.id === targetRackId) || s.floors[0]?.racks[0];
            if (!rack) throw new Error(tr('Ռաքը չի գտնվել'));
            const type = String(fd.get('hardwareType')), ports = Number(fd.get('hardwarePorts')), height = Number(fd.get('hardwareHeight')), sfpCount = D.isNetworkDevice({ type }) ? Number(fd.get('hardwareSfp')) : 0;
            if (!Number.isInteger(ports) || ports < 0 || !Number.isInteger(sfpCount) || sfpCount < 0 || sfpCount > 32 || ports + sfpCount < 1 || ports + sfpCount > 96) throw new Error(tr('Պորտերի ընդհանուր քանակը պետք է լինի 1–96'));
            if (!Number.isInteger(height) || height < 1 || height > rack.u) throw new Error(tr('Սարքը դուրս է գալիս ռաքի սահմաններից'));
            const panelName = D.nextDeviceName(type, s);
            const nextPos = Array.from({ length: rack.u }, (_, i) => rack.u - i).find(u => u + height - 1 <= rack.u && !rack.devices.some(d => u < d.pos + d.height && u + height > d.pos));
            if (!nextPos) throw new Error(tr('Ընտրված ռաքում բավարար ազատ տեղ չկա'));
            const devIndex = rack.devices.filter(x => x.type === type).length;
            targetDev = { id: crypto.randomUUID(), name: panelName, type, model, pos: nextPos, height, sfpCount, modelType: type === 'switch' ? String(fd.get('hardwarePoe')) : '', color: D.autoDeviceColor(type, devIndex), portList: Array.from({ length: ports + sfpCount }, (_, i) => D.port(i + 1, crypto.randomUUID())) };
            rack.devices.push(targetDev);
            if (fd.get('saveHardwareModel')) D.saveDeviceModel(s, { type, name: model, ports, height, sfp: sfpCount, modelType: targetDev.modelType });
          }
          let port = targetDev.portList.find(p => p.status === 'free');
          if (!port) {
            if (targetDev.portList.length >= 96) throw new Error(tr('Պորտերի առավելագույն քանակը 96 է'));
            port = { ...D.port(targetDev.portList.length + 1, crypto.randomUUID()) };
            targetDev.portList.push(port);
          }
          port.endpointName = endpointName;
          port.service = service;
          port.status = 'used';
          if (plan?.floorId) port.floorId = plan.floorId;
          port.room = room;
          port.cable = cable;
          port.vlan = vlan;
          createdPortId = port.id;
        });
        if (createdPortId) {
          view.portId = createdPortId;
          view.selectedMarkerIds.clear();
          view.placing = true;
          setTool('select');
          draw();
          toast(tr('Սարքը ստեղծված է։ Սեղմեք հատակագծի վրա՝ այն տեղադրելու համար։'));
          viewport?.focus({ preventScroll: true });
        }
      });
      const form = document.querySelector('#modalForm'), field = name => form.elements[name];
      let appliedModel = '';
      const syncHardware = () => {
        const creating = field('targetPanelId').value === 'new', type = field('hardwareType').value;
        for (const name of ['hardwareType', 'deviceModel', 'hardwarePorts', 'hardwareHeight', 'hardwareSfp', 'hardwarePoe', 'targetRackId', 'saveHardwareModel']) { const visible = creating && (name !== 'hardwareSfp' || D.isNetworkDevice({ type })) && (name !== 'hardwarePoe' || type === 'switch'); field(name).closest('.field').hidden = !visible; field(name).disabled = !visible; }
        field('hardwarePorts').min = D.isNetworkDevice({ type }) ? '0' : '1';
        form.querySelector('#knownMapModels').innerHTML = D.searchDeviceModels(type, '', curState).map(m => `<option value="${esc(m.name)}"></option>`).join('');
      };
      const fillModel = () => { const key = field('hardwareType').value + '|' + field('deviceModel').value.trim().toLowerCase(); if (key === appliedModel) return; appliedModel = key; const model = D.modelDefaults(field('hardwareType').value, field('deviceModel').value, curState); if (!model) return; field('hardwarePorts').value = model.ports; field('hardwareHeight').value = model.height; field('hardwareSfp').value = model.sfpCount; field('hardwarePoe').value = model.modelType || 'none'; };
      field('targetPanelId').onchange = syncHardware; field('hardwareType').onchange = () => { syncHardware(); fillModel(); }; field('deviceModel').oninput = fillModel; field('deviceModel').onchange = fillModel; syncHardware();
    }
    function cloneDeviceFromSelected() {
      const row = byId.get(view.portId); if (!row) return;
      let nextName = name(row);
      const match = nextName.match(/^(.*?)(\d+)$/);
      if (match) { const num = parseInt(match[2], 10) + 1; nextName = match[1] + String(num).padStart(match[2].length, '0'); }
      else nextName += ' 2';
      createDeviceModal({ service: row.service, model: row.d?.model || '', endpointName: nextName, room: row.room || '', cable: '', vlan: row.vlan || '' });
    }

    function upload(replacing = false) {
      const targetId = replacing ? plan.id : null, floors = [['', tr('Չնշել')], ...getState().floors.map(f => [f.id, f.name])];
      const draftFloors = [];
      const addFloorControls = key => `<div class="map-import-floor-actions"><button type="button" class="button" data-add-import-floor="${key}">＋ ${esc(tr('Ավելացնել հարկ'))}</button><div data-new-floor="${key}" hidden>${input('newFloor' + key, tr('Հարկի անվանում'), '', 'text', 'maxlength="200"')}<button type="button" class="button" data-save-import-floor="${key}">${esc(tr('Ավելացնել'))}</button><p class="hint" data-floor-error role="status"></p></div></div>`;
      let pages = 1, loading = false, fileError = '', generation = 0, currentPage = 1; const pageImages = new Map();
      modal(tr(replacing ? 'Խմբագրել հատակագիծը' : 'Բեռնել հատակագիծ'), `<div class="form-grid">${input('planName', tr('Անվանում'), replacing ? plan.name : '', 'text', 'required maxlength="200"')}${select('planFloor', tr('Հարկ'), floors, replacing ? plan.floorId : '')}<label class="field">${esc(tr(replacing ? 'Փոխարինել ֆայլը' : 'Հատակագծի ֆայլ'))}<input name="planFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" ${replacing ? '' : 'required'}></label>${replacing ? input('pdfPage', tr('PDF էջ'), 1, 'number', 'required min="1" max="1"') : ''}</div><p class="hint">${esc(tr(replacing ? 'Ֆայլը փոխարինելիս նշաններն ու կապերը պահպանվում են։ Նոր գծագրի վրա ստուգեք դրանց դիրքերը։' : 'Ընտրեք մեկ PDF և յուրաքանչյուր էջին նշանակեք հարկ։ Ավելորդ էջերը կարող եք բաց թողնել։'))}</p><p class="hint" data-plan-loading role="status" hidden>${esc(tr('Ֆայլը մշակվում է…'))}</p><div class="map-import-pages" data-plan-pages></div>`, async fd => {
        if (loading) throw new Error(tr('Ֆայլը մշակվում է…')); if (fileError) throw new Error(fileError);
        const file = fd.get('planFile'), hasFile = file?.size > 0, name = String(fd.get('planName')).trim(), floorId = String(fd.get('planFloor'));
        const additions = []; let replacement;
        if (replacing && pages === 1) { if (hasFile) replacement = await readPlan(file, 1, tr); }
        else {
          if (!hasFile) throw new Error(tr('Ընտրեք PNG, JPEG, WebP կամ PDF'));
          let projectedSize = new Blob([JSON.stringify(getState())]).size;
          for (let page = 1; page <= pages; page++) {
            const floor = pages > 1 ? String(fd.get('pageFloor' + page)) : floorId; if (floor === '__skip') continue;
            if (floor === '__choose') throw new Error(tr('Յուրաքանչյուր էջի համար ընտրեք հարկ կամ բաց թողեք էջը։'));
            const image = pageImages.get(page) || await readPlan(file, page, tr), pageName = pages > 1 ? String(fd.get('pageName' + page)).trim() : name;
            if (!pageName) throw new Error(tr('Անվանում'));
            const replacesTarget = replacing && Number(fd.get('replacementPage')) === page;
            const entry = { id: replacesTarget ? targetId : crypto.randomUUID(), name: pageName, floorId: floor, ...image, ...(replacesTarget ? {} : { markers: [] }) };
            if (replacesTarget) { const old = getState().floorPlans.find(p => p.id === targetId); projectedSize -= new Blob([JSON.stringify(old)]).size; projectedSize += new Blob([JSON.stringify(old?.markers || [])]).size; }
            projectedSize += new Blob([JSON.stringify(entry)]).size;
            if (projectedSize > h.maxBytes - 16384) throw new Error(tr('Հատակագիծը չի տեղավորվում բազայում։ Փոքրացրեք ֆայլը։'));
            additions.push(entry);
          }
          if (!additions.length) throw new Error(tr('Ընտրեք առնվազն մեկ էջ'));
        }
        change(s => {
          const neededFloors = new Set(replacing && pages === 1 ? [floorId] : additions.map(p => p.floorId));
          for (const floor of draftFloors) if (neededFloors.has(floor.id)) s.floors.push(floor);
          if (replacing && pages === 1) { const target = s.floorPlans.find(p => p.id === targetId); if (!target) throw new Error(tr('Չի գտնվել')); if (replacement) delete target.calibration; Object.assign(target, { name, floorId }, replacement || {}); }
          else { s.floorPlans ||= []; for (const entry of additions) { if (entry.id === targetId) { const target = s.floorPlans.find(p => p.id === targetId); if (!target) throw new Error(tr('Չի գտնվել')); delete target.calibration; Object.assign(target, entry); } else s.floorPlans.push(entry); } }
          if (new Blob([JSON.stringify(s)]).size > h.maxBytes - 16384) throw new Error(tr('Հատակագիծը չի տեղավորվում բազայում։ Փոքրացրեք ֆայլը։'));
          view.planId = replacing && pages === 1 ? targetId : additions[0].id; view.camera = null; view.zoom = 1;
        });
      });
      const form = document.querySelector('#modalForm'), field = form.elements.planFile, status = form.querySelector('[data-plan-loading]'), list = form.querySelector('[data-plan-pages]');
      form.elements.planFloor.closest('.field').insertAdjacentHTML('beforeend', addFloorControls('base'));
      // A multi-page file always uses the page-by-page picker, including replacement.
      form.elements.pdfPage?.closest('.field').remove();
      const submit = form.querySelector('[type=submit]');
      form.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.name?.startsWith('newFloor')) { e.preventDefault(); e.target.closest('[data-new-floor]').querySelector('[data-save-import-floor]').click(); } });
      form.addEventListener('click', e => {
        const add = e.target.closest('[data-add-import-floor]'), saveFloor = e.target.closest('[data-save-import-floor]');
        if (add) { const key = add.dataset.addImportFloor, box = form.querySelector(`[data-new-floor="${key}"]`); box.hidden = !box.hidden; if (!box.hidden) form.elements['newFloor' + key].focus(); }
        if (saveFloor) {
          const key = saveFloor.dataset.saveImportFloor, box = form.querySelector(`[data-new-floor="${key}"]`), name = form.elements['newFloor' + key].value.trim(), error = box.querySelector('[data-floor-error]');
          const existing = [...getState().floors, ...draftFloors];
          if (!name) { error.textContent = tr('Հարկի անվանում'); return; }
          if (existing.some(f => f.name.normalize('NFKC').toLocaleLowerCase() === name.normalize('NFKC').toLocaleLowerCase())) { error.textContent = tr('Այդ անունով հարկ արդեն կա'); return; }
          if (existing.length >= 200) { error.textContent = tr('Հարկերի առավելագույն քանակը 200 է'); return; }
          const floor = { id: crypto.randomUUID(), name, racks: [] }; draftFloors.push(floor); floors.push([floor.id, name]);
          form.querySelectorAll('select[name=planFloor],select[name^=pageFloor]').forEach(el => el.add(new Option(name, floor.id)));
          form.elements[key === 'base' ? 'planFloor' : 'pageFloor' + key].value = floor.id; box.hidden = true; error.textContent = ''; form.elements['newFloor' + key].value = '';
        }
      });
      async function showPage(number) {
        currentPage = number; const token = generation;
        list.querySelectorAll('[data-import-page]').forEach(el => { el.hidden = Number(el.dataset.importPage) !== number; });
        submit.hidden = number < pages;
        const card = list.querySelector(`[data-import-page="${number}"]`); if (!card) return;
        const preview = card.querySelector('img'), hint = card.querySelector('[data-preview-status]');
        try { const image = pageImages.get(number) || await readPlan(field.files[0], number, tr); if (token !== generation || !form.isConnected) return; pageImages.set(number, image); preview.src = image.image; preview.hidden = false; hint.hidden = true; }
        catch (error) { if (token === generation && form.isConnected) { hint.textContent = error.message; } }
      }
      function advance() { const choice = form.elements['pageFloor' + currentPage], name = form.elements['pageName' + currentPage]; if (choice.value === '__choose' || (choice.value !== '__skip' && !name.value.trim())) { const box = form.querySelector('#formError'); box.textContent = tr('Յուրաքանչյուր էջի համար ընտրեք հարկ կամ բաց թողեք էջը։'); box.hidden = false; choice.focus(); return; } form.querySelector('#formError').hidden = true; void showPage(Math.min(pages, currentPage + 1)); }
      list.addEventListener('click', e => { if (e.target.closest('[data-page-next]')) advance(); if (e.target.closest('[data-page-back]')) void showPage(Math.max(1, currentPage - 1)); });
      form.addEventListener('submit', e => { if (pages > 1 && currentPage < pages) { e.preventDefault(); e.stopImmediatePropagation(); advance(); } }, { capture: true });
      field.addEventListener('change', async () => {
        const token = ++generation, file = field.files[0]; pages = 1; currentPage = 1; pageImages.clear(); submit.hidden = false; fileError = ''; field.setCustomValidity(''); list.innerHTML = '';
        form.elements.planName.closest('.field').hidden = false; form.elements.planFloor.closest('.field').hidden = false;
        loading = !!file; status.hidden = !loading; form.querySelector('[type=submit]').disabled = loading; form.querySelector('#formError').hidden = true;
        if (!file) return;
        try {
          const count = await planPageCount(file, tr); if (token !== generation || !form.isConnected) return; pages = count;
          if (pages > 1) { form.elements.planName.closest('.field').hidden = true; form.elements.planFloor.closest('.field').hidden = true; }
          if (!form.elements.planName.value.trim()) form.elements.planName.value = file.name.replace(/\.[^.]+$/, '').slice(0, 180);
          if (pages > 1) { list.innerHTML = `<h3>${esc(tr('Էջերի հարկերը'))}</h3>${replacing ? `<p class="hint">${esc(tr('Ընտրեք՝ որ էջով փոխարինել գործող հատակագիծը։ Մյուս ընտրված էջերը կավելացվեն որպես նոր հատակագծեր։'))}</p>` : ''}` + Array.from({ length: pages }, (_, i) => { const page = i + 1; return `<section class="map-import-page" data-import-page="${page}" ${page === 1 ? '' : 'hidden'}><strong>${esc(tr('PDF էջ'))} ${page} / ${pages}</strong><p data-preview-status class="hint" role="status">${esc(tr('Ֆայլը մշակվում է…'))}</p><img class="map-import-preview" alt="${esc(tr('PDF էջ'))} ${page}" hidden><div class="form-grid">${input('pageName' + page, tr('Անվանում'), replacing && page === 1 ? plan.name : form.elements.planName.value.slice(0, 180) + ' · ' + page, 'text', 'maxlength="200"')}<div>${select('pageFloor' + page, tr('Այս էջը ո՞ր հարկին է պատկանում'), [['__choose', tr('Ընտրեք հարկը կամ բաց թողեք')], ...floors.filter(([id]) => id), ['__skip', tr('Բաց թողնել էջը')]], '__choose')}${addFloorControls(page)}</div></div>${replacing ? `<label class="map-import-replace"><input type="radio" name="replacementPage" value="${page}" ${page === 1 ? 'checked' : ''}>${esc(tr('Այս էջով փոխարինել գործող հատակագիծը'))}</label>` : ''}<div class="actions">${page > 1 ? `<button type="button" class="button" data-page-back>${esc(tr('Նախորդ էջը'))}</button>` : ''}${page < pages ? `<button type="button" class="button primary" data-page-next>${esc(tr('Հաջորդ էջը'))}</button>` : ''}</div></section>`; }).join(''); void showPage(1); }
        } catch (error) { if (token !== generation || !form.isConnected) return; fileError = error.message; field.setCustomValidity(fileError); const box = form.querySelector('#formError'); box.hidden = false; box.textContent = fileError; }
        finally { if (token === generation && form.isConnected) { loading = false; status.hidden = true; form.querySelector('[type=submit]').disabled = false; } }
      });
    }
    async function manageShares() {
      if (!h.canShare) throw new Error(tr('Հղումով կիսվելու համար բացեք նախագիծը կայքի cloud-ից'));
      const links = await h.api('/api/shares');
      modal(tr('Իմ հղումները'), `<p class="hint">${esc(tr('Հղումն ունեցողը կարող է դիտել և ներբեռնել միայն ընտրված PDF պատճենը։ Բազան խմբագրել հնարավոր չէ։ Հետագա փոփոխությունները չեն փոխում այս պատճենը։'))}</p><div class="map-share-list">${links.length ? links.map(link => `<section class="map-share-item"><strong>${esc(link.title)}</strong><small>${esc(tr('Գործում է մինչև'))}: ${esc(new Date(link.expiresAt).toLocaleDateString())}</small><input readonly aria-label="${esc(tr('Դիտման հղում'))}" value="${esc(new URL('/share.html#' + link.token, location.origin).href)}"><div class="actions"><button type="button" class="button" data-share-copy>${esc(tr('Պատճենել հղումը'))}</button><a class="button" href="/share.html#${esc(link.token)}" target="_blank" rel="noopener noreferrer">${esc(tr('Բացել'))}</a><button type="button" class="button danger" data-share-revoke="${esc(link.token)}">${esc(tr('Անջատել հղումը'))}</button></div></section>`).join('') : `<p>${esc(tr('Ակտիվ հղումներ չկան'))}</p>`}</div>`, null);
      document.querySelector('.map-share-list').addEventListener('click', async e => {
        const copy = e.target.closest('[data-share-copy]'), revoke = e.target.closest('[data-share-revoke]');
        if (copy) { const field = copy.closest('.map-share-item').querySelector('input'); try { await navigator.clipboard.writeText(field.value); toast(tr('Հղումը պատճենված է')); } catch { field.focus(); field.select(); } return; }
        if (revoke) { revoke.disabled = true; try { await h.api('/api/shares/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: revoke.dataset.shareRevoke }) }); await manageShares(); } catch (err) { toast(err.message); revoke.disabled = false; } }
      });
    }
    function exportCurrent(kind, sharing = false) {
      if (sharing && !h.canShare) throw new Error(tr('Հղումով կիսվելու համար բացեք նախագիծը կայքի cloud-ից'));
      const current = getState(), defaultFloor = plan?.floorId || '', language = globalThis.RackI18n?.language || 'hy';
      let previewBlob = null, previewName = 'MyPatch-map.pdf';
      // Build preview summary HTML of what will be included
      function buildPreview(floorId, deviceType, deviceId, planId, outputKind, rackId = '') {
        const snap = getState();
        const sel = RackHandover.select(snap, { floorId, rackId, deviceType, deviceId, planId });
        const planCount = sel.plans.length, devCount = sel.devices.length;
        if ((outputKind === 'maps' && !planCount) || (outputKind === 'devices' && !devCount) || (outputKind === 'all' && !planCount && !devCount)) return `<p class="hint map-pdf-empty">${esc(tr('Ընտրված պայմաններով տվյալներ չկան'))}</p>`;
        let html = '<div class="map-pdf-preview">';
        if (outputKind !== 'devices' && planCount) {
          const totalMarkers = sel.plans.reduce((s, p) => s + p.selectedMarkers.length, 0);
          html += `<div class="map-pdf-section"><strong>${esc(tr('Քարտեզ'))}</strong><span>${planCount} ${esc(tr('հատակ.'))} · ${totalMarkers} ${esc(tr('սարք'))}</span></div>`;
          for (const p of sel.plans) {
            const groups = new Map(); for (const m of p.selectedMarkers) { const k = D.serviceLabel(snap, m.row.service, tr) || tr('Չնշված'); groups.set(k, (groups.get(k) || 0) + 1); }
            html += `<div class="map-pdf-plan"><em>${esc(p.name)}</em><span>${[...groups.entries()].map(([k, n]) => esc(k) + ': ' + n).join(' · ') || esc(tr('Դատարկ'))}</span></div>`;
          }
        }
        if (outputKind !== 'maps' && devCount) {
          html += `<div class="map-pdf-section"><strong>${esc(tr('Սարքերի սխեմաներ'))}</strong><span>${devCount} ${esc(tr('սարք'))}</span></div>`;
        }
        html += '</div>';
        return html;
      }
      modal(tr(sharing ? 'Կիսվել հղումով' : 'PDF արտահանում'), `<div class="form-grid">${select('pdfLanguage', tr('PDF լեզու'), [['hy', 'Հայերեն'], ['en', 'English'], ['ru', 'Русский']], language)}${select('pdfKind', tr('Բովանդակություն'), [['maps', tr('Քարտեզ')], ['devices', tr('Սարքերի սխեմաներ')], ['all', tr('Քարտեզ և սարքերի սխեմաներ')]], kind)}${select('pdfMapSize', tr('Քարտեզի էջի չափ'), [['auto', tr('Ավտոմատ՝ A4 / A3')], ['A4', 'A4'], ['A3', 'A3']], 'auto')}${select('pdfFloor', tr('Հարկ'), [['', tr('Բոլոր հարկերը')], ...current.floors.map(f => [f.id, f.name])], defaultFloor)}${select('pdfRack', tr('Ռաք'), [], '')}${select('pdfType', tr('Սարքի տեսակ'), [['all', tr('Բոլոր սարքերը')], ...D.deviceTypes(current)], 'all')}${select('pdfDevice', tr('Սարք'), [], '')}${select('pdfPlan', tr('Տարածք / հատակագիծ'), [], '')}${!sharing ? select('pdfDetailed', tr('PDF ձևաչափ'), [['compact', tr('Հակիրճ սխեմա')], ['detailed', tr('Սխեմա և մանրամասն ցանկեր')]], 'compact') : ''}${!sharing ? `<div class="field full"><label for="pdfImageOpacity">${esc(tr('Հատ. ֆոնի մաղձոտ.'))}</label><input id="pdfImageOpacity" name="pdfImageOpacity" type="range" min="0" max="90" step="10" value="${view.imageOpacity}" style="width:100%;accent-color:#137f79"></div>` : ''}${sharing ? select('shareDays', tr('Հղման ժամկետ'), [[7, tr('7 օր')], [30, tr('30 օր')], [90, tr('90 օր')]], 30) : ''}</div>${sharing ? `<p class="hint">${esc(tr('Հղումն ունեցողը կարող է դիտել և ներբեռնել միայն ընտրված PDF պատճենը։ Բազան խմբագրել հնարավոր չէ։ Հետագա փոփոխությունները չեն փոխում այս պատճենը։'))}</p>` : ''}<label class="check pdf-attribution-option"><input type="checkbox" name="showItSpecialist"><span>${esc(tr('Ցուցադրել ՏՏ մասնագետին'))}<small>ՏՏ Սիփան Դանիելյան</small></span></label><p class="hint">${esc(tr('Արտահանումը ներառում է միայն ընտրված հարկը, տարածքը, ռաքը և սարքերը։'))}</p><div data-pdf-preview>${buildPreview(defaultFloor, 'all', '', '', kind)}</div>${!sharing ? `<section class="map-pdf-proof" data-pdf-proof aria-busy="true"><p role="status" data-pdf-proof-status>${esc(tr('Բեռնվում է…'))}</p><div class="map-pdf-proof-tools"><button type="button" class="button small" data-pdf-prev disabled>←</button><output data-pdf-page>—</output><button type="button" class="button small" data-pdf-next disabled>→</button><button type="button" class="button small" data-pdf-retry>${esc(tr('Թարմացնել նախադիտումը'))}</button></div><div class="map-pdf-proof-page"><canvas data-pdf-canvas hidden></canvas></div></section>` : ''}`, async fd => {
        if (!sharing) {
          if (!previewBlob) throw new Error(tr('Նախ սպասեք PDF նախադիտմանը'));
          download(previewBlob, previewName); toast(tr('Հաշվետվությունը պատրաստ է')); return;
        }
        const outputKind = String(fd.get('pdfKind')), floorId = String(fd.get('pdfFloor')), rackId = String(fd.get('pdfRack')), deviceType = String(fd.get('pdfType')), deviceId = String(fd.get('pdfDevice')), planId = String(fd.get('pdfPlan')), snapshot = structuredClone(getState());
        const selection = RackHandover.select(snapshot, { floorId, rackId, deviceType, deviceId, planId });
        if (outputKind === 'maps' ? !selection.plans.length : outputKind === 'devices' ? !selection.devices.length : !selection.plans.length && !selection.devices.length) throw new Error(tr('Ընտրված պայմաններով տվյալներ չկան'));
        if (sharing) {
          if (!await save()) throw new Error(tr('Նախ պահպանեք փոփոխությունները'));
          await h.api('/api/shares', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: outputKind, floorId, rackId, deviceType, deviceId, planId, mapPageSize: String(fd.get('pdfMapSize')), showItSpecialist: fd.has('showItSpecialist'), language: String(fd.get('pdfLanguage')), days: Number(fd.get('shareDays')), revision: h.getRevision() }) });
          setTimeout(() => manageShares().catch(err => toast(err.message)), 0); return;
        }
      });
      const form = document.querySelector('#modalForm');
      const update = (initial = false) => {
        const floorId = form.elements.pdfFloor.value, type = form.elements.pdfType.value;
        const option = (value, name) => `<option value="${esc(value)}">${esc(name)}</option>`;
        const selectedDevice = form.elements.pdfDevice.value;
        const selectedRack = form.elements.pdfRack.value, racks = current.floors.filter(f => !floorId || f.id === floorId).flatMap(f => f.racks.map(r => ({ f, r })));
        form.elements.pdfRack.innerHTML = option('', tr('Բոլոր ռաքերը')) + racks.map(x => option(x.r.id, x.f.name + ' / ' + x.r.name)).join('');
        if (racks.some(x => x.r.id === selectedRack)) form.elements.pdfRack.value = selectedRack;
        const rackId = form.elements.pdfRack.value;
        const devices = D.devices(current).filter(x => (!floorId || x.f.id === floorId) && (!rackId || x.r.id === rackId) && (type === 'all' || x.d.type === type));
        form.elements.pdfDevice.innerHTML = option('', tr('Բոլոր սարքերը')) + devices.map(x => option(x.d.id, x.f.name + ' / ' + x.r.name + ' / ' + x.d.name)).join('');
        if (devices.some(x => x.d.id === selectedDevice)) form.elements.pdfDevice.value = selectedDevice;
        const selectedPlan = initial && kind === 'maps' ? view.planId : form.elements.pdfPlan.value;
        const availablePlans = (current.floorPlans || []).filter(p => !floorId || p.floorId === floorId);
        form.elements.pdfPlan.innerHTML = option('', tr('Բոլոր հատակագծերը')) + availablePlans.map(p => option(p.id, p.name)).join('');
        if (availablePlans.some(p => p.id === selectedPlan)) form.elements.pdfPlan.value = selectedPlan;
        form.elements.pdfPlan.closest('.field').hidden = false;
        form.elements.pdfMapSize.closest('.field').hidden = form.elements.pdfKind.value === 'devices';
        form.elements.pdfMapSize.title = tr('60-ից ավելի սարքի դեպքում քարտեզն ավտոմատ արտահանվում է A3 չափով։');
      };
      function refreshPreview() {
        const previewEl = document.querySelector('[data-pdf-preview]'); if (!previewEl) return;
        previewEl.innerHTML = buildPreview(form.elements.pdfFloor.value, form.elements.pdfType.value, form.elements.pdfDevice.value, form.elements.pdfPlan.value, form.elements.pdfKind.value, form.elements.pdfRack.value);
      }
      update(true); refreshPreview(); form.elements.pdfRack.onchange = () => { form.elements.pdfDevice.value = ''; update(); refreshPreview(); }; form.elements.pdfFloor.onchange = () => { form.elements.pdfRack.value = ''; form.elements.pdfDevice.value = ''; form.elements.pdfPlan.value = ''; update(); refreshPreview(); }; form.elements.pdfType.onchange = () => { form.elements.pdfDevice.value = ''; update(); refreshPreview(); }; form.elements.pdfKind.onchange = () => { update(); refreshPreview(); }; form.elements.pdfDevice?.addEventListener('change', refreshPreview); form.elements.pdfPlan?.addEventListener('change', refreshPreview);
      form.querySelector('button[type="submit"]').textContent = tr(sharing ? 'Ստեղծել հղումը' : 'Ներբեռնել PDF');
      if (!sharing) {
        const dialog = form.closest('dialog'), submit = form.querySelector('[type="submit"]'), proof = form.querySelector('[data-pdf-proof]'), status = proof.querySelector('[data-pdf-proof-status]'), canvas = proof.querySelector('canvas'), previous = proof.querySelector('[data-pdf-prev]'), next = proof.querySelector('[data-pdf-next]'), pageLabel = proof.querySelector('[data-pdf-page]');
        let generation = 0, pageGeneration = 0, timer, task, doc, renderTask, pageNumber = 1, closed = false;
        dialog.classList.add('map-pdf-dialog');
        async function clearDocument() {
          pageGeneration++; renderTask?.cancel(); renderTask = null; doc = null;
          const old = task; task = null; if (old) await old.destroy();
        }
        async function renderPage() {
          if (!doc || closed) return; const ticket = ++pageGeneration, current = doc;
          renderTask?.cancel(); const page = await current.getPage(pageNumber); if (ticket !== pageGeneration || closed) return;
          const base = page.getViewport({ scale: 1 }), width = Math.max(280, proof.clientWidth - 24), scale = Math.min(2, width / base.width), viewport = page.getViewport({ scale: scale * Math.min(devicePixelRatio || 1, 2) });
          // Each render owns its canvas, so cancelled jobs cannot overwrite a newer page.
          const surface = document.createElement('canvas'); surface.width = Math.ceil(viewport.width); surface.height = Math.ceil(viewport.height);
          const job = page.render({ canvasContext: surface.getContext('2d'), viewport, background: '#ffffff' }); renderTask = job;
          try { await job.promise; } catch (error) { if (error.name === 'RenderingCancelledException') return; throw error; }
          if (ticket !== pageGeneration || closed) return;
          canvas.width = surface.width; canvas.height = surface.height; canvas.getContext('2d').drawImage(surface, 0, 0); canvas.hidden = false;
          pageLabel.textContent = pageNumber + ' / ' + current.numPages; previous.disabled = pageNumber <= 1; next.disabled = pageNumber >= current.numPages;
        }
        async function generate() {
          const ticket = ++generation; previewBlob = null; submit.disabled = true; canvas.hidden = true; previous.disabled = true; next.disabled = true; proof.setAttribute('aria-busy', 'true'); status.textContent = tr('Բեռնվում է…');
          try {
            await clearDocument(); if (ticket !== generation || closed) return;
            const fd = new FormData(form), snapshot = structuredClone(getState()), outputKind = String(fd.get('pdfKind')), planId = String(fd.get('pdfPlan'));
            const options = { mapPageSize: String(fd.get('pdfMapSize')), showItSpecialist: fd.has('showItSpecialist'), detailed: fd.get('pdfDetailed') === 'detailed', floorId: String(fd.get('pdfFloor')), rackId: String(fd.get('pdfRack')), deviceType: String(fd.get('pdfType')), deviceId: String(fd.get('pdfDevice')), imageOpacity: Math.min(90, Math.max(0, Number(fd.get('pdfImageOpacity')) || 0)) };
            const selection = RackHandover.select(snapshot, { ...options, planId });
            if (outputKind === 'maps' ? !selection.plans.length : outputKind === 'devices' ? !selection.devices.length : !selection.plans.length && !selection.devices.length) throw new Error(tr('Ընտրված պայմաններով տվյալներ չկան'));
            const blob = await exportPdf(snapshot, outputKind, planId, RackI18n.forLanguage(String(fd.get('pdfLanguage'))), options);
            if (ticket !== generation || closed) return;
            const lib = await import('/pdfjs/pdf.mjs'); lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.mjs';
            const bytes = new Uint8Array(await blob.arrayBuffer()); if (ticket !== generation || closed) return;
            const loading = lib.getDocument({ data: bytes, isEvalSupported: false, useWasm: false, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/' }); task = loading;
            const loaded = await loading.promise; if (ticket !== generation || closed) { await loading.destroy(); return; } doc = loaded; pageNumber = 1;
            await renderPage(); if (ticket !== generation || closed) return;
            previewBlob = blob; previewName = outputKind === 'maps' ? 'MyPatch-map.pdf' : 'MyPatch-devices.pdf'; submit.disabled = false; status.textContent = tr('Սա ներբեռնվող PDF-ի վերջնական տեսքն է');
          } catch (error) { if (ticket === generation && !closed) status.textContent = error.message || tr('Չհաջողվեց կատարել գործողությունը'); }
          finally { if (ticket === generation && !closed) proof.setAttribute('aria-busy', 'false'); }
        }
        function queuePreview() { generation++; pageGeneration++; previewBlob = null; submit.disabled = true; canvas.hidden = true; previous.disabled = true; next.disabled = true; status.textContent = tr('Բեռնվում է…'); clearTimeout(timer); timer = setTimeout(generate, 300); }
        previous.setAttribute('aria-label', tr('Նախորդ էջ')); next.setAttribute('aria-label', tr('Հաջորդ էջ'));
        previous.onclick = () => { if (doc && pageNumber > 1) { pageNumber--; renderPage().catch(e => status.textContent = e.message); } };
        next.onclick = () => { if (doc && pageNumber < doc.numPages) { pageNumber++; renderPage().catch(e => status.textContent = e.message); } };
        proof.querySelector('[data-pdf-retry]').onclick = queuePreview;
        form.addEventListener('change', queuePreview); form.elements.pdfImageOpacity.addEventListener('input', queuePreview);
        const cleanup = () => { if (dialog.open && form.isConnected) return; closed = true; generation++; clearTimeout(timer); previewBlob = null; void clearDocument().catch(() => { }); dialog.removeEventListener('close', cleanup); dialog.classList.toggle('map-pdf-dialog', dialog.open && !!dialog.querySelector('[data-pdf-proof]')); };
        dialog.addEventListener('close', cleanup);
        queuePreview();
      }
    }
    function place(x, y) { if (!view.portId || h.readOnly) return; if (view.locked) { toast(tr('Քարտեզը կողպված է')); return; } view.placing = false; change(s => { const target = findPlan(s); if (!target) return; const data = D.mapDevices(s, target), existing = data.markers.find(m => m.portId === view.portId); if (!existing && !data.devices.some(r => r.p.id === view.portId)) return; const position = { x, y, iconX: x, iconY: y }, marker = existing && target.markers.find(m => m.id === existing.id); if (marker) Object.assign(marker, position); else target.markers.push({ id: crypto.randomUUID(), portId: view.portId, ...position }); if (target.floorId) { const portRow = D.ports(s).find(x => x.p.id === data.canonical(view.portId)); if (portRow && portRow.p.floorId !== target.floorId) portRow.p.floorId = target.floorId; } }); }
    function moveMarker(id, x, y, anchor = false) { if (h.readOnly || view.locked) return; change(s => { const marker = findPlan(s)?.markers.find(m => m.id === id); if (!marker) return; const layout = D.mapMarkerLayout(marker); Object.assign(marker, layout, anchor ? { x, y } : { iconX: x, iconY: y }); }); }
    function removeMarker(id) { if (view.locked) { toast(tr('Քարտեզը կողպված է')); return; } change(s => { const p = findPlan(s); if (!p) return; const data = D.mapDevices(s, p), marker = data.markers.find(m => m.id === id); if (!marker) return; p.markers = p.markers.filter(m => data.canonical(m.portId) !== marker.portId); view.portId = ''; view.placing = false; }); toast(tr('Նշանը հեռացվեց')); }
    function placeRack(rackId, x, y) {
      if (!rackId || h.readOnly) return;
      if (view.locked) { toast(tr('Քարտեզը կողպված է')); return; }
      view.placingRackId = '';
      view.activeTab = 'devices';
      change(s => {
        const target = findPlan(s); if (!target) return;
        target.rackMarkers ||= [];
        const existing = target.rackMarkers.find(rm => rm.rackId === rackId);
        if (existing) { existing.x = x; existing.y = y; existing.iconX = x; existing.iconY = y; }
        else target.rackMarkers.push({ id: crypto.randomUUID(), rackId, x, y, iconX: x, iconY: y });
      });
      toast(tr('Ռաքը տեղադրվեց քարտեզի վրա'));
    }
    function moveRackMarker(id, x, y) {
      if (h.readOnly || view.locked) return;
      change(s => {
        const rm = findPlan(s)?.rackMarkers?.find(m => m.id === id); if (!rm) return;
        rm.x = x; rm.y = y; rm.iconX = x; rm.iconY = y;
      });
    }
    function removeRackMarker(id) {
      if (view.locked) { toast(tr('Քարտեզը կողպված է')); return; }
      change(s => {
        const p = findPlan(s); if (!p || !p.rackMarkers) return;
        p.rackMarkers = p.rackMarkers.filter(rm => rm.id !== id);
        if (view.rackId === id) view.rackId = '';
      });
      toast(tr('Ռաքը հեռացվեց քարտեզից'));
    }
    function createRackModal() {
      if (h.readOnly) return;
      const curState = getState(), curFloor = curState.floors.find(f => f.id === plan?.floorId) || curState.floors[0];
      if (!curFloor) { toast(tr('Հարկեր չկան')); return; }
      modal(tr('Ավելացնել ռաք'), `<div class="form-grid">${input('name', tr('Ռաքի անվանում'), '', 'text', 'maxlength="100" required autofocus placeholder="Rack A"')}${input('height', tr('U բարձրություն'), 42, 'number', 'min="1" max="60" required')}${select('floorId', tr('Հարկ'), curState.floors.map(f => [f.id, f.name]), curFloor.id)}</div>`, fd => {
        const name = String(fd.get('name') || '').trim(); if (!name) throw new Error(tr('Գրեք ռաքի անվանումը'));
        const height = Math.min(60, Math.max(1, Number(fd.get('height')) || 42));
        const floorId = String(fd.get('floorId') || curFloor.id);
        let newRackId = '';
        change(s => {
          const f = s.floors.find(x => x.id === floorId); if (!f) throw new Error(tr('Հարկը չի գտնվել'));
          f.racks ||= [];
          if (f.racks.some(r => r.name.toLowerCase() === name.toLowerCase())) throw new Error(tr('Այդ անունով ռաք արդեն կա'));
          newRackId = crypto.randomUUID();
          f.racks.push({ id: newRackId, name, u: height, location: '', photo: '', devices: [] });
        });
        toast(tr('Ռաքն ավելացված է'));
        if (newRackId) {
          view.activeTab = 'racks'; view.placingRackId = newRackId;
          toast(tr('Սեղմեք հատակագծի վրա՝ ռաքը տեղադրելու համար։'));
          draw();
        }
      });
    }
    function editRackName() {
      if (h.readOnly) return; const rm = (mapData.rackMarkers || []).find(m => m.id === view.rackId); if (!rm) return;
      modal(tr('Խմբագրել ռաքը'), `<div class="form-grid">${input('name', tr('Ռաքի անվանում'), rm.rack.name, 'text', 'maxlength="100" required autofocus')}${input('height', tr('U բարձրություն'), rm.rack.u || rm.rack.height || 42, 'number', 'min="1" max="60" required')}</div>`, fd => {
        const name = String(fd.get('name') || '').trim(); if (!name) throw new Error(tr('Գրեք ռաքի անվանումը'));
        const height = Math.min(60, Math.max(1, Number(fd.get('height')) || 42));
        change(s => {
          const allRacks = s.floors.flatMap(f => f.racks || []), r = allRacks.find(x => x.id === rm.rack.id); if (!r) throw new Error(tr('Ընտրված ռաքը չի գտնվել'));
          r.name = name; r.u = height;
        });
        toast(tr('Տվյալները պահպանված են'));
      });
    }
    const viewport = root.querySelector('.map-viewport'), canvas = root.querySelector('.map-canvas');
    let camera = view.camera?.planId === plan?.id ? view.camera : null, pan = null, pinch = null, space = false;
    const pointers = new Map();
    let labelFrame = 0;
    function scheduleLabels() { if (!labelFrame && !abort.signal.aborted) labelFrame = requestAnimationFrame(layoutLabels); }
    function layoutLabels() {
      labelFrame = 0; if (!canvas || !view.labels) return;
      const bounds = canvas.getBoundingClientRect(); if (!bounds.width || !bounds.height) return;
      // Clear only the previous visual scale, then batch measurements at the natural size.
      for(const text of root.querySelectorAll('.map-marker-label'))text.style.transform='none';
      const entries = [...root.querySelectorAll('[data-map-marker]')].map(el => {
        const text = el.querySelector('.map-marker-label'), r = el.getBoundingClientRect(), t = text.getBoundingClientRect();
        return { id: el.dataset.mapMarker, x: r.left - bounds.left + r.width / 2, y: r.top - bounds.top + r.height / 2, iconWidth: r.width, iconHeight: r.height, width: t.width, height: t.height, el, text, left: r.left - bounds.left + el.clientLeft, top: r.top - bounds.top + el.clientTop };
      });
      const anchors = [...root.querySelectorAll('[data-map-anchor]')].map(el => { const r = el.getBoundingClientRect(), radius = 7 * (1 + view.markerSize / 100); return { left: r.left - bounds.left + r.width / 2 - radius, right: r.left - bounds.left + r.width / 2 + radius, top: r.top - bounds.top + r.height / 2 - radius, bottom: r.top - bounds.top + r.height / 2 + radius }; });
      const layout = resolveLabelDirections(entries, bounds, anchors);
      for(const p of entries){
        const pos=layout.get(p.id),labelScale=pos.scale||1,box={x:pos.left,y:pos.top,width:pos.right-pos.left,height:pos.bottom-pos.top};
        const tip=globalThis.RackMapLabels.pointer(p,box,{radius:Math.max(p.iconWidth,p.iconHeight)/2});
        p.text.dataset.dir=pos.dir;
        p.text.style.cssText=`left:${pos.left-p.left}px;top:${pos.top-p.top}px;right:auto;bottom:auto;transform:scale(${labelScale});transform-origin:top left`;
        if(tip){
          const x=Math.min(...tip.map(q=>q.x)),y=Math.min(...tip.map(q=>q.y));
          const w=Math.max(...tip.map(q=>q.x))-x,h=Math.max(...tip.map(q=>q.y))-y;
          const style=p.text.style;
          style.setProperty('--tip-display','block');style.setProperty('--tip-x',((x-pos.left)/labelScale-1)+'px');style.setProperty('--tip-y',((y-pos.top)/labelScale-1)+'px');
          style.setProperty('--tip-width',(w/labelScale)+'px');style.setProperty('--tip-height',(h/labelScale)+'px');
          style.setProperty('--tip-points',tip.map(q=>((q.x-x)/w*100)+'% '+((q.y-y)/h*100)+'%').join(','));
        }
      }
    }
    document.fonts?.ready.then(scheduleLabels);
    function groupMarkers(markers) {
      const scale=camera?.scale||1;
      const groups=globalThis.RackMapMarkerGroups.group(markers.map(m=>{const p=D.mapMarkerLayout(m);return {id:m.id,kind:m.row.service,x:p.iconX,y:p.iconY};}),{width:plan.width*scale,height:plan.height*scale,diameter:20*(1+view.markerSize/100)});
      view.autoIconPositions.clear();
      for(const group of groups)for(const member of group.members)view.autoIconPositions.set(member.id,{iconX:group.x,iconY:group.y});
      return groups;
    }
    function refreshMarkerGroups() {
      if(dragging)return;
      const host=root.querySelector('.map-markers');if(!host)return;
      const visibleIds=new Set([...host.querySelectorAll('[data-map-marker]')].map(el=>el.dataset.mapMarker));
      globalThis.RackMapMarkerGroups.decorate(host,groupMarkers(mapData.markers.filter(m=>visibleIds.has(m.id))));
    }
    function paintAppearance(relayout = true) {
      const markers = root.querySelector('.map-markers');
      markers?.style.setProperty('--map-marker-scale', String(1 + view.markerSize / 100));
      markers?.style.setProperty('--map-line-width', String(view.lineWidth));
      root.querySelector('.map-cables-layer')?.style.setProperty('--map-line-width', String(view.lineWidth));
      root.querySelector('.map-canvas > img')?.style.setProperty('opacity', String(1 - view.imageOpacity / 100));
      const opacity = root.querySelector('[data-map-image-opacity]'), opacityValue = root.querySelector('[data-image-opacity-value]');
      if (opacity) opacity.value = view.imageOpacity;
      if (opacityValue) opacityValue.textContent = view.imageOpacity + '%';
      if(relayout){refreshMarkerGroups();scheduleLabels();}
      const size = appearance?.querySelector('[data-map-marker-size]'), width = appearance?.querySelector('[data-map-line-width]');
      if (size) { size.value = view.markerSize; appearance.querySelector('[data-marker-size-value]').textContent = (100 + view.markerSize) + '%'; }
      if (width) { width.value = view.lineWidth; appearance.querySelector('[data-line-width-value]').textContent = view.lineWidth + ' px'; }
    }
    function saveAppearance() { paintAppearance(); try { localStorage.setItem('rackmap-map-appearance', JSON.stringify({ markerSize: view.markerSize, lineWidth: view.lineWidth, imageOpacity: view.imageOpacity })); } catch { } }
    topActions?.addEventListener('input', e => { if (!e.target.matches('[data-map-image-opacity]')) return; view.imageOpacity = Math.min(90, Math.max(0, Number(e.target.value) || 0)); saveAppearance(); }, { signal: abort.signal });
    appearance?.addEventListener('toggle', e => { view.appearanceOpen = e.target.open; positionAppearance(); }, { signal: abort.signal });
    appearance?.addEventListener('input', e => { if (e.target.matches('[data-map-marker-size]')) view.markerSize = Math.min(200, Math.max(0, Number(e.target.value) || 0)); else if (e.target.matches('[data-map-line-width]')) view.lineWidth = Math.min(6, Math.max(1, Number(e.target.value) || 1.5)); else return; e.stopPropagation(); saveAppearance(); }, { signal: abort.signal });
    function paintCamera() { if (!camera || !canvas) return; const width = plan.width * camera.scale + 'px', height = plan.height * camera.scale + 'px', resized = canvas.style.width !== width || canvas.style.height !== height; canvas.style.width = width; canvas.style.height = height; canvas.style.transform = `translate(${camera.x}px,${camera.y}px)`; paintAppearance(resized); view.camera = camera; root.querySelector('[data-map-zoom]').textContent = Math.round(camera.scale * 100) + '%'; }
    function fit() { if (!viewport) return; const w = viewport.clientWidth, h = viewport.clientHeight, right = view.devicesOpen && w > 800 ? 340 : 0, pad = w < 600 ? 28 : 130; const scale = Math.max(.27, Math.min((w - right - pad) / plan.width, (h - 200) / plan.height, 2)); camera = { planId: plan.id, scale, x: (w - right - plan.width * scale) / 2, y: 100 + (h - 200 - plan.height * scale) / 2, w, h }; paintCamera(); }
    function zoom(factor, point) { if (!camera) return; point ||= { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }; const next = Math.max(.27, Math.min(6, camera.scale * factor)), ratio = next / camera.scale; camera.x = point.x - (point.x - camera.x) * ratio; camera.y = point.y - (point.y - camera.y) * ratio; camera.scale = next; paintCamera(); }
    function setTool(tool) { view.tool = tool; view.placing = false; view.placingRackId = ''; root.querySelectorAll('[data-map-action="select"],[data-map-action="hand"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mapAction === tool))); draw(); }
    function deselect() { view.portId = ''; view.panelPortId = ''; view.rackId = ''; view.placing = false; view.placingRackId = ''; view.anchorActive = false; view.selectedMarkerIds.clear(); draw(); }
    const coords = e => { const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return { x: 0, y: 0 }; return { x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) }; };
    async function click(e) {
      if (performance.now() < (view.ignoreClickUntil || 0)) { return; }
      const port = e.target.closest('[data-map-port]'), panelPort = e.target.closest('[data-map-panel-port]'), remove = e.target.closest('[data-map-remove]'), marker = e.target.closest('[data-map-marker],[data-map-anchor]'), rackMarker = e.target.closest('[data-map-rack-marker]'), placeRackBtn = e.target.closest('[data-map-place-rack]'), locateRackBtn = e.target.closest('[data-map-locate-rack]'), tabBtn = e.target.closest('[data-map-tab]'), cableEl = e.target.closest('.map-cable-path'), control = e.target.closest('[data-map-action]'), filter = e.target.closest('[data-map-filter]');
      if (cableEl) {
        const mId = cableEl.dataset.cableMarker, m = mapData.markers.find(x => x.id === mId);
        if (m) {
          view.portId = m.portId; view.panelPortId = ''; view.rackId = ''; view.selectedMarkerIds.clear(); view.selectedMarkerIds.add(m.id); view.placing = false; view.placingRackId = ''; draw(); return;
        }
      }
      if (tabBtn) {
        view.activeTab = tabBtn.dataset.mapTab;
        root.querySelectorAll('[data-map-tab]').forEach(b => {
          const active = b.dataset.mapTab === view.activeTab; b.classList.toggle('active', active); b.setAttribute('aria-selected', String(active));
        });
        const searchField = root.querySelector('.map-picker-body .field'); if (searchField) searchField.hidden = view.activeTab === 'racks';
        const hintEl = root.querySelector('[data-tab-hint]'); if (hintEl) hintEl.textContent = view.activeTab === 'racks' ? tr('Ընտրեք ռաքը և սեղմեք հատակագծի վրա՝ այն տեղադրելու համար։') : tr('Ընտրեք սարքը և սեղմեք հատակագծի վրա։');
        draw(); return;
      }
      if (placeRackBtn) {
        if (h.readOnly) return; view.tool = 'select'; view.placingRackId = placeRackBtn.dataset.mapPlaceRack; view.portId = ''; view.rackId = ''; view.placing = false; view.selectedMarkerIds.clear(); toast(tr('Սեղմեք հատակագծի վրա՝ ռաքը տեղադրելու համար։')); draw(); viewport?.focus({ preventScroll: true }); return;
      }
      if (locateRackBtn) {
        view.rackId = locateRackBtn.dataset.mapLocateRack; view.portId = ''; view.placing = false; view.placingRackId = ''; view.selectedMarkerIds.clear(); draw(); return;
      }
      if (rackMarker) {
        view.rackId = rackMarker.dataset.mapRackMarker; view.portId = ''; view.placing = false; view.placingRackId = ''; view.selectedMarkerIds.clear(); draw(); return;
      }
      if (panelPort) { view.panelPortId = panelPort.dataset.mapPanelPort; drawInspector(); return; }
      if (port) { if (h.readOnly) return; setTool('select'); view.portId = port.dataset.mapPort; view.panelPortId = ''; view.rackId = ''; view.selectedMarkerIds.clear(); view.placing = true; view.placingRackId = ''; draw(); viewport?.focus({ preventScroll: true }); return; }
      if (remove) { e.stopPropagation(); removeMarker(remove.dataset.mapRemove); return; }
      if (filter) { const f = filter.dataset.mapFilter; if (f === 'clear') { view.filter = 'all'; view.query = ''; const inp = root.querySelector('[data-map-search]'); if (inp) inp.value = ''; draw(); return; } view.filter = f; if (byId.has(view.portId) && !visibleService(byId.get(view.portId).service)) { view.portId = ''; view.placing = false; } draw(); return; }
      if (marker) {
        const mid = marker.dataset.mapMarker || marker.dataset.mapAnchor;
        const mObj = mapData.markers.find(m => m.id === mid);
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (view.selectedMarkerIds.has(mid)) view.selectedMarkerIds.delete(mid);
          else view.selectedMarkerIds.add(mid);
          if (view.selectedMarkerIds.size === 1) {
            const soleId = [...view.selectedMarkerIds][0];
            view.portId = mapData.markers.find(m => m.id === soleId)?.portId || '';
          } else {
            view.portId = '';
          }
        } else {
          view.selectedMarkerIds.clear();
          if (mid) view.selectedMarkerIds.add(mid);
          view.portId = mObj?.portId || '';
        }
        view.panelPortId = '';
        view.rackId = '';
        view.anchorActive = !!marker.dataset.mapAnchor;
        view.placing = false;
        view.placingRackId = '';
        draw();
        return;
      }
      if (control && !control.disabled) {
        const action = control.dataset.mapAction; topActions?.querySelector('.map-more')?.removeAttribute('open');
        if (action === 'undo') { undo(); draw(); return; }
        if (action === 'redo') { redo(); draw(); return; }
        if (action === 'lock-toggle') { view.locked = !view.locked; toast(view.locked ? tr('Քարտեզը կողպված է') : tr('Քարտեզն ապակողպված է')); draw(); return; }
        if (action === 'devices-toggle') { showDevices(!view.devicesOpen); return; }
        if (action === 'cables-toggle') { view.showCables = !view.showCables; toast(view.showCables ? tr('Ցուցադրել միացումները') : tr('Թաքցնել միացումները')); draw(); return; }
        if (action === 'create-map-rack') { createRackModal(); return; }
        if (action === 'edit-rack-name') { editRackName(); return; }
        if (action === 'rack-open') { const rm = (mapData.rackMarkers || []).find(m => m.id === view.rackId); if (rm) location.hash = '#rack/' + rm.rack.id; return; }
        if (action === 'rack-remove') { const rm = (mapData.rackMarkers || []).find(m => m.id === view.rackId); if (rm) h.confirm(tr('Հեռացնե՞լ ռաքը քարտեզից'), tr('Ռաքը կհեռացվի քարտեզից։ Սարքերն ու տվյալները կմնան բազայում։'), () => { removeRackMarker(rm.id); draw(); }); return; }
        if (action === 'create-map-device') { createDeviceModal(); return; }
        if (action === 'device-clone') { cloneDeviceFromSelected(); return; }
        if (action === 'batch-anchors') {
          change(s => {
            const p = findPlan(s); if (!p) return;
            const targetMarkers = p.markers.filter(m => view.selectedMarkerIds.has(m.id));
            const anyHidden = targetMarkers.some(m => !m.anchorVisible);
            targetMarkers.forEach(m => { m.anchorVisible = anyHidden; });
          });
          return;
        }
        if (action === 'batch-delete') {
          const count = view.selectedMarkerIds.size;
          h.confirm(tr('Հեռացնել նշանները'), tr('Հեռացնե՞լ ընտրված սարքերը հատակագծից։') + ' (' + count + ')', () => {
            change(s => {
              const p = findPlan(s); if (!p) return;
              const set = new Set(view.selectedMarkerIds);
              p.markers = p.markers.filter(m => !set.has(m.id));
            });
            view.selectedMarkerIds.clear(); view.portId = ''; view.placing = false; toast(tr('Նշանները հեռացվեցին'));
          });
          return;
        }
        if (action === 'select' || action === 'hand') { setTool(action); return; }
        if (action === 'deselect') { deselect(); return; }
        if (action === 'panel-open') { view.panelPortId = view.portId; drawInspector(); return; }
        if (action === 'panel-close') { view.panelPortId = ''; drawInspector(); return; }
        if (action === 'panel-edit') { editPanelPort(); return; }
        if (action === 'edit-endpoint-name') { editEndpointName(); return; }
        if (action === 'labels') { view.labels = !view.labels; control.setAttribute('aria-pressed', String(view.labels)); draw(); return; }
        if (action === 'anchor-toggle') { const selected = mapData.markers.find(m => m.portId === view.portId); if (selected) change(s => { const target = findPlan(s)?.markers.find(m => m.id === selected.id); if (target) target.anchorVisible = !target.anchorVisible; }); return; }
        if (action === 'fit') { fit(); return; }
        if (action === 'fullscreen') { if (document.fullscreenElement) await document.exitFullscreen(); else await root.requestFullscreen(); return; }
        if (action === 'upload') return upload();
        if (action === 'share') return exportCurrent(plans.length ? 'maps' : 'devices', true);
        if (action === 'shares') return manageShares();
        if (action === 'appearance-reset') { view.markerSize = 0; view.lineWidth = 1.5; view.imageOpacity = 0; saveAppearance(); return; }
        if (action === 'print') { window.print(); return; }
        if (action === 'map-pdf' || action === 'panel-pdf') return exportCurrent(action === 'map-pdf' ? 'maps' : 'devices');
        if (action.startsWith('zoom-')) { if (!camera) fit(); if (camera) zoom(action === 'zoom-reset' ? 1 / camera.scale : action === 'zoom-in' ? 1.25 : .8); return; }
        if (action === 'edit') return upload(true);
        if (action === 'delete') return h.confirm(tr('Ջնջել հատակագիծը'), tr('Կհեռացվեն միայն հատակագիծը և նշանները։ Պորտերը կմնան բազայում։'), () => change(s => { s.floorPlans = s.floorPlans.filter(p => p.id !== view.planId); }));
      }
      if (e.target.closest('.map-canvas') && view.placing) { const { x, y } = coords(e); try { place(x, y); } catch (err) { toast(err.message); } }
      else if (e.target.closest('.map-canvas') && view.placingRackId) { const { x, y } = coords(e); const targetRackId = view.placingRackId; try { placeRack(targetRackId, x, y); } catch (err) { toast(err.message); } }
      else if (e.target === viewport || e.target === canvas || e.target === canvas?.querySelector('img')) deselect();
    }
    root.addEventListener('click', e => { click(e).catch(err => toast(err.message)); }, { signal: abort.signal });
    root.addEventListener('pointerdown', e => { const more = topActions?.querySelector('.map-more'); if (more?.open && !more.contains(e.target)) more.open = false; }, { capture: true, signal: abort.signal });
    root.addEventListener('toggle', e => { const group = e.target.closest?.('.map-device-group'); if (group?.dataset?.service) { if (group.open) collapsedDeviceGroups.delete(group.dataset.service); else collapsedDeviceGroups.add(group.dataset.service); saveCollapsedGroups(); return; } const card = e.target.closest?.('.map-port-card'); if (card?.dataset?.deviceCard) { if (card.open) expandedDeviceCards.add(card.dataset.deviceCard); else expandedDeviceCards.delete(card.dataset.deviceCard); } }, { capture: true, signal: abort.signal });
    root.addEventListener('input', e => { if (e.target.matches('[data-map-marker-size]')) { view.markerSize = Math.min(200, Math.max(0, Number(e.target.value) || 0)); saveAppearance(); return; } if (e.target.matches('[data-map-line-width]')) { view.lineWidth = Math.min(6, Math.max(1, Number(e.target.value) || 1.5)); saveAppearance(); return; } if (e.target.matches('[data-map-search]')) { view.query = e.target.value; draw(); } }, { signal: abort.signal });
    const changePlan = e => { if (e.target.matches('[data-map-plan],[data-map-floor]')) { const selected = e.target.matches('[data-map-plan]') ? e.target.value : plans.find(p => p.floorId === e.target.value)?.id; if (!selected) return; view.planId = selected; view.portId = ''; view.panelPortId = ''; view.rackId = ''; view.placing = false; view.placingRackId = ''; view.showCables = false; view.camera = null; collisionGrid = null; collisionPlanId = null; h.redraw(); } };
    root.addEventListener('change', changePlan, { signal: abort.signal });
    headerControls?.addEventListener('change', e => { if (!root.contains(headerControls)) changePlan(e); }, { signal: abort.signal });
    if (viewport) {
      viewport.addEventListener('wheel', e => { e.preventDefault(); const rect = viewport.getBoundingClientRect(); zoom(Math.exp(-Math.max(-200, Math.min(200, e.deltaY)) * .002), { x: e.clientX - rect.left, y: e.clientY - rect.top }); }, { passive: false, signal: abort.signal });
      const pair = () => { const [a, b] = [...pointers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) }; };
      viewport.addEventListener('pointerdown', e => {
        if (e.button !== 0 && e.button !== 1) return; viewport.focus({ preventScroll: true });
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { viewport.setPointerCapture(e.pointerId); } catch { }
        if (pointers.size === 2) { pinch = pair(); pan = null; dragging = null; draw(); return; }
        const rackEl = e.target.closest('[data-map-rack-marker]');
        if (rackEl && view.tool === 'select' && !space && e.button === 0) {
          const id = rackEl.dataset.mapRackMarker;
          view.rackId = id; view.portId = ''; view.selectedMarkerIds.clear(); view.placing = false; view.placingRackId = '';
          if (!view.locked) {
            dragging = { rack: true, el: rackEl, id, startX: e.clientX, startY: e.clientY, moved: false };
          }
          drawInspector();
          e.preventDefault();
          return;
        }
        const el = e.target.closest('[data-map-marker],[data-map-anchor]');
        if (el && view.tool === 'select' && !space && e.button === 0) {
          const id = el.dataset.mapMarker || el.dataset.mapAnchor, marker = mapData.markers.find(m => m.id === id);
          if(e.shiftKey||e.ctrlKey||e.metaKey){
            if(view.selectedMarkerIds.has(id))view.selectedMarkerIds.delete(id);else view.selectedMarkerIds.add(id);
            view.portId=view.selectedMarkerIds.size===1?mapData.markers.find(m=>m.id===[...view.selectedMarkerIds][0])?.portId||'':'';
          }
          if (!view.selectedMarkerIds.has(id) && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            view.selectedMarkerIds.clear();
            view.selectedMarkerIds.add(id);
            view.portId = marker.portId;
          }
          const isBatch = view.selectedMarkerIds.has(id) && view.selectedMarkerIds.size > 1;
          view.panelPortId = '';
          view.rackId = '';
          view.anchorActive = !!el.dataset.mapAnchor;
          view.placing = false;
          view.placingRackId = '';
          if (!view.locked) {
            if (isBatch) {
              const list = [...view.selectedMarkerIds].map(mid => {
                const m = mapData.markers.find(x => x.id === mid); if (!m) return null;
                const l = markerLayout(m);
                const mEl = root.querySelector(`[data-map-marker="${CSS.escape(mid)}"]`);
                const aEl = root.querySelector(`[data-map-anchor="${CSS.escape(mid)}"]`);
                return { id: mid, origIconX: l.iconX, origIconY: l.iconY, origX: l.x, origY: l.y, mEl, aEl };
              }).filter(Boolean);
              dragging = { batch: true, list, startX: e.clientX, startY: e.clientY, moved: false };
            } else {
              dragging = { el, id, anchor: view.anchorActive, startX: e.clientX, startY: e.clientY, moved: false };
            }
          }
          drawInspector();
        } else if (e.shiftKey && view.tool === 'select' && !space && e.button === 0) {
          let boxEl = root.querySelector('.map-selection-box');
          if (!boxEl) { boxEl = document.createElement('div'); boxEl.className = 'map-selection-box'; viewport.append(boxEl); }
          const vpRect = viewport.getBoundingClientRect();
          dragging = { marquee: true, boxEl, startX: e.clientX, startY: e.clientY, vpLeft: vpRect.left, vpTop: vpRect.top };
        } else if ((!view.placing && !view.placingRackId) || space || view.tool === 'hand' || e.button === 1) {
          if (!camera) fit();
          pan = { x: e.clientX, y: e.clientY, cx: camera ? camera.x : 0, cy: camera ? camera.y : 0, moved: false };
        }
        e.preventDefault();
      }, { signal: abort.signal });
      viewport.addEventListener('pointermove', e => {
        if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size >= 2 && pinch) { const next = pair(), rect = viewport.getBoundingClientRect(); zoom(next.d / pinch.d, { x: pinch.x - rect.left, y: pinch.y - rect.top }); if (camera) { camera.x += next.x - pinch.x; camera.y += next.y - pinch.y; paintCamera(); } pinch = next; return; }
        if (dragging && !h.readOnly) {
          if (dragging.rack) {
            dragging.moved ||= Math.hypot(e.clientX - dragging.startX, e.clientY - dragging.startY) > 4;
            if (dragging.moved) {
              const { x, y } = coords(e);
              dragging.el.style.left = x * 100 + '%';
              dragging.el.style.top = y * 100 + '%';
            }
            return;
          }
          if (dragging.marquee) {
            const minX = Math.min(e.clientX, dragging.startX) - dragging.vpLeft;
            const minY = Math.min(e.clientY, dragging.startY) - dragging.vpTop;
            const w = Math.abs(e.clientX - dragging.startX);
            const h = Math.abs(e.clientY - dragging.startY);
            dragging.boxEl.style.left = minX + 'px';
            dragging.boxEl.style.top = minY + 'px';
            dragging.boxEl.style.width = w + 'px';
            dragging.boxEl.style.height = h + 'px';
            dragging.boxEl.hidden = false;
            return;
          }
          dragging.moved ||= Math.hypot(e.clientX - dragging.startX, e.clientY - dragging.startY) > 4;
          if (dragging.moved) {
            if (dragging.batch) {
              const cRect = canvas.getBoundingClientRect();
              const dx = (e.clientX - dragging.startX) / cRect.width;
              const dy = (e.clientY - dragging.startY) / cRect.height;
              for (const item of dragging.list) {
                const nx = Math.min(1, Math.max(0, item.origIconX + dx));
                const ny = Math.min(1, Math.max(0, item.origIconY + dy));
                if (item.mEl) { item.mEl.style.left = nx * 100 + '%'; item.mEl.style.top = ny * 100 + '%'; }
                const line = root.querySelector(`[data-map-line="${CSS.escape(item.id)}"]`);
                if (line) { line.setAttribute('x2', nx * 100); line.setAttribute('y2', ny * 100); }
              }
            } else {
              const { x, y } = coords(e);
              dragging.el.style.left = x * 100 + '%';
              dragging.el.style.top = y * 100 + '%';
              const line = root.querySelector(`[data-map-line="${CSS.escape(dragging.id)}"]`), end = dragging.anchor ? '1' : '2';
              line?.setAttribute('x' + end, x * 100); line?.setAttribute('y' + end, y * 100);
            }
          }
        }
        else if (pan && camera) { pan.moved ||= Math.hypot(e.clientX - pan.x, e.clientY - pan.y) > 4; camera.x = pan.cx + e.clientX - pan.x; camera.y = pan.cy + e.clientY - pan.y; viewport.classList.toggle('panning', pan.moved); paintCamera(); }
        if (dragging?.moved) scheduleLabels();
      }, { signal: abort.signal });
      viewport.addEventListener('pointerup', e => {
        pointers.delete(e.pointerId); try { if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId); } catch { }
        if (pinch) { if (pointers.size === 0) pinch = null; view.ignoreClickUntil = performance.now() + 120; pan = null; dragging = null; return; }
        if (view.placingRackId && !dragging && (!pan || !pan.moved)) {
          const rect = canvas.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
            view.ignoreClickUntil = performance.now() + 120;
            const { x, y } = coords(e);
            const targetRackId = view.placingRackId;
            try { placeRack(targetRackId, x, y); } catch (err) { toast(err.message); }
          }
          pan = null;
          return;
        }
        if (view.placing && !dragging && (!pan || !pan.moved)) { const rect = canvas.getBoundingClientRect(); if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) { view.ignoreClickUntil = performance.now() + 120; const { x, y } = coords(e); try { place(x, y); } catch (err) { toast(err.message); } } pan = null; return; }
        if (dragging) {
          if (dragging.rack) {
            const { moved, id } = dragging; dragging = null; view.ignoreClickUntil = performance.now() + 120;
            if (moved) {
              const { x, y } = coords(e);
              try { moveRackMarker(id, x, y); } catch (err) { toast(err.message); draw(); }
            } else draw();
            return;
          }
          if (dragging.marquee) {
            dragging.boxEl.remove();
            const minX = Math.min(e.clientX, dragging.startX);
            const maxX = Math.max(e.clientX, dragging.startX);
            const minY = Math.min(e.clientY, dragging.startY);
            const maxY = Math.max(e.clientY, dragging.startY);
            if (Math.hypot(maxX - minX, maxY - minY) > 6) {
              view.selectedMarkerIds.clear();
              for (const m of mapData.markers) {
                const el = root.querySelector(`[data-map-marker="${CSS.escape(m.id)}"]`);
                if (el) {
                  const r = el.getBoundingClientRect();
                  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                  if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) view.selectedMarkerIds.add(m.id);
                }
              }
              if (view.selectedMarkerIds.size === 1) {
                const soleId = [...view.selectedMarkerIds][0];
                view.portId = mapData.markers.find(m => m.id === soleId)?.portId || '';
              } else {
                view.portId = '';
              }
              view.ignoreClickUntil = performance.now() + 120;
              dragging = null;
              draw();
              return;
            }
          }
          const { moved, batch, list, id, anchor, startX, startY } = dragging;
          dragging = null;
          view.ignoreClickUntil = performance.now() + 120;
          if (moved) {
            if (batch) {
              const cRect = canvas.getBoundingClientRect();
              const dx = (e.clientX - startX) / cRect.width;
              const dy = (e.clientY - startY) / cRect.height;
              change(s => {
                const p = findPlan(s); if (!p) return;
                for (const item of list) {
                  const m = p.markers.find(x => x.id === item.id); if (!m) continue;
                  const l=D.mapMarkerLayout(m);
                  m.iconX = Math.min(1, Math.max(0, l.iconX + dx));
                  m.iconY = Math.min(1, Math.max(0, l.iconY + dy));
                }
              });
              toast(tr('Տեղափոխվեց') + ' ' + list.length + ' ' + tr('սարք'));
            } else {
              const { x, y } = coords(e);
              try { moveMarker(id, x, y, anchor); } catch (err) { toast(err.message); draw(); }
            }
          } else draw();
        }
        if (pan) { if (pan.moved) view.ignoreClickUntil = performance.now() + 120; pan = null; viewport.classList.remove('panning'); }
      }, { signal: abort.signal });
      viewport.addEventListener('pointercancel', () => { pointers.clear(); dragging = null; pan = null; pinch = null; viewport.classList.remove('panning'); draw(); }, { signal: abort.signal });
    }
    root.addEventListener('keydown', e => {
      if (e.target.closest('input,textarea,select,[contenteditable=true]')) return;
      if (e.code === 'Space' && !e.target.closest('button,summary')) { e.preventDefault(); space = true; viewport?.classList.add('hand-key'); return; }
      if (e.key === 'Escape') { const more = topActions?.querySelector('.map-more'); if (more?.open) { more.open = false; return; } if (view.panelPortId) { view.panelPortId = ''; drawInspector(); return; } deselect(); showDevices(false); return; }
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if (e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
        if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
        if (e.key.toLowerCase() === 'a') {
          e.preventDefault();
          const search = view.query.trim().toLocaleLowerCase();
          const visible = mapData.markers.filter(m => visibleService(m.row.service) && (!search || [name(m.row), m.row.d?.model, m.row.endpointName, D.serviceLabel(state, m.row.service, tr), m.row.floor, m.row.rack, m.row.device, m.row.port, m.row.cable, m.row.room, m.row.vlan, m.row.connection, m.row.switchName].filter(Boolean).join(' ').toLocaleLowerCase().includes(search)));
          view.selectedMarkerIds.clear();
          visible.forEach(m => view.selectedMarkerIds.add(m.id));
          if (view.selectedMarkerIds.size === 1) view.portId = [...view.selectedMarkerIds][0] ? mapData.markers.find(m => m.id === [...view.selectedMarkerIds][0])?.portId : '';
          else view.portId = '';
          draw();
          return;
        }
        return;
      }
      if (e.altKey) return;
      if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
        view.showCables = !view.showCables;
        toast(view.showCables ? tr('Ցուցադրել միացումները') : tr('Թաքցնել միացումները')); draw(); return;
      }
      if (e.key.toLowerCase() === 'h') { setTool('hand'); return; } if (e.key.toLowerCase() === 'v') { setTool('select'); return; }
      if (e.key === '+' || e.key === '=') { zoom(1.25); return; } if (e.key === '-') { zoom(.8); return; } if (e.key === '0') { fit(); return; }
      if (h.readOnly || view.locked) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (view.rackId) {
          const rm = (mapData.rackMarkers || []).find(m => m.id === view.rackId);
          if (rm) h.confirm(tr('Հեռացնե՞լ ռաքը քարտեզից'), tr('Ռաքը կհեռացվի քարտեզից։ Սարքերն ու տվյալները կմնան բազայում։'), () => { removeRackMarker(rm.id); draw(); });
          return;
        }
        if (view.selectedMarkerIds.size > 1) {
          const count = view.selectedMarkerIds.size;
          h.confirm(tr('Հեռացնել նշանները'), tr('Հեռացնե՞լ ընտրված սարքերը հատակագծից։') + ' (' + count + ')', () => {
            change(s => {
              const p = findPlan(s); if (!p) return;
              const set = new Set(view.selectedMarkerIds);
              p.markers = p.markers.filter(m => !set.has(m.id));
            });
            view.selectedMarkerIds.clear(); view.portId = ''; view.placing = false; toast(tr('Նշանները հեռացվեցին'));
          });
          return;
        }
        const selected = mapData.markers.find(m => m.portId === view.portId);
        if (selected) removeMarker(selected.id);
        return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const step = e.shiftKey ? .02 : .005;
      const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
      const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
      if (view.rackId) {
        const rm = (mapData.rackMarkers || []).find(m => m.id === view.rackId);
        if (rm) {
          try {
            moveRackMarker(rm.id, Math.min(1, Math.max(0, rm.x + dx)), Math.min(1, Math.max(0, rm.y + dy)));
            root.querySelector('.map-viewport')?.focus({ preventScroll: true });
          } catch (err) { toast(err.message); }
          return;
        }
      }
      if (view.selectedMarkerIds.size > 1) {
        try {
          change(s => {
            const p = findPlan(s); if (!p) return;
            for (const mid of view.selectedMarkerIds) {
              const m = p.markers.find(x => x.id === mid); if (!m) continue;
              const l=D.mapMarkerLayout(m);
              m.iconX = Math.min(1, Math.max(0, l.iconX + dx));
              m.iconY = Math.min(1, Math.max(0, l.iconY + dy));
            }
          });
          root.querySelector('.map-viewport')?.focus({ preventScroll: true });
        } catch (err) { toast(err.message); }
        return;
      }
      const selected = mapData.markers.find(m => m.portId === view.portId); if (!selected) return;
      const layout=D.mapMarkerLayout(selected), anchor = e.target.matches('[data-map-anchor]') || view.anchorActive, x = anchor ? layout.x : layout.iconX, y = anchor ? layout.y : layout.iconY;
      try { moveMarker(selected.id, Math.min(1, Math.max(0, x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0))), Math.min(1, Math.max(0, y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0))), anchor); root.querySelector('.map-viewport')?.focus({ preventScroll: true }); } catch (err) { toast(err.message); }
    }, { signal: abort.signal });
    window.addEventListener('keyup', e => { if (e.code === 'Space') { space = false; viewport?.classList.remove('hand-key'); } }, { signal: abort.signal });
    window.addEventListener('blur', () => { space = false; pointers.clear(); pan = null; pinch = null; dragging = null; viewport?.classList.remove('hand-key', 'panning'); draw(); }, { signal: abort.signal });
    root.addEventListener('contextmenu', e => {
      const rackEl = e.target.closest('[data-map-rack-marker]');
      if (rackEl && !h.readOnly) {
        e.preventDefault();
        const rm = (mapData.rackMarkers || []).find(m => m.id === rackEl.dataset.mapRackMarker);
        if (rm) {
          view.rackId = rm.id; view.portId = ''; view.placing = false; view.placingRackId = ''; draw();
          h.confirm(tr('Հեռացնե՞լ ռաքը քարտեզից'), tr('Ռաքը կհեռացվի քարտեզից։ Սարքերն ու տվյալները կմնան բազայում։'), () => { removeRackMarker(rm.id); draw(); });
        }
        return;
      }
      const el = e.target.closest('[data-map-marker]'); if (!el || h.readOnly) return; e.preventDefault(); const marker = mapData.markers.find(m => m.id === el.dataset.mapMarker); view.portId = marker.portId; view.placing = false; draw(); h.confirm(tr('Հեռացնել նշանը'), tr('Հեռացնե՞լ այս նշանը հատակագծից։'), () => removeMarker(marker.id));
    }, { signal: abort.signal });
    if (plans.length) showDevices(!!view.devicesOpen);
    draw();
    const resize = viewport ? new ResizeObserver(() => { if (!camera) fit(); else { camera.x += (viewport.clientWidth - camera.w) / 2; camera.y += (viewport.clientHeight - camera.h) / 2; camera.w = viewport.clientWidth; camera.h = viewport.clientHeight; paintCamera(); } scheduleLabels(); }) : null;

    if (viewport) { if (!camera) fit(); else paintCamera(); resize.observe(viewport); }
    return { busy: () => pointers.size > 0, destroy() { resize?.disconnect(); abort.abort(); cancelAnimationFrame(labelFrame); headerControls?.remove(); topActions?.remove(); mapFilters?.remove(); document.body.classList.remove('map-view'); } };
  }
  return { mount, exportPdf, resolveLabelDirections };
})();
