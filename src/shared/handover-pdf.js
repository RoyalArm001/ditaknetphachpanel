(function(root,factory){if(typeof module==='object')module.exports=factory(require('./domain'),require('./map-label-layout'),require('./pdf-branding'),require('./map-marker-groups'));else root.RackHandover=factory(root.RackDomain,root.RackMapLabels,root.RackPdfBranding,root.RackMapMarkerGroups);})(globalThis,function(D,Labels,Branding,MarkerGroups){
  'use strict';
  function select(state,{planId='',floorId='',rackId='',deviceType='all',deviceId=''}={}){
    const all=D.ports(state),byPort=new Map(all.map(x=>[x.p.id,x]));
    const matches=x=>x&&(!rackId||x.r.id===rackId)&&(deviceType==='all'||x.d.type===deviceType)&&(!deviceId||x.d.id===deviceId);
    const ends=m=>[m.row,byPort.get(m.row.p.switchPortId)].filter(Boolean);
    const plans=(state.floorPlans||[]).filter(p=>(!planId||p.id===planId)&&(!floorId||p.floorId===floorId)).map(plan=>({...plan,selectedMarkers:D.mapDevices(state,plan).markers.filter(m=>ends(m).some(matches))})).filter(plan=>planId||(!rackId&&!deviceId&&deviceType==='all')||plan.selectedMarkers.length);
    // A selected area includes only equipment represented by its placed endpoints.
    const areaDevices=new Set(plans.flatMap(p=>p.selectedMarkers.flatMap(m=>ends(m).map(x=>x.d.id))));
    const devices=D.devices(state).filter(x=>matches(x)&&(planId?areaDevices.has(x.d.id):!floorId||x.f.id===floorId));
    plans.sort((a,b)=>state.floors.findIndex(f=>f.id===a.floorId)-state.floors.findIndex(f=>f.id===b.floorId)||a.name.localeCompare(b.name,undefined,{numeric:true}));
    return {plans,devices};
  }
  function layoutMapMarkers(markers,plan,scale){
    const positions=new Map(markers.map(marker=>[marker.id,D.mapMarkerLayout(marker)]));
    const remaining=[...markers],clusters=[],tolerance=Math.max(12,Math.min(36,Math.max(plan.width,plan.height)*.005));
    while(remaining.length){
      const first=remaining.shift(),firstPos=positions.get(first.id),group=[first];
      for(let i=remaining.length-1;i>=0;i--){const pos=positions.get(remaining[i].id);if(Math.hypot((pos.x-firstPos.x)*plan.width,(pos.y-firstPos.y)*plan.height)<=tolerance)group.push(...remaining.splice(i,1));}
      if(group.length<2)continue;
      if(group.length>5){
        const x=group.reduce((sum,m)=>sum+positions.get(m.id).x,0)/group.length,y=group.reduce((sum,m)=>sum+positions.get(m.id).y,0)/group.length;
        clusters.push({members:group,x,y});
        for(const marker of group){const pos=positions.get(marker.id);positions.set(marker.id,{...pos,iconX:x,iconY:y});}
        continue;
      }
      if(group.every(m=>m.row.service===first.row.service))continue;
      let spread=0;for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){const a=positions.get(group[i].id),b=positions.get(group[j].id);spread=Math.max(spread,Math.hypot((a.iconX-b.iconX)*plan.width,(a.iconY-b.iconY)*plan.height));}
      if(spread>14)continue;
      const centerX=group.reduce((sum,m)=>sum+positions.get(m.id).x,0)/group.length,centerY=group.reduce((sum,m)=>sum+positions.get(m.id).y,0)/group.length;
      const labelRadius=group.length*50/(2*Math.PI*Math.max(.1,scale)*plan.width);
      const radius=Math.min(.16,Math.max(.02*Math.sqrt(group.length/2),labelRadius)),radiusY=radius*plan.width/plan.height;
      group.forEach((marker,i)=>{const angle=-Math.PI/2+2*Math.PI*i/group.length,pos=positions.get(marker.id);positions.set(marker.id,{...pos,iconX:Math.min(.98,Math.max(.02,centerX+Math.cos(angle)*radius)),iconY:Math.min(.98,Math.max(.02,centerY+Math.sin(angle)*radiusY))});});
    }
    const clustered=new Set(clusters.flatMap(cluster=>cluster.members.map(m=>m.id)));
    const groups=MarkerGroups.group(markers.filter(m=>!clustered.has(m.id)).map(m=>{const p=positions.get(m.id);return {id:m.id,kind:m.row.service,x:p.iconX,y:p.iconY};}),{width:plan.width*scale,height:plan.height*scale,diameter:18});
    const leaders=new Set(groups.map(group=>group.members[0].id));
    for(const group of groups)for(const member of group.members)positions.set(member.id,{...positions.get(member.id),iconX:group.x,iconY:group.y});
    return {positions,clusters,leaders};
  }
  // Shared by the browser exporter and local PDF previews. No credentials are exported.
  async function create(PDFDocument,state,{font,tr=x=>x,kind='maps',planId='',floorId='',rackId='',deviceType=kind==='panels'?'panel':'all',deviceId='',date=new Date(),imageOpacity=0,detailed=false,mapPageSize='auto',showItSpecialist=false}={}){
    const selection=select(state,{planId,floorId,rackId,deviceType,deviceId}),logo=await Branding.loadLogo();
    const pdf=new PDFDocument({autoFirstPage:false,size:'A4',layout:'landscape',margin:32,bufferPages:true,info:{Title:state.company+' - '+tr(kind==='maps'?'Քարտեզ':'Սարքերի սխեմաներ'),Author:'My Patch'}});
    const chunks=[],done=new Promise((resolve,reject)=>{pdf.on('data',chunk=>chunks.push(chunk));pdf.on('end',()=>resolve(chunks));pdf.on('error',reject);});
    pdf.registerFont('Project',font);pdf.font('Project');
    const ink='#173e43',muted='#597176',accent='#127d75',W=778,bottom=595.28-Branding.bottomMargin,byId=new Map(D.rows(state).map(x=>[x.p.id,x]));
    let pageNumber=0;
    const typeName=d=>tr({panel:'Փաչ պանել',switch:'Սվիչ',router:'Ռաուտեր'}[d.type]||state.deviceTypes?.find(t=>t.id===d.type)?.name||d.type);
    function text(value,x,y,width,size=10,color=ink,height=30,align='left'){pdf.font('Project').fontSize(size).fillColor(color).text(String(value??''),x,y,{width,height,ellipsis:true,lineGap:2,align});}
    function serviceSymbol(service,x,y,size,color){pdf.save().translate(x,y).scale(size/24).path(D.serviceIcon(service,state)).lineWidth(2).strokeColor(color).stroke().restore();}
    function page(title,subtitle,size='A4',layout='landscape'){
      pdf.addPage({size,layout});pageNumber++;
      pdf.rect(0,0,pdf.page.width,7).fill(accent);
      text(state.company||'My Patch',32,24,pdf.page.width-280,20,ink,32);
      text(title,32,61,pdf.page.width-64,13,accent,22);text(subtitle||'',32,84,pdf.page.width-64,9,muted,20);
      pdf.moveTo(32,109).lineTo(pdf.page.width-32,109).lineWidth(.7).strokeColor('#d8e4e2').stroke();
    }
    function table(title,subtitle,items){
      page(title,subtitle);let y=121;
      const cols=[{key:'number',name:'#',w:28},{key:'service',name:tr('Սարքի նշանակություն'),w:114},{key:'port',name:tr('Սարք / պորտ'),w:166},{key:'location',name:tr('Նպատակակետ'),w:112},{key:'cable',name:tr('Մալուխ'),w:80},{key:'connection',name:tr('Կապ'),w:198},{key:'status',name:tr('Վիճակ'),w:80}];
      function head(){let x=32;pdf.rect(x,y,W,28).fill('#e9f2ef');for(const c of cols){text(c.name,x+6,y+7,c.w-12,8,ink,18);x+=c.w;}y+=28;}
      head();
      for(const item of items){
        const row=byId.get(item.portId);if(!row)continue;
        const service=D.serviceLabel(state,row.service,tr),name=D.endpointLabel(state,row,tr);
        const peer=byId.get(row.p.switchPortId);
        const values={number:item.number,service:name===service?service:name+'\n'+service,port:row.device+' / '+row.port+'\n'+typeName(row.d)+' · '+(row.d.model||tr('Չնշված'))+'\n'+row.floor+' / '+row.rack,location:[row.destination,row.room,row.door,row.side].filter(Boolean).join(' / ')||'—',cable:row.cable||'—',connection:(row.connection||'—')+(peer?'\n'+typeName(peer.d)+' · '+(peer.d.model||tr('Չնշված')):'')+(row.vlan?'\nVLAN '+row.vlan:''),status:D.statusLabel(state,row.status,tr)};
        let size=9;const height=()=>Math.max(42,...cols.map(c=>pdf.font('Project').fontSize(size).heightOfString(String(values[c.key]),{width:c.w-12,lineGap:2})+16));
        while(height()>bottom-149&&size>6)size-=.5;const h=Math.min(bottom-149,height());
        if(y+h>bottom){page(title,subtitle);y=121;head();}
        if(Number(item.number)%2===0)pdf.rect(32,y,W,h).fill('#f6f9f8');
        let x=32;for(const c of cols){text(values[c.key],x+6,y+8,c.w-12,size,ink,h-12);x+=c.w;}
        y+=h;pdf.moveTo(32,y).lineTo(810,y).strokeColor('#dce7e4').stroke();
      }
      if(!items.length)text(tr('Պորտեր դեռ տեղադրված չեն'),40,y+16,W-16,11,muted);
    }
    const scopeFloor=floorId||(planId?selection.plans.find(p=>p.id===planId)?.floorId:'');
    const scope=[scopeFloor?state.floors.find(f=>f.id===scopeFloor)?.name:tr('Բոլոր հարկերը'),planId?selection.plans.find(p=>p.id===planId)?.name:'',rackId?state.floors.flatMap(f=>f.racks).find(r=>r.id===rackId)?.name:'',deviceType==='all'?'':typeName({type:deviceType}),deviceId?selection.devices.find(x=>x.d.id===deviceId)?.d.name:''].filter(Boolean).join(' / ');
    const mapEquipment=new Map();for(const plan of selection.plans)for(const marker of plan.selectedMarkers){for(const row of [marker.row,byId.get(marker.row.p.switchPortId)].filter(Boolean))mapEquipment.set(row.d.id,row);}
    const equipment=kind==='maps'?[...mapEquipment.values()].filter(x=>(!rackId||x.r.id===rackId)&&(deviceType==='all'||x.d.type===deviceType)&&(!deviceId||x.d.id===deviceId)):selection.devices;
    if(detailed){
    page(tr('Նախագծի PDF հաշվետվություն'),scope);
    text(tr('Բովանդակություն'),32,137,W,16,accent,30);
    const details=[tr(kind==='maps'?'Քարտեզ':kind==='all'?'Քարտեզ և սարքերի սխեմաներ':'Սարքերի սխեմաներ'),tr('Ամսաթիվ')+': '+date.toISOString().slice(0,10),tr('Հատակագծեր')+': '+(kind==='maps'||kind==='all'?selection.plans.length:0),tr('Սարքեր')+': '+equipment.length];
    details.forEach((value,i)=>text(value,32,187+i*40,W,13,ink,34));
    }
    function equipmentTable(){
      page(tr('Սարքերի ամփոփում'),scope);let y=121;
      const cols=[['Անվանում',140],['Սարքի տեսակ',100],['Սարքի մոդել',140],['Հարկ',95],['Ռաք',95],['Սարքի IP',140],['Պորտեր',68]];
      const head=()=>{pdf.rect(32,y,W,29).fill('#e9f2ef');let x=32;for(const [name,width] of cols){text(tr(name),x+6,y+7,width-12,8,ink,20);x+=width;}y+=29;};head();
      for(const {f,r,d} of equipment){const values=[d.name,typeName(d),d.model||tr('Չնշված'),f.name,r.name,D.hostsForDevice(state,d.id).map(x=>x.h.ip).filter(Boolean).join('\n')||'—',d.portList.length];const h=Math.min(bottom-150,Math.max(40,...values.map((value,i)=>pdf.font('Project').fontSize(8).heightOfString(String(value),{width:cols[i][1]-12,lineGap:2})+16)));if(y+h>bottom){page(tr('Սարքերի ամփոփում'),scope);y=121;head();}let x=32;for(let i=0;i<values.length;i++){text(values[i],x+6,y+8,cols[i][1]-12,8,ink,h-12);x+=cols[i][1];}y+=h;pdf.moveTo(32,y).lineTo(810,y).strokeColor('#d8e4e2').stroke();}
      if(!equipment.length)text(tr('Տվյալներ չկան'),32,y+16,W,11,muted);
    }
    if(kind==='maps'||kind==='all'){
      const plans=selection.plans;
      for(const plan of plans){
        const floor=state.floors.find(f=>f.id===plan.floorId)?.name||'';
        const markers=plan.selectedMarkers,size=mapPageSize==='A3'||mapPageSize==='auto'&&markers.length>30?'A3':'A4';
        const orientation=plan.width/Math.max(1,plan.height)<1.2?'portrait':'landscape';
        page(tr('Քարտեզ')+' · '+plan.name,tr('Հարկ')+' · '+floor,size,orientation);
        const mapW=pdf.page.width-64,legendColumns=pdf.page.width<700?2:4;
        const markerLabelsCount=Math.min(8,new Set(markers.map(m=>m.row.service)).size),legendRows=Math.max(1,Math.ceil(markerLabelsCount/legendColumns));
        const legendY=Branding.contentBottom(pdf)-legendRows*18,mapTop=119,mapH=Math.max(100,legendY-mapTop-18);
        text(markers.length+' '+tr('սարք')+' · '+size,pdf.page.width-212,30,180,10,muted,20,'right');
        pdf.roundedRect(32,mapTop,mapW,mapH,6).fillAndStroke('#f7f9fa','#d8e4e2');
        const scale=Math.min((mapW-24)/plan.width,(mapH-24)/plan.height),w=plan.width*scale,h=plan.height*scale,x=32+(mapW-w)/2,y=mapTop+(mapH-h)/2;
        pdf.image(plan.image,x,y,{width:w,height:h});
        if(imageOpacity>0)pdf.save().fillOpacity(Math.min(90,imageOpacity)/100).rect(x,y,w,h).fill('#ffffff').restore();
        const markerLayout=layoutMapMarkers(markers,plan,scale),positions=markerLayout.positions;
        const clusteredIds=new Set(markerLayout.clusters.flatMap(cluster=>cluster.members.map(m=>m.id))),clusterCards=[];
        for(const cluster of markerLayout.clusters){
          const cx=x+cluster.x*w,cy=y+cluster.y*h,columns=2,rows=Math.ceil(cluster.members.length/columns),cardWidth=Math.min(180,w-16),cardHeight=Math.min(mapH-16,22+rows*15);
          const clampBox=(left,top)=>({x:Math.max(x,Math.min(x+w-cardWidth,left)),y:Math.max(y,Math.min(y+h-cardHeight,top)),width:cardWidth,height:cardHeight});
          const candidates=[clampBox(cx+15,cy-cardHeight/2),clampBox(cx-cardWidth-15,cy-cardHeight/2),clampBox(cx-cardWidth/2,cy+15),clampBox(cx-cardWidth/2,cy-cardHeight-15)];
          const clusterIds=new Set(cluster.members.map(m=>m.id));
          const score=box=>{const collisions=markers.filter(m=>!clusterIds.has(m.id)).filter(m=>{const p=positions.get(m.id),px=x+p.iconX*w,py=y+p.iconY*h;return px>=box.x-10&&px<=box.x+box.width+10&&py>=box.y-10&&py<=box.y+box.height+10;}).length;const gapX=Math.max(box.x-cx,0,cx-(box.x+box.width)),gapY=Math.max(box.y-cy,0,cy-(box.y+box.height));return collisions*100000+Math.hypot(gapX,gapY);};
          const box=candidates.sort((a,b)=>score(a)-score(b))[0];
          pdf.circle(cx,cy,11).fillAndStroke('#ffffff',accent);text(String(cluster.members.length),cx-9,cy-5,18,9,accent,13,'center');
          pdf.roundedRect(box.x,box.y,box.width,box.height,4).fillAndStroke('#ffffff','#9db5b6');
          text(cluster.members.length+' '+tr('սարք'),box.x+7,box.y+5,box.width-14,8,ink,14);
          cluster.members.forEach((m,i)=>{const col=i%columns,row=Math.floor(i/columns),cellWidth=(box.width-16)/columns,tx=box.x+8+col*cellWidth,ty=box.y+21+row*15,color=m.row.status==='fault'?'#d35352':D.serviceColor(state,m.row.service);serviceSymbol(m.row.service,tx,ty+2,9,color);text(D.endpointLabel(state,m.row,tr),tx+12,ty,cellWidth-14,6.5,ink,13);});
          clusterCards.push(box);
        }
        const markerLabels=markers.filter(m=>!clusteredIds.has(m.id)).map(m=>{
          const p=positions.get(m.id),px=x+p.iconX*w,py=y+p.iconY*h,color=m.row.status==='fault'?'#d35352':D.serviceColor(state,m.row.service);
          if(markerLayout.leaders.has(m.id)){pdf.circle(px,py,9).fillAndStroke('#ffffff',color);serviceSymbol(m.row.service,px-5.5,py-5.5,11,ink);}
          const name=D.endpointLabel(state,m.row,tr),fontSize=size==='A3'?8:7;
          const textW=pdf.font('Project').fontSize(fontSize).widthOfString(name);
          const width=Math.min(size==='A3'?78:68,Math.max(18,Math.ceil(textW+6)));
          const height=Math.min(32,Math.max(12,Math.ceil(pdf.font('Project').fontSize(fontSize).heightOfString(name,{width:width-6,lineGap:2}))+3));
          return {m,px,py,color,name,size:fontSize,width,height};
        });
        const obstacles=markerLabels.map(({px,py})=>({x:px-9,y:py-9,width:18,height:18})).concat(clusterCards);
        const boxes=Labels.layout(markerLabels.map(item=>({id:item.m.id,x:item.px,y:item.py,width:item.width,height:item.height,radius:10})),{x:x+4,y:y+4,width:w-8,height:h-8},obstacles,2,32);
        for(const item of markerLabels){
          const box=boxes.get(item.m.id);if(!box)continue;
          const tip=Labels.pointer({x:item.px,y:item.py},box,{length:4,halfWidth:2,radius:9});
          if(tip)pdf.moveTo(tip[0].x,tip[0].y).lineTo(tip[1].x,tip[1].y).lineTo(tip[2].x,tip[2].y).closePath().fill(ink);
          pdf.roundedRect(box.x,box.y,box.width,box.height,2).fill(ink);
          text(item.name,box.x+3,box.y+2,box.width-6,item.size,'#ffffff',box.height-3,'center');
        }
        const legendGroups=new Map();for(const m of markers)legendGroups.set(m.row.service,(legendGroups.get(m.row.service)||0)+1);
        const entries=[...legendGroups];
        const legend=entries.length>8?[...entries.slice(0,7),[null,entries.slice(7).reduce((sum,x)=>sum+x[1],0)]]:entries;
        legend.forEach(([service,count],i)=>{const cellWidth=mapW/legendColumns,lx=36+(i%legendColumns)*cellWidth,ly=legendY+Math.floor(i/legendColumns)*18;if(service!==null)serviceSymbol(service,lx,ly,12,D.serviceColor(state,service));text((service===null?tr('Այլ'):D.serviceLabel(state,service,tr))+' · '+count,lx+18,ly+1,cellWidth-26,8,muted,16);});
        if(!markers.length)text(tr('Սարքեր դեռ տեղադրված չեն'),36,legendY-28,mapW-8,9,muted,18);
        if(!detailed)continue;
        const groups=new Map();for(const marker of markers){const key=marker.row.service;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(marker);}
        page(tr('Քարտեզի սարքերի ամփոփում'),plan.name+' · '+floor);let index=0;
        for(const [service,items] of groups){const count=items.filter(m=>m.row.status!=='free').length;if(!count)continue;if(index&&index%15===0)page(tr('Քարտեզի սարքերի ամփոփում'),plan.name+' · '+floor);const at=index%15,gx=32+(at%3)*259,gy=126+Math.floor(at/3)*66;pdf.roundedRect(gx,gy,247,56,5).fill('#edf4f1');serviceSymbol(service,gx+10,gy+14,25,D.serviceColor(state,service));text(D.serviceLabel(state,service,tr),gx+46,gy+10,160,10,ink,30);text(count,gx+211,gy+17,28,14,ink,22,'center');index++;}
        if(!markers.length)text(tr('Սարքեր դեռ տեղադրված չեն'),32,140,W,12,muted);
        const inactive=markers.filter(m=>m.row.status==='free').length;if(inactive)text(tr('Նախկին նշումներ')+': '+inactive,32,bottom-16,W,9,muted,16);
        table(tr('Քարտեզի սարքերի ցանկ'),plan.name+' · '+floor,[...groups.values()].flat().map(m=>({portId:m.portId,number:m.number})));
      }
    }
    if(detailed)equipmentTable();
    if(kind!=='maps'){
      let y=bottom,currentRack='';
      const devices=[...selection.devices].sort((a,b)=>state.floors.indexOf(a.f)-state.floors.indexOf(b.f)||a.f.racks.indexOf(a.r)-b.f.racks.indexOf(b.r)||b.d.pos-a.d.pos);
      for(const {f,r,d} of devices){
        const original=D.portLayout(d),bankRows=Math.max(1,...original.map(p=>p.row+1));
        // Allow two extra columns for uplinks without giving them a mostly empty bank.
        const layout=D.isNetworkDevice(d)?original.map(p=>({...p,column:p.column%14,row:Math.floor(p.column/14)*bankRows+p.row})):original.map((p,i)=>({...p,column:i%12,row:Math.floor(i/12)}));
        const totalRows=Math.max(1,...layout.map(p=>p.row+1)),columns=Math.max(1,...layout.map(p=>p.column+1)),cell=(W-24)/Math.max(12,columns);
        const title=tr(d.type==='panel'?'Փաչ պանելի սխեմա':d.type==='switch'?'Սվիչի սխեմա':d.type==='router'?'Ռաուտերի սխեմա':'Սարքի սխեմա');
        for(let first=0;first<totalRows;first+=6){
          const rows=Math.min(6,totalRows-first),height=52+rows*51;
          if(currentRack!==r.id||y+height>bottom){page(tr('Սարքերի սխեմաներ'),f.name+' / '+r.name);currentRack=r.id;y=121;}
          // Rack ears, recessed face and socket contacts distinguish equipment from a table.
          pdf.roundedRect(32,y,W,height,7).fill('#dfe7e9');
          pdf.roundedRect(42,y+4,W-20,40,4).fill(ink);
          for(const sx of [36,806])for(const sy of [y+12,y+height-12]){pdf.circle(sx,sy,2).fill('#61777e');pdf.moveTo(sx-1,sy).lineTo(sx+1,sy).lineWidth(.5).strokeColor('#c9d7da').stroke();}
          text(title+' · '+d.name,49,y+9,W-122,11,'#ffffff',18);
          text('U'+d.pos+(d.height>1?'–'+(d.pos+d.height-1):''),735,y+9,58,9,'#c9dadd',18,'right');
          const ip=D.hostsForDevice(state,d.id).map(x=>x.h.ip).filter(Boolean).join(' · ');
          const ports=(d.portList.length-(d.sfpCount||0))+' '+tr('պորտ')+(d.sfpCount?' + '+d.sfpCount+' SFP':'');
          const power=d.type==='switch'?(d.modelType==='poe-plus'?'PoE+':d.modelType==='poe'?'PoE':tr('Առանց PoE')):'';
          text([typeName(d),d.model,ports,power,ip].filter(Boolean).join(' · '),49,y+28,W-34,7,'#dbe7e9',16);
          if(columns<10){const vx=44+columns*cell+(W-24-columns*cell-80)/2,vy=y+(height+44)/2;for(let slit=0;slit<10;slit++)pdf.moveTo(vx+slit*8,vy-16).lineTo(vx+slit*8,vy+16).lineWidth(2).strokeColor('#a9bcc1').stroke();}
          for(const {p,column,row:portRow,optical} of layout.filter(p=>p.row>=first&&p.row<first+rows)){
            const row=byId.get(p.id),peer=byId.get(p.switchPortId),px=44+column*cell,py=y+49+(portRow-first)*51;
            const name=row.cable||row.endpointName||row.room||peer?.cable||peer?.endpointName||'—';
            pdf.roundedRect(px+2,py,cell-5,32,3).fillAndStroke('#10262c','#71898e');
            if(!optical){for(let pin=0;pin<8;pin++)pdf.rect(px+cell/2-9+pin*2.5,py+2,1.2,3).fill('#c9ac70');}
            else pdf.rect(px+cell/2-8,py+2,16,3).fill('#8eabb4');
            pdf.circle(px+cell-8,py+7,1.6).fill(D.statusColor(state,row.status));
            let size=8;while(size>6&&pdf.fontSize(size).heightOfString(name,{width:cell-15,lineGap:2})>23)size-=.5;
            text(name,px+7,py+8,cell-15,size,'#ffffff',23,'center');
            text(String(p.number)+(optical?' · SFP':''),px+2,py+34,cell-5,7,muted,14,'center');
          }
          y+=height+12;
        }
      }
    }
    if(kind!=='maps'&&detailed){
      const devices=[...selection.devices].sort((a,b)=>state.floors.indexOf(a.f)-state.floors.indexOf(b.f)||a.f.racks.indexOf(a.r)-b.f.racks.indexOf(b.r)||b.d.pos-a.d.pos);
      for(const {f,r,d} of devices)table(tr('Պորտերի միացումներ'),d.name+' · '+f.name+' / '+r.name,d.portList.map(p=>({portId:p.id,number:p.number})));
    }
    if(!pageNumber){page(tr(kind==='maps'?'Քարտեզ':'Սարքերի սխեմաներ'),'');text(tr('Տվյալներ չկան'),32,140,W,13,muted);}
    Branding.stamp(pdf,logo,{date,showItSpecialist});
    pdf.end();return done;
  }
  function reportGroups(rows){
    const groups=[];
    // Preserve the requested sort order; a repeated device gets its context again.
    for(const row of rows){
      let group=groups[groups.length-1];
      if(!group||group.row.d.id!==row.d.id){group={row,items:[]};groups.push(group);}
      group.items.push(row);
    }
    return groups;
  }
  async function paperReport(PDFDocument,state,{font,tr=x=>x,date=new Date(),title,stats,groups,columns,hint='',emptyText=tr('Ընտրված ֆիլտրերով պորտեր չկան։'),showItSpecialist=false}){
    const logo=await Branding.loadLogo();
    const pdf=new PDFDocument({autoFirstPage:false,size:'A4',layout:'landscape',margin:32,bufferPages:true,info:{Title:state.company+' - '+title,Author:'SMART TECH / My Patch'}});
    const chunks=[],done=new Promise((resolve,reject)=>{pdf.on('data',chunk=>chunks.push(chunk));pdf.on('end',()=>resolve(chunks));pdf.on('error',reject);});
    pdf.registerFont('Project',font).font('Project');
    const W=777.89,ink='#173e43',muted='#597176',accent='#127d75',line=11.5,size=8.5;
    let y=0,pageCount=0;
    const write=(value,x,top,width,fontSize=size,color=ink,height=24)=>pdf.font('Project').fontSize(fontSize).fillColor(color).text(String(value),x,top,{width,height,lineBreak:false});
    function wrap(value,width,fontSize=size){
      pdf.font('Project').fontSize(fontSize);
      const lines=[];
      for(const paragraph of String(value||'—').split(/\r?\n/)){
        let current='';
        for(const word of paragraph.split(/\s+/).filter(Boolean)){
          if(current&&pdf.widthOfString(current+' '+word)>width){lines.push(current);current='';}
          if(pdf.widthOfString(word)>width){
            for(const char of word){if(current&&pdf.widthOfString(current+char)>width){lines.push(current);current='';}current+=char;}
          }else current+=(current?' ':'')+word;
        }
        lines.push(current);
      }
      return lines;
    }
    function page(){
      pdf.addPage();pageCount++;
      pdf.rect(0,0,pdf.page.width,6).fill(accent);
      const companyLines=wrap(state.company||'My Patch',W-130,18);
      companyLines.forEach((value,i)=>write(value,32,23+i*22,W-130,18,ink,26));
      write(date.toISOString().slice(0,10),pdf.page.width-132,29,100,9,muted);
      const titleY=30+companyLines.length*22,titleLines=wrap(title,W,11);
      titleLines.forEach((value,i)=>write(value,32,titleY+i*15,W,11,accent));y=titleY+titleLines.length*15+11;
      if(pageCount===1){
        const width=(W-9*(stats.length-1))/stats.length;
        const labels=stats.map(stat=>wrap(stat.label,width-62,8)),height=Math.max(30,12+Math.max(...labels.map(lines=>lines.length))*10);
        stats.forEach((stat,i)=>{const x=32+i*(width+9);pdf.roundedRect(x,y,width,height,4).fill('#edf4f2');write(stat.value,x+10,y+6,45,14,stat.color||ink);labels[i].forEach((value,j)=>write(value,x+54,y+8+j*10,width-62,8,muted));});
        y+=height+4;
        if(hint){write(hint,32,y,W,7.5,muted,14);y+=14;}
      }
    }
    function groupMetrics(group,continued=false){
      const row=group.row,type=tr({panel:'Փաչ պանել',switch:'Սվիչ',router:'Ռաուտեր'}[row.d.type]||state.deviceTypes?.find(t=>t.id===row.d.type)?.name||row.d.type);
      const model=[type,row.d.model,row.d.pos?'U'+row.d.pos:'',D.hostsForDevice(state,row.d.id).map(x=>x.h.ip).filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
      const heading=tr('Հարկ')+': '+row.f.name+'   /   '+tr('Ռաք')+': '+row.r.name+'   /   '+row.d.name+(continued?' · '+tr('Շարունակություն'):'');
      const titles=wrap(heading,W-20,10),details=model?wrap(model,W-20,8):[];
      const height=14+titles.length*13+details.length*11;
      const headLines=columns.map(c=>wrap(tr(c.label),c.width-14,8)),headHeight=Math.max(24,12+Math.max(...headLines.map(lines=>lines.length))*10);
      return {titles,details,height,headLines,headHeight};
    }
    function groupHead(group,continued=false){
      const {titles,details,height,headLines,headHeight}=groupMetrics(group,continued);
      pdf.roundedRect(32,y,W,height,4).fill('#e5efec');
      titles.forEach((value,i)=>write(value,42,y+7+i*13,W-20,10));
      details.forEach((value,i)=>write(value,42,y+7+titles.length*13+i*11,W-20,8,muted));y+=height+3;
      pdf.rect(32,y,W,headHeight).fill(ink);let x=32;
      columns.forEach((c,i)=>{headLines[i].forEach((value,j)=>write(value,x+7,y+6+j*10,c.width-14,8,'#ffffff'));x+=c.width;});y+=headHeight;
    }
    function next(group){page();groupHead(group,true);}
    function entryLayout(item){
      const cells=item.cells.map((value,i)=>wrap(value,columns[i].width-(i===1&&item.service?30:14)));
      const noteLines=item.notes?wrap(tr('Նշումներ')+': '+item.notes,W-columns[0].width-14):[];
      const count=Math.max(...cells.map(lines=>lines.length)),fullHeight=Math.max(24,10+count*line)+(noteLines.length?12+noteLines.length*line:0);
      return {cells,noteLines,count,fullHeight};
    }
    page();
    for(const group of groups){
      // Keep a heading and at least one ordinary row on the same page.
      const metrics=groupMetrics(group),layouts=group.entries.map(entryLayout),firstHeight=layouts[0]?.fullHeight||24;
      if(y+metrics.height+3+metrics.headHeight+(firstHeight<260?firstHeight:24)>Branding.contentBottom(pdf))page();
      groupHead(group);
      for(const [index,item] of group.entries.entries()){
        const {cells,noteLines,count,fullHeight}=layouts[index];
        if(y+fullHeight>Branding.contentBottom(pdf)&&fullHeight<260)next(group);
        let offset=0;
        while(offset<count){
          if(Branding.contentBottom(pdf)-y<24)next(group);
          const capacity=Math.max(1,Math.floor((Branding.contentBottom(pdf)-y-10)/line)),take=Math.min(capacity,count-offset),height=Math.max(24,10+take*line);
          pdf.rect(32,y,W,height).fill(index%2?'#f2f6f5':'#ffffff');
          pdf.rect(32,y,3,height).fill(item.color||'#b8cac5');
          let x=32;
          columns.forEach((c,i)=>{
            const inset=i===1&&item.service?23:7;
            if(i===1&&item.service)pdf.save().translate(x+6,y+8).scale(12/24).path(D.serviceIcon(item.service,state)).lineWidth(1.8).strokeColor(D.serviceColor(state,item.service)).stroke().restore();
            const lines=cells[i].slice(offset,offset+take);
            if(i===0&&offset&&!lines.length)lines.push(item.cells[0]);
            lines.forEach((value,j)=>write(value,x+inset,y+6+j*line,c.width-inset-7,size,i===columns.length-1?item.color||ink:ink));
            x+=c.width;
          });
          y+=height;pdf.moveTo(32,y).lineTo(32+W,y).lineWidth(.5).strokeColor('#dce7e4').stroke();offset+=take;
          if(offset<count)next(group);
        }
        let noteOffset=0;
        while(noteOffset<noteLines.length){
          if(Branding.contentBottom(pdf)-y<26)next(group);
          const take=Math.min(noteLines.length-noteOffset,Math.max(1,Math.floor((Branding.contentBottom(pdf)-y-12)/line))),height=12+take*line;
          pdf.rect(32,y,W,height).fill('#f8f4ea');
          write(item.cells[0],39,y+6,columns[0].width-14,size,muted);
          noteLines.slice(noteOffset,noteOffset+take).forEach((value,j)=>write(value,39+columns[0].width,y+6+j*line,W-columns[0].width-14,size,ink));
          y+=height;noteOffset+=take;
        }
      }
      y+=16;
    }
    if(!groups.length)write(emptyText,32,y+18,W,11,muted);
    Branding.stamp(pdf,logo,{date,showItSpecialist});pdf.end();return done;
  }
  // Personal/offline and server reports share the same readable document template.
  async function createPortReport(PDFDocument,state,{font,tr=x=>x,filters={},date=new Date(),showItSpecialist=false}={}){
    const rows=D.rows(state,filters),all=D.rows(state),byId=new Map(all.map(row=>[row.p.id,row])),incoming=new Map(all.filter(row=>row.p.switchPortId).map(row=>[row.p.switchPortId,row]));
    const groups=reportGroups(rows);let compressed=false;
    const blank=row=>row.status==='free'&&![row.endpointName,row.cable,row.destination,row.room,row.door,row.side,row.notes,row.service,row.vlan,row.connection,row.p.switchPortId].some(Boolean);
    for(const group of groups){
      group.entries=[];
      for(let i=0;i<group.items.length;i++){
        const row=group.items[i];let end=i;
        while(blank(row)&&end+1<group.items.length&&blank(group.items[end+1])&&Number(group.items[end+1].port)===Number(group.items[end].port)+1)end++;
        if(end-i>=2){compressed=true;group.entries.push({cells:[row.port+'-'+group.items[end].port,tr('Չօգտագործված պորտեր'),'—','—','—','—',D.statusLabel(state,'free',tr)+' · '+(end-i+1)],color:'#237255'});i=end;continue;}
        const peer=byId.get(row.p.switchPortId)||incoming.get(row.p.id),service=row.service?D.serviceLabel(state,row.service,tr):'';
        const endpoint=[row.endpointName,service!==row.endpointName?service:''].filter(Boolean).join('\n')||'—';
        const location=[row.destination?tr('Հարկ')+' '+row.destination:'',row.room?tr('Սենյակ')+' '+row.room:'',row.door?tr('Դուռ')+' '+row.door:'',row.side].filter(Boolean).join(' · ')||'—';
        const connection=peer?peer.d.name+' · '+tr('Պորտ')+' '+peer.p.number+'\n'+peer.f.name+' / '+peer.r.name:tr('Չկապված');
        group.entries.push({cells:[String(row.port),endpoint,row.cable||'—',location,connection,row.vlan||'—',D.statusLabel(state,row.status,tr)],service:row.service,notes:row.notes,color:({free:'#237255',used:'#266799',fault:'#b03a34'})[row.status]});
      }
    }
    const stats=[{label:tr('Ընդամենը պորտեր'),value:rows.length},...['used','free','fault'].map(status=>({label:D.statusLabel(state,status,tr),value:rows.filter(row=>row.status===status).length,color:({free:'#237255',used:'#266799',fault:'#b03a34'})[status]}))];
    const columns=[['Պորտ',42],['Սարք / նշանակություն',164],['Մալուխ',100],['Տեղադրություն',142],['Կապ',174],['VLAN',52],['Վիճակ',103.89]].map(([label,width])=>({label,width}));
    return paperReport(PDFDocument,state,{font,tr,date,showItSpecialist,title:tr('Ցանցային միացումների հաշվետվություն'),stats,groups,columns,hint:compressed?tr('Դատարկ ազատ պորտերը խմբավորված են միջակայքով։'):''});
  }
  async function createConnectionReport(PDFDocument,state,{font,tr=x=>x,report,date=new Date(),showItSpecialist=false}={}){
    const rows=D.rows(state),byId=new Map(rows.map(row=>[row.p.id,row]));
    const issueNames={unlinked:tr('Չկապված'),duplicate:tr('Կրկնված'),wrong:tr('Սխալ կապ')};
    const colors={linked:'#237255',unlinked:'#91601d',duplicate:'#7856a5',wrong:'#b03a34'};
    const groups=reportGroups(report.records.map(record=>({...byId.get(record.id),record})));
    for(const group of groups)group.entries=group.items.map(row=>{
      const {record}=row,peer=record.to,service=row.service?D.serviceLabel(state,row.service,tr):'';
      const endpoint=[row.endpointName,service!==row.endpointName?service:''].filter(Boolean).join('\n')||'—';
      return {cells:[String(row.port),endpoint,row.cable||'—',peer?peer.d.name+' · '+tr('Պորտ')+' '+peer.p.number+'\n'+peer.f.name+' / '+peer.r.name:row.p.switchPortId?tr('Պորտը չի գտնվել'):tr('Չկապված'),row.vlan||'—',record.issues.map(code=>issueNames[code]).join('\n')||tr('Կապված')],notes:row.notes,service:row.service,color:colors[record.issues.includes('wrong')?'wrong':record.issues[0]||'linked']};
    });
    const stats=Object.entries(report.summary).map(([key,value])=>({label:key==='linked'?tr('Կապված'):issueNames[key],value,color:colors[key]}));
    const columns=[['Պորտ',42],['Սարք / նշանակություն',164],['Մալուխ',118],['Վերջնակետ',232],['VLAN',66],['Ստուգման արդյունք',155.89]].map(([label,width])=>({label,width}));
    return paperReport(PDFDocument,state,{font,tr,date,showItSpecialist,title:tr('Կապերի քարտեզ և աուդիտ'),stats,groups,columns,emptyText:tr('Կապեր չկան')});
  }
  return {create,select,createPortReport,createConnectionReport};
});
